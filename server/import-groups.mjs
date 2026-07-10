import XLSX from "xlsx";
import { pool } from "./db.mjs";

const file =
  process.env.GROUPED_EMPLOYEE_XLS ||
  "C:/Users/art22/Downloads/сотрудники_сгруппированные.xlsx";
const wb = XLSX.readFile(file);
const rows = XLSX.utils.sheet_to_json(wb.Sheets["Сотрудники по группам"], {
  defval: null,
  raw: false,
});
const groups = [
  ...new Set(rows.map((r) => String(r["Группа (рекомендация)"]).trim())),
];
const scheduleByLabel = {
  "Сдельная, 08:00–17:00": [
    "standard",
    "5/2 · 08:00–17:00",
    "08:00",
    "17:00",
    8,
    60,
    false,
  ],
  "Оклад, 08:00–17:00": [
    "standard",
    "5/2 · 08:00–17:00",
    "08:00",
    "17:00",
    8,
    60,
    false,
  ],
  "07:00–15:00": [
    "day_07_15",
    "Дневной 07:00–15:00",
    "07:00",
    "15:00",
    8,
    0,
    true,
  ],
};
const client = await pool.connect();
try {
  await client.query("BEGIN");
  await client.query(
    "ALTER TABLE employees ADD COLUMN IF NOT EXISTS needs_review BOOLEAN NOT NULL DEFAULT FALSE",
  );
  await client.query(
    "ALTER TABLE employees ADD COLUMN IF NOT EXISTS review_note TEXT",
  );
  const dbEmployees = await client.query(
    "SELECT id FROM employees WHERE id=ANY($1::int[])",
    [rows.map((r) => Number(r["ID (ZkBio)"]))],
  );
  const found = new Set(dbEmployees.rows.map((r) => r.id));
  const missing = rows.filter((r) => !found.has(Number(r["ID (ZkBio)"])));
  if (missing.length)
    throw new Error(
      `В базе не найдены ID: ${missing.map((r) => r["ID (ZkBio)"]).join(", ")}`,
    );
  const departmentIds = new Map();
  for (const name of groups) {
    const { rows: saved } = await client.query(
      "INSERT INTO departments(name,active)VALUES($1,true) ON CONFLICT(name)DO UPDATE SET active=true RETURNING id",
      [name],
    );
    departmentIds.set(name, saved[0].id);
  }
  for (const values of Object.values(scheduleByLabel)) {
    await client.query(
      `INSERT INTO schedule_templates(code,name,start_time,end_time,crosses_midnight,paid_hours,lunch_minutes,no_lunch)VALUES($1,$2,$3,$4,false,$5,$6,$7) ON CONFLICT(code)DO UPDATE SET name=excluded.name,start_time=excluded.start_time,end_time=excluded.end_time,paid_hours=excluded.paid_hours,lunch_minutes=excluded.lunch_minutes,no_lunch=excluded.no_lunch`,
      values,
    );
  }
  let scheduled = 0,
    flagged = 0;
  const effectiveFrom = new Date().toISOString().slice(0, 10);
  for (const row of rows) {
    const id = Number(row["ID (ZkBio)"]),
      group = String(row["Группа (рекомендация)"]).trim();
    const note = row["Флаг для проверки"]
      ? String(row["Флаг для проверки"]).trim()
      : null;
    const position = row["Должность по 1С"]
      ? String(row["Должность по 1С"]).trim()
      : null;
    await client.query(
      "UPDATE employees SET department_id=$2,position_name=COALESCE($3,position_name),needs_review=$4,review_note=$5,updated_at=now() WHERE id=$1",
      [id, departmentIds.get(group), position, Boolean(note), note],
    );
    if (note) flagged++;
    const schedule = scheduleByLabel[row["График"]];
    if (schedule) {
      await client.query(
        "UPDATE employee_schedules SET effective_to=$2::date-1 WHERE employee_id=$1 AND effective_from<$2 AND(effective_to IS NULL OR effective_to>=$2)",
        [id, effectiveFrom],
      );
      await client.query(
        `INSERT INTO employee_schedules(employee_id,schedule_id,effective_from,source) SELECT $1,id,$3,'grouped_employee_xlsx' FROM schedule_templates WHERE code=$2 ON CONFLICT(employee_id,effective_from)DO UPDATE SET schedule_id=excluded.schedule_id,source='grouped_employee_xlsx',effective_to=NULL`,
        [id, schedule[0], effectiveFrom],
      );
      scheduled++;
    }
  }
  await client.query(
    "UPDATE departments SET active=false WHERE name<>ALL($1::text[]) AND NOT EXISTS(SELECT 1 FROM employees e WHERE e.department_id=departments.id AND e.active)",
    [groups],
  );
  await client.query("COMMIT");
  console.log(
    JSON.stringify(
      {
        employees: rows.length,
        groups: groups.length,
        schedulesUpdated: scheduled,
        flagged,
      },
      null,
      2,
    ),
  );
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
