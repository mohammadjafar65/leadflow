import pg from 'pg';
import dotenv from 'dotenv';
import crypto from 'node:crypto';
dotenv.config();

function decrypt(ciphertext) {
  const [ivB64, tagB64, encB64] = ciphertext.split(':');
  const key = crypto.createHash('sha256').update(process.env.ENCRYPTION_KEY).digest();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'), { authTagLength: 16 });
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(encB64, 'base64')), decipher.final()]).toString('utf8');
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function run() {
  const { rows } = await pool.query('select page_access_token, ig_user_id from instagram_accounts limit 1');
  const token = decrypt(rows[0].page_access_token);
  const igUserId = rows[0].ig_user_id;

  const commentId = '18443294443135969';

  console.log('Testing /me/messages:');
  const r1 = await fetch(`https://graph.facebook.com/v21.0/me/messages?access_token=${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipient: { comment_id: commentId }, message: { text: 'test' } })
  });
  console.log('/me/messages result:', await r1.json());

  console.log(`Testing /${igUserId}/messages:`);
  const r2 = await fetch(`https://graph.facebook.com/v21.0/${igUserId}/messages?access_token=${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipient: { comment_id: commentId }, message: { text: 'test' } })
  });
  console.log(`/${igUserId}/messages result:`, await r2.json());

  await pool.end();
}

run().catch(console.error);
