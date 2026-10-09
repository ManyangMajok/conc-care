import express from "express";
import helmet from "helmet";
import { z } from "zod";
import { AppError, parse, enquirySchema, check, stages } from "./validation.js";
import {
  requireUser,
  verifyPassword,
  passwordHash,
  createSession,
  logout,
  rateLimit,
  hashToken,
} from "./auth.js";
import {
  save,
  record,
  operation,
  list,
  audience,
  log,
  today,
  pageArgs,
} from "./crm.js";
import { transaction } from "./db.js";
import { mailConfig, queueEnquiryMail } from "./mail.js";
export async function createApp(
  db,
  {
    origin = process.env.APP_ORIGIN || "http://localhost:3100",
    production = false,
    mail = mailConfig(),
  } = {},
) {
  const app = express();
  app.disable("x-powered-by");
  app.get("/health/live", (_, res) => res.json({ status: "ok" }));
  app.get("/health/ready", async (_, res) => {
    try {
      if (!(await db.prepare("SELECT id FROM crm_write_lock WHERE id=1").get()))
        throw new Error("Database not ready.");
      res.json({ status: "ready" });
    } catch {
      res.status(503).json({ status: "unavailable" });
    }
  });
  if (process.env.TRUST_PROXY === "1") app.set("trust proxy", 1);
  app.use(
    helmet({
      contentSecurityPolicy: production
        ? {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'"],
              styleSrc: ["'self'", "'unsafe-inline'"],
              imgSrc: ["'self'", "data:"],
              fontSrc: ["'self'"],
              connectSrc: ["'self'"],
              objectSrc: ["'none'"],
              frameAncestors: ["'none'"],
            },
          }
        : false,
    }),
  );
  app.use("/api", (_, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  app.use(
    express.json({
      limit: "64kb",
    }),
  );
  app.use("/api", (req, res, next) => {
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      (req.get("origin") !== origin || !req.is("application/json"))
    )
      return next(
        new AppError(403, "Request origin or content type is not allowed."),
      );
    next();
  });
  const dummy = await passwordHash("Timing-only-invalid-password");
  app.post("/api/login", async (req, res) => {
    await rateLimit(db, `login-ip:${req.ip}`, 30);
    const { email, password } = parse(
      z
        .object({
          email: z.email().transform((s) => s.toLowerCase()),
          password: z.string().min(1).max(200),
        })
        .strict(),
      req.body,
    );
    await rateLimit(db, `login-account:${email}`, 10);
    const user = await db
      .prepare("SELECT * FROM users WHERE email=? AND active=1")
      .get(email);
    const valid = await verifyPassword(password, user?.password_hash || dummy);
    if (!user || !valid)
      throw new AppError(401, "Email or password is incorrect.");
    res.json(await createSession(db, res, user, production));
  });
  app.post("/api/enquiries", async (req, res) => {
    await rateLimit(db, `enquiry:${req.ip}`, 5, 3600000);
    const input = parse(enquirySchema, req.body);
    await transaction(db, async () => {
      const id = Number(
        (
          await db
            .prepare(
              "INSERT INTO leads(name,email,phone,address,service,source,details) VALUES (?,?,?,?,?,'website',?)",
            )
            .run(
              `${input.first_name} ${input.last_name}`,
              input.email,
              input.phone,
              input.address,
              input.service,
              input.message,
            )
        ).lastInsertRowid,
      );
      const lead = await record(db, "leads", id);
      await log(
        db,
        "leads",
        id,
        "Website",
        "Website enquiry received. Marketing consent not recorded.",
      );
      await queueEnquiryMail(db, lead, mail);
    });
    res.status(201).json({
      message:
        "Your enquiry has been saved. Our office will review your project details.",
    });
  });
  app.use("/api", requireUser(db));
  app.get("/api/session", (req, res) => res.json(req.user));
  app.post("/api/logout", async (req, res) => {
    await logout(db, req, res, production);
    res.json({
      ok: true,
    });
  });
  app.get("/api/overview", async (req, res) => {
    const pipeline = await Promise.all(
      stages.map(async (stage) => ({
        stage,
        count: (
          await db
            .prepare("SELECT COUNT(*) n FROM leads WHERE stage=?")
            .get(stage)
        ).n,
        items: await db
          .prepare(
            "SELECT id,name,service,followup FROM leads WHERE stage=? ORDER BY id DESC LIMIT 15",
          )
          .all(stage),
      })),
    );
    res.json({
      pipeline,
      newLeads: pipeline[0].count,
      due: (
        await list(db, "leads", {
          due: "1",
        })
      ).total,
      awaiting: (
        await db
          .prepare("SELECT COUNT(*) n FROM quotes WHERE status='sent'")
          .get()
      ).n,
      audience: (await audience(db)).total,
      recent: (await list(db, "leads")).items.slice(0, 8),
      today: today(),
      mailMode: mail.mode,
    });
  });
  app.get("/api/audience", async (req, res) =>
    res.json(await audience(db, req.query)),
  );
  app.get("/api/activity", async (req, res) => {
    const { limit, offset } = pageArgs(req.query);
    res.json({
      items: await db
        .prepare("SELECT * FROM activity ORDER BY id DESC LIMIT ? OFFSET ?")
        .all(limit, offset),
      total: (await db.prepare("SELECT COUNT(*) n FROM activity").get()).n,
      page: offset / limit + 1,
    });
  });
  app.get("/api/records/:type", async (req, res) =>
    res.json(await list(db, req.params.type, req.query)),
  );
  app.get("/api/records/:type/:id", async (req, res) => {
    const { type, id } = req.params;
    const item = await record(db, type, id);
    const { limit, offset } = pageArgs(req.query);
    const history = await db
      .prepare(
        "SELECT * FROM activity WHERE entity=? AND entity_id=? ORDER BY id DESC LIMIT ? OFFSET ?",
      )
      .all(type, Number(id), limit, offset);
    const historyTotal = (
      await db
        .prepare(
          "SELECT COUNT(*) n FROM activity WHERE entity=? AND entity_id=?",
        )
        .get(type, Number(id))
    ).n;
    res.json({
      item,
      history,
      historyTotal,
      consent:
        type === "contacts"
          ? await db
              .prepare(
                "SELECT * FROM consent_history WHERE contact_id=? ORDER BY id DESC LIMIT ? OFFSET ?",
              )
              .all(Number(id), limit, offset)
          : [],
      snapshots:
        type === "quotes"
          ? await db
              .prepare(
                "SELECT * FROM quote_snapshots WHERE quote_id=? ORDER BY revision DESC LIMIT ? OFFSET ?",
              )
              .all(Number(id), limit, offset)
          : [],
    });
  });
  app.post("/api/records/:type", async (req, res) =>
    res
      .status(201)
      .json(await save(db, req.params.type, req.body, req.user.name)),
  );
  app.put("/api/records/:type/:id", async (req, res) =>
    res.json(
      await save(
        db,
        req.params.type,
        req.body,
        req.user.name,
        Number(req.params.id),
      ),
    ),
  );
  app.post("/api/records/:type/:id/:action", async (req, res) =>
    res.json(
      await operation(
        db,
        req.params.type,
        Number(req.params.id),
        req.params.action,
        req.body,
        req.user.name,
      ),
    ),
  );
  app.use("/api/admin", (req, res, next) =>
    req.user.role === "admin"
      ? next()
      : next(new AppError(403, "Administrator access is required.")),
  );
  app.get("/api/admin/users", async (req, res) => {
    const { limit, offset } = pageArgs(req.query);
    res.json({
      items: await db
        .prepare(
          "SELECT id,name,email,role,active FROM users ORDER BY id DESC LIMIT ? OFFSET ?",
        )
        .all(limit, offset),
      total: (await db.prepare("SELECT COUNT(*) n FROM users").get()).n,
      page: offset / limit + 1,
    });
  });
  app.post("/api/admin/users", async (req, res) => {
    const input = parse(
      z
        .object({
          name: z.string().trim().min(1).max(240),
          email: z.email().transform((s) => s.toLowerCase()),
          password: z.string().min(12).max(200),
          role: z.enum(["admin", "office"]),
        })
        .strict(),
      req.body,
    );
    check(
      !(await db
        .prepare("SELECT id FROM users WHERE email=?")
        .get(input.email)),
      "That email already has an account.",
      "email",
    );
    const hash = await passwordHash(input.password);
    await transaction(db, async () => {
      const result = await db
        .prepare(
          "INSERT INTO users(name,email,password_hash,role) VALUES (?,?,?,?)",
        )
        .run(input.name, input.email, hash, input.role);
      await log(
        db,
        "users",
        Number(result.lastInsertRowid),
        req.user.name,
        `Created ${input.role} account.`,
      );
    });
    res.status(201).json({
      ok: true,
    });
  });
  app.post("/api/admin/users/:id/access", async (req, res) => {
    const { active } = parse(
      z
        .object({
          active: z.boolean(),
        })
        .strict(),
      req.body,
    );
    const id = Number(req.params.id);
    check(id !== req.user.id, "You cannot deactivate your own account.");
    check(
      !!(await db.prepare("SELECT id FROM users WHERE id=?").get(id)),
      "User not found.",
    );
    await transaction(db, async () => {
      await db
        .prepare("UPDATE users SET active=? WHERE id=?")
        .run(active ? 1 : 0, id);
      await db.prepare("DELETE FROM sessions WHERE user_id=?").run(id);
      await log(
        db,
        "users",
        id,
        req.user.name,
        active ? "Access restored." : "Access revoked and sessions ended.",
      );
    });
    res.json({
      ok: true,
    });
  });
  app.get("/api/admin/mail", async (req, res) => {
    const { limit, offset } = pageArgs(req.query);
    res.json({
      items: await db
        .prepare(
          "SELECT id,lead_id,recipient,status,error,created_at FROM mail_outbox ORDER BY id DESC LIMIT ? OFFSET ?",
        )
        .all(limit, offset),
      total: (await db.prepare("SELECT COUNT(*) n FROM mail_outbox").get()).n,
      page: offset / limit + 1,
    });
  });
  app.use("/api", (_, res) =>
    res.status(404).json({
      message: "Endpoint not found.",
    }),
  );
  app.use((error, req, res, next) => {
    if (error.status)
      return res.status(error.status).json({
        message: error.status === 413 ? "Request is too large." : error.message,
        fields: error.fields || {},
      });
    if (
      [
        "ER_DUP_ENTRY",
        "ER_NO_REFERENCED_ROW_2",
        "ER_ROW_IS_REFERENCED_2",
        "ER_LOCK_DEADLOCK",
        "ER_LOCK_WAIT_TIMEOUT",
      ].includes(error.code)
    )
      return res.status(409).json({
        message:
          "The record conflicts with another change. Reload and try again.",
      });
    console.error("Request failed:", error.code || error.name);
    res.status(500).json({
      message: "The request could not be completed. Please retry.",
    });
  });
  return app;
}
