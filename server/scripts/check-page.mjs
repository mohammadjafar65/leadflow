import pg from 'pg';
import dotenv from 'dotenv';
import crypto from 'node:crypto';
dotenv.config();

function decrypt(ciphertext) {
  const [ivB64, tagB64, encB64] = ciphertext.split(':');
  const key = crypto.createHash('sha256').update(process.env.ENCRYPTION_KEY).digest();
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const encrypted = Buffer.from(encB64, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  const { rows } = await pool.query('select page_access_token, ig_user_id from instagram_accounts limit 1');
  const token = decrypt(rows[0].page_access_token);
  const igUserId = rows[0].ig_user_id;

  // Let's check webhooks / subscribed apps on page
  const pageSub = await fetch(`https://graph.facebook.com/v21.0/111680918400742/subscribed_apps?access_token=${token}`);
  console.log('Subscribed apps:', await pageSub.json());

  // Check if 18097671632267044 can be fetched from page feed or video
  const pageVideos = await fetch(`https://graph.facebook.com/v21.0/111680918400742/videos?limit=10&access_token=${token}`);
  console.log('Page videos:', await pageVideos.json());

  // Check if there is an IG container or child comments
  const m = '18097671632267044';
  const children = await fetch(`https://graph.facebook.com/v21.0/${m}/children?access_token=${token}`);
  console.log('Children:', await children.json());

  await pool.end();
}

run().catch(console.error);
