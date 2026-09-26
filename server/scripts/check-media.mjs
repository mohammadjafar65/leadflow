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
  const { rows } = await pool.query('select page_access_token, ig_user_id, username from instagram_accounts limit 1');
  const account = rows[0];
  const token = decrypt(account.page_access_token);

  // Fetch recent media with comments_count
  const fields = 'id,caption,media_type,media_product_type,permalink,comments_count,like_count,timestamp';
  const url = `https://graph.facebook.com/v21.0/${account.ig_user_id}/media?fields=${fields}&limit=25&access_token=${token}`;
  const res = await fetch(url);
  const data = await res.json();
  console.log('--- Account Media ---');
  if (data.error) {
    console.error('Error fetching media:', data.error);
  } else {
    for (const m of data.data || []) {
      console.log({
        id: m.id,
        permalink: m.permalink,
        comments_count: m.comments_count,
        like_count: m.like_count,
        caption: (m.caption || '').slice(0, 60).replace(/\n/g, ' ')
      });
    }
  }

  await pool.end();
}

run().catch(console.error);
