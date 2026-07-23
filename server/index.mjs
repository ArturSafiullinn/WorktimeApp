import express from "express";
import cors from "cors";
import nodemailer from "nodemailer";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { pool } from "./db.mjs";
const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, "../dist");
const isProd = process.env.NODE_ENV === "production";
const appSecret =
  process.env.APP_SECRET ||
  (isProd
    ? null
    : "dev-only-change-me-worktime-secret");
if (!appSecret)
  throw new Error("Set APP_SECRET in production before starting WorkTime API.");
const allowedOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const smtpConfig = {
  host: (process.env.SMTP_HOST || "").trim(),
  port: Number(process.env.SMTP_PORT || 0),
  user: (process.env.SMTP_USER || "").trim(),
  password: (process.env.SMTP_PASSWORD || "").trim(),
  from: (process.env.SMTP_FROM || process.env.SMTP_USER || "").trim(),
  secure: !["0", "false", "no", "off"].includes(
    String(process.env.SMTP_USE_SSL ?? "1").toLowerCase(),
  ),
  startTls: ["1", "true", "yes", "on"].includes(
    String(process.env.SMTP_USE_TLS || "0").toLowerCase(),
  ),
};
const publicBaseUrl = (process.env.PUBLIC_BASE_URL || "").trim().replace(/\/$/, "");
const smtpIsConfigured = () =>
  !!(
    smtpConfig.host &&
    smtpConfig.port &&
    smtpConfig.user &&
    smtpConfig.password &&
    smtpConfig.from
  );
const sendEmail = async ({ to, subject, text }) => {
  if (!smtpIsConfigured()) throw new Error("SMTP is not configured");
  const transporter = nodemailer.createTransport({
    host: smtpConfig.host,
    port: smtpConfig.port,
    secure: smtpConfig.secure,
    auth: { user: smtpConfig.user, pass: smtpConfig.password },
    requireTLS: smtpConfig.startTls,
  });
  await transporter.sendMail({ from: smtpConfig.from, to, subject, text });
};
const publicApiPaths = new Set([
  "/health",
  "/login",
  "/password-reset/request",
  "/password-reset/confirm",
]);
const loginAttempts = new Map();
const rateLimit = ({ windowMs, max }) => (req, res, next) => {
  const key = `${req.ip}:${req.path}`;
  const now = Date.now();
  const bucket = loginAttempts.get(key) || { count: 0, resetAt: now + windowMs };
  if (bucket.resetAt <= now) {
    bucket.count = 0;
    bucket.resetAt = now + windowMs;
  }
  bucket.count += 1;
  loginAttempts.set(key, bucket);
  if (bucket.count > max)
    return res.status(429).json({ error: "Слишком много попыток. Повторите позже." });
  next();
};
const signPayload = (payload) =>
  crypto.createHmac("sha256", appSecret).update(payload).digest("base64url");
const createToken = (account) => {
  const payload = Buffer.from(
    JSON.stringify({
      login: account.login,
      role: account.role,
      name: account.name,
      exp: Date.now() + 12 * 60 * 60 * 1000,
    }),
  ).toString("base64url");
  return `${payload}.${signPayload(payload)}`;
};
const verifyToken = (token) => {
  const [payload, signature] = String(token || "").split(".");
  if (!payload || !signature || signature !== signPayload(payload)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!data.login || Date.now() > Number(data.exp || 0)) return null;
    return data;
  } catch {
    return null;
  }
};
const hashPassword = (password) => {
  const salt = crypto.randomBytes(16).toString("base64url");
  const hash = crypto.scryptSync(String(password), salt, 64).toString("base64url");
  return `scrypt$${salt}$${hash}`;
};
const hashResetToken = (token) =>
  crypto.createHash("sha256").update(String(token)).digest("hex");
const normalizeEmail = (email) => {
  const value = String(email || "").trim().toLowerCase();
  if (!value) return "";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value))
    throw new Error("Некорректный email");
  return value;
};
const validateNewPassword = (password) => {
  if (String(password).length < 8)
    throw new Error("Новый пароль должен быть не короче 8 символов");
  if (String(password).trim() !== String(password))
    throw new Error("Пароль не должен начинаться или заканчиваться пробелом");
};
const verifyPassword = (stored, password) => {
  const value = String(stored || "");
  const parts = value.split("$");
  if (parts[0] !== "scrypt" || parts.length !== 3)
    return value === String(password || "");
  const expected = Buffer.from(parts[2], "base64url");
  const actual = crypto.scryptSync(String(password || ""), parts[1], 64);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
};
const isPasswordHash = (password) => String(password || "").startsWith("scrypt$");
const safeError = (res, status = 500, message = "Не удалось выполнить действие") =>
  res.status(status).json({ error: message });
const isExcludedFromTimesheet = (name) =>
  String(name || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .includes("сафиуллин");
const defaultAccounts = {
  admin: { pass: "admin", role: "admin", name: "Анна Викторовна" },
  observer: { pass: "observer", role: "observer", name: "Олег Сергеевич" },
  boss: { pass: "boss", role: "boss", name: "Михаил Петрович" },
  boss_msp: {
    pass: "boss_msp",
    role: "boss",
    name: "Начальник МСП",
    employeeIds: [
      120, 121, 122, 127, 191, 192, 193, 198, 200, 204, 206, 207, 211, 212,
      213, 214, 215, 218, 232, 244, 276, 277, 298, 325, 332, 340, 343, 358,
      363, 384, 398,
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
      161, 165, 167, 171, 172, 261, 265, 268, 269, 270, 271, 346, 368, 389,
      403, 404, 407, 408,
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
const ensureAccountsTable = async () => {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS app_accounts(login TEXT PRIMARY KEY,full_name TEXT NOT NULL,password TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN('admin','observer','boss')),employee_ids JSONB NOT NULL DEFAULT '[]'::jsonb,department_ids JSONB NOT NULL DEFAULT '[]'::jsonb,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  );
  await pool.query(`ALTER TABLE app_accounts ADD COLUMN IF NOT EXISTS email TEXT`);
  await pool.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_app_accounts_email ON app_accounts(lower(email)) WHERE email IS NOT NULL AND email<>''`,
  );
  await pool.query(
    `CREATE TABLE IF NOT EXISTS password_reset_tokens(id BIGSERIAL PRIMARY KEY,login TEXT NOT NULL REFERENCES app_accounts(login) ON DELETE CASCADE,token_hash TEXT NOT NULL UNIQUE,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),expires_at TIMESTAMPTZ NOT NULL,used_at TIMESTAMPTZ)`,
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_login ON password_reset_tokens(login)`,
  );
  const { rows } = await pool.query(`SELECT COUNT(*)::int count FROM app_accounts`);
  if (rows[0]?.count > 0) return;
  for (const [login, account] of Object.entries(defaultAccounts)) {
    await pool.query(
      `INSERT INTO app_accounts(login,full_name,password,role,employee_ids,department_ids)VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb)ON CONFLICT(login)DO NOTHING`,
      [
        login,
        account.name,
        hashPassword(account.pass),
        account.role,
        JSON.stringify(account.employeeIds || []),
        JSON.stringify(account.departmentIds || []),
      ],
    );
  }
};
const accountRows = async () => {
  await ensureAccountsTable();
  const { rows } = await pool.query(
    `SELECT login,full_name name,email,role,employee_ids "employeeIds",department_ids "departmentIds" FROM app_accounts ORDER BY login`,
  );
  return rows;
};
const accountByLogin = async (login) => {
  await ensureAccountsTable();
  const { rows } = await pool.query(
    `SELECT login,full_name name,email,password,role,employee_ids "employeeIds",department_ids "departmentIds" FROM app_accounts WHERE login=$1`,
    [login],
  );
  return rows[0] || null;
};
const accountCanAccessEmployee = async (account, employeeId) => {
  if (!account || account.role !== "boss") return true;
  const assignedIds = Array.isArray(account.employeeIds)
    ? account.employeeIds.map(Number)
    : [];
  if (assignedIds.includes(Number(employeeId))) return true;
  const departmentIds = Array.isArray(account.departmentIds)
    ? account.departmentIds.map(Number)
    : [];
  if (!departmentIds.length) return false;
  const { rows } = await pool.query(
    `SELECT 1 FROM employees WHERE id=$1 AND department_id=ANY($2::bigint[]) LIMIT 1`,
    [employeeId, departmentIds],
  );
  return rows.length > 0;
};
const bossEmployeeFilter = (account, alias = "e") => {
  if (!account || account.role !== "boss") return { sql: "", params: [] };
  const employeeIds = Array.isArray(account.employeeIds)
    ? account.employeeIds.map(Number).filter(Number.isFinite)
    : [];
  const departmentIds = Array.isArray(account.departmentIds)
    ? account.departmentIds.map(Number).filter(Number.isFinite)
    : [];
  return {
    sql: ` AND (${alias}.id=ANY($2::int[]) OR ${alias}.department_id=ANY($3::bigint[]))`,
    params: [employeeIds, departmentIds],
  };
};
const ensureScheduleOverrideTables = async () => {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS schedule_overrides(id BIGSERIAL PRIMARY KEY,employee_id INTEGER NOT NULL REFERENCES employees(id),work_date DATE NOT NULL,start_time TIME NOT NULL,end_time TIME NOT NULL,reason TEXT NOT NULL,comment TEXT,changed_by TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  );
  await pool.query(
    `ALTER TABLE schedule_overrides DROP CONSTRAINT IF EXISTS schedule_overrides_employee_id_work_date_key`,
  );
  await pool.query(
    `ALTER TABLE schedule_overrides ADD COLUMN IF NOT EXISTS leave_minutes INTEGER NOT NULL DEFAULT 0`,
  );
  await pool.query(
    `ALTER TABLE schedule_overrides ADD COLUMN IF NOT EXISTS combo_hours NUMERIC(6,2) NOT NULL DEFAULT 0`,
  );
  await pool.query(
    `ALTER TABLE schedule_overrides ADD COLUMN IF NOT EXISTS overtime_hours NUMERIC(6,2) NOT NULL DEFAULT 0`,
  );
  await pool.query(
    `ALTER TABLE schedule_overrides ADD COLUMN IF NOT EXISTS combo_employee_id INTEGER REFERENCES employees(id)`,
  );
  await pool.query(
    `ALTER TABLE schedule_overrides ADD COLUMN IF NOT EXISTS combo_employee_name TEXT`,
  );
  await pool.query(
    `CREATE TABLE IF NOT EXISTS schedule_override_audit(id BIGSERIAL PRIMARY KEY,override_id BIGINT,action TEXT NOT NULL CHECK(action IN('created','deleted','restored')),employee_id INTEGER,work_date DATE,changed_by TEXT,action_by TEXT NOT NULL,snapshot JSONB NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  );
  await pool.query(
    `ALTER TABLE schedule_override_audit DROP CONSTRAINT IF EXISTS schedule_override_audit_action_check`,
  );
  await pool.query(
    `ALTER TABLE schedule_override_audit ADD CONSTRAINT schedule_override_audit_action_check CHECK(action IN('created','updated','deleted','restored'))`,
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_schedule_override_audit_lookup ON schedule_override_audit(created_at,changed_by,employee_id)`,
  );
};
const overrideSelectFor = (alias = "") => {
  const p = alias ? `${alias}.` : "";
  return `${p}id,${p}employee_id,to_char(${p}work_date,'YYYY-MM-DD') work_date,to_char(${p}start_time,'HH24:MI') start_time,to_char(${p}end_time,'HH24:MI') end_time,${p}reason,${p}comment,${p}changed_by,${p}leave_minutes,${p}combo_hours::float combo_hours,${p}overtime_hours::float overtime_hours,${p}combo_employee_id,${p}combo_employee_name,to_char(${p}created_at,'YYYY-MM-DD HH24:MI') created_at`;
};
const overrideSelect = overrideSelectFor();
const auditOverride = async (client, action, row, actionBy) => {
  await client.query(
    `INSERT INTO schedule_override_audit(override_id,action,employee_id,work_date,changed_by,action_by,snapshot)VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)`,
    [
      row.id || null,
      action,
      row.employee_id || null,
      row.work_date || null,
      row.changed_by || null,
      actionBy || row.changed_by || "user",
      JSON.stringify(row),
    ],
  );
};
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || !isProd || !allowedOrigins.length || allowedOrigins.includes(origin))
        return callback(null, true);
      callback(new Error("CORS origin is not allowed"));
    },
  }),
);
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || "5mb" }));
app.get("/api/health", async (_q, res) => {
  try {
    const r = await pool.query("select current_database() db,now() time");
    res.json({ ok: true, ...r.rows[0] });
  } catch (e) {
    safeError(res, 503, "API недоступен");
  }
});
app.post("/api/login", rateLimit({ windowMs: 15 * 60 * 1000, max: 10 }), async (req, res) => {
  try {
    const login = String(req.body?.login || "").trim();
    const password = String(req.body?.password || "");
    const account = login ? await accountByLogin(login) : null;
    if (!account || !verifyPassword(account.password, password))
      return safeError(res, 401, "Неверный логин или пароль");
    if (!isPasswordHash(account.password)) {
      await pool.query(`UPDATE app_accounts SET password=$2,updated_at=now() WHERE login=$1`, [
        account.login,
        hashPassword(password),
      ]);
    }
    res.json({
      token: createToken(account),
      account: {
        login: account.login,
        name: account.name,
        email: account.email || "",
        role: account.role,
        employeeIds: account.employeeIds || [],
        departmentIds: account.departmentIds || [],
      },
    });
  } catch {
    safeError(res, 500, "Не удалось войти");
  }
});
app.post(
  "/api/password-reset/request",
  rateLimit({ windowMs: 15 * 60 * 1000, max: 5 }),
  async (req, res) => {
    const success = "Если email найден, ссылка для сброса пароля отправлена.";
    try {
      const email = normalizeEmail(req.body?.email);
      if (!email) return res.json({ ok: true, message: success });
      await ensureAccountsTable();
      if (!smtpIsConfigured())
        return safeError(
          res,
          500,
          "Отправка писем пока не настроена. Укажите SMTP-настройки на сервере.",
        );
      const { rows } = await pool.query(
        `SELECT login,full_name name,email FROM app_accounts WHERE lower(email)=lower($1) LIMIT 1`,
        [email],
      );
      const account = rows[0];
      if (account) {
        const token = crypto.randomBytes(32).toString("base64url");
        const baseUrl =
          publicBaseUrl ||
          `${req.protocol}://${req.get("host")}`.replace(/\/$/, "");
        const resetLink = `${baseUrl}/?resetToken=${encodeURIComponent(token)}`;
        await pool.query(
          `INSERT INTO password_reset_tokens(login,token_hash,expires_at)VALUES($1,$2,now()+interval '60 minutes')`,
          [account.login, hashResetToken(token)],
        );
        try {
          await sendEmail({
            to: email,
            subject: "Сброс пароля Смена",
            text:
              `Здравствуйте, ${account.name || account.login}.\n\n` +
              "Чтобы задать новый пароль, откройте ссылку:\n" +
              `${resetLink}\n\n` +
              "Ссылка действует 60 минут и может быть использована только один раз.\n" +
              "Если вы не запрашивали сброс пароля, просто проигнорируйте это письмо.\n",
          });
        } catch {
          await pool.query(
            `UPDATE password_reset_tokens SET used_at=now() WHERE token_hash=$1`,
            [hashResetToken(token)],
          );
          return safeError(
            res,
            502,
            "Не удалось отправить письмо. Проверьте SMTP-настройки на сервере.",
          );
        }
      }
      res.json({ ok: true, message: success });
    } catch (e) {
      safeError(res, 400, e.message || "Не удалось отправить письмо");
    }
  },
);
app.post("/api/password-reset/confirm", async (req, res) => {
  const client = await pool.connect();
  try {
    const token = String(req.body?.token || "").trim();
    const password = String(req.body?.password || "");
    if (!token) throw new Error("Ссылка для сброса пароля некорректна");
    validateNewPassword(password);
    await ensureAccountsTable();
    const { rows } = await pool.query(
      `SELECT prt.id,prt.login,prt.expires_at,prt.used_at,aa.password FROM password_reset_tokens prt JOIN app_accounts aa ON aa.login=prt.login WHERE prt.token_hash=$1 LIMIT 1`,
      [hashResetToken(token)],
    );
    const row = rows[0];
    if (!row || row.used_at || new Date(row.expires_at).getTime() < Date.now())
      throw new Error("Ссылка устарела или уже была использована");
    if (verifyPassword(row.password, password))
      throw new Error("Новый пароль должен отличаться от текущего");
    await client.query("BEGIN");
    await client.query(`UPDATE app_accounts SET password=$2,updated_at=now() WHERE login=$1`, [
      row.login,
      hashPassword(password),
    ]);
    await client.query(`UPDATE password_reset_tokens SET used_at=now() WHERE id=$1`, [
      row.id,
    ]);
    await client.query("COMMIT");
    res.json({ ok: true, message: "Пароль изменен. Теперь можно войти с новым паролем." });
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    safeError(res, 400, e.message || "Не удалось изменить пароль");
  } finally {
    client.release();
  }
});
app.use("/api", async (req, res, next) => {
  if (publicApiPaths.has(req.path)) return next();
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const verified = verifyToken(token);
  if (!verified) return safeError(res, 401, "Требуется вход в систему");
  const account = await accountByLogin(verified.login);
  if (!account) return safeError(res, 401, "Требуется вход в систему");
  req.account = account;
  next();
});
const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.account?.role)) return safeError(res, 403, "Недостаточно прав");
  next();
};
app.get("/api/accounts", requireRole("admin"), async (_req, res) => {
  try {
    res.json(await accountRows());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.put("/api/accounts/:login", requireRole("admin"), async (req, res) => {
  try {
    const originalLogin = String(req.params.login || "").trim();
    const login = String(req.body?.login || originalLogin).trim();
    const name = String(req.body?.name || "").trim();
    const pass = String(req.body?.pass || "").trim();
    const role = String(req.body?.role || "");
    const email = normalizeEmail(req.body?.email);
    const employeeIds = Array.isArray(req.body?.employeeIds)
      ? req.body.employeeIds.map(Number).filter(Number.isFinite)
      : [];
    const departmentIds = Array.isArray(req.body?.departmentIds)
      ? req.body.departmentIds.map(Number).filter(Number.isFinite)
      : [];
    if (!login || !name || !["admin", "observer", "boss"].includes(role))
      return res.status(400).json({ error: "Заполните логин, имя и роль" });
    const currentAccount = await accountByLogin(originalLogin);
    if (!currentAccount && !pass)
      return res.status(400).json({ error: "Для нового пользователя нужен пароль" });
    await ensureAccountsTable();
    if (login !== originalLogin) {
      const exists = await pool.query(
        `SELECT 1 FROM app_accounts WHERE login=$1`,
        [login],
      );
      if (exists.rows.length)
        return res.status(409).json({ error: "Такой логин уже есть" });
      if (currentAccount)
        await pool.query(`DELETE FROM app_accounts WHERE login=$1`, [originalLogin]);
    }
    const storedPassword = pass ? hashPassword(pass) : currentAccount?.password;
    await pool.query(
      `INSERT INTO app_accounts(login,full_name,email,password,role,employee_ids,department_ids)VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb)ON CONFLICT(login)DO UPDATE SET full_name=excluded.full_name,email=excluded.email,password=excluded.password,role=excluded.role,employee_ids=excluded.employee_ids,department_ids=excluded.department_ids,updated_at=now()`,
      [
        login,
        name,
        email || null,
        storedPassword,
        role,
        JSON.stringify(role === "boss" ? employeeIds : []),
        JSON.stringify(role === "boss" ? departmentIds : []),
      ],
    );
    res.json({ ok: true, accounts: await accountRows() });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
app.delete("/api/accounts/:login", requireRole("admin"), async (req, res) => {
  try {
    const login = String(req.params.login || "").trim();
    await ensureAccountsTable();
    const { rows } = await pool.query(
      `SELECT login,role FROM app_accounts ORDER BY login`,
    );
    if (rows.length <= 1)
      return res.status(400).json({ error: "Нельзя удалить последнего пользователя" });
    const target = rows.find((row) => row.login === login);
    if (!target) return res.status(404).json({ error: "Пользователь не найден" });
    if (
      target.role === "admin" &&
      rows.filter((row) => row.role === "admin").length <= 1
    )
      return res.status(400).json({ error: "Нельзя удалить последнего администратора" });
    await pool.query(`DELETE FROM app_accounts WHERE login=$1`, [login]);
    res.json({ ok: true, accounts: await accountRows() });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
app.put("/api/me/password", async (req, res) => {
  try {
    const current = String(req.body?.current || "");
    const next = String(req.body?.next || "");
    if (!verifyPassword(req.account.password, current))
      return safeError(res, 400, "Текущий пароль указан неверно");
    if (next.length < 8)
      return safeError(res, 400, "Новый пароль должен быть не короче 8 символов");
    await pool.query(`UPDATE app_accounts SET password=$2,updated_at=now() WHERE login=$1`, [
      req.account.login,
      hashPassword(next),
    ]);
    res.json({ ok: true });
  } catch {
    safeError(res, 400, "Не удалось изменить пароль");
  }
});
app.put("/api/me/email", async (req, res) => {
  try {
    const current = String(req.body?.current || "");
    const email = normalizeEmail(req.body?.email);
    if (!verifyPassword(req.account.password, current))
      return safeError(res, 400, "Текущий пароль указан неверно");
    await ensureAccountsTable();
    await pool.query(`UPDATE app_accounts SET email=$2,updated_at=now() WHERE login=$1`, [
      req.account.login,
      email || null,
    ]);
    res.json({ ok: true, email });
  } catch (e) {
    safeError(res, 400, e.message || "Не удалось сохранить email");
  }
});
app.get("/api/employees", async (req, res) => {
  try {
    const active = req.query.active !== "false";
    const scope = bossEmployeeFilter(req.account, "e");
    const { rows } = await pool.query(
      `SELECT e.id,e.full_name name,e.card_number,e.position_name,e.active,e.needs_review,e.review_note,e.department_id,d.name department,s.name schedule,s.id schedule_id,s.code schedule_code,s.schedule_kind,s.cycle_pattern,s.requires_anchor,s.paid_hours,s.effective_from schedule_effective_from FROM employees e LEFT JOIN departments d ON d.id=e.department_id LEFT JOIN LATERAL(SELECT st.*,es.effective_from FROM employee_schedules es JOIN schedule_templates st ON st.id=es.schedule_id WHERE es.employee_id=e.id AND es.effective_from<=CURRENT_DATE AND(es.effective_to IS NULL OR es.effective_to>=CURRENT_DATE)ORDER BY es.effective_from DESC LIMIT 1)s ON true WHERE($1::boolean=false OR e.active=true)${scope.sql} ORDER BY d.name,e.full_name`,
      [active, ...scope.params],
    );
    res.json(rows);
  } catch (e) {
    safeError(res);
  }
});
app.patch("/api/employees/:id", requireRole("admin"), async (req, res) => {
  const client = await pool.connect();
  try {
    const id = Number(req.params.id),
      { department_id, schedule_id, effective_from, active, clear_review } =
        req.body;
    await client.query("BEGIN");
    if (department_id != null || active != null)
      await client.query(
        `UPDATE employees SET department_id=COALESCE($2,department_id),active=COALESCE($3,active),updated_at=now() WHERE id=$1`,
        [id, department_id ?? null, active ?? null],
      );
    if (clear_review)
      await client.query(
        `UPDATE employees SET needs_review=false,review_note=NULL,updated_at=now() WHERE id=$1`,
        [id],
      );
    if (Object.prototype.hasOwnProperty.call(req.body, "schedule_id")) {
      const from = effective_from || new Date().toISOString().slice(0, 10);
      await client.query(
        `UPDATE employee_schedules SET effective_to=$2::date-1 WHERE employee_id=$1 AND effective_from<$2 AND(effective_to IS NULL OR effective_to>=$2)`,
        [id, from],
      );
      if (schedule_id)
        await client.query(
          `INSERT INTO employee_schedules(employee_id,schedule_id,effective_from,source)VALUES($1,$2,$3,'manual') ON CONFLICT(employee_id,effective_from)DO UPDATE SET schedule_id=excluded.schedule_id,source='manual',effective_to=NULL`,
          [id, schedule_id, from],
        );
      else
        await client.query(
          `DELETE FROM employee_schedules WHERE employee_id=$1 AND effective_from=$2 AND source='manual'`,
          [id, from],
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
    const scope = bossEmployeeFilter(req.account, "e");
    await pool.query(
      `CREATE TABLE IF NOT EXISTS skud_days(id BIGSERIAL PRIMARY KEY,employee_id INTEGER NOT NULL REFERENCES employees(id),work_date DATE NOT NULL,entry_time TIME,end_time TIME,fact_hours NUMERIC(6,2) NOT NULL DEFAULT 0,total_hours NUMERIC(6,2) NOT NULL DEFAULT 0,combo_hours NUMERIC(6,2) NOT NULL DEFAULT 0,status TEXT NOT NULL,record_count INTEGER NOT NULL DEFAULT 0,issues JSONB NOT NULL DEFAULT '[]'::jsonb,source TEXT NOT NULL DEFAULT 'skud_import',imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),UNIQUE(employee_id,work_date))`,
    );
    const { rows } = await pool.query(
      `SELECT sd.employee_id id,e.full_name name,e.department_id,d.name department,s.schedule,s.schedule_id,s.schedule_code,s.schedule_kind,s.cycle_pattern,s.requires_anchor,to_char(s.effective_from,'YYYY-MM-DD') schedule_effective_from,to_char(sd.work_date,'YYYY-MM-DD') date,COALESCE(to_char(sd.entry_time,'HH24:MI'),'—') entry,COALESCE(to_char(sd.end_time,'HH24:MI'),'—') exit,sd.fact_hours::float fact,sd.total_hours::float total,sd.combo_hours::float combo,sd.status,sd.record_count "recordCount",sd.issues FROM skud_days sd JOIN employees e ON e.id=sd.employee_id LEFT JOIN departments d ON d.id=e.department_id LEFT JOIN LATERAL(SELECT es.effective_from,st.id schedule_id,st.name schedule,st.code schedule_code,st.schedule_kind,st.cycle_pattern,st.requires_anchor FROM employee_schedules es JOIN schedule_templates st ON st.id=es.schedule_id WHERE es.employee_id=e.id AND es.effective_from<=sd.work_date AND(es.effective_to IS NULL OR es.effective_to>=sd.work_date)ORDER BY es.effective_from DESC LIMIT 1) s ON true WHERE sd.work_date>=($1 || '-01')::date AND sd.work_date<(($1 || '-01')::date + interval '1 month') AND lower(replace(e.full_name,'ё','е')) NOT LIKE '%сафиуллин%'${scope.sql} ORDER BY d.name,e.full_name,sd.work_date`,
      [month, ...scope.params],
    );
    res.json(rows);
  } catch (e) {
    safeError(res);
  }
});
app.post("/api/skud-days/import", requireRole("admin"), async (req, res) => {
  const client = await pool.connect();
  try {
    const rows = (Array.isArray(req.body?.rows) ? req.body.rows : []).filter(
      (row) => !isExcludedFromTimesheet(row.name),
    );
    if (rows.length > 20000)
      return res.status(413).json({ error: "Слишком большой файл импорта" });
    await client.query("BEGIN");
    await client.query(
      `CREATE TABLE IF NOT EXISTS skud_days(id BIGSERIAL PRIMARY KEY,employee_id INTEGER NOT NULL REFERENCES employees(id),work_date DATE NOT NULL,entry_time TIME,end_time TIME,fact_hours NUMERIC(6,2) NOT NULL DEFAULT 0,total_hours NUMERIC(6,2) NOT NULL DEFAULT 0,combo_hours NUMERIC(6,2) NOT NULL DEFAULT 0,status TEXT NOT NULL,record_count INTEGER NOT NULL DEFAULT 0,issues JSONB NOT NULL DEFAULT '[]'::jsonb,source TEXT NOT NULL DEFAULT 'skud_import',imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),UNIQUE(employee_id,work_date))`,
    );
    const importedPairs = rows
      .map((row) => ({
        employee_id: Number(row.id),
        work_date: String(row.date || ""),
      }))
      .filter(
        (row) =>
          Number.isFinite(row.employee_id) &&
          /^\d{4}-\d{2}-\d{2}$/.test(row.work_date),
      );
    const importedEmployees = [
      ...new Set(importedPairs.map((row) => row.employee_id)),
    ];
    const importedDates = importedPairs.map((row) => row.work_date).sort();
    if (importedEmployees.length && importedDates.length) {
      await client.query(
        `DELETE FROM skud_days sd WHERE sd.source='skud_import' AND sd.employee_id=ANY($1::int[]) AND sd.work_date BETWEEN $2::date AND $3::date AND NOT EXISTS(SELECT 1 FROM jsonb_to_recordset($4::jsonb) AS incoming(employee_id int,work_date date) WHERE incoming.employee_id=sd.employee_id AND incoming.work_date=sd.work_date)`,
        [
          importedEmployees,
          importedDates[0],
          importedDates[importedDates.length - 1],
          JSON.stringify(importedPairs),
        ],
      );
    }
    for (const row of rows) {
      const dep = await client.query(
        `INSERT INTO departments(name,active)VALUES($1,true)ON CONFLICT(name)DO UPDATE SET active=departments.active RETURNING id`,
        [row.department || "Без подразделения"],
      );
      await client.query(
        `INSERT INTO employees(id,full_name,department_id,active,needs_review,review_note)VALUES($1,$2,$3,true,true,$4)ON CONFLICT(id)DO NOTHING`,
        [
          row.id,
          row.name || `Сотрудник #${row.id}`,
          dep.rows[0].id,
          "Сотрудник найден в импорте СКУД, но отсутствовал в базе сотрудников. Проверьте подразделение и график.",
        ],
      );
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
    await ensureScheduleOverrideTables();
    const scope = bossEmployeeFilter(req.account, "e");
    const { rows } = await pool.query(
      `SELECT ${overrideSelectFor("so")} FROM schedule_overrides so JOIN employees e ON e.id=so.employee_id WHERE so.work_date>=($1 || '-01')::date AND so.work_date<(($1 || '-01')::date + interval '1 month')${scope.sql} ORDER BY so.work_date,so.employee_id,so.id`,
      [month, ...scope.params],
    );
    res.json(rows);
  } catch (e) {
    safeError(res);
  }
});
app.get("/api/schedule-overrides/audit", requireRole("admin"), async (req, res) => {
  try {
    const month = String(req.query.month || new Date().toISOString().slice(0, 7));
    const changedBy = String(req.query.changed_by || "").trim();
    await ensureScheduleOverrideTables();
    const params = [month];
    if (changedBy) params.push(changedBy);
    const { rows } = await pool.query(
      `SELECT a.id,a.override_id,a.action,a.employee_id,e.full_name employee_name,d.name department,to_char(a.work_date,'YYYY-MM-DD') work_date,a.changed_by,a.action_by,a.snapshot,to_char(a.created_at,'YYYY-MM-DD HH24:MI') created_at FROM schedule_override_audit a LEFT JOIN employees e ON e.id=a.employee_id LEFT JOIN departments d ON d.id=e.department_id WHERE a.work_date>=($1 || '-01')::date AND a.work_date<(($1 || '-01')::date + interval '1 month')${changedBy ? " AND a.changed_by=$2" : ""} ORDER BY a.created_at DESC,a.id DESC LIMIT 500`,
      params,
    );
    res.json(rows);
  } catch (e) {
    safeError(res);
  }
});
app.post("/api/schedule-overrides", requireRole("admin", "boss"), async (req, res) => {
  const client = await pool.connect();
  try {
    const {
      employee_id,
      work_date,
      start_time,
      end_time,
      reason,
      comment,
      changed_by,
      leave_minutes,
      combo_hours,
      overtime_hours,
      combo_employee_id,
      combo_employee_name,
    } = req.body;
    if (!employee_id || !work_date || !start_time || !end_time)
      return res.status(400).json({ error: "Не хватает данных корректировки" });
    if (!(await accountCanAccessEmployee(req.account, employee_id)))
      return safeError(res, 403, "Недостаточно прав");
    await ensureScheduleOverrideTables();
    await client.query("BEGIN");
    const { rows } = await client.query(
      `INSERT INTO schedule_overrides(employee_id,work_date,start_time,end_time,reason,comment,changed_by,leave_minutes,combo_hours,overtime_hours,combo_employee_id,combo_employee_name)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING ${overrideSelect}`,
      [
        employee_id,
        work_date,
        start_time,
        end_time,
        reason || "manual",
        comment || null,
        req.account.name || changed_by || "user",
        Math.max(0, Number(leave_minutes) || 0),
        Math.max(0, Number(combo_hours) || 0),
        Math.max(0, Number(overtime_hours) || 0),
        combo_employee_id || null,
        combo_employee_name?.trim() || null,
      ],
    );
    await auditOverride(client, "created", rows[0], req.account.name || changed_by || "user");
    await client.query("COMMIT");
    res.status(201).json(rows[0]);
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    safeError(res, 400);
  } finally {
    client.release();
  }
});
app.patch("/api/schedule-overrides/:id", requireRole("admin", "boss"), async (req, res) => {
  const client = await pool.connect();
  try {
    const id = Number(req.params.id);
    const {
      start_time,
      end_time,
      reason,
      comment,
      changed_by,
      action_by,
      leave_minutes,
      combo_hours,
      overtime_hours,
      combo_employee_id,
      combo_employee_name,
    } = req.body;
    if (!id || !start_time || !end_time)
      return res.status(400).json({ error: "Не хватает данных корректировки" });
    await ensureScheduleOverrideTables();
    await client.query("BEGIN");
    const existing = await client.query(
      `SELECT ${overrideSelect} FROM schedule_overrides WHERE id=$1 AND($2::text IS NULL OR changed_by=$2)`,
      [id, req.account.role === "admin" ? null : req.account.name],
    );
    if (!existing.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Правка не найдена" });
    }
    if (!(await accountCanAccessEmployee(req.account, existing.rows[0].employee_id))) {
      await client.query("ROLLBACK");
      return safeError(res, 403, "Недостаточно прав");
    }
    const { rows } = await client.query(
      `UPDATE schedule_overrides SET start_time=$2,end_time=$3,reason=$4,comment=$5,leave_minutes=$6,combo_hours=$7,overtime_hours=$8,combo_employee_id=$9,combo_employee_name=$10 WHERE id=$1 RETURNING ${overrideSelect}`,
      [
        id,
        start_time,
        end_time,
        reason || existing.rows[0].reason,
        comment || null,
        Math.max(0, Number(leave_minutes) || 0),
        Math.max(0, Number(combo_hours) || 0),
        Math.max(0, Number(overtime_hours) || 0),
        combo_employee_id || null,
        combo_employee_name?.trim() || null,
      ],
    );
    await auditOverride(
      client,
      "updated",
      { before: existing.rows[0], after: rows[0], ...rows[0] },
      req.account.name || action_by || changed_by || "admin",
    );
    await client.query("COMMIT");
    res.json(rows[0]);
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    safeError(res, 400);
  } finally {
    client.release();
  }
});
app.post("/api/schedule-overrides/bulk-delete", requireRole("admin", "boss"), async (req, res) => {
  const client = await pool.connect();
  try {
    const {
      employee_id,
      reason,
      start_time,
      end_time,
      comment,
      changed_by,
      action_by,
      from_date,
    } = req.body;
    if (!employee_id || !reason || !start_time || !end_time || !comment)
      return res.status(400).json({ error: "Не хватает данных периода" });
    if (!(await accountCanAccessEmployee(req.account, employee_id)))
      return safeError(res, 403, "Недостаточно прав");
    await ensureScheduleOverrideTables();
    await client.query("BEGIN");
    const params = [
      employee_id,
      reason,
      start_time,
      end_time,
      comment,
      req.account.role === "admin" ? changed_by || null : req.account.name,
      from_date || null,
    ];
    const { rows } = await client.query(
      `SELECT ${overrideSelect} FROM schedule_overrides WHERE employee_id=$1 AND reason=$2 AND start_time=$3::time AND end_time=$4::time AND comment=$5 AND($6::text IS NULL OR changed_by=$6) AND($7::date IS NULL OR work_date>=$7::date)`,
      params,
    );
    for (const row of rows) {
      await auditOverride(client, "deleted", row, req.account.name || action_by || changed_by || "admin");
    }
    await client.query(
      `DELETE FROM schedule_overrides WHERE id=ANY($1::bigint[])`,
      [rows.map((row) => row.id)],
    );
    await client.query("COMMIT");
    res.json({ ok: true, count: rows.length });
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    safeError(res, 400);
  } finally {
    client.release();
  }
});
app.delete("/api/schedule-overrides/:id", requireRole("admin", "boss"), async (req, res) => {
  const client = await pool.connect();
  try {
    const id = Number(req.params.id);
    const { changed_by, action_by } = req.body || {};
    await ensureScheduleOverrideTables();
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT ${overrideSelect} FROM schedule_overrides WHERE id=$1 AND($2::text IS NULL OR changed_by=$2)`,
      [id, req.account.role === "admin" ? changed_by || null : req.account.name],
    );
    if (!rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Правка не найдена" });
    }
    if (!(await accountCanAccessEmployee(req.account, rows[0].employee_id))) {
      await client.query("ROLLBACK");
      return safeError(res, 403, "Недостаточно прав");
    }
    await auditOverride(client, "deleted", rows[0], req.account.name || action_by || changed_by || "admin");
    await client.query(`DELETE FROM schedule_overrides WHERE id=$1`, [id]);
    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    safeError(res, 400);
  } finally {
    client.release();
  }
});
app.post("/api/schedule-overrides/audit/:id/restore", requireRole("admin"), async (req, res) => {
  const client = await pool.connect();
  try {
    const id = Number(req.params.id);
    const { action_by } = req.body || {};
    await ensureScheduleOverrideTables();
    await client.query("BEGIN");
    const audit = await client.query(
      `SELECT snapshot FROM schedule_override_audit WHERE id=$1 AND action='deleted'`,
      [id],
    );
    if (!audit.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Удалённая правка не найдена" });
    }
    const row = audit.rows[0].snapshot;
    const duplicate = await client.query(
      `SELECT 1 FROM schedule_overrides WHERE employee_id=$1 AND work_date=$2::date AND start_time=$3::time AND end_time=$4::time AND reason=$5 AND comment IS NOT DISTINCT FROM $6 AND changed_by=$7 AND leave_minutes=$8 AND combo_hours=$9 AND overtime_hours=$10 AND combo_employee_id IS NOT DISTINCT FROM $11 AND combo_employee_name IS NOT DISTINCT FROM $12 LIMIT 1`,
      [
        row.employee_id,
        row.work_date,
        row.start_time,
        row.end_time,
        row.reason,
        row.comment || null,
        row.changed_by || action_by || "admin",
        Math.max(0, Number(row.leave_minutes) || 0),
        Math.max(0, Number(row.combo_hours) || 0),
        Math.max(0, Number(row.overtime_hours) || 0),
        row.combo_employee_id || null,
        row.combo_employee_name || null,
      ],
    );
    if (duplicate.rows.length) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Такая правка уже есть в табеле" });
    }
    const inserted = await client.query(
      `INSERT INTO schedule_overrides(employee_id,work_date,start_time,end_time,reason,comment,changed_by,leave_minutes,combo_hours,overtime_hours,combo_employee_id,combo_employee_name)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING ${overrideSelect}`,
      [
        row.employee_id,
        row.work_date,
        row.start_time,
        row.end_time,
        row.reason,
        row.comment || null,
        row.changed_by || action_by || "admin",
        Math.max(0, Number(row.leave_minutes) || 0),
        Math.max(0, Number(row.combo_hours) || 0),
        Math.max(0, Number(row.overtime_hours) || 0),
        row.combo_employee_id || null,
        row.combo_employee_name || null,
      ],
    );
    await auditOverride(client, "restored", inserted.rows[0], action_by || "admin");
    await client.query("COMMIT");
    res.status(201).json(inserted.rows[0]);
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    res.status(400).json({ error: e.message });
  } finally {
    client.release();
  }
});
app.get("/api/departments", requireRole("admin"), async (_q, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT d.id,d.external_id,d.name,d.active,count(e.id)::int employee_count,ds.schedule_id,st.name schedule_name,to_char(st.start_time,'HH24:MI') schedule_start,to_char(st.end_time,'HH24:MI') schedule_end FROM departments d LEFT JOIN employees e ON e.department_id=d.id AND e.active LEFT JOIN LATERAL(SELECT schedule_id FROM department_schedules WHERE department_id=d.id AND effective_from<=CURRENT_DATE AND(effective_to IS NULL OR effective_to>=CURRENT_DATE)ORDER BY effective_from DESC LIMIT 1)ds ON true LEFT JOIN schedule_templates st ON st.id=ds.schedule_id GROUP BY d.id,ds.schedule_id,st.name,st.start_time,st.end_time ORDER BY d.name`,
    );
    res.json(rows);
  } catch (e) {
    safeError(res);
  }
});
app.post("/api/departments", requireRole("admin"), async (req, res) => {
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
app.patch("/api/departments/:id", requireRole("admin"), async (req, res) => {
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
app.delete("/api/departments/:id", requireRole("admin"), async (req, res) => {
  const client = await pool.connect();
  try {
    const id = Number(req.params.id);
    await client.query("BEGIN");
    const employeeCount = await client.query(
      `SELECT count(*)::int count FROM employees WHERE department_id=$1`,
      [id],
    );
    if (employeeCount.rows[0]?.count > 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        error: "Нельзя удалить подразделение, пока в нём есть сотрудники",
      });
    }
    await client.query(`DELETE FROM department_schedules WHERE department_id=$1`, [
      id,
    ]);
    const { rows } = await client.query(
      `DELETE FROM departments WHERE id=$1 RETURNING id`,
      [id],
    );
    if (!rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Подразделение не найдено" });
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
app.use(express.static(distDir));
app.get(/^(?!\/api).*/, (_req, res) => {
  res.sendFile(path.join(distDir, "index.html"));
});
app.listen(Number(process.env.PORT || 3001), "0.0.0.0", () =>
  console.log(`WorkTime API: http://localhost:${process.env.PORT || 3001}`),
);
