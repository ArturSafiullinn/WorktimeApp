import fs from "node:fs";
import XLSX from "xlsx";
import { pool } from "./db.mjs";
const schema = fs.readFileSync(
  new URL("./schema.sql", import.meta.url),
  "utf8",
);
const file =
  process.env.EMPLOYEE_XLS ||
  "C:/Users/art22/Downloads/Сотрудник_20260706091541.xls";
const wb = XLSX.readFile(file),
  matrix = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
    header: 1,
    defval: null,
    raw: false,
  });
const hi = matrix.findIndex((r) =>
  r.some((x) => String(x).trim() === "ID сотрудника"),
);
if (hi < 0) throw new Error("В XLS не найден заголовок ID сотрудника");
const h = matrix[hi].map((x) => String(x ?? "").trim()),
  col = (n) => h.indexOf(n),
  employees = matrix
    .slice(hi + 1)
    .filter((r) => Number(r[col("ID сотрудника")]));
const schedules = [
  ["standard", "Стандартный 8 часов", "08:00", "17:00", false, 8, 60, false],
  ["security24", "Суточный 07:00–07:00", "07:00", "07:00", true, 24, 0, true],
  ["day24", "Суточный 08:00–08:00", "08:00", "08:00", true, 24, 0, true],
  [
    "special193",
    "Индивидуальный 07:30–15:30",
    "07:30",
    "15:30",
    false,
    8,
    0,
    true,
  ],
  [
    "special380",
    "Индивидуальный 07:00–16:00",
    "07:00",
    "16:00",
    false,
    8,
    60,
    false,
  ],
];
const security = new Set([250, 251, 252, 254, 255, 256, 257, 258, 259]),
  day24 = new Set([234, 235, 237]);
const client = await pool.connect();
try {
  await client.query("BEGIN");
  await client.query(schema);
  for (const s of schedules)
    await client.query(
      `INSERT INTO schedule_templates(code,name,start_time,end_time,crosses_midnight,paid_hours,lunch_minutes,no_lunch)VALUES($1,$2,$3,$4,$5,$6,$7,$8)ON CONFLICT(code)DO UPDATE SET name=excluded.name,start_time=excluded.start_time,end_time=excluded.end_time,crosses_midnight=excluded.crosses_midnight,paid_hours=excluded.paid_hours,lunch_minutes=excluded.lunch_minutes,no_lunch=excluded.no_lunch`,
      s,
    );
  for (const r of employees) {
    const id = Number(r[col("ID сотрудника")]),
      department = String(r[col("Имя отдела")] || "Без подразделения").trim(),
      external = Number(r[col("Отдел №")]) || null,
      inactive = ["Уволенные", "Все сотрудники"].includes(department);
    const dep = await client.query(
      `INSERT INTO departments(external_id,name,active)VALUES($1,$2,$3)ON CONFLICT(name)DO UPDATE SET external_id=COALESCE(excluded.external_id,departments.external_id),active=excluded.active RETURNING id`,
      [external, department, !inactive],
    );
    const first = String(r[col("Имя")] || "").trim(),
      patronymic = String(r[col("Фамилия")] || "").trim(),
      full = `${first} ${patronymic}`.trim();
    await client.query(
      `INSERT INTO employees(id,full_name,first_name,patronymic,department_id,card_number,gender,email,position_name,hired_at,active,clean_time_calculation)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)ON CONFLICT(id)DO UPDATE SET full_name=excluded.full_name,first_name=excluded.first_name,patronymic=excluded.patronymic,department_id=excluded.department_id,card_number=excluded.card_number,gender=excluded.gender,email=excluded.email,position_name=excluded.position_name,hired_at=excluded.hired_at,active=excluded.active,clean_time_calculation=excluded.clean_time_calculation,updated_at=now()`,
      [
        id,
        full,
        first,
        patronymic || null,
        dep.rows[0].id,
        String(r[col("Номер карты")] || "") || null,
        r[col("Пол")] || null,
        r[col("Эл. почта")] || null,
        r[col("Название должности")] || null,
        r[col("Дата устройства на работу")] || null,
        !inactive,
        id === 154,
      ],
    );
    const d = department.toLowerCase();
    let code = security.has(id)
      ? "security24"
      : day24.has(id)
        ? "day24"
        : "standard";
    if (id === 193) code = "special193";
    if (id === 380) code = "special380";
    await client.query(
      `INSERT INTO employee_schedules(employee_id,schedule_id,effective_from)SELECT $1,id,$3 FROM schedule_templates WHERE code=$2 ON CONFLICT(employee_id,effective_from)DO UPDATE SET schedule_id=excluded.schedule_id,source='WorkSchedule'`,
      [id, code, id === 380 ? "2026-05-28" : "2000-01-01"],
    );
  }
  await client.query("COMMIT");
  console.log(
    `Готово: ${employees.length} сотрудников, активных ${employees.filter((r) => !["Уволенные", "Все сотрудники"].includes(String(r[col("Имя отдела")]))).length}.`,
  );
} catch (e) {
  await client.query("ROLLBACK");
  throw e;
} finally {
  client.release();
  await pool.end();
}
