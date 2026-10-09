import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import express from "express";
import { openDatabase } from "./db.js";
import { hostingerSetup } from "./hostinger-setup.js";
import { createApp } from "./app.js";
import { sessionUser } from "./auth.js";
import { mailConfig, deliverPending } from "./mail.js";
const production =
  process.argv.includes("--production") ||
  process.env.NODE_ENV === "production";
const origin = process.env.APP_ORIGIN || "http://localhost:3100";
const parsedOrigin = new URL(origin);
if (
  parsedOrigin.origin !== origin ||
  (production && parsedOrigin.protocol !== "https:")
)
  throw new Error(
    "APP_ORIGIN must be an exact origin; production requires HTTPS.",
  );
const db = await openDatabase();
await hostingerSetup(db);
try {
  if (!(await db.prepare("SELECT id FROM crm_write_lock WHERE id=1").get()))
    throw new Error("Missing transaction lock row.");
} catch {
  throw new Error("Run npm run db:migrate before starting the application.");
}
const mail = mailConfig();
const app = await createApp(db, {
  origin,
  production,
  mail,
});
app.use("/office", async (req, res, next) => {
  res.set("Cache-Control", "no-store");
  if (!(await sessionUser(db, req))) return res.redirect("/login");
  next();
});
app.get("/portfolio", (_, res) => res.redirect(301, "/projects/"));
if (production) {
  app.use(
    express.static(resolve("dist"), {
      index: false,
    }),
  );
  app.get("/{*path}", (_, res) => res.sendFile(resolve("dist/index.html")));
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: {
      middlewareMode: true,
      hmr: {
        port: Number(process.env.PORT || 3100) + 100,
      },
    },
    appType: "custom",
  });
  app.use(vite.middlewares);
  app.get("/{*path}", async (req, res, next) => {
    try {
      res
        .type("html")
        .send(
          await vite.transformIndexHtml(
            req.originalUrl,
            await readFile("index.html", "utf8"),
          ),
        );
    } catch (error) {
      vite.ssrFixStacktrace(error);
      next(error);
    }
  });
}
const server = app.listen(
  Number(process.env.PORT || 3100),
  process.env.HOST || "127.0.0.1",
  () =>
    console.log(
      `Conc Care running at ${origin} (${production ? "production" : "development"}; mail ${mail.mode})`,
    ),
);
let delivering = false;
const timer = setInterval(async () => {
  if (delivering) return;
  delivering = true;
  try {
    await deliverPending(db, mail);
  } catch (error) {
    console.error("Mail worker failed:", error.code || error.name);
  } finally {
    delivering = false;
  }
}, 15000);
timer.unref();
let shuttingDown = false;
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    if (shuttingDown) return;
    shuttingDown = true;
    clearInterval(timer);
    const deadline = setTimeout(() => process.exit(1), 30000);
    deadline.unref();
    server.close(async () => {
      while (delivering) await new Promise((r) => setTimeout(r, 100));
      await db.close();
      process.exit(0);
    });
  });
