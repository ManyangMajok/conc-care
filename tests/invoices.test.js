import { test } from "node:test";
import assert from "node:assert/strict";
import { openDatabase, migrate } from "./db.js";
import { save, record, operation, list } from "../server/crm.js";
import { schemas } from "../server/validation.js";
test("invoice conversion is persistent, idempotent, version checked and independent of quote revisions", async () => {
  const db = await openDatabase(":memory:");
  try {
    await migrate(db);
    const contact = await save(
      db,
      "contacts",
      {
        name: "Invoice customer",
      },
      "Office",
    );
    let q = await save(
      db,
      "quotes",
      {
        name: "Driveway",
        contact_id: contact.id,
        scope: "Concrete",
        amount_cents: 123456,
        status: "sent",
      },
      "Office",
    );
    const inv = await operation(
      db,
      "quotes",
      q.id,
      "convert-invoice",
      {
        version: q.version,
      },
      "Office",
    );
    assert.equal(inv.amount_cents, 123456);
    assert.equal(inv.quote_revision, 1);
    assert.equal(inv.status, "draft");
    assert.equal(
      (
        await operation(
          db,
          "quotes",
          q.id,
          "convert-invoice",
          {
            version: q.version,
          },
          "Office",
        )
      ).id,
      inv.id,
    );
    await assert.rejects(
      async () =>
        await operation(
          db,
          "quotes",
          q.id,
          "convert-invoice",
          {
            version: 99,
          },
          "Office",
        ),
      (e) => e.status === 409,
    );
    q = await operation(
      db,
      "quotes",
      q.id,
      "revise",
      {
        version: q.version,
      },
      "Office",
    );
    assert.equal((await record(db, "invoices", inv.id)).amount_cents, 123456);
    assert.equal(
      (
        await operation(
          db,
          "quotes",
          q.id,
          "convert-invoice",
          {
            version: q.version,
          },
          "Office",
        )
      ).id,
      inv.id,
    );
    assert.equal(
      (
        await list(db, "invoices", {
          contact_id: contact.id,
          status: "draft",
        })
      ).total,
      1,
    );
    assert.equal(JSON.parse(inv.source_snapshot).scope, "Concrete");
  } finally {
    await db.close();
  }
});
test("manual invoices validate totals and dates, preserve issued details and reject stale updates", async () => {
  const db = await openDatabase(":memory:");
  try {
    await migrate(db);
    const c = await save(
      db,
      "contacts",
      {
        name: "Original customer",
      },
      "Office",
    );
    const base = {
      name: "Manual work",
      contact_id: c.id,
      amount_cents: 10001,
      scope: "Repair",
      due_date: "2026-11-01",
    };
    const edit = async (row, changes) =>
      await save(
        db,
        "invoices",
        {
          ...Object.fromEntries(
            Object.keys(schemas.invoices.shape)
              .filter((k) => k in row)
              .map((k) => [k, row[k]]),
          ),
          ...changes,
        },
        "Office",
        row.id,
      );
    for (const changes of [
      {
        amount_cents: 1.5,
      },
      {
        due_date: "2026-02-30",
      },
      {
        status: "paid",
      },
      {
        status: "issued",
        scope: "",
      },
    ])
      await assert.rejects(
        async () =>
          await save(
            db,
            "invoices",
            {
              ...base,
              ...changes,
            },
            "Office",
          ),
      );
    let inv = await save(db, "invoices", base, "Office");
    const issued = await edit(inv, {
      status: "issued",
    });
    await assert.rejects(
      async () =>
        await edit(inv, {
          scope: "Stale",
        }),
      (e) => e.status === 409,
    );
    await assert.rejects(
      async () =>
        await edit(issued, {
          amount_cents: 1,
        }),
      (e) => e.status === 422,
    );
    const paid = await edit(issued, {
      status: "paid",
    });
    assert.equal(paid.status, "paid");
    assert.equal(paid.issued_snapshot, issued.issued_snapshot);
    assert.equal(
      JSON.parse(paid.issued_snapshot).contact.name,
      "Original customer",
    );
    await assert.rejects(
      async () =>
        await edit(paid, {
          status: "draft",
        }),
    );
    await assert.rejects(
      async () =>
        await db
          .prepare("UPDATE invoices SET issued_snapshot=? WHERE id=?")
          .run("{}", paid.id),
    );
  } finally {
    await db.close();
  }
});
