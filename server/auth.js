import {
  randomBytes,
  createHash,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { parse as parseCookie, serialize } from "cookie";
import { AppError, check } from "./validation.js";
const scrypt = promisify(scryptCallback);
export const hashToken = (token) =>
  createHash("sha256").update(token).digest("hex");
export async function passwordHash(password) {
  check(
    typeof password === "string" &&
      password.length >= 12 &&
      password.length <= 200,
    "Use a password of 12–200 characters.",
    "password",
  );
  const salt = randomBytes(16).toString("hex");
  const derived = await scrypt(password, salt, 64);
  return `${salt}:${derived.toString("hex")}`;
}
export async function verifyPassword(password, stored) {
  if (typeof password !== "string" || password.length > 200) return false;
  const [salt, hex] = stored.split(":");
  const result = await scrypt(password, salt, 64);
  return timingSafeEqual(result, Buffer.from(hex, "hex"));
}
export async function sessionUser(db, req) {
  const token = parseCookie(req.headers.cookie || "").ccg_session;
  if (!token) return null;
  return await db
    .prepare(
      "SELECT u.id,u.name,u.email,u.role,s.csrf FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.active=1",
    )
    .get(hashToken(token), Date.now());
}
export function requireUser(db) {
  return async (req, res, next) => {
    req.user = await sessionUser(db, req);
    if (!req.user || !["admin", "office"].includes(req.user.role))
      return next(new AppError(401, "Please sign in to the office workspace."));
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.get("x-csrf-token") !== req.user.csrf
    )
      return next(
        new AppError(403, "Session verification failed. Reload and try again."),
      );
    next();
  };
}
export async function createSession(db, res, user, production) {
  const token = randomBytes(32).toString("hex"),
    csrf = randomBytes(32).toString("hex");
  await db.prepare("DELETE FROM sessions WHERE expires_at<=?").run(Date.now());
  await db
    .prepare("INSERT INTO sessions VALUES (?,?,?,?)")
    .run(hashToken(token), user.id, csrf, Date.now() + 8 * 3600000);
  res.setHeader(
    "Set-Cookie",
    serialize("ccg_session", token, {
      httpOnly: true,
      secure: production,
      sameSite: "strict",
      path: "/",
      maxAge: 8 * 3600,
    }),
  );
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    csrf,
  };
}
export async function logout(db, req, res, production) {
  const token = parseCookie(req.headers.cookie || "").ccg_session;
  if (token)
    await db
      .prepare("DELETE FROM sessions WHERE token_hash=?")
      .run(hashToken(token));
  res.setHeader(
    "Set-Cookie",
    serialize("ccg_session", "", {
      httpOnly: true,
      secure: production,
      sameSite: "strict",
      path: "/",
      maxAge: 0,
    }),
  );
}
export async function rateLimit(db, key, max, window = 900000) {
  const now = Date.now();
  await db.prepare("DELETE FROM rate_limits WHERE expires_at<=?").run(now);
  await db
    .prepare(
      "INSERT INTO rate_limits(`key`,hits,expires_at) VALUES (?,1,?) ON DUPLICATE KEY UPDATE hits=IF(expires_at<=?,1,hits+1),expires_at=IF(expires_at<=?,VALUES(expires_at),expires_at)",
    )
    .run(hashToken(key), now + window, now, now);
  if (
    (
      await db
        .prepare("SELECT hits FROM rate_limits WHERE `key`=?")
        .get(hashToken(key))
    ).hits > max
  )
    throw new AppError(429, "Too many attempts. Please try again later.");
}
