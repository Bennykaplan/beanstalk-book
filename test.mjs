// Usage: node test.mjs <photo> <name> [age]
// Makes one book against the running server (BASE, default localhost): one character call,
// one call per page, then the PDF. Outputs land in test-output/<photo name>/.
import fs from 'node:fs';
import path from 'node:path';

const [photoPath, name = 'Jack', age = ''] = process.argv.slice(2);
const base = process.env.BASE || `http://localhost:${process.env.PORT || 3020}`;
const out = path.join('test-output', path.parse(photoPath).name);
const ext = path.extname(photoPath).slice(1).replace('jpg', 'jpeg');
const photo = `data:image/${ext};base64,${fs.readFileSync(photoPath).toString('base64')}`;
fs.mkdirSync(out, { recursive: true });

async function post(url, body) {
  const r = await fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error((await r.json()).error);
  return url === '/api/pdf' ? Buffer.from(await r.arrayBuffer()) : (await r.json()).image;
}
const save = (file, dataUrl) => fs.writeFileSync(path.join(out, file), Buffer.from(dataUrl.split(',')[1], 'base64'));

const character = await post('/api/character', { photo });
save('0-character.jpg', character);
const cupboard = await post('/api/page', { page: 'cupboard', character });
save('1-cupboard.jpg', cupboard);
const trade = await post('/api/page', { page: 'trade', character });
save('2-trade.jpg', trade);
const window = await post('/api/page', { page: 'window', character });
save('3-window.jpg', window);

const pdf = await post('/api/pdf', {
  images: { cupboard, trade, window },
  character,
  about: { name, age, favorites: 'Climbing trees, pancakes, and the color green', bio: `${name} loves stories about giants and wants to be an explorer.` },
});
fs.writeFileSync(path.join(out, 'JackAndTheBeanstalk.pdf'), pdf);
console.log('saved', out);
