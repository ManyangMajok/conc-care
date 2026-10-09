import { test } from "node:test";
import assert from "node:assert/strict";
import { openDatabase, migrate } from "./db.js";
import { openDatabase as connect, transaction } from "../server/db.js";
import { save, record, operation } from "../server/crm.js";
test("independent MySQL pools reject simultaneous stale edits and prevent duplicate conversion", async () => {
  const db = await openDatabase();
  let other;
  try {
    await migrate(db);
    const c = db.pool.pool.config.connectionConfig;
    other = await connect({
      host: c.host,
      port: c.port,
      user: c.user,
      password: c.password,
      database: c.database,
      dateStrings: true,
    });
    const contact = await save(
      db,
      "contacts",
      { name: "Concurrent customer" },
      "Test",
    );
    const lead = await save(db, "leads", { name: "Original lead" }, "Test");
    const results = await Promise.allSettled([
      save(db, "leads", { name: "First", version: lead.version }, "A", lead.id),
      save(
        other,
        "leads",
        { name: "Second", version: lead.version },
        "B",
        lead.id,
      ),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(
      results.find((r) => r.status === "rejected").reason.status,
      409,
    );
    const quote = await save(
      db,
      "quotes",
      {
        name: "Concurrent quote",
        contact_id: contact.id,
        amount_cents: 12345,
        scope: "Concrete",
      },
      "Test",
    );
    const invoices = await Promise.all([
      operation(
        db,
        "quotes",
        quote.id,
        "convert-invoice",
        { version: quote.version },
        "A",
      ),
      operation(
        other,
        "quotes",
        quote.id,
        "convert-invoice",
        { version: quote.version },
        "B",
      ),
    ]);
    assert.equal(invoices[0].id, invoices[1].id);
    assert.equal(
      (await db.prepare("SELECT COUNT(*) n FROM invoices").get()).n,
      1,
    );
    await assert.rejects(() =>
      transaction(db, async () => {
        await db
          .prepare("INSERT INTO contacts(name) VALUES (?)")
          .run("Rolled back");
        throw new Error("rollback");
      }),
    );
    assert.equal(
      (await db.prepare("SELECT COUNT(*) n FROM contacts").get()).n,
      1,
    );
    assert.equal((await record(db, "quotes", quote.id)).status, "draft");
  } finally {
    if (other) await other.close();
    await db.close();
  }
});
