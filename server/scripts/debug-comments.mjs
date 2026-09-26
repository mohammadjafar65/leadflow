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

  const mediaId = '18097671632267044'; // DddgnMNIr-P (comments_count: 5)
  console.log(`Checking media ${mediaId} details:`);
  
  // 1. Check media node itself
  const mediaRes = await fetch(`https://graph.facebook.com/v21.0/${mediaId}?fields=id,caption,comments_count,like_count,is_comment_enabled,shortcode,permalink&access_token=${token}`);
  console.log('Media details:', await mediaRes.json());

  // 2. Query comments without fields
  const cRes1 = await fetch(`https://graph.facebook.com/v21.0/${mediaId}/comments?access_token=${token}`);
  console.log('Comments default query:', await cRes1.json());

  // 3. Query comments with fields
  const cRes2 = await fetch(`https://graph.facebook.com/v21.0/${mediaId}/comments?fields=id,text,timestamp,from,like_count,replies{id,text,from,timestamp}&access_token=${token}`);
  console.log('Comments with fields & replies:', await cRes2.json());

  // 4. Also check 17959076523197585 (comments_count: 82, only 9 returned)
  const mediaId2 = '17959076523197585';
  console.log(`\nChecking media ${mediaId2} (comments_count: 82):`);
  const cRes3 = await fetch(`https://graph.facebook.com/v21.0/${mediaId2}/comments?fields=id,text,timestamp,from,like_count,replies{id,text,from,timestamp}&limit=100&access_token=${token}`);
  const data3 = await cRes3.json();
  console.log('Media 2 comments count on page 1:', data3.data?.length);
  console.log('Media 2 paging:', data3.paging);
  if (data3.paging?.next) {
    const nextRes = await fetch(data3.paging.next);
    const nextData = await nextRes.json();
    console.log('Media 2 page 2 comments count:', nextData.data?.length);
    console.log('Media 2 page 2 paging:', nextData.paging);
  }

  await pool.end();
}

run().catch(console.error);
