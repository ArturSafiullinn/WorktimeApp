import XLSX from "xlsx";
import { pool } from "./db.mjs";

const skudFile =
  process.env.SKUD_EMPLOYEE_XLS ||
  "C:/Users/art22/Downloads/Сотрудник_20260713130439.xls";
const oneCFile =
  process.env.ONEC_EMPLOYEE_XLS ||
  "//Miserver/общая/Артур/Печать/сотрудники 13.07.2026.xlsx";

const norm = (value) => String(value ?? "").trim().replace(/\s+/g, " ");
const nameKey = (value) => norm(value).toLowerCase().replace(/ё/g, "е");
const readMatrix = (file) => {
  const workbook = XLSX.readFile(file, { cellDates: false });
  return XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], {
    header: 1,
    defval: "",
    raw: false,
  });
};

const skudRows = readMatrix(skudFile);
const skudEmployees = skudRows
  .slice(2)
  .filter((row) => Number(row[0]))
  .map((row) => ({
    id: Number(row[0]),
    name: norm(`${row[1]} ${row[2]}`),
    firstName: norm(row[1]),
    patronymic: norm(row[2]),
    departmentExternalId: Number(row[3]) || null,
    department: norm(row[4]) || "Без подразделения",
    gender: norm(row[5]) || null,
    cardNumber: norm(row[6]) || null,
    skudPosition: norm(row[8]) || null,
  }));

const activeWithPass = skudEmployees.filter(
  (employee) =>
    employee.cardNumber &&
    employee.departmentExternalId !== 3,
);

const oneCRows = readMatrix(oneCFile);
const oneCEmployees = oneCRows
  .slice(1)
  .filter((row) => norm(row[1]))
  .map((row) => ({
    name: norm(row[1]),
    key: nameKey(row[1]),
    structure: norm(row[3]),
    position: norm(row[4]),
    hiredAt: norm(row[5]) || null,
    firedAt: norm(row[6]) || null,
  }));

const activeOneCByName = new Map();
for (const row of oneCEmployees) {
  if (!row.firedAt && !activeOneCByName.has(row.key)) {
    activeOneCByName.set(row.key, row);
  }
}

const client = await pool.connect();
const report = {
  skudRows: skudEmployees.length,
  skudActiveWithPass: activeWithPass.length,
  oneCRows: oneCEmployees.length,
  oneCActiveRows: oneCEmployees.filter((row) => !row.firedAt).length,
  insertedEmployees: 0,
  reactivatedEmployees: 0,
  updatedEmployees: 0,
  updatedPositionsFromOneC: 0,
  deactivatedEmployeesWithoutActivePass: 0,
  createdOrReactivatedDepartments: 0,
  deactivatedEmptyDepartments: 0,
  oneCPositionNotFound: [],
};

try {
  await client.query("BEGIN");

  const existingEmployees = await client.query(
    "SELECT id,active FROM employees",
  );
  const existingById = new Map(
    existingEmployees.rows.map((row) => [Number(row.id), row]),
  );
  const activeSkudIds = activeWithPass.map((employee) => employee.id);

  const departmentIds = new Map();
  for (const employee of activeWithPass) {
    const saved = await client.query(
      `INSERT INTO departments(external_id,name,active)
       VALUES($1,$2,true)
       ON CONFLICT(name) DO UPDATE
       SET external_id=COALESCE(excluded.external_id,departments.external_id),
           active=true
       RETURNING id`,
      [employee.departmentExternalId, employee.department],
    );
    if (!departmentIds.has(employee.department)) {
      report.createdOrReactivatedDepartments++;
    }
    departmentIds.set(employee.department, saved.rows[0].id);
  }

  for (const employee of activeWithPass) {
    const oneC = activeOneCByName.get(nameKey(employee.name));
    const position = oneC?.position || employee.skudPosition || null;
    if (oneC?.position) report.updatedPositionsFromOneC++;
    else report.oneCPositionNotFound.push({
      id: employee.id,
      name: employee.name,
      department: employee.department,
    });

    const existing = existingById.get(employee.id);
    if (!existing) report.insertedEmployees++;
    else if (!existing.active) report.reactivatedEmployees++;
    else report.updatedEmployees++;

    await client.query(
      `INSERT INTO employees(
        id,full_name,first_name,patronymic,department_id,card_number,gender,
        position_name,active,updated_at
       )
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,true,now())
       ON CONFLICT(id) DO UPDATE SET
        full_name=excluded.full_name,
        first_name=excluded.first_name,
        patronymic=excluded.patronymic,
        department_id=excluded.department_id,
        card_number=excluded.card_number,
        gender=excluded.gender,
        position_name=COALESCE(excluded.position_name,employees.position_name),
        active=true,
        updated_at=now()`,
      [
        employee.id,
        employee.name,
        employee.firstName,
        employee.patronymic || null,
        departmentIds.get(employee.department),
        employee.cardNumber,
        employee.gender,
        position,
      ],
    );
  }

  const deactivated = await client.query(
    `UPDATE employees
     SET active=false,updated_at=now()
     WHERE active=true AND NOT (id=ANY($1::int[]))
     RETURNING id,full_name`,
    [activeSkudIds],
  );
  report.deactivatedEmployeesWithoutActivePass = deactivated.rowCount;

  const inactiveDepartments = await client.query(
    `UPDATE departments
     SET active=false
     WHERE active=true
       AND NOT EXISTS (
         SELECT 1 FROM employees
         WHERE employees.department_id=departments.id AND employees.active=true
       )
     RETURNING id,name`,
  );
  report.deactivatedEmptyDepartments = inactiveDepartments.rowCount;

  await client.query("COMMIT");
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
