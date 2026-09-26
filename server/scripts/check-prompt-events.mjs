import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  const res = await pool.query(`select * from ig_automation_events where automation_id = '534ae5af-91be-40ed-ac76-e7f7eddcd35e' or media_id = '18097671632267044'`);
  console.log('Events for Prompt automation:', res.rows);
  
  // Also check all distinct media_id in ig_automation_events
  const mediaEvents = await pool.query(`select distinct media_id, count(*) from ig_automation_events group by media_id`);
  console.log('Events by media_id:', mediaEvents.rows);

  await pool.end();
}

run().catch(console.error);
