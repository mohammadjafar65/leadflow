import { pool } from "../dist/src/db/pool.js";
import bcrypt from "bcryptjs";

async function run() {
  const hash = await bcrypt.hash("Password123!", 10);
  const org = await pool.query("INSERT INTO organizations (name) VALUES ($1) RETURNING id", ["MZI Studio"]);
  const user = await pool.query(
    "INSERT INTO users (organization_id, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, email, role",
    [org.rows[0].id, "admin@mzistudio.com", hash, "owner"]
  );
  console.log("ADMIN_USER_CREATED_SUCCESSFULLY:", user.rows[0]);
  await pool.end();
}
run().catch(console.error);
