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
  Eye,
  EyeOff,
  FileCheck2,
  History,
  KeyRound,
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
type Account = {
  pass: string;
  role: Role;
  name: string;
  employeeIds?: number[];
  departmentIds?: number[];
};
const defaultAccounts: Record<string, Account> = {
  admin: { pass: "admin", role: "admin", name: "Анна Викторовна" },
  observer: { pass: "observer", role: "observer", name: "Олег Сергеевич" },
  boss: { pass: "boss", role: "boss", name: "Михаил Петрович" },
  boss_msp: {
    pass: "boss_msp",
    role: "boss",
    name: "Начальник МСП",
    employeeIds: [
      120, 121, 122, 127, 191, 192, 193, 198, 200, 204, 206, 207, 211,
      212, 213, 214, 215, 218, 232, 244, 276, 277, 298, 325, 332, 340,
      343, 358, 363, 384, 398,
    ],
  },
  boss_sklad: {
    pass: "boss_sklad",
    role: "boss",
    name: "Начальник производственного склада",
    employeeIds: [107, 108, 109, 111, 113, 157, 294, 339, 379, 380, 406],
  },
  boss_glav_sklad: {
    pass: "boss_glav_sklad",
    role: "boss",
    name: "Начальник главного склада",
    employeeIds: [129, 130, 133, 135, 337, 383],
  },
  boss_liteyka_press: {
    pass: "boss_liteyka_press",
    role: "boss",
    name: "Начальник литейки и прессового",
    employeeIds: [
      161, 165, 167, 171, 172, 261, 265, 268, 269, 270, 271, 346, 368,
      389, 403, 404, 407, 408,
    ],
  },
  boss_otk: {
    pass: "boss_otk",
    role: "boss",
    name: "Начальник ОТК",
    employeeIds: [119, 333, 336],
  },
  boss_ohrana: {
    pass: "boss_ohrana",
    role: "boss",
    name: "Начальник охраны",
    employeeIds: [251, 252, 254, 255, 256, 257, 258, 259, 395],
  },
  boss_remont: {
    pass: "boss_remont",
    role: "boss",
    name: "Начальник ремонтной службы",
    employeeIds: [145, 156, 284, 326, 359],
  },
  boss_shih: {
    pass: "boss_shih",
    role: "boss",
    name: "Начальник ШИХ",
    employeeIds: [102, 143, 144, 146, 147, 149, 150, 151, 152, 154, 300],
  },
  boss_electro: {
    pass: "boss_electro",
    role: "boss",
    name: "Начальник электроцеха",
    employeeIds: [234, 235, 237, 238],
  },
  boss_termopak: {
    pass: "boss_termopak",
    role: "boss",
    name: "Начальник термопака",
    employeeIds: [295, 297, 319, 371],
  },
};
const loadAccounts = (): Record<string, Account> => {
  try {
    const stored = localStorage.getItem("accounts");
    if (!stored) return { ...defaultAccounts };
    const parsed = JSON.parse(stored);
    return {
      ...defaultAccounts,
      ...parsed,
      ...Object.fromEntries(
        Object.entries(defaultAccounts)
          .filter(([login]) => login.startsWith("boss_"))
          .map(([login, account]) => [
            login,
            {
              ...account,
              ...(parsed[login] || {}),
              employeeIds:
                account.employeeIds || parsed[login]?.employeeIds || [],
            },
          ]),
      ),
    };
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
  schedule: formatScheduleText(e.schedule || "График не назначен"),
  departmentId: Number(e.department_id),
  scheduleId: Number(e.schedule_id),
  scheduleCode: e.schedule_code,
  scheduleKind: e.schedule_kind,
  schedulePattern: e.cycle_pattern,
  scheduleEffectiveFrom: e.schedule_effective_from?.slice(0, 10),
  needsReview: e.needs_review,
  reviewNote: e.review_note,
  entry: formatTime(e.entry || "—"),
  exit: formatTime(e.exit || "—"),
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
const correctionReasons = {
  forgot_pass: "Забыл пропуск",
  missing_entry: "Не приложил пропуск на входе",
  missing_exit: "Не приложил пропуск на выходе",
  temporary_leave: "Отлучался в течение дня",
  schedule_change: "Другая смена",
  substitution: "Выходил за другого сотрудника",
  sick_leave: "Больничный",
  vacation: "Отпуск",
  other: "Другое",
};
type CorrectionReason = keyof typeof correctionReasons;
const fmt = (n: number) =>
  n.toLocaleString("ru-RU", { maximumFractionDigits: 1 }) + " ч";
const formatDate = (date?: string) => {
  const match = String(date || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : date || "";
};
const parseDisplayDate = (date: string) => {
  const match = date.trim().match(/^(\d{2})[-.](\d{2})[-.](\d{4})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : date;
};
const formatTime = (time?: string) => {
  if (!time || time === "—") return time || "—";
  const match = time.match(/^(\d{1,2}):(\d{2})/);
  return match ? `${match[1].padStart(2, "0")}:${match[2]}` : time;
};
const formatRange = (start?: string, end?: string) =>
  `${formatTime(start)}–${formatTime(end)}`;
const formatScheduleText = (text?: string) =>
  (text || "").replace(/\b(\d{1,2}):(\d{2})(?::\d{2})?\b/g, (_x, h, m) =>
    `${String(h).padStart(2, "0")}:${m}`,
  );
function App() {
  const [role, setRole] = useState<Role | null>(
    () => localStorage.getItem("role") as Role,
  );
  const [user, setUser] = useState(localStorage.getItem("user") || "");
  const [page, setPage] = useState("dashboard");
  const [employees, setEmployees] = useState<Employee[]>(base);
  const [selected, setSelected] = useState<Employee | null>(null);
  const [menu, setMenu] = useState(false);
  const assignedIds = accounts[user]?.employeeIds;
  const assignedDepartmentIds = accounts[user]?.departmentIds;
  const hasBossScope =
    role === "boss" &&
    (Array.isArray(assignedIds) || Array.isArray(assignedDepartmentIds));
  const scopedEmployees =
    hasBossScope
      ? employees.filter(
          (e) =>
            assignedIds?.includes(e.id) ||
            assignedDepartmentIds?.includes(Number(e.departmentId)),
        )
      : employees;
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
    localStorage.removeItem("role");
    localStorage.removeItem("user");
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
              badge={String(scopedEmployees.filter((e) => e.status !== "ОК").length)}
              active={page === "problems"}
              onClick={() => go("problems")}
            />
          )}{" "}
          {role === "boss" && (
            <>
              <Nav
                icon={<Users />}
                label="Сотрудники"
                active={page === "employees"}
                onClick={() => go("employees")}
              />
              <Nav
                icon={<FileCheck2 />}
                label="Подтверждение"
                active={page === "approval"}
                onClick={() => go("approval")}
              />
            </>
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
            <small>06-07-2026, понедельник</small>
          </div>
          <div className="headerRight">
            <span className="sync">
              <i />
              СКУД синхронизирован
            </span>
            <button className="avatar sm" onClick={() => go("account")}>
              {accounts[user]?.name?.[0]}
            </button>
          </div>
        </header>
        <section>
          {page === "dashboard" && (
            <Dashboard role={role} go={go} employees={scopedEmployees} />
          )}{" "}
          {page === "timesheet" && (
            <Timesheet
              employees={scopedEmployees}
              go={go}
              role={role}
              user={user}
            />
          )}{" "}
          {page === "problems" && <Problems employees={scopedEmployees} go={go} />}{" "}
          {page === "detail" && selected && (
            <Detail
              e={employees.find((x) => x.id === selected.id) || selected}
              employees={scopedEmployees}
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
              employees={scopedEmployees}
              go={go}
              update={(v) =>
                setEmployees(employees.map((x) => (x.id === v.id ? v : x)))
              }
            />
          )}{" "}
          {page === "approval" && <Approval employees={scopedEmployees} />}{" "}
          {page === "import" && (
            <SkudImport
              onImport={setEmployees}
              employees={employees}
              go={go}
            />
          )}{" "}
          {page === "employees" && (
            role === "admin" ? (
              <EmployeeDirectory
                employees={employees}
                setEmployees={setEmployees}
              />
            ) : (
              <BossEmployeeCalendar
                employees={scopedEmployees}
                role={role}
                user={user}
              />
            )
          )}
          {page === "admin" && <Admin employees={employees} />}
          {page === "account" && <AccountSettings login={user} />}
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
    [showPassword, setShowPassword] = useState(false),
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
          <span className="passwordField">
            <input
              type={showPassword ? "text" : "password"}
              value={p}
              onChange={(e) => setP(e.target.value)}
              placeholder="Введите пароль"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}
              title={showPassword ? "Скрыть пароль" : "Показать пароль"}
            >
              {showPassword ? <EyeOff /> : <Eye />}
            </button>
          </span>
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
              <code>{x}</code>
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
            <b>07-2026</b>
            <small>Табель открыт до 31-07-2026</small>
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
            text="Данные за 06-07-2026"
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
        {formatScheduleText(e.schedule)} · {formatTime(e.entry)} →{" "}
        {formatTime(e.exit)}
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
  baseHours: number;
  comboHours: number;
  overtimeHours: number;
  leaveMinutes: number;
  status?: Status;
  planned?: boolean;
  override?: WorkOverride;
  overrides?: WorkOverride[];
  comboEmployeeName?: string;
};
type WorkOverride = {
  id?: number;
  employee_id: number;
  work_date: string;
  start_time: string;
  end_time: string;
  reason: string;
  comment?: string;
  changed_by: string;
  leave_minutes?: number;
  combo_hours?: number;
  overtime_hours?: number;
  combo_employee_id?: number;
  combo_employee_name?: string;
  created_at?: string;
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
const localDateString = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const addDays = (date: string, days: number) => {
  const [year, month, day] = date.split("-").map(Number);
  const d = new Date(year, month - 1, day + days);
  return localDateString(d);
};
const datesBetween = (from: string, to: string) => {
  const days = Math.max(0, dayDiff(from, to));
  return Array.from({ length: days + 1 }, (_, i) => addDays(from, i));
};
const timeMinutes = (time: string) => {
  if (!/^\d{1,2}:\d{2}$/.test(time)) return Number.NaN;
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};
const durationHours = (start: string, end: string) => {
  let diff = timeMinutes(end) - timeMinutes(start);
  if (Number.isNaN(diff)) return 0;
  if (diff < 0) diff += 24 * 60;
  return Math.round((diff / 60) * 100) / 100;
};
const roundHours = (hours: number) => Math.round(hours * 100) / 100;
const isRegularSchedule = (e: Employee) =>
  e.scheduleCode === "standard" ||
  e.scheduleKind === "weekly" ||
  /08:00.*17:00|09:00.*18:00/.test(formatScheduleText(e.schedule));
const lunchHoursFor = (e: Employee, rawHours: number) =>
  isRegularSchedule(e) && rawHours >= 5 ? 1 : 0;
const plannedPaidHoursFor = (e: Employee) => (isRegularSchedule(e) ? 8 : null);
const payableManualHours = (
  e: Employee,
  start: string,
  end: string,
  leaveMinutes = 0,
) => {
  const rawHours = durationHours(start, end);
  const workedHours = Math.max(
    0,
    rawHours - lunchHoursFor(e, rawHours) - leaveMinutes / 60,
  );
  const plannedHours = plannedPaidHoursFor(e);
  return roundHours(plannedHours == null ? workedHours : Math.min(workedHours, plannedHours));
};
const suggestedOvertimeHours = (
  e: Employee,
  start: string,
  end: string,
  leaveMinutes = 0,
) => {
  const rawHours = durationHours(start, end);
  const workedHours = Math.max(
    0,
    rawHours - lunchHoursFor(e, rawHours) - leaveMinutes / 60,
  );
  const plannedHours = plannedPaidHoursFor(e);
  if (plannedHours == null) return 0;
  return Math.max(
    0,
    roundHours(workedHours - plannedHours),
  );
};
const blankCellHours = { hours: 0, baseHours: 0, comboHours: 0, overtimeHours: 0, leaveMinutes: 0 };
const compactHours = (hours: number) => hours.toLocaleString("ru-RU", { maximumFractionDigits: 1 });
const normalizeTimeInput = (value: string) =>
  value.replace(/[^\d:]/g, "").slice(0, 5);
function plannedCellFor(
  e: Employee,
  d: (typeof monthDays)[number],
): TimesheetCell {
  const base = { date: d.date, day: d.day, weekday: d.weekday };
  if (e.needsReview && e.reviewNote?.toLowerCase().includes("отпуск"))
    return { ...base, label: "ОТ", kind: "vacation", ...blankCellHours };
  if (e.needsReview && !e.scheduleCode)
    return { ...base, label: "?", kind: "review", ...blankCellHours };
  if (!e.scheduleCode)
    return { ...base, label: "", kind: "unknown", ...blankCellHours };
  if (e.scheduleCode === "standard" || e.scheduleKind === "weekly") {
    const wd = new Date(d.date).getDay();
    if (wd === 0 || wd === 6)
      return { ...base, label: "В", kind: "off", ...blankCellHours };
    return {
      ...base,
      label: "пл",
      kind: "planned",
      start: "08:00",
      end: "17:00",
      ...blankCellHours,
      planned: true,
    };
  }
  if (e.scheduleCode === "tpa_setup_monthly")
    return { ...base, label: "таб.", kind: "review", ...blankCellHours };
  const pattern = Array.isArray(e.schedulePattern) ? e.schedulePattern : [];
  if (e.scheduleKind === "cycle" && pattern.length && e.scheduleEffectiveFrom) {
    const index =
        ((dayDiff(e.scheduleEffectiveFrom, d.date) % pattern.length) +
          pattern.length) %
        pattern.length,
      item = pattern[index];
    if (!item || item.type === "off")
      return { ...base, label: "В", kind: "off", ...blankCellHours };
    const start = item.start || "08:00",
      end = item.end || "17:00";
    return {
      ...base,
      label: "пл",
      kind: "planned",
      start,
      end,
      ...blankCellHours,
      planned: true,
    };
  }
  return { ...base, label: "?", kind: "review", ...blankCellHours };
}
function cellFor(
  e: Employee,
  d: (typeof monthDays)[number],
  fact?: Employee,
  overrides: WorkOverride[] = [],
): TimesheetCell {
  const base = { date: d.date, day: d.day, weekday: d.weekday };
  const sortedOverrides = [...overrides].sort((a, b) => Number(a.id || 0) - Number(b.id || 0));
  const timeReasons = new Set([
    "forgot_pass",
    "missing_entry",
    "missing_exit",
    "schedule_change",
    "other",
  ]);
  const timeOverride = [...sortedOverrides]
    .reverse()
    .find((row) => timeReasons.has(row.reason));
  const absenceOverride = [...sortedOverrides]
    .reverse()
    .find((row) => row.reason === "sick_leave" || row.reason === "vacation");
  const absenceActive =
    !!absenceOverride &&
    (!timeOverride || Number(timeOverride.id || 0) < Number(absenceOverride.id || 0));
  if (fact || sortedOverrides.length) {
    const baseHours = fact?.fact || 0;
    const planned = plannedCellFor(e, d);
    const start = absenceActive
      ? "00:00"
      : timeOverride?.start_time ||
      (fact?.entry && fact.entry !== "—" ? fact.entry : planned.start || "08:00");
    const end = absenceActive
      ? "00:00"
      : timeOverride?.end_time ||
      (fact?.exit && fact.exit !== "—" ? fact.exit : planned.end || "17:00");
    const leaveMinutes = sortedOverrides.reduce(
      (sum, row) => sum + Math.max(0, Number(row.leave_minutes) || 0),
      0,
    );
    const overrideComboHours = sortedOverrides.reduce(
      (sum, row) => sum + Math.max(0, Number(row.combo_hours) || 0),
      0,
    );
    const overtimeHours = absenceActive
      ? 0
      : sortedOverrides.reduce(
          (sum, row) => sum + Math.max(0, Number(row.overtime_hours) || 0),
          0,
        );
    const comboHours = absenceActive ? 0 : (fact?.combo || 0) + overrideComboHours;
    const manualBaseHours = absenceActive
      ? 0
      : sortedOverrides.length
      ? payableManualHours(e, start, end, leaveMinutes)
      : baseHours;
    const hours = roundHours(manualBaseHours + overtimeHours + comboHours);
    const bad = ["Нет входа", "Нет выхода", "Требует проверки"].includes(
      fact?.status || "",
    );
    const relatedNames = Array.from(
      new Set(
        sortedOverrides
          .map((row) => row.combo_employee_name)
          .filter(Boolean) as string[],
      ),
    );
    return {
      ...base,
      label: bad && !sortedOverrides.length
        ? "!"
        : absenceActive
          ? absenceOverride?.reason === "sick_leave"
            ? "Б"
            : "ОТ"
        : comboHours || overtimeHours
          ? `${compactHours(manualBaseHours)}+${compactHours(overtimeHours + comboHours)}`
          : hours
            ? `${compactHours(hours)}ч`
            : "0",
      kind: absenceActive
        ? absenceOverride?.reason === "vacation"
          ? "vacation"
          : "review"
        : bad && !sortedOverrides.length
          ? "review"
          : "fact",
      start,
      end,
      hours,
      baseHours: manualBaseHours,
      comboHours,
      overtimeHours,
      leaveMinutes,
      status: sortedOverrides.length
        ? "Ручная корректировка"
        : fact?.status || "Требует проверки",
      override: sortedOverrides[sortedOverrides.length - 1],
      overrides: sortedOverrides,
      comboEmployeeName: relatedNames.join(", "),
    };
  }
  return plannedCellFor(e, d);
}
function Timesheet({
  employees,
  go,
  role,
  user,
}: {
  employees: Employee[];
  go: any;
  role: Role;
  user: string;
}) {
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
    const key = `${row.employee_id}|${row.work_date}`;
    map.set(key, [...(map.get(key) || []), row]);
    return map;
  }, new Map<string, WorkOverride[]>());
  const factFor = (e: Employee, date: string) => facts.get(`${e.id}|${date}`);
  const overrideFor = (e: Employee, date: string) =>
    overrideMap.get(`${e.id}|${date}`) || [];
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
                      <small>{formatScheduleText(e.schedule)}</small>
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
                        title={`${e.name}, ${formatDate(cell.date)}`}
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
        <TimesheetCellModal
          opened={opened}
          role={role}
          user={user}
          roster={roster}
          onClose={() => setOpened(null)}
          onOpenDetail={() => {
            setOpened(null);
            go("detail", opened.employee);
          }}
          onSave={(row) => {
            const nextOverrides = [...overrides, row];
            setOverrides(nextOverrides);
            const day = monthDays.find((d) => d.date === row.work_date);
            if (day)
              setOpened({
                employee: opened.employee,
                cell: cellFor(
                  opened.employee,
                  day,
                  factFor(opened.employee, row.work_date),
                  nextOverrides.filter(
                    (item) =>
                      item.employee_id === row.employee_id &&
                      item.work_date === row.work_date,
                  ),
                ),
              });
          }}
          onDelete={(row) => {
            const nextOverrides = overrides.filter((item) => item.id !== row.id);
            setOverrides(nextOverrides);
            const day = monthDays.find((d) => d.date === row.work_date);
            if (day)
              setOpened({
                employee: opened.employee,
                cell: cellFor(
                  opened.employee,
                  day,
                  factFor(opened.employee, row.work_date),
                  nextOverrides.filter(
                    (item) =>
                      item.employee_id === row.employee_id &&
                      item.work_date === row.work_date,
                  ),
                ),
              });
          }}
        />
      )}
    </>
  );
}
function TimesheetCellModal({
  opened,
  role,
  user,
  roster,
  onClose,
  onOpenDetail,
  onSave,
  onDelete,
}: {
  opened: { employee: Employee; cell: TimesheetCell };
  role: Role;
  user: string;
  roster: Employee[];
  onClose: () => void;
  onOpenDetail: () => void;
  onSave: (row: WorkOverride) => void;
  onDelete: (row: WorkOverride) => void;
}) {
  const canEdit = role !== "observer";
  const actorName = accounts[user]?.name || user || role;
  const cellOverrides = opened.cell.overrides || [];
  const initialStart =
    opened.cell.start && opened.cell.start !== "—"
      ? opened.cell.start
      : opened.employee.entry !== "—"
        ? opened.employee.entry
        : "08:00";
  const initialEnd =
    opened.cell.end && opened.cell.end !== "—"
      ? opened.cell.end
      : opened.employee.exit !== "—"
        ? opened.employee.exit
        : "17:00";
  const [edit, setEdit] = useState({
    start: opened.cell.override?.start_time || initialStart,
    end: opened.cell.override?.end_time || initialEnd,
    reason:
      (opened.cell.override?.reason as CorrectionReason) ||
      (opened.cell.status === "Нет входа"
        ? "missing_entry"
        : opened.cell.status === "Нет выхода"
          ? "missing_exit"
          : "forgot_pass"),
    leaveMinutes: String(opened.cell.override?.leave_minutes || 0),
    comboHours: String(opened.cell.override?.combo_hours || 0),
    overtimeHours: String(opened.cell.override?.overtime_hours || 0),
    comboEmployeeId: String(opened.cell.override?.combo_employee_id || ""),
    comboEmployeeName: opened.cell.override?.combo_employee_name || "",
    comment: opened.cell.override?.comment || "",
  });
  const comboEmployee = roster.find((e) => String(e.id) === edit.comboEmployeeId);
  const comboEmployeeName = comboEmployee?.name || edit.comboEmployeeName.trim();
  const leaveMinutes = Math.max(0, Number(edit.leaveMinutes) || 0);
  const comboHours = Math.max(0, Number(edit.comboHours) || 0);
  const overtimeHours = Math.max(0, Number(edit.overtimeHours) || 0);
  const suggestedOvertime = suggestedOvertimeHours(
    opened.employee,
    edit.start,
    edit.end,
    leaveMinutes,
  );
  const baseHours = payableManualHours(
    opened.employee,
    edit.start,
    edit.end,
    leaveMinutes,
  );
  const isAbsenceReason = ["sick_leave", "vacation"].includes(edit.reason);
  const previewBaseHours = isAbsenceReason ? 0 : baseHours;
  const previewOvertimeHours = isAbsenceReason ? 0 : overtimeHours;
  const previewComboHours = isAbsenceReason ? 0 : comboHours;
  const totalHours = roundHours(
    previewBaseHours + previewOvertimeHours + previewComboHours,
  );
  const needsOnlyEntry =
    !isAbsenceReason &&
    (edit.reason === "missing_entry" || opened.cell.status === "Нет входа");
  const needsOnlyExit =
    !isAbsenceReason &&
    (edit.reason === "missing_exit" || opened.cell.status === "Нет выхода");
  const showStartInput = !isAbsenceReason && !needsOnlyExit;
  const showEndInput = !isAbsenceReason && !needsOnlyEntry;
  const needsRelatedEmployee =
    !isAbsenceReason && (comboHours > 0 || edit.reason === "substitution");
  const save = async () => {
    const payload = {
      employee_id: opened.employee.id,
      work_date: opened.cell.date,
      start_time: isAbsenceReason ? "00:00" : edit.start,
      end_time: isAbsenceReason ? "00:00" : edit.end,
      reason: edit.reason,
      comment: edit.comment,
      changed_by: actorName,
      leave_minutes: isAbsenceReason ? 0 : leaveMinutes,
      combo_hours: isAbsenceReason ? 0 : comboHours,
      overtime_hours: isAbsenceReason ? 0 : overtimeHours,
      combo_employee_id: isAbsenceReason
        ? null
        : comboEmployee
          ? comboEmployee.id
          : null,
      combo_employee_name: isAbsenceReason ? "" : comboEmployeeName,
    };
    const response = await fetch("/api/schedule-overrides", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) return;
    onSave(await response.json());
  };
  const remove = async (row: WorkOverride) => {
    if (!row.id) return;
    const response = await fetch(`/api/schedule-overrides/${row.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        changed_by: role === "admin" ? null : actorName,
      }),
    });
    if (response.ok) onDelete(row);
  };
  return (
    <div className="cellModalShade" onClick={onClose}>
      <div className="cellModal panel" onClick={(e) => e.stopPropagation()}>
        <button className="closeModal" onClick={onClose}>
          <X />
        </button>
        <span className="eyebrow">ЯЧЕЙКА ТАБЕЛЯ</span>
        <h2>{opened.employee.name}</h2>
        <p>
          {formatDate(opened.cell.date)} · {opened.employee.department}
        </p>
        <div className="cellFacts">
          <div>
            <span>График</span>
            <b>{formatScheduleText(opened.employee.schedule)}</b>
          </div>
          <div>
            <span>Смена</span>
            <b>
              {opened.cell.kind === "fact" || opened.cell.kind === "planned"
                ? formatRange(opened.cell.start, opened.cell.end)
                : opened.cell.kind === "vacation"
                  ? "Отпуск"
                  : opened.cell.kind === "off"
                    ? "Выходной"
                    : "Требует проверки"}
            </b>
          </div>
          <div>
            <span>Основное время</span>
            <b>{fmt(opened.cell.baseHours)}</b>
          </div>
          {opened.cell.leaveMinutes > 0 && (
            <div>
              <span>Отлучка</span>
              <b>{opened.cell.leaveMinutes} мин</b>
            </div>
          )}
          {opened.cell.overtimeHours > 0 && (
            <div>
              <span>Переработка</span>
              <b>+ {fmt(opened.cell.overtimeHours)}</b>
            </div>
          )}
          {(opened.cell.comboHours > 0 || opened.cell.comboEmployeeName) && (
            <div>
              <span>
                {opened.cell.comboHours > 0 ? "Совмещение" : "За сотрудника"}
              </span>
              <b>
                {opened.cell.comboHours > 0 ? `+ ${fmt(opened.cell.comboHours)}` : ""}
                {opened.cell.comboEmployeeName
                  ? `${opened.cell.comboHours > 0 ? " · " : ""}${opened.cell.comboEmployeeName}`
                  : ""}
              </b>
            </div>
          )}
          <div>
            <span>Итого</span>
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
        {cellOverrides.length > 0 && (
          <div className="cellCorrections">
            <h3>Внесённые правки</h3>
            {cellOverrides.map((row) => {
              const canDelete = role === "admin" || row.changed_by === actorName;
              return (
                <div className="correctionItem" key={row.id || `${row.reason}-${row.created_at}`}>
                  <div>
                    <b>
                      {correctionReasons[row.reason as CorrectionReason] ||
                        "Изменено вручную"}
                    </b>
                    <small>
                      {formatRange(row.start_time, row.end_time)}
                      {Number(row.leave_minutes) > 0
                        ? ` · отлучка ${row.leave_minutes} мин`
                        : ""}
                      {Number(row.combo_hours) > 0
                        ? ` · совмещение ${fmt(Number(row.combo_hours))}`
                        : ""}
                      {Number(row.overtime_hours) > 0
                        ? ` · переработка ${fmt(Number(row.overtime_hours))}`
                        : ""}
                      {row.combo_employee_name
                        ? ` · ${row.combo_employee_name}`
                        : ""}
                      {row.comment ? ` · ${row.comment}` : ""} ·{" "}
                      {row.changed_by}
                    </small>
                  </div>
                  {canDelete && (
                    <button className="danger mini" onClick={() => remove(row)}>
                      Удалить
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {canEdit && (
          <div className="cellEdit">
            <h3>Внести правку</h3>
            <label>
              Причина
              <select
                value={edit.reason}
                onChange={(event) =>
                  setEdit({
                    ...edit,
                    reason: event.target.value as CorrectionReason,
                  })
                }
              >
                {Object.entries(correctionReasons).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {!isAbsenceReason && (
            <div className="fieldRow">
              {showStartInput && (
                <label>
                  Вход
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="HH:mm"
                    pattern="[0-2][0-9]:[0-5][0-9]"
                    value={edit.start}
                    onChange={(event) =>
                      setEdit({
                        ...edit,
                        start: normalizeTimeInput(event.target.value),
                      })
                    }
                    onBlur={() =>
                      setEdit({ ...edit, start: formatTime(edit.start) })
                    }
                  />
                </label>
              )}
              {showEndInput && (
                <label>
                  Выход
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="HH:mm"
                    pattern="[0-2][0-9]:[0-5][0-9]"
                    value={edit.end}
                    onChange={(event) =>
                      setEdit({
                        ...edit,
                        end: normalizeTimeInput(event.target.value),
                      })
                    }
                    onBlur={() =>
                      setEdit({ ...edit, end: formatTime(edit.end) })
                    }
                  />
                </label>
              )}
            </div>
            )}
            {!isAbsenceReason && (
            <div className="fieldRow">
              <label>
                Отлучка, минут
                <input
                  min="0"
                  step="5"
                  type="number"
                  value={edit.leaveMinutes}
                  onChange={(event) =>
                    setEdit({ ...edit, leaveMinutes: event.target.value })
                  }
                />
              </label>
              <label>
                Совмещение, часов
                <input
                  min="0"
                  step="0.5"
                  type="number"
                  value={edit.comboHours}
                  onChange={(event) =>
                    setEdit({ ...edit, comboHours: event.target.value })
                  }
                />
              </label>
            </div>
            )}
            {!isAbsenceReason && (
            <div className="fieldRow">
              <label>
                Переработка, часов
                <input
                  min="0"
                  step="0.5"
                  type="number"
                  value={edit.overtimeHours}
                  onChange={(event) =>
                    setEdit({ ...edit, overtimeHours: event.target.value })
                  }
                />
              </label>
              {suggestedOvertime > 0.5 && (
                <label>
                  Видно сверх графика
                  <button
                    className="outline"
                    onClick={() =>
                      setEdit({
                        ...edit,
                        overtimeHours: String(suggestedOvertime),
                      })
                    }
                  >
                    Утвердить {fmt(suggestedOvertime)}
                  </button>
                </label>
              )}
            </div>
            )}
            {needsRelatedEmployee && (
              <label>
                {edit.reason === "substitution"
                  ? "За какого сотрудника вышел"
                  : "Кого совмещал"}
                <select
                  value={edit.comboEmployeeId}
                  onChange={(event) =>
                    setEdit({
                      ...edit,
                      comboEmployeeId: event.target.value,
                      comboEmployeeName: event.target.value
                        ? ""
                        : edit.comboEmployeeName,
                    })
                  }
                >
                  <option value="">Выберите сотрудника</option>
                  {roster
                    .filter((e) => e.id !== opened.employee.id)
                    .map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                      </option>
                    ))}
                </select>
                <input
                  type="text"
                  value={edit.comboEmployeeName}
                  onChange={(event) =>
                    setEdit({
                      ...edit,
                      comboEmployeeId: "",
                      comboEmployeeName: event.target.value,
                    })
                  }
                  placeholder="Или введите ФИО вручную"
                />
              </label>
            )}
            <label>
              Комментарий
              <textarea
                value={edit.comment}
                onChange={(event) =>
                  setEdit({ ...edit, comment: event.target.value })
                }
                placeholder="Например: забыл пропуск, отлучался на 40 минут, заменял сотрудника"
              />
            </label>
            <div className="calcPreview">
              <span>Основное {fmt(previewBaseHours)}</span>
              <b>+</b>
              <span>Переработка {fmt(previewOvertimeHours)}</span>
              <b>+</b>
              <span>Совмещение {fmt(previewComboHours)}</span>
              <b>=</b>
              <strong>Итого {fmt(totalHours)}</strong>
            </div>
            <button className="primary" onClick={save}>
              Сохранить в табеле
            </button>
          </div>
        )}
        <button className={canEdit ? "outline openDetail" : "primary"} onClick={onOpenDetail}>
          Открыть карточку сотрудника
        </button>
      </div>
    </div>
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
function Detail({ e, employees = [], role, go, update }: any) {
  const [correction, setCorrection] = useState({
    date: e.date || "2026-07-06",
    start: e.entry !== "—" ? e.entry : "08:00",
    end: e.exit !== "—" ? e.exit : "17:00",
    reason: "missing_entry" as CorrectionReason,
    comboEmployeeId: "",
    comboEmployeeName: "",
    comment: "",
  });
  const correctionNeedsOnlyEntry = correction.reason === "missing_entry";
  const correctionNeedsOnlyExit = correction.reason === "missing_exit";
  const correctionRelatedEmployee = employees.find(
    (x: Employee) => String(x.id) === correction.comboEmployeeId,
  );
  const saveCorrection = async () => {
    const isAbsence = ["sick_leave", "vacation"].includes(correction.reason);
    const start = isAbsence ? "00:00" : correction.start;
    const end = isAbsence ? "00:00" : correction.end;
    const hours = isAbsence ? 0 : payableManualHours(e, start, end);
    const status =
      correction.reason === "schedule_change"
        ? "Изменен график"
        : "Ручная корректировка";
    await fetch("/api/schedule-overrides", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employee_id: e.id,
        work_date: correction.date,
        start_time: start,
        end_time: end,
        reason: correction.reason,
        comment:
          correction.comment ||
          correctionReasons[correction.reason as CorrectionReason],
        changed_by: role,
        combo_employee_id:
          correction.reason === "substitution" && correctionRelatedEmployee
            ? correctionRelatedEmployee.id
            : null,
        combo_employee_name:
          correction.reason === "substitution"
            ? correctionRelatedEmployee?.name ||
              correction.comboEmployeeName.trim()
            : "",
      }),
    }).catch(() => null);
    update({
      ...e,
      entry: start,
      exit: end,
      fact: hours,
      total: hours + e.combo,
      status,
    });
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
          <span className="eyebrow">КАРТОЧКА ЗА {formatDate(e.date || "2026-07-06")}</span>
          <h1>{e.name}</h1>
          <p>
            {e.department} · {formatScheduleText(e.schedule)}
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
          {role !== "observer" && (
            <div className="panel actions">
              <h2>Ручная корректировка</h2>
              <label>
                Дата
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="дд-мм-гггг"
                  value={formatDate(correction.date)}
                  onChange={(event) =>
                    setCorrection({
                      ...correction,
                      date: parseDisplayDate(event.target.value),
                    })
                  }
                />
              </label>
              <label>
                Причина
                <select
                  value={correction.reason}
                  onChange={(event) =>
                    setCorrection({
                      ...correction,
                      reason: event.target.value as CorrectionReason,
                    })
                  }
                >
                  {Object.entries(correctionReasons).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              {!["sick_leave", "vacation"].includes(correction.reason) && (
                <div className="fieldRow">
                  {!correctionNeedsOnlyExit && (
                    <label>
                      Начало
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="HH:mm"
                        pattern="[0-2][0-9]:[0-5][0-9]"
                        value={correction.start}
                        onChange={(event) =>
                          setCorrection({
                            ...correction,
                            start: normalizeTimeInput(event.target.value),
                          })
                        }
                        onBlur={() =>
                          setCorrection({
                            ...correction,
                            start: formatTime(correction.start),
                          })
                        }
                      />
                    </label>
                  )}
                  {!correctionNeedsOnlyEntry && (
                    <label>
                      Окончание
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="HH:mm"
                        pattern="[0-2][0-9]:[0-5][0-9]"
                        value={correction.end}
                        onChange={(event) =>
                          setCorrection({
                            ...correction,
                            end: normalizeTimeInput(event.target.value),
                          })
                        }
                        onBlur={() =>
                          setCorrection({
                            ...correction,
                            end: formatTime(correction.end),
                          })
                        }
                      />
                    </label>
                  )}
                </div>
              )}
              {correction.reason === "substitution" && (
                <label>
                  За какого сотрудника вышел
                  <select
                    value={correction.comboEmployeeId}
                    onChange={(event) =>
                      setCorrection({
                        ...correction,
                        comboEmployeeId: event.target.value,
                        comboEmployeeName: event.target.value
                          ? ""
                          : correction.comboEmployeeName,
                      })
                    }
                  >
                    <option value="">Выберите сотрудника</option>
                    {employees
                      .filter((x: Employee) => x.id !== e.id)
                      .map((x: Employee) => (
                        <option key={x.id} value={x.id}>
                          {x.name}
                        </option>
                      ))}
                  </select>
                  <input
                    value={correction.comboEmployeeName}
                    onChange={(event) =>
                      setCorrection({
                        ...correction,
                        comboEmployeeId: "",
                        comboEmployeeName: event.target.value,
                      })
                    }
                    placeholder="Или введите ФИО вручную"
                  />
                </label>
              )}
              <label>
                Комментарий
                <textarea
                  value={correction.comment}
                  onChange={(event) =>
                    setCorrection({
                      ...correction,
                      comment: event.target.value,
                    })
                  }
                  placeholder="Например: объяснительная, служебная записка, номер больничного"
                />
              </label>
              <button className="primary" onClick={saveCorrection}>
                Сохранить корректировку
              </button>
              <button
                onClick={() => {
                  setCorrection({
                    ...correction,
                    start: "08:00",
                    end: "17:00",
                    reason: "forgot_pass",
                    comment: "Полный день по подтверждению начальника",
                  });
                }}
              >
                Заполнить полный день <ChevronRight />
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
    <b>{formatTime(time)}</b>
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
        update({
          ...e,
          schedule: formatRange(start, end),
          status: "Изменен график",
        });
        go("detail", {
          ...e,
          schedule: formatRange(start, end),
          status: "Изменен график",
        });
      }}
    >
      <label>
        Старый график
        <input disabled value={formatScheduleText(e.schedule)} />
      </label>
      <div className="fieldRow">
        <label>
          Начало
          <input
            type="text"
            inputMode="numeric"
            placeholder="HH:mm"
            pattern="[0-2][0-9]:[0-5][0-9]"
            value={start}
            onChange={(x) => setStart(normalizeTimeInput(x.target.value))}
            onBlur={() => setStart(formatTime(start))}
          />
        </label>
        <label>
          Окончание
          <input
            type="text"
            inputMode="numeric"
            placeholder="HH:mm"
            pattern="[0-2][0-9]:[0-5][0-9]"
            value={end}
            onChange={(x) => setEnd(normalizeTimeInput(x.target.value))}
            onBlur={() => setEnd(formatTime(end))}
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
function Combination({ e, employees, go, update }: any) {
  const [h, setH] = useState(4);
  const [employeeId, setEmployeeId] = useState("");
  const [employeeName, setEmployeeName] = useState("");
  const relatedEmployee = employees?.find(
    (x: Employee) => String(x.id) === employeeId,
  );
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
        <select
          value={employeeId}
          onChange={(event) => {
            setEmployeeId(event.target.value);
            if (event.target.value) setEmployeeName("");
          }}
        >
          <option value="">Выберите сотрудника</option>
          {(employees || [])
            .filter((x: Employee) => x.id !== e.id)
            .map((x: Employee) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
        </select>
        <input
          value={employeeName}
          onChange={(event) => {
            setEmployeeId("");
            setEmployeeName(event.target.value);
          }}
          placeholder="Или введите ФИО вручную"
        />
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
      {(relatedEmployee?.name || employeeName.trim()) && (
        <div className="calcPreview">
          <span>За сотрудника</span>
          <strong>{relatedEmployee?.name || employeeName.trim()}</strong>
        </div>
      )}
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
            <small>{formatDate(e.date || "2026-07-06")} · {e.department}</small>
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
                try {
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
                } catch {
                  setState({
                    ...state,
                    saving: false,
                    error:
                      "Не удалось применить импорт: сервер API недоступен. Запустите npm run dev:server и повторите импорт.",
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
function BossEmployeeCalendar({
  employees,
  role,
  user,
}: {
  employees: Employee[];
  role: Role;
  user: string;
}) {
  const roster = Array.from(
    employees
      .reduce((map, e) => {
        if (!map.has(e.id) || !e.date) map.set(e.id, e);
        return map;
      }, new Map<number, Employee>())
      .values(),
  );
  const today = localDateString();
  const monthEnd = "2026-07-31";
  const openEndedHorizonDays = 365;
  const [selectedId, setSelectedId] = useState(roster[0]?.id || 0);
  const [overrides, setOverrides] = useState<WorkOverride[]>([]);
  const [mode, setMode] = useState<"schedule_change" | "sick_leave" | "vacation">(
    "schedule_change",
  );
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [noEnd, setNoEnd] = useState(false);
  const [start, setStart] = useState("08:00");
  const [end, setEnd] = useState("17:00");
  const [comment, setComment] = useState("");
  const [message, setMessage] = useState("");
  const [periodCloseDates, setPeriodCloseDates] = useState<
    Record<string, string>
  >({});
  const [editingPeriodKey, setEditingPeriodKey] = useState("");
  const [periodModalOpen, setPeriodModalOpen] = useState(false);
  const selected = roster.find((e) => e.id === selectedId) || roster[0];
  const actorName = accounts[user]?.name || user || role;
  const loadOverrides = () =>
    fetch("/api/schedule-overrides?month=2026-07")
      .then((r) => (r.ok ? r.json() : []))
      .then(setOverrides)
      .catch(() => setOverrides([]));
  useEffect(() => {
    loadOverrides();
  }, []);
  const employeeOverrides = overrides.filter(
    (row) => row.employee_id === selected?.id,
  );
  const byDate = employeeOverrides.reduce((map, row) => {
    map.set(row.work_date, [...(map.get(row.work_date) || []), row]);
    return map;
  }, new Map<string, WorkOverride[]>());
  const markFor = (date: string) => {
    const rows = byDate.get(date) || [];
    if (rows.some((row) => row.reason === "sick_leave")) return "Б";
    if (rows.some((row) => row.reason === "vacation")) return "ОТ";
    if (rows.some((row) => row.reason === "schedule_change")) return "гр";
    return rows.length ? "*" : "";
  };
  const assignedPeriods = Array.from(
    employeeOverrides
      .filter((row) =>
        ["schedule_change", "sick_leave", "vacation"].includes(row.reason),
      )
      .reduce((map, row) => {
        const key = [
          row.reason,
          row.start_time,
          row.end_time,
          row.comment,
          row.changed_by,
        ].join("|");
        const current = map.get(key);
        map.set(key, current ? [...current, row] : [row]);
        return map;
      }, new Map<string, WorkOverride[]>())
      .entries(),
  ).map(([key, rows]) => {
    const dates = rows.map((row) => row.work_date).sort();
    return {
      key,
      rows,
      from: dates[0],
      to: dates[dates.length - 1],
      openEnded: rows[0]?.comment?.includes("Время окончания неопределено"),
    };
  });
  const bulkDeletePeriod = async (
    period: (typeof assignedPeriods)[number],
    fromDate?: string,
  ) => {
    const sample = period.rows[0];
    const response = await fetch("/api/schedule-overrides/bulk-delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employee_id: sample.employee_id,
        reason: sample.reason,
        start_time: sample.start_time,
        end_time: sample.end_time,
        comment: sample.comment,
        changed_by: role === "admin" ? null : actorName,
        from_date: fromDate || null,
      }),
    });
    const result = response.ok ? await response.json() : { count: 0 };
    setMessage(
      fromDate
        ? `Период закрыт с ${formatDate(fromDate)}: удалено ${result.count} будущих дней`
        : `Период удалён: ${result.count} дней`,
    );
    loadOverrides();
  };
  const closePeriod = (period: (typeof assignedPeriods)[number]) => {
    const closeDate = periodCloseDates[period.key] || today;
    bulkDeletePeriod(period, closeDate);
  };
  const removePeriod = (period: (typeof assignedPeriods)[number]) => {
    const sample = period.rows[0];
    const label = correctionReasons[sample.reason as CorrectionReason] || sample.reason;
    if (
      confirm(
        `Удалить период "${label}" для ${selected?.name}? Это уберёт все дневные правки этого периода.`,
      )
    )
      bulkDeletePeriod(period);
  };
  const resetPeriodForm = () => {
    setEditingPeriodKey("");
    setMode("schedule_change");
    setFrom(today);
    setTo(today);
    setNoEnd(false);
    setStart("08:00");
    setEnd("17:00");
    setComment("");
    setMessage("");
  };
  const editPeriod = (period: (typeof assignedPeriods)[number]) => {
    const sample = period.rows[0];
    setEditingPeriodKey(period.key);
    setMode(sample.reason as "schedule_change" | "sick_leave" | "vacation");
    setFrom(period.from);
    setTo(period.openEnded ? period.from : period.to);
    setNoEnd(!!period.openEnded);
    setStart(formatTime(sample.start_time));
    setEnd(formatTime(sample.end_time));
    setComment(
      (sample.comment || "")
        .replace(" · Время окончания неопределено", "")
        .replace("Время окончания неопределено", ""),
    );
    setMessage("Период загружен для редактирования");
    setPeriodModalOpen(true);
  };
  const savePeriod = async () => {
    if (!selected) return;
    const editingPeriod = assignedPeriods.find((period) => period.key === editingPeriodKey);
    if (editingPeriod) await bulkDeletePeriod(editingPeriod);
    const toDate = noEnd ? addDays(from, openEndedHorizonDays) : to;
    const dates = datesBetween(from, toDate);
    const isAbsence = mode === "sick_leave" || mode === "vacation";
    const payloads = dates.map((date) => ({
      employee_id: selected.id,
      work_date: date,
      start_time: isAbsence ? "00:00" : start,
      end_time: isAbsence ? "00:00" : end,
      reason: mode,
      comment:
        [
          comment ||
            (mode === "schedule_change"
              ? "Временное изменение графика"
              : correctionReasons[mode]),
          noEnd ? "Время окончания неопределено" : "",
        ]
          .filter(Boolean)
          .join(" · "),
      changed_by: actorName,
      leave_minutes: 0,
      combo_hours: 0,
      overtime_hours: 0,
      combo_employee_id: null,
      combo_employee_name: "",
    }));
    await Promise.all(
      payloads.map((payload) =>
        fetch("/api/schedule-overrides", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }),
      ),
    );
    setMessage(
      noEnd
        ? `Сохранено: открытый период с ${formatDate(from)}`
        : `Сохранено: ${payloads.length} дней`,
    );
    setComment("");
    setEditingPeriodKey("");
    setPeriodModalOpen(false);
    loadOverrides();
  };
  return (
    <>
      <PageHead
        eye="КОМАНДА"
        title="Сотрудники"
        text="Календарь графиков, больничных и отпусков по вашим сотрудникам"
      />
      <div className="staffPlanner">
        <div className="panel staffList">
          <div className="panelHead">
            <div>
              <span className="eyebrow">СОТРУДНИКИ</span>
              <h2>{roster.length} человек</h2>
            </div>
          </div>
          {roster.map((e) => (
            <button
              key={e.id}
              className={selected?.id === e.id ? "selected" : ""}
              onClick={() => {
                setSelectedId(e.id);
                setMessage("");
              }}
            >
              <span className="avatar sm">{e.initials}</span>
              <span>
                <b>{e.name}</b>
                <small>{e.department}</small>
              </span>
            </button>
          ))}
        </div>
        <div className="panel staffCalendar">
          <div className="panelHead">
            <div>
              <span className="eyebrow">КАЛЕНДАРЬ 07-2026</span>
              <h2>{selected?.name || "Сотрудник не выбран"}</h2>
            </div>
            <button
              className="primary"
              onClick={() => {
                resetPeriodForm();
                setPeriodModalOpen(true);
              }}
            >
              Внести период
            </button>
          </div>
          <div className="staffMonth">
            {monthDays.map((d) => {
              const mark = markFor(d.date);
              return (
                <button
                  key={d.date}
                  className={mark ? "marked" : ""}
                  onClick={() => {
                    setFrom(d.date);
                    setTo(d.date);
                  }}
                >
                  <b>{d.day}</b>
                  <small>{d.weekday}</small>
                  <span>{mark}</span>
                </button>
              );
            })}
          </div>
          <div className="timesheetLegend staffLegend">
            <span><i className="check" /> Б больничный</span>
            <span><i className="vac" /> ОТ отпуск</span>
            <span><i className="fact" /> гр временный график</span>
          </div>
          {assignedPeriods.length > 0 && (
            <div className="openPeriods">
              <h3>Назначенные периоды</h3>
              {assignedPeriods.map((period) => {
                const sample = period.rows[0];
                return (
                  <div className="openPeriod" key={period.key}>
                    <div>
                      <b>
                        {correctionReasons[sample.reason as CorrectionReason] ||
                          sample.reason}
                      </b>
                      <small>
                        С {formatDate(period.from)}
                        {period.openEnded
                          ? " · окончание не определено"
                          : ` · по ${formatDate(period.to)}`}
                        {" · "}
                        {sample.reason === "schedule_change"
                          ? `${formatRange(sample.start_time, sample.end_time)} · `
                          : ""}
                        {sample.comment}
                      </small>
                    </div>
                    {period.openEnded && (
                    <label>
                      Закрыть с даты
                      <DatePickerInput
                        value={periodCloseDates[period.key] || today}
                        onChange={(value) =>
                          setPeriodCloseDates({
                            ...periodCloseDates,
                            [period.key]: value,
                          })
                        }
                      />
                    </label>
                    )}
                    <div className="openPeriodActions">
                      <button className="outline" onClick={() => editPeriod(period)}>
                        Редактировать
                      </button>
                      {period.openEnded && (
                      <button className="outline" onClick={() => closePeriod(period)}>
                        Закрыть
                      </button>
                      )}
                      <button className="danger mini" onClick={() => removePeriod(period)}>
                        Удалить
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      {periodModalOpen && (
        <div className="cellModalShade" onClick={() => setPeriodModalOpen(false)}>
          <div
            className="cellModal panel periodModal"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="closeModal"
              onClick={() => setPeriodModalOpen(false)}
            >
              <X />
            </button>
            <span className="eyebrow">ПЕРИОД СОТРУДНИКА</span>
            <h2>{editingPeriodKey ? "Редактировать период" : "Внести период"}</h2>
            <p>{selected?.name}</p>
            <div className="staffEditor">
              <label>
                Тип изменения
                <select
                  value={mode}
                  onChange={(event) => setMode(event.target.value as any)}
                >
                  <option value="schedule_change">Временный график</option>
                  <option value="sick_leave">Больничный</option>
                  <option value="vacation">Отпуск</option>
                </select>
              </label>
              <div className="fieldRow">
                <label>
                  С даты
                  <DatePickerInput
                    value={from}
                    onChange={(value) => {
                      setFrom(value);
                      if (noEnd) setTo(value);
                    }}
                  />
                </label>
                <label>
                  По дату
                  {noEnd ? (
                    <input disabled value="Не определено" />
                  ) : (
                    <DatePickerInput value={to} onChange={setTo} />
                  )}
                </label>
              </div>
              <label className="checkLine">
                <input
                  type="checkbox"
                  checked={noEnd}
                  onChange={(event) => setNoEnd(event.target.checked)}
                />
                Время окончания неопределено
              </label>
              {noEnd && (
                <div className="calcPreview">
                  <span>Открытый период</span>
                  <strong>
                    С {formatDate(from)} и далее, пока начальник не изменит обратно
                  </strong>
                </div>
              )}
          {mode === "schedule_change" && (
            <div className="fieldRow">
              <label>
                Начало
                <input
                  value={start}
                  inputMode="numeric"
                  placeholder="HH:mm"
                  onChange={(event) =>
                    setStart(normalizeTimeInput(event.target.value))
                  }
                  onBlur={() => setStart(formatTime(start))}
                />
              </label>
              <label>
                Окончание
                <input
                  value={end}
                  inputMode="numeric"
                  placeholder="HH:mm"
                  onChange={(event) =>
                    setEnd(normalizeTimeInput(event.target.value))
                  }
                  onBlur={() => setEnd(formatTime(end))}
                />
              </label>
            </div>
          )}
              <label>
                Комментарий
                <textarea
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  placeholder="Номер больничного, приказ на отпуск или причина графика"
                />
              </label>
              {message && <div className="success">{message}</div>}
              <button className="primary" onClick={savePeriod} disabled={!selected}>
                {editingPeriodKey ? "Сохранить изменения" : "Сохранить период"}
              </button>
              {editingPeriodKey && (
                <button
                  className="outline openDetail"
                  onClick={resetPeriodForm}
                >
                  Сбросить редактирование
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
function DatePickerInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const pickerRef = useRef<HTMLInputElement | null>(null);
  const openPicker = () => {
    const input = pickerRef.current as HTMLInputElement & {
      showPicker?: () => void;
    };
    if (input?.showPicker) input.showPicker();
    else input?.click();
  };
  return (
    <span className="datePickerField">
      <input readOnly value={formatDate(value)} onClick={openPicker} />
      <button type="button" onClick={openPicker} aria-label="Выбрать дату">
        <CalendarCheck />
      </button>
      <input
        ref={pickerRef}
        className="nativeDateInput"
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        tabIndex={-1}
      />
    </span>
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
  const [from, setFrom] = useState(localDateString());
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
                    {e.department} · {formatScheduleText(e.schedule)}
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
                  type="text"
                  inputMode="numeric"
                  placeholder="дд-мм-гггг"
                  value={formatDate(from)}
                  onChange={(e) => setFrom(parseDisplayDate(e.target.value))}
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
function Admin({ employees }: { employees: Employee[] }) {
  const emptyUser = {
    login: "",
    name: "",
    pass: "",
    role: "boss" as Role,
    employeeIds: [] as number[],
    departmentIds: [] as number[],
  };
  const [rows, setRows] = useState<Record<string, Account>>({ ...accounts });
  const [selected, setSelected] = useState(emptyUser);
  const [originalLogin, setOriginalLogin] = useState("");
  const [message, setMessage] = useState("");
  const uniqueEmployees = employees.filter(
    (e, index, list) => list.findIndex((x) => x.id === e.id) === index,
  );
  const departments = Array.from(
    uniqueEmployees
      .reduce((map, e) => {
        if (e.departmentId) map.set(Number(e.departmentId), e.department);
        return map;
      }, new Map<number, string>())
      .entries(),
  ).sort((a, b) => a[1].localeCompare(b[1], "ru"));
  const persist = (next: Record<string, Account>) => {
    Object.keys(accounts).forEach((key) => delete accounts[key]);
    Object.assign(accounts, next);
    saveAccounts(next);
    setRows({ ...next });
  };
  const edit = (login: string) => {
    setSelected({
      login,
      name: rows[login].name,
      pass: "",
      role: rows[login].role,
      employeeIds: rows[login].employeeIds || [],
      departmentIds: rows[login].departmentIds || [],
    });
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
    if (!login || !selected.name.trim() || (!originalLogin && !selected.pass.trim())) {
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
      pass: selected.pass.trim() || rows[originalLogin]?.pass || "",
      role: selected.role,
      employeeIds: selected.role === "boss" ? selected.employeeIds : undefined,
      departmentIds:
        selected.role === "boss" ? selected.departmentIds : undefined,
    };
    persist(next);
    setOriginalLogin(login);
    setSelected({
      login,
      name: next[login].name,
      pass: "",
      role: next[login].role,
      employeeIds: next[login].employeeIds || [],
      departmentIds: next[login].departmentIds || [],
    });
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
            {originalLogin ? "Новый пароль" : "Пароль"}
            <input
              type="password"
              value={selected.pass}
              onChange={(e) =>
                setSelected({ ...selected, pass: e.target.value })
              }
              placeholder={
                originalLogin ? "Оставьте пустым, чтобы не менять" : "Пароль"
              }
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
          {selected.role === "boss" && (
            <div className="bossScope">
              <div>
                <span className="eyebrow">ЗОНА ОТВЕТСТВЕННОСТИ</span>
                <small>
                  {selected.departmentIds.length} подразделений ·{" "}
                  {selected.employeeIds.length} сотрудников
                </small>
              </div>
              <div className="bossScopeSection">
                <b>Подразделения</b>
                <div className="bossScopeList">
                  {departments.map(([id, name]) => (
                    <label key={id}>
                      <input
                        type="checkbox"
                        checked={selected.departmentIds.includes(id)}
                        onChange={(event) => {
                          const nextIds = event.target.checked
                            ? [...selected.departmentIds, id]
                            : selected.departmentIds.filter(
                                (departmentId) => departmentId !== id,
                              );
                          setSelected({
                            ...selected,
                            departmentIds: nextIds,
                          });
                        }}
                      />
                      <span>
                        <b>{name}</b>
                        <small>
                          {
                            uniqueEmployees.filter(
                              (e) => Number(e.departmentId) === id,
                            ).length
                          }{" "}
                          сотрудников
                        </small>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="bossScopeSection">
                <b>Отдельные сотрудники</b>
                <small>Для точечных исключений вне выбранных подразделений</small>
              <div className="bossScopeList">
                {uniqueEmployees.map((e) => (
                  <label key={e.id}>
                    <input
                      type="checkbox"
                      checked={selected.employeeIds.includes(e.id)}
                      onChange={(event) => {
                        const nextIds = event.target.checked
                          ? [...selected.employeeIds, e.id]
                          : selected.employeeIds.filter((id) => id !== e.id);
                        setSelected({ ...selected, employeeIds: nextIds });
                      }}
                    />
                    <span>
                      <b>{e.name}</b>
                      <small>{e.department}</small>
                    </span>
                  </label>
                ))}
                </div>
              </div>
            </div>
          )}
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
function AccountSettings({ login }: { login: string }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const account = accounts[login];
  const save = () => {
    if (!account) {
      setMessage("Учетная запись не найдена");
      return;
    }
    if (account.pass !== current) {
      setMessage("Текущий пароль указан неверно");
      return;
    }
    if (!next.trim()) {
      setMessage("Введите новый пароль");
      return;
    }
    if (next !== repeat) {
      setMessage("Пароли не совпадают");
      return;
    }
    const updated = {
      ...accounts,
      [login]: { ...account, pass: next.trim() },
    };
    Object.keys(accounts).forEach((key) => delete accounts[key]);
    Object.assign(accounts, updated);
    saveAccounts(updated);
    setCurrent("");
    setNext("");
    setRepeat("");
    setMessage("Пароль изменен");
  };
  return (
    <>
      <PageHead
        eye="ПРОФИЛЬ"
        title="Моя учетная запись"
        text="Смена пароля текущего пользователя"
      />
      <div className="panel edit accountPanel">
        <div className="editPerson">
          <span className="avatar">
            {account?.name
              ?.split(" ")
              .map((x: string) => x[0])
              .slice(0, 2)}
          </span>
          <div>
            <b>{account?.name}</b>
            <small>
              {login} · {account ? roleName[account.role] : "Нет роли"}
            </small>
          </div>
        </div>
        <label>
          Текущий пароль
          <input
            type={showPassword ? "text" : "password"}
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            placeholder="Введите текущий пароль"
          />
        </label>
        <label>
          Новый пароль
          <input
            type={showPassword ? "text" : "password"}
            value={next}
            onChange={(e) => setNext(e.target.value)}
            placeholder="Введите новый пароль"
          />
        </label>
        <label>
          Повторите пароль
          <input
            type={showPassword ? "text" : "password"}
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
            placeholder="Повторите новый пароль"
          />
        </label>
        <label className="checkLine">
          <input
            type="checkbox"
            checked={showPassword}
            onChange={(e) => setShowPassword(e.target.checked)}
          />
          Показать введенные пароли
        </label>
        {message && (
          <div className={message.includes("изменен") ? "success" : "error"}>
            {message}
          </div>
        )}
        <button className="primary" onClick={save}>
          <KeyRound />
          Изменить пароль
        </button>
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
    localDateString(),
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
                type="text"
                inputMode="numeric"
                placeholder="дд-мм-гггг"
                value={formatDate(effectiveFrom)}
                onChange={(e) =>
                  setEffectiveFrom(parseDisplayDate(e.target.value))
                }
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
                    <small>{formatScheduleText(e.schedule)}</small>
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
                    type="text"
                    inputMode="numeric"
                    placeholder="дд-мм-гггг"
                    value={formatDate(effectiveFrom)}
                    onChange={(e) =>
                      setEffectiveFrom(parseDisplayDate(e.target.value))
                    }
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
                  ? formatScheduleText(x.schedule_name)
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
      account: "Моя учетная запись",
      departments: "Подразделения",
    }) as any
  )[p];
createRoot(document.getElementById("root")!).render(<App />);
