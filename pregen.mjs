// Pre-generates the shared parts of both books, once: the character bible (every recurring
// character, plus a stand-in hero) and all 40 scenes, each checked by the vision model.
// Writes assets/ and assets/manifest.json; the server loads them into the database on start.
//
// Usage: node pregen.mjs [story] [--pages 3,7] [--bible]   (needs OPENAI_API_KEY in .env)
// With no options it makes everything that is missing; --pages remakes those scenes.
import fs from 'node:fs';
import path from 'node:path';

process.loadEnvFile('.env');
const { STORIES, bibleCastPrompt, bibleStandInPrompt, scenePrompt, analysisPrompt } = await import('./stories.js');
const { generateFromText, generateImage, analyzeImage } = await import('./images.js');
const fsExists = (file) => fs.existsSync(path.join('assets', file));

const args = process.argv.slice(2);
const only = args.find((a) => STORIES[a]);
const pagesArg = args.includes('--pages') ? args[args.indexOf('--pages') + 1].split(',').map(Number) : null;
const ROOT = 'assets';
const manifestPath = path.join(ROOT, 'manifest.json');
const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : { stories: {} };
let spent = 0;

const read = (file) => ({ mime: 'image/jpeg', data: fs.readFileSync(path.join(ROOT, file)) });
const write = (file, image) => {
  fs.mkdirSync(path.dirname(path.join(ROOT, file)), { recursive: true });
  fs.writeFileSync(path.join(ROOT, file), image.data);
  spent += image.cost;
};
const save = () => {
  manifest.version = new Date().toISOString();
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
};

for (const story of Object.values(STORIES).filter((s) => !only || s.id === only)) {
  const m = (manifest.stories[story.id] ??= { bible: {}, scenes: {} });

  // Bible first: the scenes are drawn from these references.
  const bibleJobs = [];
  if (!m.bible.hero || args.includes('--bible')) {
    bibleJobs.push(generateFromText(bibleStandInPrompt(story)).then((img) => {
      write(`${story.id}/bible-hero.jpg`, img);
      m.bible.hero = { file: `${story.id}/bible-hero.jpg`, description: `${story.hero} (stand-in, replaced by the child in every book)` };
    }));
  }
  for (const key of Object.keys(story.cast)) {
    if (m.bible[key] && !args.includes('--bible')) continue;
    bibleJobs.push(generateFromText(bibleCastPrompt(story, key)).then((img) => {
      write(`${story.id}/bible-${key}.jpg`, img);
      m.bible[key] = { file: `${story.id}/bible-${key}.jpg`, description: story.cast[key] };
    }));
  }
  for (const r of await Promise.allSettled(bibleJobs)) if (r.status === 'rejected') console.log(story.id, 'bible failed:', r.reason.message.slice(0, 120));
  save();
  console.log(story.id, 'bible ready', Object.keys(m.bible).join(', '));
  if (!m.bible.hero || Object.keys(story.cast).some((k) => !m.bible[k])) { console.log(story.id, 'bible incomplete, run again'); continue; }

  const hero = read(m.bible.hero.file);
  const results = await Promise.allSettled(story.pages.map(async (page, i) => {
    const n = i + 1;
    if (m.scenes[n] && !pagesArg?.includes(n)) return;
    const refs = [hero, ...page.cast.map((key) => read(m.bible[key].file))];
    const img = await generateImage(scenePrompt(story, i), refs);
    const file = `${story.id}/scene-${String(n).padStart(2, '0')}.jpg`;
    write(file, img);
    const { result, cost } = await analyzeImage(analysisPrompt(story, i, 'sheet'), [img, hero]);
    spent += cost;
    m.scenes[n] = { file, analysis: result };
    save();
    console.log(story.id, n, `likeness ${result.likeness} scene ${result.scene_match}`, result.defects?.length ? result.defects : '');
  }));
  results.forEach((r, i) => r.status === 'rejected' && console.log(story.id, 'scene', i + 1, 'failed:', r.reason.message.slice(0, 120)));
}
save();
console.log(`done, about $${spent.toFixed(2)} spent`);
