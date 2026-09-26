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

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function run() {
  const { rows } = await pool.query('select page_access_token from instagram_accounts limit 1');
  const token = decrypt(rows[0].page_access_token);
  const versions = ['v22.0', 'v21.0', 'v20.0', 'v19.0', 'v18.0'];
  for (const v of versions) {
    const res = await fetch(`https://graph.facebook.com/${v}/18097671632267044/comments?access_token=${token}`);
    console.log(v, await res.json());
  }
  await pool.end();
}

run().catch(console.error);
