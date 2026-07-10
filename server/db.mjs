import pg from "pg";
import "dotenv/config";
if (!process.env.DATABASE_URL)
  throw new Error(
    "Не задан DATABASE_URL. Скопируйте .env.example в .env и укажите пароль PostgreSQL.",
  );
export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
