import { spawn } from "node:child_process";
import {
  mkdtempSync,
  writeFileSync,
  rmSync,
  rmdirSync,
  mkdirSync,
  existsSync,
  renameSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { databaseConfig } from "../server/db.js";
const file = process.argv[2];
if (!file) throw new Error("Provide the destination .sql backup path.");
if (existsSync(file)) throw new Error("Backup destination already exists.");
const c = databaseConfig(),
  temp = mkdtempSync(join(tmpdir(), "ccg-backup-")),
  options = join(temp, "client.cnf");
const quote = (s) =>
  '"' +
  String(s)
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replaceAll("\n", "\\n") +
  '"';
try {
  mkdirSync(dirname(resolve(file)), { recursive: true });
  writeFileSync(
    options,
    `[client]\nhost=${quote(c.host)}\nport=${c.port}\nuser=${quote(c.user)}\npassword=${quote(c.password)}\n${c.ssl ? "ssl-mode=VERIFY_IDENTITY\n" + (process.env.DB_SSL_CA ? `ssl-ca=${quote(process.env.DB_SSL_CA)}\n` : "") : ""}`,
    { mode: 0o600 },
  );
  const child = spawn(
    process.env.MYSQLDUMP_BIN || "mysqldump",
    [
      `--defaults-extra-file=${options}`,
      "--single-transaction",
      "--no-tablespaces",
      "--set-gtid-purged=OFF",
      "--triggers",
      `--result-file=${resolve(file)}.partial`,
      c.database,
    ],
    { stdio: ["ignore", "ignore", "pipe"], windowsHide: true },
  );
  child.stderr.resume();
  await new Promise((yes, no) => {
    child.on("error", no);
    child.on("exit", (code) =>
      code === 0
        ? yes()
        : no(
            new Error(
              "mysqldump failed; check credentials, privileges and connection.",
            ),
          ),
    );
  });
  renameSync(`${resolve(file)}.partial`, resolve(file));
  console.log(
    `Backup saved to ${resolve(file)}. Store an encrypted copy off-host and test restoration.`,
  );
} finally {
  rmSync(options, { force: true });
  rmdirSync(temp);
}
