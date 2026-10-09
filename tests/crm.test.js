import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { openDatabase, migrate } from "./db.js";
import {
  save,
  record,
  operation,
  audience,
  list,
  today,
} from "../server/crm.js";
let db;
beforeEach(async () => {
  db = await openDatabase(":memory:");
  await migrate(db);
});
afterEach(async () => await db.close());
const actor = "Test office";
async function contact(values = {}) {
  return await save(
    db,
    "contacts",
    {
      name: "Test contact",
      email: "person@example.test",
      ...values,
    },
    actor,
  );
}
async function lead(values = {}) {
  return await save(
    db,
    "leads",
    {
      name: "Test enquiry",
      email: "person@example.test",
      details: "Customer's path \\ side gate",
      ...values,
    },
    actor,
  );
}
async function edit(type, row, values = {}) {
  const { id, created_at, updated_at, revision, ...input } = row;
  return await save(
    db,
    type,
    {
      ...input,
      ...values,
    },
    actor,
    id,
  );
}
test("migrations are repeatable and role storage excludes crew/general users", async () => {
  await migrate(db);
  assert.equal(
    (await db.prepare("SELECT COUNT(*) n FROM migrations").get()).n,
    1,
  );
  await assert.rejects(
    async () =>
      await db
        .prepare(
          "INSERT INTO users(name,email,password_hash,role) VALUES (?,?,?,?)",
        )
        .run("Bad", "bad@test", "hash", "crew"),
  );
});
test("lead defaults, validation and exact text preservation", async () => {
  const l = await lead();
  assert.equal(l.stage, "new");
  assert.equal(l.details, "Customer's path \\ side gate");
  for (const patch of [
    {
      stage: "invented",
    },
    {
      email: "bad",
    },
    {
      phone: [],
    },
    {
      followup: "2026-02-30",
    },
    {
      contact_id: 999,
    },
  ])
    await assert.rejects(async () => await edit("leads", l, patch));
  assert.equal(
    (
      await edit("leads", l, {
        followup: "2028-02-29",
      })
    ).followup,
    "2028-02-29",
  );
});
test("stale concurrent writes reject without data or activity changes", async () => {
  const l = await lead();
  const updated = await edit("leads", l, {
    stage: "contacted",
    note: "Called customer.",
  });
  const before = (await db.prepare("SELECT COUNT(*) n FROM activity").get()).n;
  await assert.rejects(
    async () =>
      await edit("leads", l, {
        stage: "won",
      }),
    (e) => e.status === 409,
  );
  assert.equal((await record(db, "leads", l.id)).stage, "contacted");
  assert.equal(updated.version, 2);
  assert.equal(
    (await db.prepare("SELECT COUNT(*) n FROM activity").get()).n,
    before,
  );
});
test("contact linking is idempotent and never overwrites existing contact", async () => {
  const c = await contact({
      name: "Trusted name",
      phone: "123",
    }),
    l = await lead({
      name: "Public name",
      phone: "456",
    });
  const linked = await operation(
    db,
    "leads",
    l.id,
    "link-contact",
    {
      version: l.version,
    },
    actor,
  );
  assert.equal(linked.contact_id, c.id);
  const again = await operation(
    db,
    "leads",
    l.id,
    "link-contact",
    {
      version: linked.version,
    },
    actor,
  );
  assert.equal(again.contact_id, c.id);
  assert.equal((await record(db, "contacts", c.id)).name, "Trusted name");
  assert.equal((await audience(db)).total, 0);
});
test("linking a new contact grants no permission", async () => {
  const l = await lead();
  const linked = await operation(
    db,
    "leads",
    l.id,
    "link-contact",
    {
      version: l.version,
    },
    actor,
  );
  assert.equal(
    (await record(db, "contacts", linked.contact_id)).permission,
    "unknown",
  );
  assert.equal((await audience(db)).total, 0);
});
test("site relationships and quote-linked lead relationships cannot diverge", async () => {
  const c = await contact(),
    other = await contact({
      email: "other@example.test",
    }),
    s = await save(
      db,
      "sites",
      {
        name: "Home",
        contact_id: c.id,
        address: "Test address",
      },
      actor,
    );
  await assert.rejects(
    async () =>
      await lead({
        contact_id: other.id,
        site_id: s.id,
      }),
  );
  const l = await lead({
    contact_id: c.id,
    site_id: s.id,
  });
  await assert.rejects(
    async () =>
      await edit("sites", s, {
        contact_id: other.id,
      }),
  );
  await save(
    db,
    "quotes",
    {
      name: "Draft",
      contact_id: c.id,
      site_id: s.id,
      lead_id: l.id,
    },
    actor,
  );
  await assert.rejects(
    async () =>
      await edit("leads", l, {
        contact_id: other.id,
        site_id: null,
      }),
  );
  await assert.rejects(
    async () =>
      await save(
        db,
        "quotes",
        {
          name: "Mismatch",
          contact_id: other.id,
          lead_id: l.id,
        },
        actor,
      ),
  );
});
test("follow-up queue includes open due leads only; completion logs and reschedules", async () => {
  const due = await lead({
      followup: today(),
    }),
    past = await lead({
      followup: "2020-01-01",
    });
  await lead({
    followup: "2099-01-01",
  });
  await lead({
    followup: "2020-01-01",
    stage: "won",
  });
  assert.equal(
    (
      await list(db, "leads", {
        due: "1",
      })
    ).total,
    2,
  );
  let result = await operation(
    db,
    "leads",
    due.id,
    "complete-followup",
    {
      version: due.version,
      next_followup: "2099-01-01",
    },
    actor,
  );
  assert.equal(result.followup, "2099-01-01");
  await operation(
    db,
    "leads",
    past.id,
    "complete-followup",
    {
      version: past.version,
    },
    actor,
  );
  assert.equal(
    (
      await list(db, "leads", {
        due: "1",
      })
    ).total,
    0,
  );
  assert.ok(
    await db
      .prepare(
        "SELECT id FROM activity WHERE message LIKE 'Completed follow-up%'",
      )
      .get(),
  );
});
test("prepare quote reuses draft; issued quote locks all commercial fields", async () => {
  const c = await contact(),
    l = await lead({
      contact_id: c.id,
    });
  let q = await operation(
    db,
    "leads",
    l.id,
    "prepare-quote",
    {
      version: l.version,
    },
    actor,
  );
  assert.equal(
    (
      await operation(
        db,
        "leads",
        l.id,
        "prepare-quote",
        {
          version: l.version,
        },
        actor,
      )
    ).id,
    q.id,
  );
  await assert.rejects(
    async () =>
      await edit("quotes", q, {
        status: "accepted",
      }),
  );
  await assert.rejects(
    async () =>
      await edit("quotes", q, {
        status: "sent",
      }),
  );
  await assert.rejects(
    async () =>
      await edit("quotes", q, {
        amount_cents: -1,
      }),
  );
  await assert.rejects(
    async () =>
      await edit("quotes", q, {
        amount_cents: 1.5,
      }),
  );
  q = await edit("quotes", q, {
    amount_cents: 450050,
    scope: "Supply and pour",
    exclusions: "Excavation",
    status: "sent",
  });
  for (const patch of [
    {
      amount_cents: 900000,
    },
    {
      scope: "New",
    },
    {
      exclusions: "New",
    },
    {
      name: "New",
    },
    {
      valid_until: "2027-01-01",
    },
  ])
    await assert.rejects(async () => await edit("quotes", q, patch));
  assert.equal((await record(db, "leads", l.id)).stage, "new");
});
test("issued snapshots survive revisions and later contact edits, with immutable audit tables", async () => {
  let c = await contact();
  let q = await save(
    db,
    "quotes",
    {
      name: "Quote",
      contact_id: c.id,
      scope: "Original scope",
      amount_cents: 12345,
      status: "sent",
    },
    actor,
  );
  q = await edit("quotes", q, {
    status: "accepted",
  });
  q = await operation(
    db,
    "quotes",
    q.id,
    "revise",
    {
      version: q.version,
    },
    actor,
  );
  assert.equal(q.revision, 2);
  assert.equal(q.status, "draft");
  q = await edit("quotes", q, {
    amount_cents: 45678,
    status: "sent",
  });
  await edit("contacts", c, {
    name: "Changed name",
  });
  const snapshots = await db
    .prepare("SELECT * FROM quote_snapshots ORDER BY revision")
    .all();
  assert.equal(snapshots.length, 2);
  assert.equal(JSON.parse(snapshots[0].snapshot).amount_cents, 12345);
  assert.equal(JSON.parse(snapshots[0].snapshot).contact.name, "Test contact");
  for (const table of ["quote_snapshots", "consent_history", "activity"]) {
    await assert.rejects(async () => await db.exec(`DELETE FROM ${table}`));
    await assert.rejects(
      async () => await db.exec(`UPDATE ${table} SET actor='Changed'`),
    );
  }
});
test("multiple quotes never automatically close a lead", async () => {
  const c = await contact(),
    l = await lead({
      contact_id: c.id,
      stage: "quoted",
    });
  let q = await save(
    db,
    "quotes",
    {
      name: "A",
      contact_id: c.id,
      lead_id: l.id,
      scope: "A",
      amount_cents: 100,
      status: "sent",
    },
    actor,
  );
  await save(
    db,
    "quotes",
    {
      name: "B",
      contact_id: c.id,
      lead_id: l.id,
      scope: "B",
      amount_cents: 200,
      status: "sent",
    },
    actor,
  );
  q = await edit("quotes", q, {
    status: "declined",
  });
  await operation(
    db,
    "quotes",
    q.id,
    "revise",
    {
      version: q.version,
    },
    actor,
  );
  assert.equal((await record(db, "leads", l.id)).stage, "quoted");
});
test("consent requires fresh evidence and explicit confirmation", async () => {
  let c = await contact();
  await assert.rejects(
    async () =>
      await edit("contacts", c, {
        permission: "subscribed",
      }),
  );
  await assert.rejects(
    async () =>
      await edit("contacts", c, {
        permission: "subscribed",
        evidence: "Test written opt-in 1",
      }),
  );
  c = await edit("contacts", c, {
    permission: "subscribed",
    evidence: "Test written opt-in 1",
    confirm_consent: true,
  });
  assert.equal((await audience(db)).total, 1);
  await assert.rejects(
    async () =>
      await edit("contacts", c, {
        email: "new@example.test",
      }),
  );
  await assert.rejects(
    async () =>
      await edit("contacts", c, {
        email: "new@example.test",
        confirm_consent: true,
      }),
  );
  c = await edit("contacts", c, {
    email: "new@example.test",
    evidence: "New-address written opt-in 2",
    confirm_consent: true,
  });
  assert.equal((await audience(db)).items[0].email, "new@example.test");
});
test("normalized duplicate suppression, fresh restoration, AND segments and deduplication", async () => {
  let c = await contact({
    email: "PERSON@example.test",
    source: "website",
    tags: ["vip"],
    permission: "subscribed",
    evidence: "Written opt-in 1",
    confirm_consent: true,
  });
  await contact({
    source: "website",
    tags: ["vip"],
    permission: "subscribed",
    evidence: "Written opt-in 2",
    confirm_consent: true,
  });
  assert.equal(
    (
      await audience(db, {
        tag: "vip",
        source: "website",
      })
    ).total,
    1,
  );
  assert.equal(
    (
      await audience(db, {
        tag: "vip",
        source: "referral",
      })
    ).total,
    0,
  );
  c = await edit("contacts", c, {
    permission: "unsubscribed",
  });
  assert.equal((await audience(db)).total, 0);
  await assert.rejects(
    async () =>
      await edit("contacts", c, {
        permission: "subscribed",
        confirm_consent: true,
      }),
  );
  c = await edit("contacts", c, {
    permission: "subscribed",
    evidence: "New confirmed written opt-in 3",
    confirm_consent: true,
  });
  assert.equal((await audience(db)).total, 1);
  assert.ok(
    (
      await db
        .prepare("SELECT COUNT(*) n FROM consent_history WHERE contact_id=?")
        .get(c.id)
    ).n >= 3,
  );
});
test("pagination and bounded lookups preserve full counts", async () => {
  for (let i = 0; i < 30; i++)
    await contact({
      name: `Contact ${i}`,
      email: `p${i}@example.test`,
    });
  assert.equal((await list(db, "contacts")).items.length, 25);
  assert.equal(
    (
      await list(db, "contacts", {
        page: 2,
      })
    ).items.length,
    5,
  );
  assert.equal((await list(db, "contacts")).total, 30);
  assert.equal(
    (
      await list(db, "contacts", {
        q: "p29@",
      })
    ).total,
    1,
  );
});
