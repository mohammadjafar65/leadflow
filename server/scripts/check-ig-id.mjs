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
  const { rows } = await pool.query('select page_access_token from instagram_accounts limit 1');
  const token = decrypt(rows[0].page_access_token);

  const m2 = '18097671632267044';
  const res = await fetch(`https://graph.facebook.com/v21.0/${m2}?fields=id,ig_id,caption,media_type,media_product_type,owner,permalink,shortcode,comments_count,like_count,is_shared_to_feed&access_token=${token}`);
  console.log('Media details with ig_id:', await res.json());

  // Also check if we can query by ig_id if different
  const m2Details = await (await fetch(`https://graph.facebook.com/v21.0/${m2}?fields=id,ig_id&access_token=${token}`)).json();
  if (m2Details.ig_id && m2Details.ig_id !== m2) {
    console.log(`Checking comments with ig_id ${m2Details.ig_id}:`);
    const cRes = await fetch(`https://graph.facebook.com/v21.0/${m2Details.ig_id}/comments?access_token=${token}`);
    console.log('Result:', await cRes.json());
  }

  // Also try graph.instagram.com
  const igRes = await fetch(`https://graph.instagram.com/v21.0/${m2}/comments?access_token=${token}`);
  console.log('graph.instagram.com result:', await igRes.json());

  await pool.end();
}

run().catch(console.error);
