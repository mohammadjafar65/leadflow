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

  // Let's test media 17959076523197585 (comments_count: 82)
  const mediaId = '17959076523197585';
  console.log('--- Checking all comments for 17959076523197585 ---');
  const res = await fetch(`https://graph.facebook.com/v21.0/${mediaId}/comments?fields=id,text,from,timestamp,like_count,replies{id,text,from,timestamp}&limit=100&access_token=${token}`);
  const data = await res.json();
  console.log(`Top level comments count: ${data.data?.length}`);
  let totalWithReplies = data.data?.length || 0;
  for (const c of data.data || []) {
    const repliesCount = c.replies?.data?.length || 0;
    totalWithReplies += repliesCount;
    console.log(`Comment: "${c.text}" by @${c.from?.username} | Replies: ${repliesCount}`);
    if (repliesCount > 0) {
      for (const r of c.replies.data) {
        console.log(`   -> Reply: "${r.text}" by @${r.from?.username}`);
      }
    }
  }
  console.log(`Total count (top-level + replies): ${totalWithReplies}`);

  // Now let's test 18097671632267044 (DddgnMNIr-P)
  const m2 = '18097671632267044';
  console.log('\n--- Checking 18097671632267044 with different filters ---');
  // Try with order=chronological, or reverse_chronological
  const res2 = await fetch(`https://graph.facebook.com/v21.0/${m2}/comments?fields=id,text,from,timestamp,like_count,replies{id,text,from,timestamp}&filter=stream&limit=100&access_token=${token}`);
  console.log('filter=stream:', await res2.json());
  
  const res3 = await fetch(`https://graph.facebook.com/v21.0/${m2}/comments?fields=id,text,from,timestamp,like_count,replies{id,text,from,timestamp}&order=reverse_chronological&limit=100&access_token=${token}`);
  console.log('order=reverse_chronological:', await res3.json());

  // Also let's check media 17872496091584804 (COCO, comments_count: 10)
  const m3 = '17872496091584804';
  console.log('\n--- Checking 17872496091584804 (COCO) ---');
  const res4 = await fetch(`https://graph.facebook.com/v21.0/${m3}/comments?fields=id,text,from,timestamp,like_count,replies{id,text,from,timestamp}&limit=100&access_token=${token}`);
  const d4 = await res4.json();
  console.log(`Top level comments: ${d4.data?.length}`);
  for (const c of d4.data || []) {
    console.log(`Comment: "${c.text}" by @${c.from?.username} | Replies: ${c.replies?.data?.length || 0}`);
  }

  await pool.end();
}

run().catch(console.error);
