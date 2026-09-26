import fs from 'fs';

const html = fs.readFileSync('C:/Users/mansu/.gemini/antigravity/brain/0dd97113-69e1-46cb-9444-32b74368077c/.system_generated/steps/155/content.md', 'utf8');

// Search for any JSON blobs or comment text
const matches = html.match(/"text":"([^"]+)"/g);
console.log('Matches with "text":', matches);

const userMatches = html.match(/"username":"([^"]+)"/g);
console.log('Matches with "username":', userMatches?.slice(0, 20));

const commentMatches = html.match(/class="[^"]*comment[^"]*"/gi);
console.log('Comment classes:', commentMatches?.length);
