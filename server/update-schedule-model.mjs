import { pool } from "./db.mjs";
const templates = [
  [
    "standard",
    "5/2 · 08:00–17:00",
    "08:00",
    "17:00",
    false,
    8,
    60,
    false,
    "weekly",
    [
      { days: [1, 2, 3, 4, 5], type: "work", start: "08:00", end: "17:00" },
      { days: [6, 7], type: "off" },
    ],
    false,
  ],
  [
    "piecework_standard",
    "5/2 сдельный · 08:00–17:00",
    "08:00",
    "17:00",
    false,
    8,
    60,
    false,
    "weekly",
    [
      { days: [1, 2, 3, 4, 5], type: "work", start: "08:00", end: "17:00" },
      { days: [6, 7], type: "off" },
    ],
    false,
  ],
  [
    "salary_standard",
    "5/2 оклад · 08:00–17:00",
    "08:00",
    "17:00",
    false,
    8,
    60,
    false,
    "weekly",
    [
      { days: [1, 2, 3, 4, 5], type: "work", start: "08:00", end: "17:00" },
      { days: [6, 7], type: "off" },
    ],
    false,
  ],
  [
    "day_07_15",
    "5/2 · 07:00–15:00",
    "07:00",
    "15:00",
    false,
    8,
    0,
    true,
    "weekly",
    [
      { days: [1, 2, 3, 4, 5], type: "work", start: "07:00", end: "15:00" },
      { days: [6, 7], type: "off" },
    ],
    false,
  ],
  [
    "tpa_2x2",
    "2/2 ТПА · день 08:00–20:00 / ночь 20:00–08:00",
    "08:00",
    "20:00",
    false,
    12,
    0,
    true,
    "cycle",
    [
      { day: 1, type: "day", start: "08:00", end: "20:00" },
      {
        day: 2,
        type: "night",
        start: "20:00",
        end: "08:00",
        crosses_midnight: true,
      },
      { day: 3, type: "off" },
      { day: 4, type: "off" },
    ],
    true,
  ],
  [
    "foundry_2x2",
    "2/2 литейный цех · день 08:00–17:00 / ночь 17:00–08:00",
    "08:00",
    "17:00",
    false,
    9,
    0,
    true,
    "cycle",
    [
      { day: 1, type: "day", start: "08:00", end: "17:00" },
      {
        day: 2,
        type: "night",
        start: "17:00",
        end: "08:00",
        crosses_midnight: true,
      },
      { day: 3, type: "off" },
      { day: 4, type: "off" },
    ],
    true,
  ],
];
const c = await pool.connect();
try {
  await c.query("BEGIN");
  await c.query(
    `ALTER TABLE schedule_templates ADD COLUMN IF NOT EXISTS schedule_kind TEXT NOT NULL DEFAULT 'weekly';ALTER TABLE schedule_templates ADD COLUMN IF NOT EXISTS cycle_pattern JSONB;ALTER TABLE schedule_templates ADD COLUMN IF NOT EXISTS requires_anchor BOOLEAN NOT NULL DEFAULT FALSE`,
  );
  for (const t of templates)
    await c.query(
      `INSERT INTO schedule_templates(code,name,start_time,end_time,crosses_midnight,paid_hours,lunch_minutes,no_lunch,schedule_kind,cycle_pattern,requires_anchor)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)ON CONFLICT(code)DO UPDATE SET name=excluded.name,start_time=excluded.start_time,end_time=excluded.end_time,crosses_midnight=excluded.crosses_midnight,paid_hours=excluded.paid_hours,lunch_minutes=excluded.lunch_minutes,no_lunch=excluded.no_lunch,schedule_kind=excluded.schedule_kind,cycle_pattern=excluded.cycle_pattern,requires_anchor=excluded.requires_anchor`,
      [...t.slice(0, 9), JSON.stringify(t[9]), t[10]],
    );
  await c.query(
    "UPDATE schedule_templates SET schedule_kind='rolling',requires_anchor=true WHERE code IN('security24','day24')",
  );
  await c.query(
    `UPDATE employee_schedules SET schedule_id=(SELECT id FROM schedule_templates WHERE code='standard') WHERE schedule_id IN(SELECT id FROM schedule_templates WHERE code IN('piecework_standard','salary_standard'));DELETE FROM department_schedules WHERE schedule_id IN(SELECT id FROM schedule_templates WHERE code='shift12');DELETE FROM employee_schedules WHERE schedule_id IN(SELECT id FROM schedule_templates WHERE code='shift12');DELETE FROM schedule_templates WHERE code IN('piecework_standard','salary_standard','shift12')`,
  );
  for (const [group, code] of [
    ["ТПА — литейщицы", "tpa_2x2"],
    ["Литейный цех — литейщики", "foundry_2x2"],
  ])
    await c.query(
      `UPDATE employee_schedules es SET schedule_id=st.id,source='schedule_model_correction' FROM employees e JOIN departments d ON d.id=e.department_id CROSS JOIN schedule_templates st WHERE es.employee_id=e.id AND es.effective_to IS NULL AND d.name=$1 AND st.code=$2`,
      [group, code],
    );
  await c.query("COMMIT");
  console.log("Модель графиков обновлена");
} catch (e) {
  await c.query("ROLLBACK");
  throw e;
} finally {
  c.release();
  await pool.end();
}
