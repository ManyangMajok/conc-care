// Restore only into a fresh random schema, compare rows, then remove that schema.
import { spawn } from "node:child_process";
import {
  createReadStream,
  mkdtempSync,
  writeFileSync,
  rmSync,
  rmdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { databaseConfig, openDatabase } from "../server/db.js";
const file = process.argv[2];
if (!file) throw new Error("Provide a MySQL dump to verify.");
const c = databaseConfig(),
  db = await openDatabase(c),
  name = "ccg_restore_" + randomBytes(8).toString("hex");
const temp = mkdtempSync(join(tmpdir(), "ccg-restore-")),
  options = join(temp, "client.cnf");
const quote = (s) =>
  '"' + String(s).replaceAll("\\", "\\\\").replaceAll('"', '\\"') + '"';
let created = false;
try {
  await db.exec(
    `CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_bin`,
  );
  created = true;
  writeFileSync(
    options,
    `[client]\nhost=${quote(c.host)}\nport=${c.port}\nuser=${quote(c.user)}\npassword=${quote(c.password)}\n${c.ssl ? "ssl-mode=VERIFY_IDENTITY\n" + (process.env.DB_SSL_CA ? `ssl-ca=${quote(process.env.DB_SSL_CA)}\n` : "") : ""}`,
    { mode: 0o600 },
  );
  const child = spawn(
    process.env.MYSQL_BIN || "mysql",
    [`--defaults-extra-file=${options}`, name],
    { stdio: ["pipe", "ignore", "pipe"], windowsHide: true },
  );
  child.stderr.resume();
  const input = createReadStream(file);
  input.pipe(child.stdin);
  await new Promise((yes, no) => {
    child.on("error", no);
    input.on("error", no);
    child.stdin.on("error", no);
    child.on("exit", (code) =>
      code === 0 ? yes() : no(new Error("Restore failed.")),
    );
  });
  const tables = await db.query("SHOW TABLES");
  for (const row of tables) {
    const t = Object.values(row)[0];
    const a = await db.query(`SELECT * FROM \`${t}\``),
      b = await db.query(`SELECT * FROM \`${name}\`.\`${t}\``);
    const canonical = (rows) =>
      rows
        .map((r) =>
          JSON.stringify(
            Object.keys(r)
              .sort()
              .map((k) => [k, r[k]]),
          ),
        )
        .sort();
    if (JSON.stringify(canonical(a)) !== JSON.stringify(canonical(b)))
      throw new Error(
        `Restored data differs: ${t}. Take a fresh backup while writes are stopped.`,
      );
  }
  const triggers = await db.query(
    "SELECT TRIGGER_NAME FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=?",
    [name],
  );
  if (triggers.length !== 7)
    throw new Error("Audit triggers missing from restored backup.");
  console.log(
    `Restore verified: ${tables.length} tables and ${triggers.length} audit triggers. Temporary restore schema removed.`,
  );
} finally {
  if (created) await db.exec(`DROP DATABASE \`${name}\``);
  await db.close();
  rmSync(options, { force: true });
  rmdirSync(temp);
}
