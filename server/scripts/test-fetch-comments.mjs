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
  console.log('Account:', account.username, 'Token starts with:', token.slice(0, 10));

  const automations = await pool.query('select id, name, target_media_id, target_media_url from ig_automations');
  for (const auto of automations.rows) {
    console.log(`\nTesting automation "${auto.name}" with media ${auto.target_media_id} (${auto.target_media_url}):`);
    
    // Test 1: Try current getMediaComments URL
    const fields = "id,text,timestamp,from,like_count";
    const url1 = token.startsWith("IG")
      ? `https://graph.instagram.com/v21.0/${auto.target_media_id}/comments?fields=${fields}&limit=50&access_token=${token}`
      : `https://graph.facebook.com/v21.0/${auto.target_media_id}/comments?fields=${fields}&limit=50&access_token=${token}`;
    
    console.log('Calling URL:', url1.replace(token, 'TOKEN'));
    const res1 = await fetch(url1);
    const data1 = await res1.json();
    console.log('Response status:', res1.status);
    console.log('Response data keys:', Object.keys(data1));
    if (data1.error) {
      console.log('ERROR:', JSON.stringify(data1.error, null, 2));
    } else {
      console.log(`Found ${data1.data?.length || 0} comments`);
      if (data1.data && data1.data.length > 0) {
        console.log('Sample comment:', JSON.stringify(data1.data[0], null, 2));
      }
      if (data1.paging) {
        console.log('Paging:', JSON.stringify(data1.paging, null, 2));
      }
    }
  }

  await pool.end();
}

run().catch(console.error);
