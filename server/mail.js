import nodemailer from "nodemailer";
export function mailConfig(env = process.env) {
  const mode = env.MAIL_MODE || "disabled";
  if (!["disabled", "smtp"].includes(mode))
    throw new Error("MAIL_MODE must be disabled or smtp.");
  if (
    mode === "smtp" &&
    (!env.SMTP_HOST || !env.MAIL_FROM || !env.OFFICE_EMAIL)
  )
    throw new Error("SMTP requires SMTP_HOST, MAIL_FROM and OFFICE_EMAIL.");
  return {
    mode,
    office: env.OFFICE_EMAIL || "",
    from: env.MAIL_FROM || "",
    transport:
      mode === "smtp"
        ? nodemailer.createTransport({
            host: env.SMTP_HOST,
            port: Number(env.SMTP_PORT || 587),
            secure: env.SMTP_SECURE === "true",
            requireTLS: env.SMTP_SECURE !== "true",
            auth: env.SMTP_USER
              ? {
                  user: env.SMTP_USER,
                  pass: env.SMTP_PASSWORD,
                }
              : undefined,
          })
        : null,
  };
}
export async function queueEnquiryMail(db, lead, config) {
  const status = config.mode === "smtp" ? "pending" : "disabled";
  const insert = db.prepare(
    "INSERT INTO mail_outbox(lead_id,recipient,subject,body,status) VALUES (?,?,?,?,?)",
  );
  await insert.run(
    lead.id,
    config.office,
    "New website enquiry",
    `Enquiry #${lead.id}\n${lead.name}\n${lead.email}\n${lead.phone}\n${lead.address}\n${lead.service}\n\n${lead.details}`,
    status,
  );
  await insert.run(
    lead.id,
    lead.email,
    "Your enquiry — Conc Care Group",
    `Hi ${lead.name},\n\nWe received your enquiry about ${lead.service}. Our office will review your project details.\n\nConc Care Group`,
    status,
  );
}
export async function deliverPending(db, config) {
  if (config.mode !== "smtp") return;
  for (const mail of await db
    .prepare(
      "SELECT * FROM mail_outbox WHERE status='pending' ORDER BY id LIMIT 10",
    )
    .all()) {
    const claimed = await db
      .prepare(
        "UPDATE mail_outbox SET status='sending' WHERE id=? AND status='pending'",
      )
      .run(mail.id);
    if (!claimed.changes) continue;
    try {
      await config.transport.sendMail({
        from: config.from,
        to: mail.recipient,
        subject: mail.subject,
        text: mail.body,
      });
      await db
        .prepare("UPDATE mail_outbox SET status='sent' WHERE id=?")
        .run(mail.id);
    } catch {
      await db
        .prepare(
          "UPDATE mail_outbox SET status='failed',error='SMTP delivery failed; review provider logs before manual retry.' WHERE id=?",
        )
        .run(mail.id);
    }
  }
}
