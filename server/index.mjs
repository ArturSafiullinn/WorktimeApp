import express from "express";
import cors from "cors";
import { pool } from "./db.mjs";
const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.get("/api/health", async (_q, res) => {
  try {
    const r = await pool.query("select current_database() db,now() time");
    res.json({ ok: true, ...r.rows[0] });
  } catch (e) {
    res.status(503).json({ ok: false, error: e.message });
  }
});
app.get("/api/employees", async (req, res) => {
  try {
    const active = req.query.active !== "false";
    const { rows } = await pool.query(
      `SELECT e.id,e.full_name name,e.card_number,e.position_name,e.active,e.needs_review,e.review_note,e.department_id,d.name department,s.name schedule,s.id schedule_id,s.code schedule_code,s.schedule_kind,s.cycle_pattern,s.requires_anchor,s.paid_hours,s.effective_from schedule_effective_from FROM employees e LEFT JOIN departments d ON d.id=e.department_id LEFT JOIN LATERAL(SELECT st.*,es.effective_from FROM employee_schedules es JOIN schedule_templates st ON st.id=es.schedule_id WHERE es.employee_id=e.id AND es.effective_from<=CURRENT_DATE AND(es.effective_to IS NULL OR es.effective_to>=CURRENT_DATE)ORDER BY es.effective_from DESC LIMIT 1)s ON true WHERE($1::boolean=false OR e.active=true)ORDER BY d.name,e.full_name`,
      [active],
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.patch("/api/employees/:id", async (req, res) => {
  const client = await pool.connect();
  try {
    const id = Number(req.params.id),
      { department_id, schedule_id, effective_from, active } = req.body;
    await client.query("BEGIN");
    if (department_id != null || active != null)
      await client.query(
        `UPDATE employees SET department_id=COALESCE($2,department_id),active=COALESCE($3,active),updated_at=now() WHERE id=$1`,
        [id, department_id ?? null, active ?? null],
      );
    if (schedule_id != null) {
      const from = effective_from || new Date().toISOString().slice(0, 10);
      await client.query(
        `UPDATE employee_schedules SET effective_to=$2::date-1 WHERE employee_id=$1 AND effective_from<$2 AND(effective_to IS NULL OR effective_to>=$2)`,
        [id, from],
      );
      await client.query(
        `INSERT INTO employee_schedules(employee_id,schedule_id,effective_from,source)VALUES($1,$2,$3,'manual') ON CONFLICT(employee_id,effective_from)DO UPDATE SET schedule_id=excluded.schedule_id,source='manual',effective_to=NULL`,
        [id, schedule_id, from],
      );
    }
    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (e) {
    await client.query("ROLLBACK");
    res.status(400).json({ error: e.message });
  } finally {
    client.release();
  }
});
app.get("/api/schedules", async (_q, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id,code,name,to_char(start_time,'HH24:MI') start_time,to_char(end_time,'HH24:MI') end_time,crosses_midnight,paid_hours,schedule_kind,cycle_pattern,requires_anchor FROM schedule_templates ORDER BY name`,
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.get("/api/skud-days", async (req, res) => {
  try {
    const month = String(req.query.month || new Date().toISOString().slice(0, 7));
    await pool.query(
      `CREATE TABLE IF NOT EXISTS skud_days(id BIGSERIAL PRIMARY KEY,employee_id INTEGER NOT NULL REFERENCES employees(id),work_date DATE NOT NULL,entry_time TIME,end_time TIME,fact_hours NUMERIC(6,2) NOT NULL DEFAULT 0,total_hours NUMERIC(6,2) NOT NULL DEFAULT 0,combo_hours NUMERIC(6,2) NOT NULL DEFAULT 0,status TEXT NOT NULL,record_count INTEGER NOT NULL DEFAULT 0,issues JSONB NOT NULL DEFAULT '[]'::jsonb,source TEXT NOT NULL DEFAULT 'skud_import',imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),UNIQUE(employee_id,work_date))`,
    );
    const { rows } = await pool.query(
      `SELECT sd.employee_id id,e.full_name name,d.name department,s.schedule,s.schedule_id,s.schedule_code,s.schedule_kind,s.cycle_pattern,s.requires_anchor,to_char(s.effective_from,'YYYY-MM-DD') schedule_effective_from,to_char(sd.work_date,'YYYY-MM-DD') date,COALESCE(to_char(sd.entry_time,'HH24:MI'),'—') entry,COALESCE(to_char(sd.end_time,'HH24:MI'),'—') exit,sd.fact_hours::float fact,sd.total_hours::float total,sd.combo_hours::float combo,sd.status,sd.record_count \"recordCount\",sd.issues FROM skud_days sd JOIN employees e ON e.id=sd.employee_id LEFT JOIN departments d ON d.id=e.department_id LEFT JOIN LATERAL(SELECT es.effective_from,st.id schedule_id,st.name schedule,st.code schedule_code,st.schedule_kind,st.cycle_pattern,st.requires_anchor FROM employee_schedules es JOIN schedule_templates st ON st.id=es.schedule_id WHERE es.employee_id=e.id AND es.effective_from<=sd.work_date AND(es.effective_to IS NULL OR es.effective_to>=sd.work_date)ORDER BY es.effective_from DESC LIMIT 1) s ON true WHERE sd.work_date>=($1 || '-01')::date AND sd.work_date<(($1 || '-01')::date + interval '1 month') ORDER BY d.name,e.full_name,sd.work_date`,
      [month],
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.post("/api/skud-days/import", async (req, res) => {
  const client = await pool.connect();
  try {
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    await client.query("BEGIN");
    await client.query(
      `CREATE TABLE IF NOT EXISTS skud_days(id BIGSERIAL PRIMARY KEY,employee_id INTEGER NOT NULL REFERENCES employees(id),work_date DATE NOT NULL,entry_time TIME,end_time TIME,fact_hours NUMERIC(6,2) NOT NULL DEFAULT 0,total_hours NUMERIC(6,2) NOT NULL DEFAULT 0,combo_hours NUMERIC(6,2) NOT NULL DEFAULT 0,status TEXT NOT NULL,record_count INTEGER NOT NULL DEFAULT 0,issues JSONB NOT NULL DEFAULT '[]'::jsonb,source TEXT NOT NULL DEFAULT 'skud_import',imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),UNIQUE(employee_id,work_date))`,
    );
    for (const row of rows) {
      await client.query(
        `INSERT INTO skud_days(employee_id,work_date,entry_time,end_time,fact_hours,total_hours,combo_hours,status,record_count,issues,source)VALUES($1,$2,NULLIF($3,'—')::time,NULLIF($4,'—')::time,$5,$6,$7,$8,$9,$10::jsonb,'skud_import')ON CONFLICT(employee_id,work_date)DO UPDATE SET entry_time=excluded.entry_time,end_time=excluded.end_time,fact_hours=excluded.fact_hours,total_hours=excluded.total_hours,combo_hours=excluded.combo_hours,status=excluded.status,record_count=excluded.record_count,issues=excluded.issues,source=excluded.source,imported_at=now()`,
        [
          row.id,
          row.date,
          row.entry || "—",
          row.exit || "—",
          Number(row.fact) || 0,
          Number(row.total) || 0,
          Number(row.combo) || 0,
          row.status || "Требует проверки",
          Number(row.recordCount) || 0,
          JSON.stringify(row.issues || []),
        ],
      );
    }
    await client.query("COMMIT");
    res.status(201).json({ ok: true, count: rows.length });
  } catch (e) {
    await client.query("ROLLBACK");
    res.status(400).json({ error: e.message });
  } finally {
    client.release();
  }
});
app.get("/api/schedule-overrides", async (req, res) => {
  try {
    const month = String(req.query.month || new Date().toISOString().slice(0, 7));
    const { rows } = await pool.query(
      `SELECT employee_id,to_char(work_date,'YYYY-MM-DD') work_date,to_char(start_time,'HH24:MI') start_time,to_char(end_time,'HH24:MI') end_time,reason,comment,changed_by FROM schedule_overrides WHERE work_date>=($1 || '-01')::date AND work_date<(($1 || '-01')::date + interval '1 month') ORDER BY work_date,employee_id`,
      [month],
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.post("/api/schedule-overrides", async (req, res) => {
  try {
    const {
      employee_id,
      work_date,
      start_time,
      end_time,
      reason,
      comment,
      changed_by,
    } = req.body;
    if (!employee_id || !work_date || !start_time || !end_time)
      return res.status(400).json({ error: "Не хватает данных корректировки" });
    const { rows } = await pool.query(
      `INSERT INTO schedule_overrides(employee_id,work_date,start_time,end_time,reason,comment,changed_by)VALUES($1,$2,$3,$4,$5,$6,$7)ON CONFLICT(employee_id,work_date)DO UPDATE SET start_time=excluded.start_time,end_time=excluded.end_time,reason=excluded.reason,comment=excluded.comment,changed_by=excluded.changed_by,created_at=now() RETURNING employee_id,to_char(work_date,'YYYY-MM-DD') work_date,to_char(start_time,'HH24:MI') start_time,to_char(end_time,'HH24:MI') end_time,reason,comment,changed_by`,
      [
        employee_id,
        work_date,
        start_time,
        end_time,
        reason || "manual",
        comment || null,
        changed_by || "user",
      ],
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
app.get("/api/departments", async (_q, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT d.id,d.external_id,d.name,d.active,count(e.id)::int employee_count,ds.schedule_id,st.name schedule_name,to_char(st.start_time,'HH24:MI') schedule_start,to_char(st.end_time,'HH24:MI') schedule_end FROM departments d LEFT JOIN employees e ON e.department_id=d.id AND e.active LEFT JOIN LATERAL(SELECT schedule_id FROM department_schedules WHERE department_id=d.id AND effective_from<=CURRENT_DATE AND(effective_to IS NULL OR effective_to>=CURRENT_DATE)ORDER BY effective_from DESC LIMIT 1)ds ON true LEFT JOIN schedule_templates st ON st.id=ds.schedule_id GROUP BY d.id,ds.schedule_id,st.name,st.start_time,st.end_time ORDER BY d.name`,
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.post("/api/departments", async (req, res) => {
  try {
    const { name } = req.body;
    if (!name?.trim())
      return res.status(400).json({ error: "Укажите название" });
    const { rows } = await pool.query(
      `INSERT INTO departments(name,active)VALUES($1,true)RETURNING *`,
      [name.trim()],
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
app.patch("/api/departments/:id", async (req, res) => {
  const client = await pool.connect();
  try {
    const id = Number(req.params.id),
      { name, active, schedule_id, effective_from, apply_to_employees } =
        req.body;
    await client.query("BEGIN");
    const { rows } = await client.query(
      `UPDATE departments SET name=COALESCE($2,name),active=COALESCE($3,active) WHERE id=$1 RETURNING *`,
      [id, name?.trim() || null, active ?? null],
    );
    if (!rows.length) throw new Error("Подразделение не найдено");
    if (schedule_id != null) {
      const from = effective_from || new Date().toISOString().slice(0, 10);
      await client.query(
        `UPDATE department_schedules SET effective_to=$2::date-1 WHERE department_id=$1 AND effective_from<$2 AND(effective_to IS NULL OR effective_to>=$2)`,
        [id, from],
      );
      await client.query(
        `INSERT INTO department_schedules(department_id,schedule_id,effective_from)VALUES($1,$2,$3)ON CONFLICT(department_id,effective_from)DO UPDATE SET schedule_id=excluded.schedule_id,effective_to=NULL`,
        [id, schedule_id, from],
      );
      if (apply_to_employees) {
        await client.query(
          `UPDATE employee_schedules es SET effective_to=$2::date-1 FROM employees e WHERE es.employee_id=e.id AND e.department_id=$1 AND es.effective_from<$2 AND(es.effective_to IS NULL OR es.effective_to>=$2)`,
          [id, from],
        );
        await client.query(
          `INSERT INTO employee_schedules(employee_id,schedule_id,effective_from,source)SELECT id,$2,$3,'department' FROM employees WHERE department_id=$1 AND active ON CONFLICT(employee_id,effective_from)DO UPDATE SET schedule_id=excluded.schedule_id,source='department',effective_to=NULL`,
          [id, schedule_id, from],
        );
      }
    }
    await client.query("COMMIT");
    res.json(rows[0]);
  } catch (e) {
    await client.query("ROLLBACK");
    res.status(400).json({ error: e.message });
  } finally {
    client.release();
  }
});
app.listen(Number(process.env.PORT || 3001), "0.0.0.0", () =>
  console.log(`WorkTime API: http://localhost:${process.env.PORT || 3001}`),
);
