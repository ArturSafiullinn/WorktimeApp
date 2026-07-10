import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  CalendarCheck,
  ChevronRight,
  Clock3,
  Download,
  FileCheck2,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Search,
  Settings2,
  ShieldCheck,
  UploadCloud,
  Users,
  X,
} from "lucide-react";
import { parseSkudWorkbook, SKUD_RULES } from "./skud";
import "./styles.css";

type Role = "admin" | "observer" | "boss";
type Status =
  | "ОК"
  | "Нет входа"
  | "Нет выхода"
  | "Опоздание"
  | "Ранний уход"
  | "Выход в течение дня"
  | "Изменен график"
  | "Ручная корректировка"
  | "Требует проверки";
type Employee = {
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
  status: Status;
  date?: string;
  recordCount?: number;
  issues?: string[];
  departmentId?: number;
  scheduleId?: number;
  scheduleCode?: string;
  scheduleKind?: string;
  schedulePattern?: any;
  scheduleEffectiveFrom?: string;
  needsReview?: boolean;
  reviewNote?: string;
};
const base: Employee[] = [];
type Account = { pass: string; role: Role; name: string };
const defaultAccounts: Record<string, Account> = {
  admin: { pass: "admin", role: "admin", name: "Анна Викторовна" },
  observer: { pass: "observer", role: "observer", name: "Олег Сергеевич" },
  boss: { pass: "boss", role: "boss", name: "Михаил Петрович" },
};
const loadAccounts = (): Record<string, Account> => {
  try {
    const stored = localStorage.getItem("accounts");
    return stored ? JSON.parse(stored) : { ...defaultAccounts };
  } catch {
    return { ...defaultAccounts };
  }
};
const saveAccounts = (next: Record<string, Account>) =>
  localStorage.setItem("accounts", JSON.stringify(next));
const accounts: Record<string, Account> = loadAccounts();
const employeeFromApi = (e: any): Employee => ({
  id: e.id,
  name: e.name,
  initials: e.name
    .split(/\s+/)
    .slice(0, 2)
    .map((x: string) => x[0])
    .join(""),
  department: e.department,
  schedule: e.schedule || "График не назначен",
  departmentId: Number(e.department_id),
  scheduleId: Number(e.schedule_id),
  scheduleCode: e.schedule_code,
  scheduleKind: e.schedule_kind,
  schedulePattern: e.cycle_pattern,
  scheduleEffectiveFrom: e.schedule_effective_from?.slice(0, 10),
  needsReview: e.needs_review,
  reviewNote: e.review_note,
  entry: e.entry || "—",
  exit: e.exit || "—",
  fact: Number(e.fact) || 0,
  total: Number(e.total) || 0,
  combo: Number(e.combo) || 0,
  status: e.status || ("Требует проверки" as Status),
  date: e.date,
  recordCount: Number(e.recordCount) || 0,
  issues: e.issues || ["Посещения за выбранную дату ещё не загружены"],
});
const roleName = {
  admin: "Администратор",
  observer: "Наблюдатель",
  boss: "Начальник участка",
};
const fmt = (n: number) =>
  n.toLocaleString("ru-RU", { maximumFractionDigits: 1 }) + " ч";
function App() {
  const [role, setRole] = useState<Role | null>(
    () => localStorage.getItem("role") as Role,
  );
  const [user, setUser] = useState(localStorage.getItem("user") || "");
  const [page, setPage] = useState("dashboard");
  const [employees, setEmployees] = useState<Employee[]>(base);
  const [selected, setSelected] = useState<Employee | null>(null);
  const [menu, setMenu] = useState(false);
  useEffect(() => {
    Promise.all([
      fetch("/api/employees").then((r) =>
        r.ok ? r.json() : Promise.reject(new Error("API недоступен")),
      ),
      fetch("/api/skud-days?month=2026-07").then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([employeeRows, skudRows]) =>
        setEmployees([
          ...employeeRows.map(employeeFromApi),
          ...skudRows.map(employeeFromApi),
        ]),
      )
      .catch(() => setEmployees([]));
  }, []);
  if (!role)
    return (
      <Login
        onLogin={(u, r) => {
          setUser(u);
          setRole(r);
          localStorage.setItem("user", u);
          localStorage.setItem("role", r);
        }}
      />
    );
  const go = (p: string, e?: Employee) => {
    setPage(p);
    setSelected(e || null);
    setMenu(false);
    scrollTo(0, 0);
  };
  const logout = () => {
    localStorage.clear();
    setRole(null);
    setPage("dashboard");
  };
  return (
    <div className="app">
      <aside className={menu ? "open" : ""}>
        <div className="brand">
          <span>
            <Clock3 />
          </span>
          <b>Смена</b>
          <button className="close" onClick={() => setMenu(false)}>
            <X />
          </button>
        </div>
        <nav>
          <Nav
            icon={<LayoutDashboard />}
            label="Обзор"
            active={page === "dashboard"}
            onClick={() => go("dashboard")}
          />
          <Nav
            icon={<CalendarCheck />}
            label="Табель"
            active={page === "timesheet"}
            onClick={() => go("timesheet")}
          />
          {role !== "observer" && (
            <Nav
              icon={<AlertTriangle />}
              label="Проблемы"
              badge={String(employees.filter((e) => e.status !== "ОК").length)}
              active={page === "problems"}
              onClick={() => go("problems")}
            />
          )}{" "}
          {role === "boss" && (
            <Nav
              icon={<FileCheck2 />}
              label="Подтверждение"
              active={page === "approval"}
              onClick={() => go("approval")}
            />
          )}{" "}
          {role === "admin" && (
            <>
              <Nav
                icon={<UploadCloud />}
                label="Импорт СКУД"
                active={page === "import"}
                onClick={() => go("import")}
              />
              <Nav
                icon={<Users />}
                label="Сотрудники"
                active={page === "employees"}
                onClick={() => go("employees")}
              />
              <Nav
                icon={<Settings2 />}
                label="Пользователи"
                active={page === "admin"}
                onClick={() => go("admin")}
              />
              <Nav
                icon={<Building2 />}
                label="Подразделения"
                active={page === "departments"}
                onClick={() => go("departments")}
              />
            </>
          )}
        </nav>
        <div className="asideUser">
          <div className="avatar sm">
            {accounts[user]?.name
              ?.split(" ")
              .map((x: string) => x[0])
              .slice(0, 2)}
          </div>
          <div>
            <b>{accounts[user]?.name}</b>
            <small>{roleName[role]}</small>
          </div>
          <button onClick={logout}>
            <LogOut />
          </button>
        </div>
      </aside>
      {menu && <div className="shade" onClick={() => setMenu(false)} />}
      <main>
        <header>
          <button className="hamb" onClick={() => setMenu(true)}>
            <Menu />
          </button>
          <div>
            <b>{title(page)}</b>
            <small>6 июля 2026, понедельник</small>
          </div>
          <div className="headerRight">
            <span className="sync">
              <i />
              СКУД синхронизирован
            </span>
            <button className="avatar sm">{accounts[user]?.name?.[0]}</button>
          </div>
        </header>
        <section>
          {page === "dashboard" && (
            <Dashboard role={role} go={go} employees={employees} />
          )}{" "}
          {page === "timesheet" && <Timesheet employees={employees} go={go} />}{" "}
          {page === "problems" && <Problems employees={employees} go={go} />}{" "}
          {page === "detail" && selected && (
            <Detail
              e={employees.find((x) => x.id === selected.id) || selected}
              role={role}
              go={go}
              update={(v) =>
                setEmployees(employees.map((x) => (x.id === v.id ? v : x)))
              }
            />
          )}{" "}
          {page === "schedule" && selected && (
            <Schedule
              e={selected}
              go={go}
              update={(v) =>
                setEmployees(employees.map((x) => (x.id === v.id ? v : x)))
              }
            />
          )}{" "}
          {page === "combo" && selected && (
            <Combination
              e={selected}
              go={go}
              update={(v) =>
                setEmployees(employees.map((x) => (x.id === v.id ? v : x)))
              }
            />
          )}{" "}
          {page === "approval" && <Approval employees={employees} />}{" "}
          {page === "import" && (
            <SkudImport
              onImport={setEmployees}
              employees={employees}
              go={go}
            />
          )}{" "}
          {page === "employees" && (
            <EmployeeDirectory
              employees={employees}
              setEmployees={setEmployees}
            />
          )}
          {page === "admin" && <Admin />}
          {page === "departments" && (
            <Departments employees={employees} setEmployees={setEmployees} />
          )}
        </section>
      </main>
    </div>
  );
}
function Login({ onLogin }: { onLogin: (u: string, r: Role) => void }) {
  const [u, setU] = useState("boss"),
    [p, setP] = useState("boss"),
    [err, setErr] = useState("");
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (accounts[u]?.pass === p) onLogin(u, accounts[u].role);
    else setErr("Неверный логин или пароль");
  };
  return (
    <div className="login">
      <div className="loginArt">
        <div className="mark">
          <Clock3 />
        </div>
        <div>
          <h1>
            Время работает
            <br />
            на вас
          </h1>
          <p>
            Прозрачный учет рабочего времени
            <br />
            на основе данных СКУД
          </p>
        </div>
        <small>Заводская система учета · 2026</small>
      </div>
      <form className="loginForm" onSubmit={submit}>
        <div className="mobileLogo">
          <span>
            <Clock3 />
          </span>
          <b>Смена</b>
        </div>
        <div>
          <span className="eyebrow">ДОБРО ПОЖАЛОВАТЬ</span>
          <h2>Вход в систему</h2>
          <p>Используйте корпоративную учетную запись</p>
        </div>
        <label>
          Логин
          <input
            value={u}
            onChange={(e) => setU(e.target.value)}
            placeholder="Введите логин"
          />
        </label>
        <label>
          Пароль
          <input
            type="password"
            value={p}
            onChange={(e) => setP(e.target.value)}
            placeholder="Введите пароль"
          />
        </label>
        {err && <div className="error">{err}</div>}
        <button className="primary" type="submit">
          Войти <ChevronRight />
        </button>
        <div className="test">
          <b>Тестовые аккаунты</b>
          {["boss", "observer", "admin"].map((x) => (
            <button
              type="button"
              onClick={() => {
                setU(x);
                setP(x);
              }}
              key={x}
            >
              <span>{roleName[accounts[x].role as Role]}</span>
              <code>
                {x} / {x}
              </code>
            </button>
          ))}
        </div>
      </form>
    </div>
  );
}
const Nav = ({ icon, label, badge, active, onClick }: any) => (
  <button className={active ? "active" : ""} onClick={onClick}>
    {icon}
    <span>{label}</span>
    {badge && <em>{badge}</em>}
  </button>
);
function Dashboard({
  role,
  go,
  employees,
}: {
  role: Role;
  go: any;
  employees: Employee[];
}) {
  const problem = employees.filter((x) => x.status !== "ОК").length;
  return (
    <>
      <div className="hero">
        <div>
          <span className="eyebrow">ОБЗОР СМЕНЫ</span>
          <h1>
            Добрый день,{" "}
            {role === "boss"
              ? "Михаил Петрович"
              : role === "admin"
                ? "Анна Викторовна"
                : "Олег Сергеевич"}
            !
          </h1>
          <p>
            {role === "boss"
              ? "В механическом цехе есть записи, которые требуют вашего внимания."
              : "Актуальная картина рабочего времени по предприятию."}
          </p>
        </div>
        <div className="dateCard">
          <CalendarCheck />
          <div>
            <b>Июль 2026</b>
            <small>Табель открыт до 31 июля</small>
          </div>
        </div>
      </div>
      <div className="stats">
        <Stat
          n={String(employees.length)}
          label="Сотрудников в выборке"
          sub={`${employees.filter((e) => e.entry !== "—").length} с отметками СКУД`}
        />
        <Stat
          n={fmt(employees.reduce((sum, e) => sum + e.fact, 0))}
          label="Отработано"
          sub="по загруженным данным"
        />
        <Stat
          n={String(problem)}
          label="Требуют внимания"
          sub={`${employees.filter((e) => ["Нет входа", "Нет выхода", "Требует проверки"].includes(e.status)).length} критических`}
          warn
        />
        <Stat
          n={
            employees.length
              ? `${Math.round(((employees.length - problem) / employees.length) * 100)}%`
              : "0%"
          }
          label="Без исключений"
          sub="в текущей выборке"
        />
      </div>
      <div className="grid2">
        <div className="panel">
          <div className="panelHead">
            <div>
              <span className="eyebrow">ТРЕБУЕТ ВНИМАНИЯ</span>
              <h2>Проблемные записи</h2>
            </div>
            <button className="link" onClick={() => go("problems")}>
              Все записи <ChevronRight />
            </button>
          </div>
          {employees
            .filter((x) => x.status !== "ОК")
            .slice(0, 4)
            .map((e) => (
              <PersonRow e={e} key={e.id} onClick={() => go("detail", e)} />
            ))}
        </div>
        <div className="panel quick">
          <div className="panelHead">
            <div>
              <span className="eyebrow">БЫСТРЫЕ ДЕЙСТВИЯ</span>
              <h2>Что нужно сделать</h2>
            </div>
          </div>
          <Quick
            icon={<AlertTriangle />}
            title="Разобрать исключения"
            text={`${problem} записей ожидают проверки`}
            onClick={() => go("problems")}
          />
          <Quick
            icon={<CalendarCheck />}
            title="Открыть табель"
            text="Данные за 6 июля"
            onClick={() => go("timesheet")}
          />
          <Quick
            icon={<FileCheck2 />}
            title="Подтвердить месяц"
            text="После разбора всех исключений"
            onClick={() => go("approval")}
          />
        </div>
      </div>
    </>
  );
}
const Stat = ({ n, label, sub, warn }: any) => (
  <div className={"stat " + (warn ? "warn" : "")}>
    <b>{n}</b>
    <span>{label}</span>
    <small>{sub}</small>
  </div>
);
const PersonRow = ({ e, onClick }: { e: Employee; onClick: any }) => (
  <button className="personRow" onClick={onClick}>
    <span className="avatar">{e.initials}</span>
    <div>
      <b>{e.name}</b>
      <small>
        {e.schedule} · {e.entry} → {e.exit}
      </small>
    </div>
    <Status s={e.status} />
    <ChevronRight />
  </button>
);
const Quick = ({ icon, title, text, onClick }: any) => (
  <button className="quickRow" onClick={onClick}>
    <span>{icon}</span>
    <div>
      <b>{title}</b>
      <small>{text}</small>
    </div>
    <ChevronRight />
  </button>
);
type TimesheetCell = {
  date: string;
  day: number;
  weekday: string;
  label: string;
  kind:
    | "fact"
    | "planned"
    | "off"
    | "review"
    | "vacation"
    | "unknown";
  start?: string;
  end?: string;
  hours: number;
  status?: Status;
  planned?: boolean;
  override?: WorkOverride;
};
type WorkOverride = {
  employee_id: number;
  work_date: string;
  start_time: string;
  end_time: string;
  reason: string;
  comment?: string;
  changed_by: string;
};
const monthStart = "2026-07-01";
const monthDays = Array.from({ length: 31 }, (_, i) => {
  const date = new Date(2026, 6, i + 1),
    weekday = new Intl.DateTimeFormat("ru-RU", { weekday: "short" }).format(
      date,
    );
  return {
    date: `2026-07-${String(i + 1).padStart(2, "0")}`,
    day: i + 1,
    weekday,
  };
});
const dayDiff = (from: string, to: string) =>
  Math.floor((Date.parse(to) - Date.parse(from)) / 86400000);
const timeMinutes = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};
const durationHours = (start: string, end: string) => {
  let diff = timeMinutes(end) - timeMinutes(start);
  if (diff < 0) diff += 24 * 60;
  return Math.round((diff / 60) * 100) / 100;
};
function plannedCellFor(
  e: Employee,
  d: (typeof monthDays)[number],
): TimesheetCell {
  const base = { date: d.date, day: d.day, weekday: d.weekday };
  if (e.needsReview && e.reviewNote?.toLowerCase().includes("отпуск"))
    return { ...base, label: "ОТ", kind: "vacation", hours: 0 };
  if (e.needsReview && !e.scheduleCode)
    return { ...base, label: "?", kind: "review", hours: 0 };
  if (!e.scheduleCode)
    return { ...base, label: "", kind: "unknown", hours: 0 };
  if (e.scheduleCode === "standard" || e.scheduleKind === "weekly") {
    const wd = new Date(d.date).getDay();
    if (wd === 0 || wd === 6)
      return { ...base, label: "В", kind: "off", hours: 0 };
    return {
      ...base,
      label: "пл",
      kind: "planned",
      start: "08:00",
      end: "17:00",
      hours: 0,
      planned: true,
    };
  }
  if (e.scheduleCode === "tpa_setup_monthly")
    return { ...base, label: "таб.", kind: "review", hours: 0 };
  const pattern = Array.isArray(e.schedulePattern) ? e.schedulePattern : [];
  if (e.scheduleKind === "cycle" && pattern.length && e.scheduleEffectiveFrom) {
    const index =
        ((dayDiff(e.scheduleEffectiveFrom, d.date) % pattern.length) +
          pattern.length) %
        pattern.length,
      item = pattern[index];
    if (!item || item.type === "off")
      return { ...base, label: "В", kind: "off", hours: 0 };
    const start = item.start || "08:00",
      end = item.end || "17:00",
      hours =
        item.type === "24h"
          ? 24
          : e.scheduleCode === "foundry_2x2"
            ? item.type === "night"
              ? 15
              : 9
            : 12;
    return {
      ...base,
      label: "пл",
      kind: "planned",
      start,
      end,
      hours: 0,
      planned: true,
    };
  }
  return { ...base, label: "?", kind: "review", hours: 0 };
}
function cellFor(
  e: Employee,
  d: (typeof monthDays)[number],
  fact?: Employee,
  override?: WorkOverride,
): TimesheetCell {
  const base = { date: d.date, day: d.day, weekday: d.weekday };
  if (override) {
    const hours = durationHours(override.start_time, override.end_time);
    return {
      ...base,
      label: `${hours.toLocaleString("ru-RU")}ч`,
      kind: "fact",
      start: override.start_time,
      end: override.end_time,
      hours,
      status: "Ручная корректировка",
      override,
    };
  }
  if (fact) {
    const hours = fact.total || fact.fact || 0;
    const bad = ["Нет входа", "Нет выхода", "Требует проверки"].includes(
      fact.status,
    );
    return {
      ...base,
      label: bad ? "!" : hours ? `${hours.toLocaleString("ru-RU")}ч` : "0",
      kind: bad ? "review" : "fact",
      start: fact.entry,
      end: fact.exit,
      hours,
      status: fact.status,
    };
  }
  return plannedCellFor(e, d);
}
function Timesheet({ employees, go }: { employees: Employee[]; go: any }) {
  const [q, setQ] = useState("");
  const [department, setDepartment] = useState("all");
  const [overrides, setOverrides] = useState<WorkOverride[]>([]);
  const [opened, setOpened] = useState<{
    employee: Employee;
    cell: TimesheetCell;
  } | null>(null);
  useEffect(() => {
    fetch("/api/schedule-overrides?month=2026-07")
      .then((r) => (r.ok ? r.json() : []))
      .then(setOverrides)
      .catch(() => setOverrides([]));
  }, []);
  const roster = Array.from(
    employees
      .reduce((map, e) => {
        if (!map.has(e.id) || !e.date) map.set(e.id, e);
        return map;
      }, new Map<number, Employee>())
      .values(),
  );
  const facts = employees.reduce((map, e) => {
    if (e.date) map.set(`${e.id}|${e.date}`, e);
    return map;
  }, new Map<string, Employee>());
  const overrideMap = overrides.reduce((map, row) => {
    map.set(`${row.employee_id}|${row.work_date}`, row);
    return map;
  }, new Map<string, WorkOverride>());
  const factFor = (e: Employee, date: string) => facts.get(`${e.id}|${date}`);
  const overrideFor = (e: Employee, date: string) =>
    overrideMap.get(`${e.id}|${date}`);
  const departments = Array.from(
    new Set(roster.map((e) => e.department || "Без подразделения")),
  ).sort((a, b) => a.localeCompare(b, "ru"));
  const list = roster.filter(
    (e) =>
      e.name.toLowerCase().includes(q.toLowerCase()) &&
      (department === "all" || e.department === department),
  );
  const groups = departments
    .filter((d) => department === "all" || d === department)
    .map((name) => ({
      name,
      rows: list.filter((e) => (e.department || "Без подразделения") === name),
    }))
    .filter((g) => g.rows.length);
  const monthTotal = (e: Employee) =>
    monthDays.reduce(
      (sum, d) =>
        sum + cellFor(e, d, factFor(e, d.date), overrideFor(e, d.date)).hours,
      0,
    );
  const visibleTotal = list.reduce((sum, e) => sum + monthTotal(e), 0);
  const reviewCount = list.filter((e) => e.needsReview).length;
  return (
    <>
      <PageHead
        eye="УЧЕТ РАБОЧЕГО ВРЕМЕНИ"
        title="Табель за июль"
        text="Месячная сетка по подразделениям: факт из СКУД, корректировки и пометки"
      />
      <div className="timesheetSummary">
        <Stat
          n={String(list.length)}
          label="Сотрудников"
          sub={department === "all" ? "во всех подразделениях" : department}
        />
        <Stat
          n={fmt(visibleTotal)}
          label="Факт по данным"
          sub="после импорта СКУД"
        />
        <Stat
          n={String(groups.length)}
          label="Подразделений"
          sub="в текущей выборке"
        />
        <Stat
          n={String(reviewCount)}
          label="С проверкой"
          sub="отпуск, уточнение или ручной табель"
          warn={reviewCount > 0}
        />
      </div>
      <div className="toolbar">
        <div className="search">
          <Search />
          <input
            placeholder="Найти сотрудника"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <select
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
        >
          <option value="all">Все подразделения</option>
          {departments.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <button className="outline">
          <Download />
          Экспорт
        </button>
      </div>
      <div className="timesheetLegend">
        <span>
          <i className="day" /> День
        </span>
        <span>
          <i className="fact" /> Факт
        </span>
        <span>
          <i className="plan" /> План без факта
        </span>
        <span>
          <i className="night" /> Ночь
        </span>
        <span>
          <i className="full" /> 24 часа
        </span>
        <span>
          <i className="vac" /> Отпуск
        </span>
        <span>
          <i className="check" /> Проверить
        </span>
      </div>
      <div className="timesheetBook">
        {groups.map((group) => (
          <div className="timesheetDepartment panel" key={group.name}>
            <div className="timesheetDepartmentHead">
              <div>
                <span className="eyebrow">ПОДРАЗДЕЛЕНИЕ</span>
                <h2>{group.name}</h2>
              </div>
              <b>{group.rows.length} сотрудников</b>
            </div>
            <div className="monthGridWrap">
              <div className="monthGrid monthGridHead">
                <div className="employeeCol">Сотрудник</div>
                {monthDays.map((d) => (
                  <div
                    className={
                      new Date(d.date).getDay() === 0 ||
                      new Date(d.date).getDay() === 6
                        ? "dayHead weekend"
                        : "dayHead"
                    }
                    key={d.date}
                  >
                    <b>{d.day}</b>
                    <span>{d.weekday}</span>
                  </div>
                ))}
                <div className="totalCol">Итого</div>
              </div>
              {group.rows.map((e) => (
                <div className="monthGrid monthGridRow" key={e.id}>
                  <button className="employeeCol employeeName" onClick={() => go("detail", e)}>
                    <span className="avatar sm">{e.initials}</span>
                    <span>
                      <b>{e.name}</b>
                      <small>{e.schedule}</small>
                    </span>
                  </button>
                  {monthDays.map((d) => {
                    const cell = cellFor(
                      e,
                      d,
                      factFor(e, d.date),
                      overrideFor(e, d.date),
                    );
                    return (
                      <button
                        className={`monthCell ${cell.kind} ${cell.label === "Н" ? "night" : ""} ${cell.label === "24" ? "full" : ""}`}
                        key={d.date}
                        onClick={() => setOpened({ employee: e, cell })}
                        title={`${e.name}, ${cell.date}`}
                      >
                        {cell.label}
                      </button>
                    );
                  })}
                  <div className="totalCol">{fmt(monthTotal(e))}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      {opened && (
        <div className="cellModalShade" onClick={() => setOpened(null)}>
          <div className="cellModal panel" onClick={(e) => e.stopPropagation()}>
            <button className="closeModal" onClick={() => setOpened(null)}>
              <X />
            </button>
            <span className="eyebrow">ЯЧЕЙКА ТАБЕЛЯ</span>
            <h2>{opened.employee.name}</h2>
            <p>
              {opened.cell.date} · {opened.employee.department}
            </p>
            <div className="cellFacts">
              <div>
                <span>График</span>
                <b>{opened.employee.schedule}</b>
              </div>
              <div>
                <span>Смена</span>
                <b>
                  {opened.cell.kind === "fact"
                    ? `${opened.cell.start}–${opened.cell.end}`
                    : opened.cell.kind === "planned"
                    ? `${opened.cell.start}–${opened.cell.end}`
                    : opened.cell.kind === "vacation"
                      ? "Отпуск"
                      : opened.cell.kind === "off"
                        ? "Выходной"
                        : "Требует проверки"}
                </b>
              </div>
              <div>
                <span>Часы</span>
                <b>{fmt(opened.cell.hours)}</b>
              </div>
              {opened.cell.status && (
                <div>
                  <span>Статус</span>
                  <b>{opened.cell.status}</b>
                </div>
              )}
            </div>
            {opened.employee.reviewNote && (
              <div className="notice compact">
                <AlertTriangle />
                <div>
                  <b>Пометка</b>
                  <p>{opened.employee.reviewNote}</p>
                </div>
              </div>
            )}
            {opened.cell.override && (
              <div className="notice compact">
                <AlertTriangle />
                <div>
                  <b>Ручная корректировка</b>
                  <p>
                    {opened.cell.override.comment || "Изменено вручную"} ·{" "}
                    {opened.cell.override.changed_by}
                  </p>
                </div>
              </div>
            )}
            <button
              className="primary"
              onClick={() => {
                setOpened(null);
                go("detail", opened.employee);
              }}
            >
              Открыть карточку сотрудника
            </button>
          </div>
        </div>
      )}
    </>
  );
}
function Problems({ employees, go }: any) {
  return (
    <>
      <PageHead
        eye="ИСКЛЮЧЕНИЯ"
        title="Проблемные записи"
        text="Проверьте отклонения — обычные смены уже рассчитаны автоматически"
      />
      <div className="notice">
        <AlertTriangle />
        <div>
          <b>Сначала — критические записи</b>
          <p>
            Нет входа или выхода: система не может рассчитать отработанное
            время.
          </p>
        </div>
      </div>
      <div className="panel problemList">
        {employees
          .filter((e: Employee) => e.status !== "ОК")
          .map((e: Employee) => (
            <PersonRow e={e} key={e.id} onClick={() => go("detail", e)} />
          ))}
      </div>
    </>
  );
}
function Detail({ e, role, go, update }: any) {
  const fix = async (kind: "entry" | "exit") => {
    const val = prompt(
      `Укажите время ${kind === "entry" ? "входа" : "выхода"}`,
      kind === "entry" ? "08:00" : "17:00",
    );
    if (val) {
      const next = {
        ...e,
        [kind]: val,
        fact: 8,
        total: 8 + e.combo,
        status: "Ручная корректировка",
      };
      const start = kind === "entry" ? val : e.entry !== "—" ? e.entry : "08:00";
      const end = kind === "exit" ? val : e.exit !== "—" ? e.exit : "17:00";
      await fetch("/api/schedule-overrides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employee_id: e.id,
          work_date: e.date || "2026-07-06",
          start_time: start,
          end_time: end,
          reason: "manual_time_correction",
          comment: `Ручная корректировка ${kind === "entry" ? "входа" : "выхода"}`,
          changed_by: role,
        }),
      }).catch(() => null);
      update(next);
    }
  };
  return (
    <>
      <button className="back" onClick={() => go("timesheet")}>
        <ArrowLeft />
        Назад к табелю
      </button>
      <div className="detailHead">
        <div className="avatar xl">{e.initials}</div>
        <div>
          <span className="eyebrow">КАРТОЧКА ЗА 6 ИЮЛЯ</span>
          <h1>{e.name}</h1>
          <p>
            {e.department} · {e.schedule}
          </p>
        </div>
        <Status s={e.status} />
      </div>
      <div className="detailGrid">
        <div>
          <div className="panel">
            <div className="panelHead">
              <h2>События СКУД</h2>
              <span className="live">
                <i />
                Автоматически
              </span>
            </div>
            <div className="events">
              <Event
                time={e.entry}
                title="Вход на территорию"
                place="Проходная №1"
                bad={e.entry === "—"}
              />
              <Event
                time={e.exit}
                title="Выход с территории"
                place="Проходная №1"
                bad={e.exit === "—"}
              />
            </div>
          </div>
          <div className="panel history">
            <div className="panelHead">
              <h2>История корректировок</h2>
              <History />
            </div>
            <div className="empty">Ручных изменений пока нет</div>
          </div>
        </div>
        <div>
          <div className="panel calc">
            <span className="eyebrow">РАСЧЕТ СИСТЕМЫ</span>
            <div>
              <span>Фактически по СКУД</span>
              <b>{fmt(e.fact)}</b>
            </div>
            <div>
              <span>Совмещение</span>
              <b>+ {fmt(e.combo)}</b>
            </div>
            <div className="total">
              <span>Итого к оплате</span>
              <b>{fmt(e.total)}</b>
            </div>
          </div>
          {role === "boss" && (
            <div className="panel actions">
              <h2>Исправить исключение</h2>
              <button onClick={() => fix("entry")}>
                Исправить вход <ChevronRight />
              </button>
              <button onClick={() => fix("exit")}>
                Исправить выход <ChevronRight />
              </button>
              <button
                onClick={() =>
                  update({
                    ...e,
                    entry: "08:00",
                    exit: "17:00",
                    fact: 8,
                    total: 8 + e.combo,
                    status: "Ручная корректировка",
                  })
                }
              >
                Поставить полный день <ChevronRight />
              </button>
              <button onClick={() => go("schedule", e)}>
                Изменить график на день <ChevronRight />
              </button>
              <button onClick={() => go("combo", e)}>
                Добавить совмещение <ChevronRight />
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
const Event = ({ time, title, place, bad }: any) => (
  <div className={"event " + (bad ? "bad" : "")}>
    <b>{time}</b>
    <i />
    <div>
      <strong>{bad ? "Событие не найдено" : title}</strong>
      <small>{bad ? "Требуется ручная проверка" : place}</small>
    </div>
  </div>
);
function Schedule({ e, go, update }: any) {
  const [start, setStart] = useState("09:00"),
    [end, setEnd] = useState("18:00");
  return (
    <EditPage
      title="Разовое изменение графика"
      text="Постоянный график сотрудника останется без изменений"
      e={e}
      go={go}
      onSave={() => {
        update({ ...e, schedule: `${start}–${end}`, status: "Изменен график" });
        go("detail", {
          ...e,
          schedule: `${start}–${end}`,
          status: "Изменен график",
        });
      }}
    >
      <label>
        Старый график
        <input disabled value={e.schedule} />
      </label>
      <div className="fieldRow">
        <label>
          Начало
          <input
            type="time"
            value={start}
            onChange={(x) => setStart(x.target.value)}
          />
        </label>
        <label>
          Окончание
          <input
            type="time"
            value={end}
            onChange={(x) => setEnd(x.target.value)}
          />
        </label>
      </div>
      <label>
        Причина
        <select>
          <option>Производственная необходимость</option>
          <option>Личная договоренность</option>
        </select>
      </label>
      <label>
        Комментарий
        <textarea placeholder="Добавьте пояснение" />
      </label>
    </EditPage>
  );
}
function Combination({ e, go, update }: any) {
  const [h, setH] = useState(4);
  return (
    <EditPage
      title="Добавить совмещение"
      text="Часы совмещения начисляются отдельно от фактического времени"
      e={e}
      go={go}
      onSave={() => {
        update({
          ...e,
          combo: h,
          total: e.fact + h,
          status: "Ручная корректировка",
        });
        go("detail", {
          ...e,
          combo: h,
          total: e.fact + h,
          status: "Ручная корректировка",
        });
      }}
    >
      <label>
        Количество часов
        <input
          type="number"
          value={h}
          onChange={(x) => setH(+x.target.value)}
        />
      </label>
      <label>
        За кого выполнялось
        <select>
          <option>Николай Орлов</option>
          <option>Павел Новиков</option>
        </select>
      </label>
      <label>
        Причина
        <select>
          <option>Больничный</option>
          <option>Отпуск</option>
          <option>Производственная необходимость</option>
        </select>
      </label>
      <label>
        Комментарий
        <textarea placeholder="Опишите выполненные работы" />
      </label>
      <div className="calcPreview">
        <span>Факт {fmt(e.fact)}</span>
        <b>+</b>
        <span>Совмещение {fmt(h)}</span>
        <b>=</b>
        <strong>К оплате {fmt(e.fact + h)}</strong>
      </div>
    </EditPage>
  );
}
function EditPage({ title, text, e, go, onSave, children }: any) {
  return (
    <>
      <button className="back" onClick={() => go("detail", e)}>
        <ArrowLeft />
        Вернуться
      </button>
      <PageHead eye="РУЧНАЯ КОРРЕКТИРОВКА" title={title} text={text} />
      <div className="edit panel">
        <div className="editPerson">
          <span className="avatar">{e.initials}</span>
          <div>
            <b>{e.name}</b>
            <small>6 июля 2026 · {e.department}</small>
          </div>
        </div>
        {children}
        <div className="formActions">
          <button className="outline" onClick={() => go("detail", e)}>
            Отмена
          </button>
          <button className="primary" onClick={onSave}>
            Сохранить изменение
          </button>
        </div>
      </div>
    </>
  );
}
function Approval({ employees }: any) {
  const [done, setDone] = useState(false);
  return (
    <>
      <PageHead
        eye="ИЮЛЬ 2026"
        title="Подтверждение табеля"
        text="Механический цех · 24 сотрудника"
      />
      <div className="approvalTop">
        <div>
          <b>96%</b>
          <span>готовность табеля</span>
        </div>
        <p>
          Осталось разобрать <strong>4 проблемные записи</strong>. Подтверждение
          заблокирует изменения начальника.
        </p>
      </div>
      <div className="panel summary">
        <div>
          <span>
            Фактические часы
            <b>
              {fmt(employees.reduce((a: number, e: Employee) => a + e.fact, 0))}
            </b>
          </span>
          <span>
            Совмещение
            <b>
              {fmt(
                employees.reduce((a: number, e: Employee) => a + e.combo, 0),
              )}
            </b>
          </span>
          <span>
            Отпуск<b>16 ч</b>
          </span>
          <span>
            Больничный<b>8 ч</b>
          </span>
          <span>
            Корректировки<b>7</b>
          </span>
        </div>
      </div>
      <button
        disabled={done}
        onClick={() => setDone(true)}
        className="primary approve"
      >
        <ShieldCheck />
        {done ? "Табель подтвержден" : "Подтвердить табель"}
      </button>
    </>
  );
}
function SkudImport({
  onImport,
  employees,
  go,
}: {
  onImport: (e: Employee[]) => void;
  employees: Employee[];
  go: any;
}) {
  const [state, setState] = useState<{
    name?: string;
    rows?: Employee[];
    error?: string;
    saving?: boolean;
  }>({});
  const load = async (file?: File) => {
    if (!file) return;
    try {
      const rows = parseSkudWorkbook(await file.arrayBuffer()) as Employee[];
      setState({ name: file.name, rows });
    } catch (e) {
      setState({
        name: file.name,
        error: e instanceof Error ? e.message : "Не удалось прочитать файл",
      });
    }
  };
  const rows = state.rows || [],
    problems = rows.filter((e) => e.status !== "ОК").length;
  return (
    <>
      <PageHead
        eye="ДАННЫЕ СКУД"
        title="Импорт посещений"
        text="Загрузите ежедневную или месячную выгрузку XLS/XLSX"
      />
      <div className="importGrid">
        <div className="panel importBox">
          <UploadCloud />
          <h2>{state.name || "Выберите файл посещений"}</h2>
          <p>
            Поддерживается структура «Посещения за день»: ID, ФИО, отдел, дата,
            первая и последняя отметки.
          </p>
          <label className="primary fileButton">
            Выбрать XLS/XLSX
            <input
              type="file"
              accept=".xls,.xlsx"
              onChange={(e) => load(e.target.files?.[0])}
            />
          </label>
          {state.error && <div className="error">{state.error}</div>}
        </div>
        <div className="panel rules">
          <span className="eyebrow">ПРАВИЛА РАСЧЕТА</span>
          <h2>Перенесено из WorkSchedule</h2>
          <ul>
            <li>Рабочее окно и вычет обеда</li>
            <li>
              Минимальный интервал — {SKUD_RULES.minValidIntervalMin} минут
            </li>
            <li>
              Опоздание и ранний уход — от {SKUD_RULES.lateThresholdMin} минут
            </li>
            <li>Индивидуальные графики сотрудников</li>
            <li>Суточные смены 07:00/08:00 → следующий день</li>
            <li>Неполные и аномально длинные смены — в исключения</li>
          </ul>
        </div>
      </div>
      {rows.length > 0 && (
        <div className="panel importResult">
          <div className="panelHead">
            <div>
              <span className="eyebrow">ПРЕДПРОСМОТР</span>
              <h2>
                {rows.length} сотрудников · {problems} исключений
              </h2>
            </div>
            <button
              className="primary"
              disabled={state.saving}
              onClick={async () => {
                setState({ ...state, saving: true, error: undefined });
                const response = await fetch("/api/skud-days/import", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ rows }),
                });
                if (!response.ok) {
                  const e = await response.json().catch(() => ({}));
                  setState({
                    ...state,
                    saving: false,
                    error: e.error || "Не удалось сохранить импорт",
                  });
                  return;
                }
                const baseRows = employees.filter((e) => !e.date);
                const importedKeys = new Set(
                  rows.map((e) => `${e.id}|${e.date}`),
                );
                const oldFacts = employees.filter(
                  (e) => e.date && !importedKeys.has(`${e.id}|${e.date}`),
                );
                onImport([...baseRows, ...oldFacts, ...rows]);
                go("timesheet");
              }}
            >
              {state.saving ? "Сохраняю..." : "Применить импорт"}
            </button>
          </div>
          {rows.slice(0, 8).map((e) => (
            <PersonRow key={`${e.id}-${e.date}`} e={e} onClick={() => {}} />
          ))}
          {rows.length > 8 && (
            <div className="more">
              Ещё {rows.length - 8} записей появятся в табеле
            </div>
          )}
        </div>
      )}
    </>
  );
}
function EmployeeDirectory({
  employees,
  setEmployees,
}: {
  employees: Employee[];
  setEmployees: (e: Employee[]) => void;
}) {
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Employee | null>(null);
  const [departments, setDepartments] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [from, setFrom] = useState(new Date().toISOString().slice(0, 10));
  const [message, setMessage] = useState("");
  useEffect(() => {
    Promise.all([
      fetch("/api/departments").then((r) => r.json()),
      fetch("/api/schedules").then((r) => r.json()),
    ]).then(([d, s]) => {
      setDepartments(d);
      setSchedules(s);
    });
  }, []);
  const save = async () => {
    if (!selected) return;
    const response = await fetch(`/api/employees/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        department_id: selected.departmentId,
        schedule_id: selected.scheduleId,
        effective_from: from,
      }),
    });
    if (!response.ok) {
      const e = await response.json();
      setMessage(e.error || "Ошибка сохранения");
      return;
    }
    const department = departments.find(
      (d) => Number(d.id) === Number(selected.departmentId),
    );
    const schedule = schedules.find(
      (s) => Number(s.id) === Number(selected.scheduleId),
    );
    const updated = {
      ...selected,
      department: department?.name || selected.department,
      schedule: schedule ? schedule.name : selected.schedule,
    };
    setEmployees(employees.map((e) => (e.id === updated.id ? updated : e)));
    setSelected(updated);
    setMessage("Сохранено в PostgreSQL");
  };
  const list = employees.filter((e) =>
    `${e.name} ${e.department}`.toLowerCase().includes(q.toLowerCase()),
  );
  return (
    <>
      <PageHead
        eye="СПРАВОЧНИК"
        title="Сотрудники"
        text={`${employees.length} активных сотрудников · подразделения и постоянные графики`}
      />
      <div className="directoryLayout">
        <div>
          <div className="search directorySearch">
            <Search />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ФИО или подразделение"
            />
          </div>
          <div className="panel directoryList">
            {list.map((e) => (
              <button
                key={e.id}
                className={selected?.id === e.id ? "selected" : ""}
                onClick={() => {
                  setSelected({ ...e });
                  setMessage("");
                }}
              >
                <span className="avatar sm">{e.initials}</span>
                <span>
                  <b>{e.name}</b>
                  <small>
                    {e.department} · {e.schedule}
                    {e.needsReview ? " · Требует проверки" : ""}
                  </small>
                </span>
                <ChevronRight />
              </button>
            ))}
          </div>
        </div>
        <div>
          {selected ? (
            <div className="panel editor stickyEditor">
              <span className="eyebrow">СОТРУДНИК #{selected.id}</span>
              <h2>{selected.name}</h2>
              {selected.needsReview && (
                <div className="notice compact">
                  <AlertTriangle />
                  <div>
                    <b>Требует проверки</b>
                    <p>{selected.reviewNote}</p>
                  </div>
                </div>
              )}
              <label>
                Подразделение
                <select
                  value={selected.departmentId || ""}
                  onChange={(e) =>
                    setSelected({
                      ...selected,
                      departmentId: Number(e.target.value),
                    })
                  }
                >
                  {departments
                    .filter((d) => d.active)
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Постоянный график
                <select
                  value={selected.scheduleId || ""}
                  onChange={(e) =>
                    setSelected({
                      ...selected,
                      scheduleId: Number(e.target.value),
                    })
                  }
                >
                  <option value="">График не назначен</option>
                  {schedules.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Действует с
                <input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </label>
              {message && (
                <div
                  className={
                    message.startsWith("Сохранено") ? "success" : "error"
                  }
                >
                  {message}
                </div>
              )}
              <button className="primary" onClick={save}>
                Сохранить назначение
              </button>
            </div>
          ) : (
            <div className="panel editorPlaceholder">
              <Users />
              <p>Выберите сотрудника для редактирования</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
function Admin() {
  const emptyUser = { login: "", name: "", pass: "", role: "boss" as Role };
  const [rows, setRows] = useState<Record<string, Account>>({ ...accounts });
  const [selected, setSelected] = useState(emptyUser);
  const [originalLogin, setOriginalLogin] = useState("");
  const [message, setMessage] = useState("");
  const persist = (next: Record<string, Account>) => {
    Object.keys(accounts).forEach((key) => delete accounts[key]);
    Object.assign(accounts, next);
    saveAccounts(next);
    setRows({ ...next });
  };
  const edit = (login: string) => {
    setSelected({ login, ...rows[login] });
    setOriginalLogin(login);
    setMessage("");
  };
  const reset = () => {
    setSelected(emptyUser);
    setOriginalLogin("");
    setMessage("");
  };
  const save = () => {
    const login = selected.login.trim();
    if (!login || !selected.name.trim() || !selected.pass.trim()) {
      setMessage("Заполните логин, имя и пароль");
      return;
    }
    if (login !== originalLogin && rows[login]) {
      setMessage("Такой логин уже есть");
      return;
    }
    const adminCount = Object.entries(rows).filter(
      ([key, value]) => key !== originalLogin && value.role === "admin",
    ).length;
    if (selected.role !== "admin" && adminCount === 0) {
      setMessage("Нужен хотя бы один администратор");
      return;
    }
    const next = { ...rows };
    if (originalLogin && originalLogin !== login) delete next[originalLogin];
    next[login] = {
      name: selected.name.trim(),
      pass: selected.pass,
      role: selected.role,
    };
    persist(next);
    setOriginalLogin(login);
    setSelected({ login, ...next[login] });
    setMessage("Пользователь сохранён");
  };
  const remove = () => {
    if (!originalLogin) return;
    if (Object.keys(rows).length <= 1) {
      setMessage("Нельзя удалить последнего пользователя");
      return;
    }
    if (
      rows[originalLogin].role === "admin" &&
      Object.values(rows).filter((x) => x.role === "admin").length <= 1
    ) {
      setMessage("Нельзя удалить последнего администратора");
      return;
    }
    const next = { ...rows };
    delete next[originalLogin];
    persist(next);
    reset();
    setMessage("Пользователь удалён");
  };
  return (
    <>
      <PageHead
        eye="АДМИНИСТРИРОВАНИЕ"
        title="Пользователи"
        text="Управление доступом и ролями"
      />
      <div className="adminLayout">
        <div className="panel adminTable">
          <div className="panelHead">
            <div>
              <span className="eyebrow">УЧЕТНЫЕ ЗАПИСИ</span>
              <h2>{Object.keys(rows).length} пользователей</h2>
            </div>
            <button className="outline" onClick={reset}>
              + Новый
            </button>
          </div>
          {Object.keys(rows).map((x) => (
            <button
              className={`adminRow ${selected.login === x ? "selected" : ""}`}
              key={x}
              onClick={() => edit(x)}
            >
              <span className="avatar">
                {rows[x].name
                  .split(" ")
                  .map((y: string) => y[0])
                  .slice(0, 2)}
              </span>
              <div>
                <b>{rows[x].name}</b>
                <small>{x}</small>
              </div>
              <span className="role">{roleName[rows[x].role]}</span>
              <Settings2 />
            </button>
          ))}
        </div>
        <div className="panel editor userEditor">
          <span className="eyebrow">
            {originalLogin ? "РЕДАКТИРОВАНИЕ" : "НОВЫЙ ПОЛЬЗОВАТЕЛЬ"}
          </span>
          <h2>{originalLogin ? selected.name : "Добавить пользователя"}</h2>
          <label>
            Логин
            <input
              value={selected.login}
              onChange={(e) =>
                setSelected({ ...selected, login: e.target.value })
              }
              placeholder="Например master"
            />
          </label>
          <label>
            ФИО
            <input
              value={selected.name}
              onChange={(e) =>
                setSelected({ ...selected, name: e.target.value })
              }
              placeholder="Имя пользователя"
            />
          </label>
          <label>
            Пароль
            <input
              value={selected.pass}
              onChange={(e) =>
                setSelected({ ...selected, pass: e.target.value })
              }
              placeholder="Пароль"
            />
          </label>
          <label>
            Роль
            <select
              value={selected.role}
              onChange={(e) =>
                setSelected({ ...selected, role: e.target.value as Role })
              }
            >
              {Object.keys(roleName).map((r) => (
                <option key={r} value={r}>
                  {roleName[r as Role]}
                </option>
              ))}
            </select>
          </label>
          {message && (
            <div className={message.includes("Заполните") || message.includes("есть") || message.includes("Нельзя") ? "error" : "success"}>
              {message}
            </div>
          )}
          <button className="primary" onClick={save}>
            Сохранить пользователя
          </button>
          {originalLogin && (
            <button className="danger" onClick={remove}>
              Удалить пользователя
            </button>
          )}
        </div>
      </div>
    </>
  );
}
function Departments({
  employees,
  setEmployees,
}: {
  employees: Employee[];
  setEmployees: (rows: Employee[]) => void;
}) {
  const [departments, setDepartments] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [effectiveFrom, setEffectiveFrom] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [applyAll, setApplyAll] = useState(false);
  const [message, setMessage] = useState("");
  const detailRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    Promise.all([
      fetch("/api/departments").then((r) => r.json()),
      fetch("/api/schedules").then((r) => r.json()),
    ])
      .then(([d, s]) => {
        setDepartments(d);
        setSchedules(s);
      })
      .catch(() => setDepartments([]));
  }, []);
  useEffect(() => {
    if (selected)
      setTimeout(
        () => detailRef.current?.scrollIntoView({ behavior: "smooth" }),
        0,
      );
  }, [selected?.id]);
  const saveDepartment = async () => {
    if (!selected) return;
    const r = await fetch(`/api/departments/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: selected.name,
        active: selected.active,
        schedule_id: selected.schedule_id || null,
        effective_from: effectiveFrom,
        apply_to_employees: applyAll,
      }),
    });
    if (!r.ok) {
      setMessage("Не удалось сохранить");
      return;
    }
    const schedule = schedules.find(
      (s) => Number(s.id) === Number(selected.schedule_id),
    );
    setDepartments(
      departments.map((d) =>
        Number(d.id) === Number(selected.id)
          ? {
              ...d,
              ...selected,
              schedule_name: schedule?.name,
              schedule_start: schedule?.start_time,
              schedule_end: schedule?.end_time,
            }
          : d,
      ),
    );
    if (applyAll && schedule)
      setEmployees(
        employees.map((e) =>
          Number(e.departmentId) === Number(selected.id)
            ? {
                ...e,
                scheduleId: Number(schedule.id),
                schedule: schedule.name,
              }
            : e,
        ),
      );
    setMessage("Сохранено в PostgreSQL");
  };
  const saveEmployee = async () => {
    if (!employee) return;
    const r = await fetch(`/api/employees/${employee.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        department_id: employee.departmentId,
        schedule_id: employee.scheduleId,
        effective_from: effectiveFrom,
      }),
    });
    if (!r.ok) {
      setMessage("Не удалось сохранить сотрудника");
      return;
    }
    const dep = departments.find(
        (d) => Number(d.id) === Number(employee.departmentId),
      ),
      schedule = schedules.find(
        (s) => Number(s.id) === Number(employee.scheduleId),
      );
    const updated = {
      ...employee,
      department: dep?.name || employee.department,
      schedule: schedule ? schedule.name : employee.schedule,
    };
    setEmployees(employees.map((e) => (e.id === updated.id ? updated : e)));
    setEmployee(updated);
    setMessage("Сотрудник обновлён");
  };
  const members = selected
    ? employees.filter((e) => Number(e.departmentId) === Number(selected.id))
    : [];
  return (
    <>
      <PageHead
        eye="СТРУКТУРА"
        title="Подразделения"
        text="Откройте подразделение, чтобы управлять его сотрудниками и графиком"
      />
      {selected && (
        <div className="departmentDetail" ref={detailRef}>
          <div className="panel departmentEditor expanded">
            <div>
              <span className="eyebrow">ПОДРАЗДЕЛЕНИЕ #{selected.id}</span>
              <h2>{selected.name}</h2>
            </div>
            <label>
              Название
              <input
                value={selected.name}
                onChange={(e) =>
                  setSelected({ ...selected, name: e.target.value })
                }
              />
            </label>
            <label>
              График подразделения
              <select
                value={selected.schedule_id || ""}
                onChange={(e) =>
                  setSelected({
                    ...selected,
                    schedule_id: Number(e.target.value),
                  })
                }
              >
                <option value="">Не назначен</option>
                {schedules.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Действует с
              <input
                type="date"
                value={effectiveFrom}
                onChange={(e) => setEffectiveFrom(e.target.value)}
              />
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={selected.active}
                onChange={(e) =>
                  setSelected({ ...selected, active: e.target.checked })
                }
              />{" "}
              Активное подразделение
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={applyAll}
                onChange={(e) => setApplyAll(e.target.checked)}
              />{" "}
              Применить график всем сотрудникам
            </label>
            <button className="primary" onClick={saveDepartment}>
              Сохранить
            </button>
            <button className="outline" onClick={() => setSelected(null)}>
              Закрыть
            </button>
            {message && <span className="success">{message}</span>}
          </div>
          <div className="departmentPeople">
            <div className="panel memberList">
              <div className="panelHead">
                <div>
                  <span className="eyebrow">СОТРУДНИКИ</span>
                  <h2>{members.length} человек</h2>
                </div>
              </div>
              {members.map((e) => (
                <button
                  key={e.id}
                  className={employee?.id === e.id ? "selected" : ""}
                  onClick={() => {
                    setEmployee({ ...e });
                    setMessage("");
                  }}
                >
                  <span className="avatar sm">{e.initials}</span>
                  <span>
                    <b>{e.name}</b>
                    <small>{e.schedule}</small>
                  </span>
                  <ChevronRight />
                </button>
              ))}
              {!members.length && (
                <div className="empty">В этом подразделении нет сотрудников</div>
              )}
            </div>
            {employee && (
              <div className="panel editor memberEditor">
                <span className="eyebrow">СОТРУДНИК #{employee.id}</span>
                <h2>{employee.name}</h2>
                <label>
                  Подразделение
                  <select
                    value={employee.departmentId || ""}
                    onChange={(e) =>
                      setEmployee({
                        ...employee,
                        departmentId: Number(e.target.value),
                      })
                    }
                  >
                    {departments
                      .filter((d) => d.active)
                      .map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  График
                  <select
                    value={employee.scheduleId || ""}
                    onChange={(e) =>
                      setEmployee({
                        ...employee,
                        scheduleId: Number(e.target.value),
                      })
                    }
                  >
                    <option value="">График не назначен</option>
                    {schedules.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Действует с
                  <input
                    type="date"
                    value={effectiveFrom}
                    onChange={(e) => setEffectiveFrom(e.target.value)}
                  />
                </label>
                <button className="primary" onClick={saveEmployee}>
                  Сохранить сотрудника
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      <button
        className="outline addDepartment"
        onClick={async () => {
          const name = prompt("Название нового подразделения");
          if (!name) return;
          const r = await fetch("/api/departments", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name }),
          });
          if (r.ok) {
            const d = await r.json();
            setDepartments([...departments, { ...d, employee_count: 0 }]);
            setSelected(d);
          }
        }}
      >
        + Новое подразделение
      </button>
      <div className="cards">
        {departments
          .filter((x) => x.active)
          .map((x) => (
            <button
              key={x.id}
              className={`panel dep ${x.active ? "" : "inactive"}`}
              onClick={() => {
                setSelected({ ...x });
                setEmployee(null);
                setMessage("");
              }}
            >
              <Building2 />
              <h2>{x.name}</h2>
              <p>{x.employee_count} сотрудников</p>
              <small>
                {x.schedule_name
                  ? x.schedule_name
                  : `График подразделения не назначен`}
              </small>
              <ChevronRight />
            </button>
          ))}
      </div>
    </>
  );
}
const PageHead = ({ eye, title, text }: any) => (
  <div className="pageHead">
    <span className="eyebrow">{eye}</span>
    <h1>{title}</h1>
    <p>{text}</p>
  </div>
);
function Status({ s }: { s: Status }) {
  const good = s === "ОК",
    bad = ["Нет входа", "Нет выхода", "Требует проверки"].includes(s);
  return (
    <span className={"status " + (good ? "good" : bad ? "bad" : "mid")}>
      {s}
    </span>
  );
}
const title = (p: string) =>
  (
    ({
      dashboard: "Обзор",
      timesheet: "Табель",
      problems: "Проблемные записи",
      detail: "Карточка сотрудника",
      schedule: "Изменение графика",
      combo: "Совмещение",
      approval: "Подтверждение",
      import: "Импорт СКУД",
      employees: "Сотрудники",
      admin: "Пользователи",
      departments: "Подразделения",
    }) as any
  )[p];
createRoot(document.getElementById("root")!).render(<App />);
