import { test } from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "./db.js";
import { hostingerSetup } from "../server/hostinger-setup.js";
import { verifyPassword } from "../server/auth.js";
test("Hostinger first-run setup is opt-in and preserves accounts across deployments", async () => {
  const db = await openDatabase();
  try {
    await hostingerSetup(db, {});
    await assert.rejects(() => db.query("SELECT * FROM users"));
    const env = {
      SETUP_DATABASE: "true",
      INITIAL_ADMIN_EMAIL: "owner@example.test",
      INITIAL_ADMIN_NAME: "Owner",
      INITIAL_ADMIN_PASSWORD: "New-production-test-password-123",
    };
    await hostingerSetup(db, env);
    const original = await db.prepare("SELECT * FROM users").get();
    assert.equal(original.role, "admin");
    assert.equal(original.email, env.INITIAL_ADMIN_EMAIL);
    assert.ok(
      await verifyPassword(env.INITIAL_ADMIN_PASSWORD, original.password_hash),
    );
    await hostingerSetup(db, { SETUP_DATABASE: "true" });
    await hostingerSetup(db, {
      ...env,
      INITIAL_ADMIN_EMAIL: "someoneelse@example.test",
    });
    assert.deepEqual(await db.prepare("SELECT * FROM users").get(), original);
    assert.equal((await db.prepare("SELECT COUNT(*) n FROM users").get()).n, 1);
  } finally {
    await db.close();
  }
});
