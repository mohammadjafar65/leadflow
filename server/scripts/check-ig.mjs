import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  const accounts = await pool.query('select id, username, ig_user_id, token_expires_at, page_access_token from instagram_accounts');
  console.log('--- Connected Accounts ---');
  for (const a of accounts.rows) {
    console.log({ id: a.id, username: a.username, ig_user_id: a.ig_user_id, hasToken: !!a.page_access_token });
  }

  const automations = await pool.query('select id, name, trigger_type, keywords, target_media_id, target_media_url, target_media_caption, is_active from ig_automations');
  console.log('--- Automations ---');
  console.log(automations.rows);

  const events = await pool.query('select id, status, comment_text, error_message, action_taken, created_at from ig_automation_events order by created_at desc limit 10');
  console.log('--- Recent Events ---');
  console.log(events.rows);

  await pool.end();
}

run().catch(console.error);
