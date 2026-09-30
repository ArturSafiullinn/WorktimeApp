import * as XLSX from "xlsx";

export type ZkBioEmployeeImportRow = {
  id: number;
  name: string;
  cardNumber: string;
  active: boolean;
  sourceDepartment: string;
};

const norm = (value: unknown) => String(value ?? "").trim().replace(/\s+/g, " ");
const normalizedDepartment = (value: string) => value.toLowerCase().replace(/ё/g, "е");

export function parseZkBioEmployeeWorkbook(buffer: ArrayBuffer): ZkBioEmployeeImportRow[] {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
  });
  const headerIndex = rows.findIndex(
    (row) =>
      Array.isArray(row) &&
      row.some((cell) => norm(cell) === "ID сотрудника") &&
      row.some((cell) => norm(cell) === "Номер карты"),
  );
  if (headerIndex < 0)
    throw new Error("В файле не найдены колонки «ID сотрудника» и «Номер карты»");
  const headers = rows[headerIndex].map(norm);
  const col = (name: string) => headers.indexOf(name);
  const required = ["ID сотрудника", "Имя", "Фамилия", "Имя отдела", "Номер карты"];
  const missing = required.filter((name) => col(name) < 0);
  if (missing.length) throw new Error(`В файле нет колонок: ${missing.join(", ")}`);

  const byId = new Map<number, ZkBioEmployeeImportRow>();
  for (const row of rows.slice(headerIndex + 1)) {
    const id = Number(row[col("ID сотрудника")]);
    if (!Number.isInteger(id) || id <= 0) continue;
    const sourceDepartment = norm(row[col("Имя отдела")]);
    const departmentKey = normalizedDepartment(sourceDepartment);
    byId.set(id, {
      id,
      name:
        [row[col("Имя")], row[col("Фамилия")]]
          .map(norm)
          .filter(Boolean)
          .join(" ") || `Сотрудник #${id}`,
      cardNumber: norm(row[col("Номер карты")]),
      active:
        departmentKey !== "уволенные" &&
        departmentKey !== "все сотрудники",
      sourceDepartment,
    });
  }
  if (!byId.size) throw new Error("В файле не найдено ни одного сотрудника");
  return [...byId.values()].sort((a, b) => a.id - b.id);
}
