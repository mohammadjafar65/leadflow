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
  const m = '18097671632267044';

  const testUrls = [
    `https://graph.facebook.com/v21.0/${m}/comments?access_token=${token}&include_hidden=true`,
    `https://graph.facebook.com/v21.0/${m}/comments?access_token=${token}&filter=toplevel`,
    `https://graph.facebook.com/v21.0/${m}/comments?access_token=${token}&summary=true`,
    `https://graph.facebook.com/v21.0/${m}?fields=comments.include_hidden(true){id,text,from,timestamp}&access_token=${token}`,
    `https://graph.facebook.com/v21.0/${m}?fields=comments.filter(stream){id,text,from,timestamp}&access_token=${token}`,
    `https://graph.facebook.com/v21.0/${m}?fields=comments{id,text,from,timestamp,replies{id,text,from}}&access_token=${token}`,
  ];

  for (const u of testUrls) {
    console.log('\nTesting URL:', u.replace(token, 'TOKEN'));
    const r = await fetch(u);
    const json = await r.json();
    console.log('Result:', JSON.stringify(json, null, 2));
  }

  await pool.end();
}

run().catch(console.error);
