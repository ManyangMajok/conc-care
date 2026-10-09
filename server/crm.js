import { transaction } from "./db.js";
import { schemas, parse, check, AppError } from "./validation.js";
const tables = Object.keys(schemas);
export function table(type) {
  if (!tables.includes(type)) throw new AppError(404, "Record type not found.");
  return type;
}
export async function record(db, type, id) {
  const row = await db
    .prepare(`SELECT * FROM ${table(type)} WHERE id=?`)
    .get(Number(id));
  if (!row) throw new AppError(404, "Record not found.");
  if (type === "contacts")
    row.tags = (
      await db
        .prepare(
          "SELECT t.name FROM tags t JOIN contact_tags ct ON ct.tag_id=t.id WHERE ct.contact_id=? ORDER BY t.name",
        )
        .all(row.id)
    ).map((r) => r.name);
  return row;
}
export async function log(db, type, id, actor, message) {
  await db
    .prepare(
      "INSERT INTO activity(entity,entity_id,actor,message) VALUES (?,?,?,?)",
    )
    .run(type, id, actor, message);
}
export function versionMatch(old, version) {
  if (old && old.version !== version)
    throw new AppError(
      409,
      "Someone updated this record. Reload it before saving your changes.",
    );
}
async function related(db, type, id, field) {
  if (id) {
    check(
      !!(await db.prepare(`SELECT id FROM ${type} WHERE id=?`).get(id)),
      "Choose an existing related record.",
      field,
    );
    return await record(db, type, id);
  }
  return null;
}
export async function save(db, type, input, actor, id = null) {
  return await transaction(
    db,
    async () => await saveInside(db, type, input, actor, id),
  );
}
async function saveInside(db, type, input, actor, id = null) {
  table(type);
  const old = id ? await record(db, type, id) : null;
  versionMatch(old, input.version);
  const data = parse(schemas[type], input);
  const { note, version, confirm_consent, tags, ...values } = data;
  const contact = await related(
    db,
    "contacts",
    values.contact_id,
    "contact_id",
  );
  const site = await related(db, "sites", values.site_id, "site_id");
  const lead = await related(db, "leads", values.lead_id, "lead_id");
  if (site)
    check(
      site.contact_id === values.contact_id,
      "This site belongs to a different contact.",
      "site_id",
    );
  if (lead) {
    check(
      lead.contact_id === values.contact_id,
      "Choose a lead belonging to this contact.",
      "lead_id",
    );
    if (values.site_id && lead.site_id)
      check(
        values.site_id === lead.site_id,
        "Choose the site linked to the lead.",
        "site_id",
      );
  }
  if (type === "sites" && old && old.contact_id !== values.contact_id) {
    check(
      !(await db
        .prepare(
          "SELECT id FROM leads WHERE site_id=? UNION ALL SELECT id FROM quotes WHERE site_id=? UNION ALL SELECT id FROM invoices WHERE site_id=? LIMIT 1",
        )
        .get(id, id, id)),
      "This site is referenced. Create another site instead.",
      "contact_id",
    );
  }
  if (
    type === "leads" &&
    old &&
    (old.contact_id !== values.contact_id || old.site_id !== values.site_id)
  ) {
    const conflict = await db
      .prepare(
        "SELECT id FROM quotes WHERE lead_id=? AND (NOT (contact_id <=> ?) OR (site_id IS NOT NULL AND NOT (site_id <=> ?))) LIMIT 1",
      )
      .get(id, values.contact_id, values.site_id);
    check(
      !conflict,
      "A linked quote uses this contact or site. Preserve the relationship or create a separate lead.",
      "contact_id",
    );
  }
  if (type === "contacts") {
    const suppressed =
      values.email &&
      (
        await db
          .prepare("SELECT active FROM suppressions WHERE email=?")
          .get(values.email)
      )?.active;
    const fresh =
      values.permission === "subscribed" &&
      (old?.permission !== "subscribed" ||
        old?.email !== values.email ||
        suppressed);
    if (values.permission === "subscribed") {
      check(!!values.email, "Email is required for permission.", "email");
      check(
        !!values.evidence,
        "Record where and when permission was given.",
        "evidence",
      );
      if (fresh || confirm_consent) {
        check(
          confirm_consent === true,
          "Explicitly confirm fresh consent for this email.",
          "confirm_consent",
        );
        const reused = await db
          .prepare(
            "SELECT id FROM consent_history WHERE contact_id=? AND evidence=? AND permission=? LIMIT 1",
          )
          .get(id || 0, values.evidence, "subscribed");
        check(
          !reused,
          "Enter fresh evidence, including the date and source of the new consent.",
          "evidence",
        );
      }
    }
    if (values.permission === "unsubscribed")
      check(!!values.email, "Enter the address to suppress.", "email");
    if (
      old?.permission === "subscribed" &&
      values.email !== old.email &&
      values.permission === "subscribed"
    )
      check(
        fresh && confirm_consent,
        "Permission cannot silently transfer to a new email.",
        "email",
      );
  }
  if (type === "quotes") {
    const before = old?.status || "draft";
    check(
      {
        draft: ["draft", "sent"],
        sent: ["sent", "accepted", "declined"],
        accepted: ["accepted"],
        declined: ["declined"],
      }[before].includes(values.status),
      "Use draft → sent → accepted/declined. Create a revision to change issued content.",
      "status",
    );
    if (old && before !== "draft")
      for (const field of [
        "name",
        "contact_id",
        "site_id",
        "lead_id",
        "amount_cents",
        "scope",
        "exclusions",
        "valid_until",
      ])
        check(
          old[field] === values[field],
          "Issued commercial content is locked. Create a revision first.",
          field,
        );
    if (values.status !== "draft") {
      check(
        values.amount_cents !== null,
        "Enter the AUD total.",
        "amount_cents",
      );
      check(!!values.scope, "Enter a scope before issuing.", "scope");
    }
  }
  if (type === "invoices") {
    const before = old?.status || "draft";
    check(
      {
        draft: ["draft", "issued", "void"],
        issued: ["issued", "paid", "void"],
        paid: ["paid"],
        void: ["void"],
      }[before].includes(values.status),
      "Use draft → issued → paid/void.",
      "status",
    );
    if (old && before !== "draft")
      for (const field of [
        "name",
        "contact_id",
        "site_id",
        "amount_cents",
        "scope",
        "exclusions",
        "due_date",
      ])
        check(
          old[field] === values[field],
          "Issued or void invoice details are locked.",
          field,
        );
    if (["issued", "paid"].includes(values.status)) {
      check(
        values.amount_cents !== null,
        "Enter the AUD total.",
        "amount_cents",
      );
      check(!!values.scope, "Enter the work description.", "scope");
      check(!!values.due_date, "Enter a due date.", "due_date");
    }
  }
  const keys = Object.keys(values);
  if (old)
    await db
      .prepare(
        `UPDATE ${type} SET ${keys.map((k) => `${k}=?`).join(",")},version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
      )
      .run(...Object.values(values), id);
  else
    id = Number(
      (
        await db
          .prepare(
            `INSERT INTO ${type} (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`,
          )
          .run(...Object.values(values))
      ).lastInsertRowid,
    );
  if (type === "contacts") {
    await db.prepare("DELETE FROM contact_tags WHERE contact_id=?").run(id);
    for (const tag of new Set(tags)) {
      await db
        .prepare(
          "INSERT INTO tags(name) VALUES (?) ON DUPLICATE KEY UPDATE name=VALUES(name)",
        )
        .run(tag);
      await db
        .prepare(
          "INSERT INTO contact_tags VALUES (?,(SELECT id FROM tags WHERE name=?))",
        )
        .run(id, tag);
    }
    const changed =
      !old ||
      old.permission !== values.permission ||
      old.email !== values.email ||
      old.evidence !== values.evidence ||
      confirm_consent;
    if (changed)
      await db
        .prepare(
          "INSERT INTO consent_history(contact_id,email,permission,evidence,actor) VALUES (?,?,?,?,?)",
        )
        .run(id, values.email, values.permission, values.evidence, actor);
    if (
      values.permission === "unsubscribed" ||
      (values.permission === "subscribed" && confirm_consent)
    )
      await db
        .prepare(
          "INSERT INTO suppressions(email,active) VALUES (?,?) ON DUPLICATE KEY UPDATE active=VALUES(active),updated_at=CURRENT_TIMESTAMP",
        )
        .run(values.email, values.permission === "unsubscribed" ? 1 : 0);
  }
  if (
    type === "quotes" &&
    values.status === "sent" &&
    (!old || old.status === "draft")
  ) {
    const snapshot = {
      ...(await record(db, type, id)),
      contact,
      site,
      issued_at: new Date().toISOString(),
    };
    await db
      .prepare(
        "INSERT INTO quote_snapshots(quote_id,revision,snapshot,actor) VALUES (?,?,?,?)",
      )
      .run(id, snapshot.revision, JSON.stringify(snapshot), actor);
  }
  if (
    type === "invoices" &&
    values.status === "issued" &&
    (!old || old.status === "draft")
  ) {
    const snapshot = {
      ...(await record(db, type, id)),
      contact,
      site,
      issued_at: new Date().toISOString(),
    };
    await db
      .prepare("UPDATE invoices SET issued_snapshot=? WHERE id=?")
      .run(JSON.stringify(snapshot), id);
  }
  const changes = old ? keys.filter((k) => old[k] !== values[k]) : [];
  if (
    old &&
    type === "contacts" &&
    JSON.stringify(old.tags) !== JSON.stringify(tags)
  )
    changes.push("tags");
  await log(
    db,
    type,
    id,
    actor,
    old
      ? `Updated: ${changes.join(", ") || "record reviewed"}.`
      : `${type.slice(0, -1)} created.`,
  );
  if (type === "quotes" && old?.status !== values.status)
    await log(
      db,
      type,
      id,
      actor,
      `Staff recorded status: ${values.status}. No quote email sent; this is not proof of customer acceptance.`,
    );
  if (note) await log(db, type, id, actor, note);
  return await record(db, type, id);
}
export async function operation(db, type, id, action, input, actor) {
  return await transaction(db, async () => {
    const old = await record(db, type, id);
    versionMatch(old, input.version);
    if (type === "leads" && action === "link-contact") {
      if (old.contact_id) return old;
      let contact = old.email
        ? await db
            .prepare(
              "SELECT id FROM contacts WHERE email=? ORDER BY id LIMIT 1",
            )
            .get(old.email)
        : null;
      if (!contact)
        contact = await saveInside(
          db,
          "contacts",
          {
            name: old.name,
            email: old.email,
            phone: old.phone,
            source: old.source,
          },
          actor,
        );
      await db
        .prepare(
          "UPDATE leads SET contact_id=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?",
        )
        .run(contact.id, id);
      await log(
        db,
        type,
        id,
        actor,
        "Contact linked without overwriting trusted information or granting consent.",
      );
    } else if (type === "leads" && action === "prepare-quote") {
      check(!!old.contact_id, "Link a contact before preparing a quote.");
      const existing = await db
        .prepare(
          "SELECT id FROM quotes WHERE lead_id=? AND status='draft' ORDER BY id DESC LIMIT 1",
        )
        .get(id);
      if (existing) return await record(db, "quotes", existing.id);
      const quote = await saveInside(
        db,
        "quotes",
        {
          name: `Quote for ${old.name}`,
          contact_id: old.contact_id,
          site_id: old.site_id,
          lead_id: old.id,
          scope: old.details,
        },
        actor,
      );
      await log(
        db,
        type,
        id,
        actor,
        `Prepared quote #${quote.id}. Lead stage unchanged.`,
      );
      return quote;
    } else if (type === "leads" && action === "complete-followup") {
      check(!!old.followup, "No follow-up is scheduled.");
      const next = parse(schemas.leads, {
        name: old.name,
        followup: input.next_followup || "",
      }).followup;
      await db
        .prepare(
          "UPDATE leads SET followup=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?",
        )
        .run(next, id);
      await log(
        db,
        type,
        id,
        actor,
        `Completed follow-up due ${old.followup}.${next ? ` Next: ${next}.` : ""}`,
      );
    } else if (type === "quotes" && action === "convert-invoice") {
      const existing = await db
        .prepare("SELECT id FROM invoices WHERE quote_id=?")
        .get(id);
      if (existing) return await record(db, "invoices", existing.id);
      check(old.status !== "declined", "A declined quote cannot be converted.");
      check(
        old.amount_cents !== null && !!old.scope,
        "Save a total and scope on the quote before converting.",
      );
      const invoice = await saveInside(
        db,
        "invoices",
        {
          name: `Invoice for ${old.name}`,
          contact_id: old.contact_id,
          site_id: old.site_id,
          amount_cents: old.amount_cents,
          scope: old.scope,
          exclusions: old.exclusions,
        },
        actor,
      );
      const source = {
        ...old,
        contact: await record(db, "contacts", old.contact_id),
        site: old.site_id ? await record(db, "sites", old.site_id) : null,
      };
      await db
        .prepare(
          "UPDATE invoices SET quote_id=?,quote_revision=?,source_snapshot=? WHERE id=?",
        )
        .run(id, old.revision, JSON.stringify(source), invoice.id);
      await log(
        db,
        type,
        id,
        actor,
        `Converted saved revision ${old.revision} to invoice INV-${invoice.id}. Quote status unchanged.`,
      );
      await log(
        db,
        "invoices",
        invoice.id,
        actor,
        `Created from quote #${id}, revision ${old.revision}.`,
      );
      return await record(db, "invoices", invoice.id);
    } else if (type === "quotes" && action === "revise") {
      check(
        old.status !== "draft",
        "Finish the current draft before creating another revision.",
      );
      await db
        .prepare(
          "UPDATE quotes SET status='draft',revision=revision+1,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?",
        )
        .run(id);
      await log(
        db,
        type,
        id,
        actor,
        `Created draft revision ${old.revision + 1}. Issued snapshots retained; lead stage unchanged.`,
      );
    } else throw new AppError(404, "Unknown action.");
    return await record(db, type, id);
  });
}
export function today(
  timezone = process.env.BUSINESS_TIMEZONE || "Australia/Perth",
) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
export function pageArgs(query) {
  return {
    limit: 25,
    offset: (Math.max(1, Math.min(100000, parseInt(query.page) || 1)) - 1) * 25,
  };
}
export async function list(db, type, query = {}) {
  table(type);
  const where = [],
    params = [];
  const { limit, offset } = pageArgs(query);
  if (query.q) {
    where.push(
      "(name LIKE ?" +
        (["contacts", "leads"].includes(type) ? " OR email LIKE ?" : "") +
        ")",
    );
    params.push(`%${String(query.q).slice(0, 200)}%`);
    if (["contacts", "leads"].includes(type)) params.push(params[0]);
  }
  if (type === "leads" && query.stage) {
    where.push("stage=?");
    params.push(query.stage);
  }
  if (["quotes", "invoices"].includes(type) && query.status) {
    where.push("status=?");
    params.push(query.status);
  }
  if (
    query.contact_id &&
    ["leads", "sites", "quotes", "invoices"].includes(type)
  ) {
    where.push("contact_id=?");
    params.push(Number(query.contact_id));
  }
  if (type === "leads" && query.due === "1") {
    where.push("followup<>'' AND followup<=? AND stage NOT IN ('won','lost')");
    params.push(today());
  }
  const clause = where.length ? " WHERE " + where.join(" AND ") : "";
  return {
    items: await db
      .prepare(
        `SELECT * FROM ${type}${clause} ORDER BY id DESC LIMIT ? OFFSET ?`,
      )
      .all(...params, limit, offset),
    total: (
      await db.prepare(`SELECT COUNT(*) n FROM ${type}${clause}`).get(...params)
    ).n,
    page: offset / limit + 1,
  };
}
export async function audience(db, query = {}) {
  const params = [],
    where = [
      "c.permission='subscribed'",
      "c.email<>''",
      "c.evidence<>''",
      "NOT EXISTS (SELECT 1 FROM suppressions s WHERE s.email=c.email AND s.active=1)",
    ];
  if (query.tag) {
    where.push(
      "EXISTS (SELECT 1 FROM contact_tags ct JOIN tags t ON t.id=ct.tag_id WHERE ct.contact_id=c.id AND t.name=?)",
    );
    params.push(String(query.tag));
  }
  if (query.source) {
    where.push("c.source=?");
    params.push(String(query.source));
  }
  const sql = `SELECT MIN(c.id) id,c.email FROM contacts c WHERE ${where.join(" AND ")} GROUP BY c.email`;
  const { limit, offset } = pageArgs(query);
  return {
    items: await db
      .prepare(
        `SELECT c.id,c.name,c.email,c.source FROM contacts c JOIN (${sql}) a ON a.id=c.id ORDER BY c.id DESC LIMIT ? OFFSET ?`,
      )
      .all(...params, limit, offset),
    total: (
      await db
        .prepare(`SELECT COUNT(*) n FROM (${sql}) AS eligible`)
        .get(...params)
    ).n,
    page: offset / limit + 1,
  };
}
