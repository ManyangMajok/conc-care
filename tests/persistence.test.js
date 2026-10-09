import { test } from "node:test";
import assert from "node:assert/strict";
import { openDatabase, migrate } from "./db.js";
import { save, record } from "../server/crm.js";
test("records survive closing and reopening a MySQL pool", async () => {
  const db = await openDatabase();
  let reopened;
  try {
    await migrate(db);
    const lead = await save(
      db,
      "leads",
      { name: "Persistent enquiry", details: "Saved to MySQL" },
      "Test",
    );
    reopened = await db.reconnect();
    assert.equal(
      (await record(reopened, "leads", lead.id)).details,
      "Saved to MySQL",
    );
  } finally {
    if (reopened) await reopened.close();
    await db.close();
  }
});
