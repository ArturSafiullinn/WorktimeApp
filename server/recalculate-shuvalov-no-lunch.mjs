// One-off correction. Defaults to preview; --apply writes in one transaction.
// A database backup must be taken before applying on production.
import { pool } from './db.mjs';
const client = await pool.connect();
const apply = process.argv.includes('--apply');
const round = x => Math.round(x * 100) / 100;
try {
  await client.query('BEGIN');
  const employee = (await client.query('SELECT id,full_name FROM employees WHERE id=154 FOR UPDATE')).rows[0];
  if (employee?.full_name !== 'Шувалов Михаил Валентинович') throw new Error('Employee identity mismatch');
  const overrides = await client.query("SELECT id FROM schedule_overrides WHERE employee_id=154 AND work_date >= '2026-10-01' AND work_date < '2026-12-01'");
  if (overrides.rowCount) throw new Error('Manual corrections need review before recalculation');
  const { rows } = await client.query(`SELECT *,to_char(work_date,'YYYY-MM-DD') work_day,
    CASE WHEN entry_time IS NOT NULL AND end_time IS NOT NULL THEN
    round(extract(epoch FROM (end_time-entry_time))/3600,2)::float END raw_hours
    FROM skud_days WHERE employee_id=154 AND work_date >= '2026-10-01' AND work_date < '2026-12-01' ORDER BY work_date FOR UPDATE`);
  const valid = rows.filter(r => Number(r.fact_hours)>0 && r.record_count>1 && r.raw_hours>0 && r.raw_hours<=16 && !['Нет входа','Нет выхода','Требует проверки'].includes(r.status));
  const october = valid.filter(r => r.work_day.startsWith('2026-10'));
  // Old timesheet: one hour lunch from five hours, then eight-hour daily cap.
  const oldHours = round(october.reduce((sum,r) => sum + Math.min(8,Math.max(0,round(r.raw_hours - (r.raw_hours>=5 ? 1 : 0)))),0));
  const correctedHours = round(october.reduce((sum,r) => sum+r.raw_hours,0));
  const difference = round(correctedHours-oldHours);
  if (october.length!==8 || oldHours!==52.49 || correctedHours!==60.67 || difference!==8.18) throw new Error('Source data changed; review totals');
  const report = {apply,employee,october:{oldHours,correctedHours,difference},november:{workedHours:round(valid.filter(r=>r.work_day.startsWith('2026-11')).reduce((sum,r)=>sum+r.raw_hours,0)),carryoverHours:difference},before:rows};
  if (apply) {
    await client.query(`CREATE TABLE IF NOT EXISTS payroll_adjustments(id BIGSERIAL PRIMARY KEY,employee_id INTEGER NOT NULL REFERENCES employees(id),pay_month DATE NOT NULL,source_month DATE NOT NULL,hours NUMERIC(8,2) NOT NULL,comment TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),UNIQUE(employee_id,pay_month,source_month))`);
    const existing = (await client.query("SELECT hours FROM payroll_adjustments WHERE employee_id=154 AND pay_month='2026-11-01' AND source_month='2026-10-01' FOR UPDATE")).rows[0];
    if (existing && Number(existing.hours)!==difference) throw new Error('Existing carryover differs');
    for (const row of valid) {
      await client.query('UPDATE skud_days SET fact_hours=$2,total_hours=$2+combo_hours WHERE id=$1',[row.id,row.raw_hours]);
    }
    await client.query(`INSERT INTO payroll_adjustments(employee_id,pay_month,source_month,hours,comment) VALUES(154,'2026-11-01','2026-10-01',$1,'Доплата за октябрь 2026: отмена вычета обеда, почасовая оплата') ON CONFLICT(employee_id,pay_month,source_month) DO NOTHING`,[difference]);
    await client.query('COMMIT');
  } else await client.query('ROLLBACK');
  console.log(JSON.stringify(report,null,2));
} catch (error) {
  await client.query('ROLLBACK');
  console.error(error.message);
  process.exitCode=1;
} finally { client.release(); await pool.end(); }

