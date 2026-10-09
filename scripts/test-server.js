import { loadEnvFile } from "node:process";
import { openDatabase, migrate } from "../tests/db.js";
import { passwordHash } from "../server/auth.js";
try {
  loadEnvFile(".env.test");
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
const db = await openDatabase();
await migrate(db);
await db
  .prepare("INSERT INTO users(name,email,password_hash,role) VALUES (?,?,?,?)")
  .run(
    "Synthetic office",
    "office@example.test",
    await passwordHash("Browser-test-password-123"),
    "office",
  );
Object.assign(process.env, {
  DB_NAME: db.pool.pool.config.connectionConfig.database,
  DB_USER: process.env.TEST_DB_USER,
  DB_PASSWORD: process.env.TEST_DB_PASSWORD,
  PORT: "3101",
  APP_ORIGIN: "http://localhost:3101",
  MAIL_MODE: "disabled",
  HOST: "127.0.0.1",
});
// The isolated test schema is cleaned when the test server receives shutdown.
process.on("SIGTERM", () => db.close().catch(() => {}));
process.on("SIGINT", () => db.close().catch(() => {}));
await import("../server/index.js");
