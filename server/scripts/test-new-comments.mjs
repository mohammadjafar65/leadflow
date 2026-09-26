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

async function getMediaCommentsTest(token, mediaId) {
  const cleanToken = token.trim();
  const fields = 'id,text,timestamp,from,like_count,replies{id,text,timestamp,from,like_count}';
  let nextUrl = cleanToken.startsWith('IG')
    ? `https://graph.instagram.com/v21.0/${mediaId}/comments?fields=${fields}&limit=50&access_token=${cleanToken}`
    : `https://graph.facebook.com/v21.0/${mediaId}/comments?fields=${fields}&limit=50&access_token=${cleanToken}`;

  const allComments = [];
  const seenIds = new Set();
  let pages = 0;

  while (nextUrl && allComments.length < 500 && pages < 10) {
    pages++;
    const res = await fetch(nextUrl);
    const data = await res.json();
    if (data.error) {
      console.warn('getMediaCommentsTest error:', data.error);
      break;
    }
    const items = data.data || [];
    for (const c of items) {
      if (c.id && !seenIds.has(c.id)) {
        seenIds.add(c.id);
        allComments.push({
          id: c.id,
          text: c.text,
          timestamp: c.timestamp,
          from: c.from,
          likeCount: c.like_count,
          isReply: false,
        });
      }
      if (c.replies?.data && Array.isArray(c.replies.data)) {
        for (const r of c.replies.data) {
          if (r.id && !seenIds.has(r.id)) {
            seenIds.add(r.id);
            allComments.push({
              id: r.id,
              text: r.text,
              timestamp: r.timestamp,
              from: r.from,
              likeCount: r.like_count,
              parentId: c.id,
              isReply: true,
            });
          }
        }
      }
    }
    nextUrl = data.paging?.next ?? null;
  }
  return { allComments, pages };
}

async function run() {
  const { rows } = await pool.query('select page_access_token from instagram_accounts limit 1');
  const token = decrypt(rows[0].page_access_token);

  console.log('Testing 17959076523197585 (UI reel):');
  const res1 = await getMediaCommentsTest(token, '17959076523197585');
  console.log(`Loaded ${res1.allComments.length} comments across ${res1.pages} page(s)!`);
  console.log('Sample comments (first 5):', res1.allComments.slice(0, 5));

  console.log('\nTesting 17872496091584804 (COCO reel):');
  const res2 = await getMediaCommentsTest(token, '17872496091584804');
  console.log(`Loaded ${res2.allComments.length} comments across ${res2.pages} page(s)!`);

  await pool.end();
}

run().catch(console.error);
