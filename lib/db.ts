import "server-only";
import sql from "mssql";

// pool เดียวต่อ process — เก็บใน globalThis เพื่อไม่ให้ HMR ตอน dev เปิด pool ซ้ำ
const g = globalThis as unknown as { __orgPool?: Promise<sql.ConnectionPool> };

function required(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

export function getPool(): Promise<sql.ConnectionPool> {
  if (!g.__orgPool) {
    const pool = new sql.ConnectionPool({
      server: required("DB_SERVER"),
      user: required("DB_USER"),
      password: required("DB_PASSWORD"),
      database: required("DB_NAME_USERSRIGHT"),
      options: { encrypt: false, trustServerCertificate: true },
      pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
    });
    g.__orgPool = pool.connect().catch((err) => {
      g.__orgPool = undefined;
      throw err;
    });
  }
  return g.__orgPool;
}

export { sql };
