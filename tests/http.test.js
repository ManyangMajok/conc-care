import { test } from "node:test";
import assert from "node:assert/strict";
import { openDatabase, migrate } from "./db.js";
import { createApp } from "../server/app.js";
import { passwordHash, createSession } from "../server/auth.js";
import { mailConfig, deliverPending } from "../server/mail.js";
test("HTTP authorization, CSRF, public intake, no mail, administrator boundary and logout", async () => {
  const db = await openDatabase(":memory:");
  await migrate(db);
  const password = "Synthetic-test-password-123";
  await db
    .prepare(
      "INSERT INTO users(name,email,password_hash,role) VALUES (?,?,?,?)",
    )
    .run(
      "Office",
      "office@example.test",
      await passwordHash(password),
      "office",
    );
  const origin = "http://localhost:3100";
  const mail = mailConfig({
    MAIL_MODE: "disabled",
  });
  const app = await createApp(db, {
    origin,
    mail,
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = "",
    csrf = "";
  async function request(path, method = "GET", body, headers = {}) {
    return fetch(base + "/api" + path, {
      method,
      headers: {
        origin,
        "Content-Type": "application/json",
        cookie,
        "x-csrf-token": csrf,
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }
  try {
    for (const path of [
      "/session",
      "/overview",
      "/records/leads",
      "/audience",
      "/activity",
      "/admin/users",
    ])
      assert.equal((await request(path)).status, 401);
    assert.equal(
      (
        await request("/records/leads", "POST", {
          name: "Unauthorized",
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await request(
          "/login",
          "POST",
          {
            email: "office@example.test",
            password,
          },
          {
            origin: "https://evil.test",
          },
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await request("/enquiries", "POST", {
          first_name: "Invalid",
        })
      ).status,
      422,
    );
    const enquiry = {
      first_name: "Test",
      last_name: "Enquiry",
      email: "customer@example.test",
      service: "driveways",
      message: "Synthetic enquiry details.",
    };
    assert.equal((await request("/enquiries", "POST", enquiry)).status, 201);
    assert.equal((await db.prepare("SELECT COUNT(*) n FROM leads").get()).n, 1);
    assert.equal(
      (await db.prepare("SELECT COUNT(*) n FROM contacts").get()).n,
      0,
    );
    assert.equal(
      (
        await db
          .prepare("SELECT COUNT(*) n FROM mail_outbox WHERE status='disabled'")
          .get()
      ).n,
      2,
    );
    await deliverPending(db, mail);
    assert.equal(
      (
        await db
          .prepare("SELECT COUNT(*) n FROM mail_outbox WHERE status='sent'")
          .get()
      ).n,
      0,
    );
    assert.equal(
      (
        await request("/enquiries", "POST", {
          ...enquiry,
          website: "spam",
        })
      ).status,
      422,
    );
    const login = await request("/login", "POST", {
      email: "office@example.test",
      password,
    });
    assert.equal(login.status, 200);
    cookie = login.headers.get("set-cookie").split(";")[0];
    csrf = (await login.json()).csrf;
    assert.match(login.headers.get("set-cookie"), /HttpOnly/);
    assert.match(login.headers.get("set-cookie"), /SameSite=Strict/);
    assert.equal((await request("/overview")).status, 200);
    assert.equal((await request("/admin/users")).status, 403);
    assert.equal((await request("/admin/users", "POST", {})).status, 403);
    assert.equal(
      (
        await request(
          "/records/contacts",
          "POST",
          {
            name: "Test",
          },
          {
            "x-csrf-token": "",
          },
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await request("/records/contacts", "POST", {
          name: "Test",
        })
      ).status,
      201,
    );
    assert.equal((await request("/logout", "POST", {})).status, 200);
    assert.equal((await request("/overview")).status, 401);
    assert.equal(
      (await db.prepare("SELECT COUNT(*) n FROM sessions").get()).n,
      0,
    );
    for (let i = 0; i < 3; i++) await request("/enquiries", "POST", enquiry);
    assert.equal((await request("/enquiries", "POST", enquiry)).status, 429);
  } finally {
    await new Promise((r) => server.close(r));
    await db.close();
  }
});
test("production session cookies are secure and SMTP configuration fails closed", async () => {
  const db = await openDatabase(":memory:");
  await migrate(db);
  const id = Number(
    (
      await db
        .prepare(
          "INSERT INTO users(name,email,password_hash,role) VALUES (?,?,?,?)",
        )
        .run(
          "Admin",
          "admin@example.test",
          await passwordHash("Synthetic-password-123"),
          "admin",
        )
    ).lastInsertRowid,
  );
  let cookie;
  await createSession(
    db,
    {
      setHeader: (key, value) => (cookie = value),
    },
    {
      id,
      name: "Admin",
      email: "admin@example.test",
      role: "admin",
    },
    true,
  );
  assert.match(cookie, /Secure/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  await db.close();
  assert.throws(() =>
    mailConfig({
      MAIL_MODE: "smtp",
    }),
  );
  assert.throws(() =>
    mailConfig({
      MAIL_MODE: "fake",
    }),
  );
});
