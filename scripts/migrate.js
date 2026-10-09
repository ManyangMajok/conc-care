import { openDatabase, migrate } from "../server/db.js";
const db = await openDatabase();
await migrate(db);
await db.close();
console.log("Migrations applied to the separate Conc Care database.");
