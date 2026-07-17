import * as XLSX from "xlsx";

export type SkudStatus =
  | "ОК"
  | "Нет входа"
  | "Нет выхода"
  | "Опоздание"
  | "Ранний уход"
  | "Выход в течение дня"
  | "Изменен график"
  | "Ручная корректировка"
  | "Требует проверки";
export type SkudEmployee = {
  id: number;
  name: string;
  initials: string;
  department: string;
  schedule: string;
  entry: string;
  exit: string;
  fact: number;
  total: number;
  combo: number;
  status: SkudStatus;
  date?: string;
  recordCount?: number;
  issues?: string[];
};

type Raw = {
  id: number;
  name: string;
  department: string;
  date: string;
  first: number | null;
  last: number | null;
  count: number;
};
type Schedule = {
  start: number;
  end: number;
  lunch: number;
  minLunch: number;
  overnight?: boolean;
  cleanTime?: boolean;
};

// Правила перенесены из WorkSchedule/config.py и mappings.py.
export const SKUD_RULES = {
  lateThresholdMin: 30,
  earlyThresholdMin: 30,
  minValidIntervalMin: 60,
  overtimeThresholdMin: 30,
  shiftToleranceMin: 60,
};
const overnightIds = new Set([
  250, 251, 252, 254, 255, 256, 257, 258, 259, 234, 235, 237,
]);

function scheduleFor(id: number, department: string, date: string): Schedule {
  if (overnightIds.has(id))
    return {
      start: [250, 251, 252, 254, 255, 256, 257, 258, 259].includes(id)
        ? 420
        : 480,
      end: [250, 251, 252, 254, 255, 256, 257, 258, 259].includes(id)
        ? 420
        : 480,
      lunch: 0,
      minLunch: 0,
      overnight: true,
    };
  if (id === 193) return { start: 450, end: 930, lunch: 0, minLunch: 0 };
  if (id === 380 && date >= "2026-05-28")
    return { start: 420, end: 960, lunch: 60, minLunch: 300 };
  if (id === 154)
    return { start: 0, end: 1440, lunch: 0, minLunch: 0, cleanTime: true };
  const d = department.toLowerCase();
  if (d.includes("литей") || d.includes("тпа"))
    return { start: 480, end: 1200, lunch: 60, minLunch: 300 };
  return { start: 480, end: 1020, lunch: 60, minLunch: 300 };
}
function minutes(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number")
    return v < 1 ? Math.round(v * 1440) : Math.round((v % 1) * 1440);
  const m = String(v).match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  return m ? +m[1] * 60 + +m[2] + Math.round(+(m[3] || 0) / 60) : null;
}
function isoDate(v: unknown): string {
  if (v instanceof Date)
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  const s = String(v ?? "").trim();
  const m = s.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  return m
    ? `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`
    : s.slice(0, 10);
}
const hm = (m: number | null) =>
  m == null
    ? "—"
    : `${String(Math.floor((m % 1440) / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((x) => x[0])
    .join("")
    .toUpperCase();
function statusFor(
  start: number | null,
  end: number | null,
  count: number,
  s: Schedule,
  duration: number,
  issues: string[],
): SkudStatus {
  if (start == null && end == null) {
    issues.push("Нет данных СКУД при наличии рабочего графика");
    return "Требует проверки";
  }
  if (count <= 1 || start === end) {
    const mark = start ?? end!;
    if (mark <= s.start + 240) {
      issues.push("Есть только одна утренняя отметка");
      return "Нет выхода";
    }
    issues.push("Есть только одна вечерняя отметка");
    return "Нет входа";
  }
  if (duration < SKUD_RULES.minValidIntervalMin) {
    issues.push(`Интервал меньше ${SKUD_RULES.minValidIntervalMin} минут`);
    return "Требует проверки";
  }
  if (duration > 16 * 60 && !s.overnight) {
    issues.push("Слишком длинный рабочий день");
    return "Требует проверки";
  }
  if (s.overnight) return "ОК";
  if (start! > s.start + SKUD_RULES.lateThresholdMin) {
    issues.push(
      `Вход позже графика более чем на ${SKUD_RULES.lateThresholdMin} минут`,
    );
    return "Опоздание";
  }
  if (end! < s.end - SKUD_RULES.earlyThresholdMin) {
    issues.push(
      `Выход раньше графика более чем на ${SKUD_RULES.earlyThresholdMin} минут`,
    );
    return "Ранний уход";
  }
  if (count > 2) {
    issues.push(`Зафиксировано событий: ${count}`);
    return "Выход в течение дня";
  }
  return "ОК";
}
function calculate(raw: Raw): SkudEmployee {
  const s = scheduleFor(raw.id, raw.department, raw.date),
    issues: string[] = [];
  let duration =
    raw.first != null && raw.last != null ? raw.last - raw.first : 0;
  if (s.overnight && duration < 0) duration += 1440;
  const status = statusFor(raw.first, raw.last, raw.count, s, duration, issues);
  let fact = 0;
  if (
    status !== "Нет входа" &&
    status !== "Нет выхода" &&
    status !== "Требует проверки" &&
    raw.first != null &&
    raw.last != null
  ) {
    if (s.cleanTime || s.overnight) fact = duration / 60;
    else {
      const worked = Math.max(
        0,
        Math.min(raw.last, s.end) - Math.max(raw.first, s.start),
      );
      fact = Math.max(0, (worked - (worked >= s.minLunch ? s.lunch : 0)) / 60);
    }
  }
  fact = Math.round(fact * 100) / 100;
  return {
    id: raw.id,
    name: raw.name,
    initials: initials(raw.name),
    department: raw.department,
    schedule: `${hm(s.start)}–${hm(s.end)}`,
    entry: hm(raw.first),
    exit: raw.count <= 1 ? "—" : hm(raw.last),
    fact,
    total: fact,
    combo: 0,
    status,
    date: raw.date,
    recordCount: raw.count,
    issues,
  };
}

export function parseSkudWorkbook(buffer: ArrayBuffer): SkudEmployee[] {
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: null,
    raw: true,
  });
  const hi = rows.findIndex(
    (r) =>
      Array.isArray(r) && r.some((x) => String(x).trim() === "ID сотрудника"),
  );
  if (hi < 0) throw new Error("Не найдена строка заголовков «ID сотрудника»");
  const headers = (rows[hi] as unknown[]).map((x) => String(x ?? "").trim());
  const col = (n: string) => headers.indexOf(n);
  const required = [
    "ID сотрудника",
    "Имя",
    "Дата записи",
    "Самое раннее время",
    "Самое позднее время",
  ];
  const missing = required.filter((n) => col(n) < 0);
  if (missing.length)
    throw new Error(`В файле нет колонок: ${missing.join(", ")}`);
  const map = new Map<string, Raw>();
  for (const row of rows.slice(hi + 1)) {
    const id = Number(row[col("ID сотрудника")]);
    if (!Number.isFinite(id)) continue;
    const date = isoDate(row[col("Дата записи")]);
    if (!date) continue;
    const key = `${id}|${date}`,
      first = minutes(row[col("Самое раннее время")]),
      last = minutes(row[col("Самое позднее время")]);
    const name = [
      row[col("Имя")],
      col("Фамилия") >= 0 ? row[col("Фамилия")] : null,
    ]
      .filter(Boolean)
      .join(" ")
      .trim();
    const department =
      col("Имя отдела") >= 0
        ? String(row[col("Имя отдела")] ?? "Без подразделения")
        : "Без подразделения";
    const count =
      col("Записано раз") >= 0 ? Number(row[col("Записано раз")]) || 1 : 1;
    const old = map.get(key);
    map.set(
      key,
      old
        ? {
            ...old,
            first:
              old.first == null
                ? first
                : first == null
                  ? old.first
                  : Math.min(old.first, first),
            last:
              old.last == null
                ? last
                : last == null
                  ? old.last
                  : Math.max(old.last, last),
            count: old.count + count,
          }
        : { id, name, department, date, first, last, count },
    );
  }
  if (!map.size)
    throw new Error("В файле не найдено ни одной записи сотрудника");
  const raw = [...map.values()],
    tails = new Set<string>();
  // Суточники: как в WorkSchedule, склеиваем вход первого дня и выход следующего.
  for (const id of overnightIds) {
    const group = raw
      .filter((r) => r.id === id)
      .sort((a, b) => a.date.localeCompare(b.date));
    for (let i = 0; i < group.length - 1; i++) {
      const head = group[i],
        tail = group[i + 1],
        s = scheduleFor(id, head.department, head.date);
      const dayGap = (Date.parse(tail.date) - Date.parse(head.date)) / 86400000;
      if (dayGap !== 1 || head.first == null || tail.last == null) continue;
      const nearStart =
        Math.abs(head.first - s.start) <= SKUD_RULES.shiftToleranceMin;
      const nearEnd =
        Math.abs(tail.last - s.end) <= SKUD_RULES.shiftToleranceMin;
      const duration = 1440 - head.first + tail.last;
      if (nearStart && nearEnd && duration >= 23 * 60 && duration <= 25 * 60) {
        head.last = tail.last;
        head.count = Math.max(2, head.count + tail.count);
        tails.add(`${tail.id}|${tail.date}`);
        i++;
      }
    }
  }
  return raw
    .filter((r) => !tails.has(`${r.id}|${r.date}`))
    .map(calculate)
    .sort((a, b) =>
      (a.department + a.name + a.date).localeCompare(
        b.department + b.name + b.date,
        "ru",
      ),
    );
}
