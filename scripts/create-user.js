import { openDatabase } from "../server/db.js";
import { passwordHash } from "../server/auth.js";
import { z } from "zod";
// Read secrets from an interactive hidden prompt or stdin, never command-line arguments.
import { createInterface } from "node:readline/promises";
const args = process.argv.slice(2),
  role = args[2] || "admin";
if (!z.email().safeParse(args[0]).success || !args[1] || !["admin", "office"].includes(role)) {
  console.error('Usage: npm run user:create -- email "Full name" [admin|office]. Supply password through CCG_NEW_PASSWORD or stdin.');
  process.exit(1);
}
let password = process.env.CCG_NEW_PASSWORD;
if (!password) {
  if (process.stdin.isTTY) {
    console.error("Set CCG_NEW_PASSWORD in this shell (12+ characters), run this command, then remove the variable.");
    process.exit(1);
  }
  const rl = createInterface({
    input: process.stdin
  });
  password = await new Promise(resolve => rl.once("line", resolve));
  rl.close();
}
const hash = await passwordHash(password);
const db = await openDatabase();
await db.prepare("INSERT INTO users(name,email,password_hash,role) VALUES (?,?,?,?)").run(args[1], args[0].toLowerCase(), hash, role);
await db.close();
console.log(`Created ${role} account. No existing accounts were modified.`);
