import { migrate, transaction } from "./db.js";
import { passwordHash } from "./auth.js";
import { z } from "zod";

export async function hostingerSetup(db, env = process.env) {
  if (env.SETUP_DATABASE !== "true") return;
  // Explicit first-deployment mode; hPanel already owns database/user creation.
  await migrate(db);
  const count = (await db.prepare("SELECT COUNT(*) n FROM users").get()).n;
  if (count) {
    console.log(
      "Schema ready; existing accounts preserved. Disable SETUP_DATABASE in hPanel.",
    );
    return;
  }
  const email = z.email().parse(env.INITIAL_ADMIN_EMAIL).toLowerCase();
  const name = z
    .string()
    .trim()
    .min(1)
    .max(240)
    .parse(env.INITIAL_ADMIN_NAME || "Administrator");
  const hash = await passwordHash(env.INITIAL_ADMIN_PASSWORD);
  await transaction(db, async () => {
    if ((await db.prepare("SELECT COUNT(*) n FROM users").get()).n) return;
    await db
      .prepare(
        "INSERT INTO users(name,email,password_hash,role) VALUES (?,?,?,?)",
      )
      .run(name, email, hash, "admin");
  });
  console.log(
    "Initial administrator ready. Remove INITIAL_ADMIN_* and disable SETUP_DATABASE in hPanel.",
  );
}
