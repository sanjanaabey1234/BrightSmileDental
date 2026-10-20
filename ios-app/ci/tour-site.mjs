// A copy of the SELF DOC website for the iPhone app's UI tour on GitHub (see .github/workflows/ios.yml):
// the real server.js on http://localhost:3000, with an empty in-memory database and three demo blog posts.
// The tour starts a free check and signs in as staff, so it must never run against the real clinic data.
//
// Run from the repository root after: npm ci && npm install --no-save mongodb-memory-server
// Writes tour-site.ready when the site is up, then keeps running until the job ends.
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const PORT = Number(process.env.TOUR_PORT) || 3000;
const BASE = `http://localhost:${PORT}`;
const PASSWORD = process.env.ADMIN_PASSWORD || 'tour-password';
const PHOTOS = new URL('./photos/', import.meta.url);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// TOUR_MONGODB_URI is only for trying this script out against a throwaway database of your own.
let mongoUri = process.env.TOUR_MONGODB_URI;
if (!mongoUri) {
  const { MongoMemoryServer } = await import('mongodb-memory-server');
  mongoUri = (await MongoMemoryServer.create()).getUri();
  console.log('in-memory database:', mongoUri);
}
const server = spawn(process.execPath, ['server.js'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    PORT: String(PORT),
    MONGODB_URI: mongoUri,
    MONGODB_DB: 'selfdoc_tour',
    ADMIN_PASSWORD: PASSWORD,
    ADMIN_SECRET: `tour-${Date.now()}-${Math.random()}`,
    ANTHROPIC_API_KEY: '',
  },
});
server.on('exit', (code) => { console.error('website stopped, code', code); process.exit(1); });

for (let i = 0; ; i++) {
  try { if ((await fetch(`${BASE}/api/config`)).ok) break; } catch { /* not up yet */ }
  if (i > 120) throw new Error('the website did not start');
  await sleep(500);
}

// Demo blog posts, written through the staff API like the dashboard does. The newest is shown first.
const { token } = await (await fetch(`${BASE}/api/admin/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: PASSWORD }),
})).json();
const upload = async (name) => {
  const res = await fetch(`${BASE}/api/admin/images`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'image/jpeg', 'X-Image-Width': '1600', 'X-Image-Height': '1000' },
    body: fs.readFileSync(new URL(`${name}.jpg`, PHOTOS)),
  });
  if (res.status !== 201) throw new Error(`photo ${name}: ${res.status}`);
  return (await res.json()).image.id;
};
const publish = async (post, photos) => {
  const imageIds = [];
  for (const name of photos) imageIds.push(await upload(name));
  const res = await fetch(`${BASE}/api/admin/posts`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...post, status: 'published', imageIds }),
  });
  if (res.status !== 201) throw new Error(`post "${post.title}": ${res.status} ${await res.text()}`);
  console.log('published:', post.title);
  await sleep(1100); // distinct publish times
};

await publish({
  title: 'Our clinic is open Monday to Friday', category: 'Clinic news',
  summary: 'Visit us from 8:00am to 4:00pm on weekdays. Book online in about a minute.',
  body: 'Our dental clinic is open Monday to Friday, from 8:00am to 4:00pm.\n\n## How to book\n- Use the Book a visit page on our website or app\n- Choose what you need and a day that suits you\n- Our team calls or messages you to confirm\n\nIn an emergency, call 1990 straight away.',
}, ['hours-1']);
await publish({
  title: 'Five foods that are good for your teeth', category: 'Daily care',
  summary: 'What you eat matters for your smile. These everyday foods help keep teeth strong and gums healthy.',
  body: 'Healthy teeth start with what is on your plate.\n\n## Good choices\n- Cheese and yoghurt\n- Leafy greens\n- Apples and carrots\n- Nuts\n- Water instead of sweet drinks\n\nCut down on sugary snacks between meals, and brush twice a day with fluoride toothpaste.',
}, ['food-1', 'food-2']);
await publish({
  title: 'How to brush your teeth the right way', category: 'Daily care',
  summary: 'Two minutes, twice a day. A simple guide to brushing that protects your teeth and gums.',
  body: 'Brushing is the most important thing you can do for your teeth every day. Most people brush too fast or too hard, which can hurt the gums.\n\n## What you need\n- A soft toothbrush\n- Fluoride toothpaste, a pea-sized amount\n- Two minutes on a timer\n\n## How to brush\nHold the brush at a slight angle towards the gum line.\nUse small circles, not hard scrubbing.\n\nSpit out the toothpaste but do not rinse with water, so the fluoride keeps working.',
}, ['brush-1', 'brush-2', 'brush-3']);

fs.writeFileSync('tour-site.ready', BASE);
console.log('TOUR SITE READY at', BASE);
