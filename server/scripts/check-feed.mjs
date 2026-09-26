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

  const res = await fetch(`https://graph.facebook.com/v21.0/${rows[0].ig_user_id}/media?fields=id,permalink,comments_count,is_shared_to_feed,media_product_type&limit=10&access_token=${token}`);
  const data = await res.json();
  for (const m of data.data || []) {
    console.log({
      id: m.id,
      permalink: m.permalink,
      comments_count: m.comments_count,
      is_shared_to_feed: m.is_shared_to_feed,
      media_product_type: m.media_product_type
    });
  }

  await pool.end();
}

run().catch(console.error);
