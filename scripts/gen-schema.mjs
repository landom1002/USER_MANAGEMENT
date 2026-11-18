// สร้าง schema.md จาก DB จริง — อ่าน sys.* อย่างเดียว ไม่แก้อะไรใน DB
// ใช้ค่าเชื่อมต่อจาก .env (DB_SERVER / DB_USER / DB_PASSWORD / DB_NAME_USERSRIGHT)
// usage: npm run dump:schema                  -> เขียนทับ db/schema.md
//        npm run dump:schema -- out.md         -> เขียนไฟล์อื่น (path จาก root โปรเจกต์)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sql from "mssql";

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outFile = path.resolve(projectDir, process.argv[2] ?? "db/schema.md");

/** โน้ตเขียนมือ (ไม่มีใน DB) — แสดงใต้บรรทัด Type ของตาราง / ช่อง Description ของคอลัมน์ */
const NOTES = {
  "dbo.Org_UnitPos": {
    table: "สร้างโดย `db/002_org_unit_pos.sql` — ตำแหน่ง node บนผังห้อง แยกตามคน",
    cols: { UserID: "dbo.Users.UserID · `0` = ผังกลาง (ไม่มี FK)" },
  },
  "dbo.Org_UnitType": {
    table: "สร้างโดย `db/001_org_unit_types.sql` — ประเภทห้อง (ตารางกำหนดค่า) · เพิ่มประเภทใหม่ได้ด้วยการ INSERT",
    cols: { level_no: "COMPANY 5 > LINE 4 > DEPT 3 > SECTION 2 > AREA 1 · NULL = TEAM (ระดับตาม rank_no ของหัวหน้าทีม)", color: "สีบน node (#rrggbb)" },
  },
};

const env = Object.fromEntries(
  fs.readFileSync(path.join(projectDir, ".env"), "utf8").split(/\r?\n/)
    .filter((l) => /^\s*[A-Z_]+\s*=/.test(l))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }),
);

const pool = await new sql.ConnectionPool({
  server: env.DB_SERVER, user: env.DB_USER, password: env.DB_PASSWORD, database: env.DB_NAME_USERSRIGHT,
  options: { encrypt: false, trustServerCertificate: true, readOnlyIntent: true },
}).connect();
const q = async (s) => (await pool.request().query(s)).recordset;

const objs = await q(`
  SELECT o.object_id, s.name AS sch, o.name, o.type, o.type_desc, OBJECT_NAME(o.parent_object_id) AS parent
  FROM sys.objects o JOIN sys.schemas s ON s.schema_id = o.schema_id
  WHERE o.is_ms_shipped = 0 AND o.type IN ('U','V','FN','IF','TF','P','TR')
  ORDER BY s.name, o.name`);
const cols = await q(`
  SELECT c.object_id, c.column_id, c.name,
         TYPE_NAME(c.user_type_id) AS tname, c.max_length, c.precision, c.scale,
         c.is_nullable, c.is_identity, dc.definition AS def,
         CAST(ep.value AS nvarchar(4000)) AS descr,
         CASE WHEN EXISTS (SELECT 1 FROM sys.index_columns ic JOIN sys.indexes i ON i.object_id = ic.object_id AND i.index_id = ic.index_id
                           WHERE i.is_primary_key = 1 AND ic.object_id = c.object_id AND ic.column_id = c.column_id) THEN 1 ELSE 0 END AS pk
  FROM sys.columns c
  JOIN sys.objects o ON o.object_id = c.object_id AND o.type IN ('U','V') AND o.is_ms_shipped = 0
  LEFT JOIN sys.default_constraints dc ON dc.object_id = c.default_object_id
  LEFT JOIN sys.extended_properties ep ON ep.major_id = c.object_id AND ep.minor_id = c.column_id AND ep.class = 1 AND ep.name = 'MS_Description'
  ORDER BY c.object_id, c.column_id`);
const rows = await q(`SELECT object_id, SUM(rows) AS n FROM sys.partitions WHERE index_id IN (0,1) GROUP BY object_id`);
const tdesc = await q(`SELECT major_id AS object_id, CAST(value AS nvarchar(4000)) AS d FROM sys.extended_properties WHERE class = 1 AND minor_id = 0 AND name = 'MS_Description'`);
const fks = await q(`
  SELECT fk.name, fk.parent_object_id AS object_id, OBJECT_NAME(fk.parent_object_id) AS child,
         SCHEMA_NAME(rt.schema_id) AS rsch, rt.name AS parent,
         STUFF((SELECT ', ' + COL_NAME(k.parent_object_id, k.parent_column_id) FROM sys.foreign_key_columns k WHERE k.constraint_object_id = fk.object_id ORDER BY k.constraint_column_id FOR XML PATH('')), 1, 2, '') AS cols,
         STUFF((SELECT ', ' + COL_NAME(k.referenced_object_id, k.referenced_column_id) FROM sys.foreign_key_columns k WHERE k.constraint_object_id = fk.object_id ORDER BY k.constraint_column_id FOR XML PATH('')), 1, 2, '') AS rcols,
         fk.delete_referential_action_desc AS del, fk.update_referential_action_desc AS upd
  FROM sys.foreign_keys fk JOIN sys.tables rt ON rt.object_id = fk.referenced_object_id
  ORDER BY fk.name`);
const idx = await q(`
  SELECT i.object_id, i.name, i.type_desc, i.is_unique, i.is_primary_key, i.is_unique_constraint, i.filter_definition AS filt,
         STUFF((SELECT ', ' + c.name + CASE WHEN ic.is_descending_key = 1 THEN ' DESC' ELSE '' END FROM sys.index_columns ic JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
                WHERE ic.object_id = i.object_id AND ic.index_id = i.index_id AND ic.is_included_column = 0 ORDER BY ic.key_ordinal FOR XML PATH('')), 1, 2, '') AS keys,
         STUFF((SELECT ', ' + c.name FROM sys.index_columns ic JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
                WHERE ic.object_id = i.object_id AND ic.index_id = i.index_id AND ic.is_included_column = 1 ORDER BY ic.index_column_id FOR XML PATH('')), 1, 2, '') AS incl
  FROM sys.indexes i JOIN sys.objects o ON o.object_id = i.object_id AND o.is_ms_shipped = 0
  WHERE i.type > 0 ORDER BY i.object_id, i.is_primary_key DESC, i.name`);
const chks = await q(`SELECT parent_object_id AS object_id, name, definition FROM sys.check_constraints ORDER BY name`);
const mods = await q(`SELECT object_id, definition FROM sys.sql_modules`);
const meta = await q(`SELECT @@SERVERNAME AS srv, DB_NAME() AS db`);
await pool.close();

const by = (arr, k = "object_id") => arr.reduce((m, r) => (m.get(r[k]) ?? m.set(r[k], []).get(r[k])).push(r) && m, new Map());
const colsBy = by(cols), fkBy = by(fks), idxBy = by(idx), chkBy = by(chks);
const rowsOf = new Map(rows.map((r) => [r.object_id, Number(r.n)]));
const descOf = new Map(tdesc.map((r) => [r.object_id, r.d]));
const modOf = new Map(mods.map((r) => [r.object_id, r.definition]));

const typeStr = (c) => {
  const t = c.tname;
  if (["varchar", "char", "varbinary", "binary"].includes(t)) return `${t}(${c.max_length === -1 ? "max" : c.max_length})`;
  if (["nvarchar", "nchar"].includes(t)) return `${t}(${c.max_length === -1 ? "max" : c.max_length / 2})`;
  if (["decimal", "numeric"].includes(t)) return `${t}(${c.precision},${c.scale})`;
  if (["datetime2", "time", "datetimeoffset"].includes(t)) return `${t}(${c.scale})`;
  return t;
};
const cell = (v) => (v == null ? "" : String(v).replace(/\|/g, "\\|").replace(/\r?\n/g, " "));
const anchor = (s) => s.toLowerCase().replace(/[^a-z0-9_]/g, "");
const ts = new Date();
const pad = (n) => String(n).padStart(2, "0");
const stamp = `${ts.getFullYear()}-${pad(ts.getMonth() + 1)}-${pad(ts.getDate())} ${pad(ts.getHours())}:${pad(ts.getMinutes())}`;

const tv = objs.filter((o) => o.type.trim() === "U" || o.type.trim() === "V");
// ลำดับ: function -> procedure -> trigger แล้วตามชื่อ
const kind = { FN: 0, IF: 0, TF: 0, P: 1, TR: 2 };
const code = objs.filter((o) => !["U", "V"].includes(o.type.trim()))
  .sort((a, b) => kind[a.type.trim()] - kind[b.type.trim()] || a.name.localeCompare(b.name));
const L = [];
L.push(`# Database Schema: ${meta[0].db}`, "", `> Generated from \`${env.DB_SERVER}\` / \`${meta[0].db}\` on ${stamp}. Engine: SQL Server.`, "");
L.push("## Contents", "");
for (const o of tv) L.push(`- [${o.sch}.${o.name}](#${anchor(o.sch + "." + o.name)}) (${o.type.trim() === "U" ? "table" : "view"})`);
L.push("", "## Relationships", "", "```mermaid", "erDiagram");
for (const f of fks) for (const c of f.cols.split(", ")) L.push(`    ${f.parent} ||--o{ ${f.child} : "${c}"`);
L.push("```", "");

for (const o of tv) {
  const isT = o.type.trim() === "U";
  const note = NOTES[`${o.sch}.${o.name}`];
  L.push(`## ${o.sch}.${o.name}`, "");
  L.push(isT ? `Type: table | Rows: ${rowsOf.get(o.object_id) ?? 0}` : "Type: view");
  for (const d of [descOf.get(o.object_id), note?.table]) if (d) L.push("", d);
  L.push("", "| # | Column | Type | Null | PK | Identity | Default | Description |", "|---|---|---|---|---|---|---|---|");
  (colsBy.get(o.object_id) ?? []).forEach((c, i) => {
    const d = [c.descr && cell(c.descr), note?.cols?.[c.name]].filter(Boolean).join(" · ");
    L.push(`| ${i + 1} | ${c.name} | ${typeStr(c)} | ${c.is_nullable ? "YES" : "NO"} | ${c.pk ? "PK" : ""} | ${c.is_identity ? "YES" : ""} | ${cell(c.def)} | ${d} |`);
  });
  L.push("");
  const f = fkBy.get(o.object_id);
  if (f) {
    L.push("**Foreign keys**", "", "| Name | Columns | References | On delete | On update |", "|---|---|---|---|---|");
    for (const r of f) L.push(`| ${r.name} | ${r.cols} | ${r.rsch}.${r.parent} (${r.rcols}) | ${r.del} | ${r.upd} |`);
    L.push("");
  }
  const ix = idxBy.get(o.object_id);
  if (ix) {
    L.push("**Indexes**", "", "| Name | Type | Unique | Keys | Included | Filter |", "|---|---|---|---|---|---|");
    for (const r of ix) {
      const t = r.is_primary_key ? "PK" : r.is_unique_constraint ? "UNIQUE constraint" : r.type_desc;
      L.push(`| ${r.name} | ${t} | ${r.is_unique ? "YES" : ""} | ${r.keys ?? ""} | ${r.incl ?? ""} | ${cell(r.filt)} |`);
    }
    L.push("");
  }
  const ck = chkBy.get(o.object_id);
  if (ck) {
    L.push("**Check constraints**", "");
    for (const r of ck) L.push(`- \`${r.name}\`: \`${r.definition}\``);
    L.push("");
  }
  if (!isT && modOf.has(o.object_id)) L.push("**Definition**", "", "```sql", modOf.get(o.object_id).trim().replace(/\r\n/g, "\n"), "```", "");
}

if (code.length) {
  L.push("## Functions, Procedures & Triggers", "");
  for (const o of code) {
    L.push(`### ${o.sch}.${o.name}`, "", `Type: ${o.type_desc}${o.type.trim() === "TR" ? ` (on ${o.parent})` : ""}`, "");
    L.push("```sql", (modOf.get(o.object_id) ?? "-- (encrypted / unavailable)").trim().replace(/\r\n/g, "\n"), "```", "");
  }
}
fs.writeFileSync(outFile, L.join("\n").replace(/\n+$/, "\n"));
console.log(`objects: ${tv.length} tables/views, ${code.length} modules -> ${outFile}`);
