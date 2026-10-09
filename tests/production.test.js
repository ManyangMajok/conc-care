import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { openDatabase, migrate } from "./db.js";
test("production serves built assets with security headers and a restricted MySQL account", async () => {
  const db = await openDatabase();
  let child, user;
  try {
    await migrate(db);
    const c = db.pool.pool.config.connectionConfig;
    user = "ccg_prod_" + randomBytes(6).toString("hex");
    const password = randomBytes(24).toString("hex");
    await db.query("CREATE USER ?@'%' IDENTIFIED BY ?", [
      user,
      password,
    ]);
    await db.query(
      `GRANT SELECT,INSERT,UPDATE,DELETE ON \`${c.database}\`.* TO ?@'%'`,
      [user],
    );
    child = spawn(process.execPath, ["server/index.js", "--production"], {
      env: {
        ...process.env,
        NODE_ENV: "production",
        DB_HOST: c.host,
        DB_PORT: String(c.port),
        DB_NAME: c.database,
        DB_USER: user,
        DB_PASSWORD: password,
        APP_ORIGIN: "https://production.example.test",
        HOST: "127.0.0.1",
        PORT: "3102",
        MAIL_MODE: "disabled",
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let output = "";
    child.stdout.on("data", (d) => (output += d));
    child.stderr.on("data", (d) => (output += d));
    const base = "http://127.0.0.1:3102";
    let ready = false;
    for (let i = 0; i < 80; i++) {
      try {
        ready = (await fetch(base + "/health/ready")).ok;
      } catch {}
      if (ready) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.ok(ready, output);
    const home = await fetch(base + "/");
    const html = await home.text();
    assert.equal(home.status, 200);
    assert.match(
      home.headers.get("content-security-policy"),
      /frame-ancestors 'none'/,
    );
    assert.match(home.headers.get("strict-transport-security"), /max-age/);
    assert.equal(home.headers.get("x-powered-by"), null);
    const asset = html.match(/src="([^"]+\.js)"/)[1];
    assert.equal((await fetch(base + asset)).status, 200);
    assert.equal((await fetch(base + "/api/records/invoices")).status, 401);
    assert.equal(
      (
        await fetch(base + "/api/enquiries", {
          method: "POST",
          headers: {
            origin: "https://evil.test",
            "content-type": "application/json",
          },
          body: "{}",
        })
      ).status,
      403,
    );
    for (const path of ["/.env", "/data/private-backup.sql", "/server/db.js"]) {
      const r = await fetch(base + path);
      assert.match(r.headers.get("content-type"), /text\/html/);
      assert.equal((await r.text()).includes(password), false);
    }
  } finally {
    if (child && child.exitCode === null) {
      const exit = new Promise((r) => child.once("exit", r));
      child.kill();
      await exit;
    }
    if (user) await db.query("DROP USER IF EXISTS ?@'%'", [user]);
    await db.close();
  }
});
