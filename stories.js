// The book: one 20-page template shared by both stories, the two storyboards, the character
// bible descriptions, and every prompt the image and vision models see.
// The image model never draws text: the PDF layer does, placed where the art is clear.

// The one style string for every image in every book. Never vary it per page or per story.
export const STYLE = 'Modern 3D animated feature — rounded forms, large expressive eyes, soft rim light.';

const NO_TEXT = 'Do not draw any text, letters, numbers, words, signs, labels, speech bubbles or captions anywhere in the image.';

// The 20-page template. Each slot fixes the camera and keeps one band of the picture quiet,
// so both stories have the same rhythm and the same place for words. The layout engine
// (layout.js) still checks the finished art and moves the text if something important lands there.
export const TEMPLATE = [
  { shot: 'wide establishing shot', hero: 'small but clearly visible, face toward the viewer', quiet: 'top' },
  { shot: 'medium shot indoors', hero: 'knees-up, face toward the viewer', quiet: 'bottom' },
  { shot: 'medium two-shot', hero: 'waist-up in three-quarter view', quiet: 'top' },
  { shot: 'close-up', hero: 'head and shoulders, filling the right half of the frame', quiet: 'bottom' },
  { shot: 'wide shot of a path or landscape', hero: 'full body in the lower middle of the frame', quiet: 'top' },
  { shot: 'medium shot', hero: 'knees-up, face toward the viewer', quiet: 'bottom' },
  { shot: 'medium close-up', hero: 'waist-up, face toward the viewer', quiet: 'top' },
  { shot: 'wide shot', hero: 'full body, face visible', quiet: 'bottom' },
  { shot: 'low-angle shot looking up', hero: 'full body, face lit and visible', quiet: 'top' },
  { shot: 'wide shot of a new place', hero: 'full body in the lower third, face visible', quiet: 'top' },
  { shot: 'medium shot', hero: 'knees-up, face toward the viewer', quiet: 'bottom' },
  { shot: 'medium shot with tension', hero: 'partly hidden but face clearly visible', quiet: 'top' },
  { shot: 'medium shot', hero: 'knees-up, face toward the viewer', quiet: 'bottom' },
  { shot: 'close-up', hero: 'head and shoulders, face toward the viewer', quiet: 'top' },
  { shot: 'dynamic medium shot', hero: 'full body in motion, face visible', quiet: 'bottom' },
  { shot: 'wide action shot', hero: 'full body in motion, face visible', quiet: 'top' },
  { shot: 'medium shot', hero: 'knees-up, determined, face toward the viewer', quiet: 'bottom' },
  { shot: 'wide shot', hero: 'full body, face visible', quiet: 'top' },
  { shot: 'medium two-shot', hero: 'waist-up, smiling, face toward the viewer', quiet: 'bottom' },
  { shot: 'wide closing shot at golden hour', hero: 'full body, face toward the viewer', quiet: 'top' },
];

export const STORIES = {
  jack: {
    id: 'jack',
    title: 'Jack and the Beanstalk',
    hero: 'Jack',
    cover: 6, // The page whose picture goes on the front cover (0-based).
    outfit: 'a patched oatmeal-colored linen tunic with a lace-up collar, a rope belt, brown trousers and worn brown leather boots',
    cast: {
      mother: "Jack's mum: a friendly adult village woman with brown hair in a loose bun, a faded blue dress and a long patched cream apron.",
      cow: 'Milky-White: a gentle, thin, all-white dairy cow with a pink nose, a small brass bell on a leather collar and a frayed rope halter.',
      oldMan: 'The old man: a small, hunched, kindly but mysterious old man with a long white beard, a wide-brimmed patched green hat and a long brown traveling cloak.',
      giant: 'The giant: an enormous, clumsy, grumpy giant (comic, not frightening) with a bushy red beard, a big round nose, a brown leather vest and huge boots.',
      giantWife: "The giant's wife: a very tall, round, kind-faced giantess with grey hair in a bun, a green dress and a flour-dusted apron.",
      hen: 'The magic hen: a plump, glossy brown hen with a red comb who lays shining golden eggs.',
    },
    pages: [
      { text: 'Jack and his mother lived in a little cottage, and they were very poor.', cast: ['mother', 'cow'], scene: 'A small, run-down thatched cottage beside a bare garden on a grey morning. Jack stands at the gate with his mother; Milky-White grazes on thin grass nearby.' },
      { text: '"We have nothing left to sell but Milky-White," said his mother.', cast: ['mother', 'cow'], scene: 'A bare cottage kitchen: an open cupboard with empty shelves and an empty bowl on the table. Jack listens to his mother; through the open door Milky-White stands outside in the yard.' },
      { text: 'On the road to market, an old man stopped Jack. "Five magic beans for your cow," he said.', cast: ['oldMan', 'cow'], scene: "A dirt road between green fields. The old man holds out his open palm with exactly five shining colored beans. Jack holds Milky-White's rope." },
      { text: 'The beans shimmered in Jack\'s hand. Jack said yes.', cast: [], scene: 'Jack holds exactly five shining beans (red, blue, yellow, purple and green) in his open palm, delighted, on the sunny road.' },
      { text: '"Beans?" cried his mother, and out the window they went.', cast: ['mother'], scene: "The cottage at dusk. Jack's mother leans out of the window flinging exactly five colored beans into the garden; Jack stands below in the garden watching them fly." },
      { text: 'Jack went to bed hungry, and the moon rose over the garden.', cast: [], scene: 'A tiny attic bedroom at night, moonlight through a round window. Jack sits in his small bed hugging his knees, sad but hopeful.' },
      { text: 'In the morning, a giant beanstalk had grown right up into the clouds.', cast: [], scene: 'Dawn in the garden. An enormous twisting green beanstalk rises from the soil up into pink clouds. Jack stands at its base in his nightshirt-free day clothes, mouth open in wonder.' },
      { text: 'Up and up Jack climbed, past the birds and into the clouds.', cast: [], scene: 'Jack climbs the giant beanstalk high above the countryside, small birds flying past, fields far below.' },
      { text: 'At the very top stood a castle as big as a mountain.', cast: [], scene: 'Jack stands on a path made of clouds in front of a gigantic stone castle with huge doors, turned three-quarters toward the viewer so his amazed face is clearly visible as he glances up at it.' },
      { text: 'A giant woman opened the door. "Quick, hide! My husband is coming, and he is grumpy!"', cast: ['giantWife'], scene: "In the castle's enormous doorway the kind giantess bends down toward tiny Jack, finger to her lips." },
      { text: 'Thump! Thump! "Fee-fi-fo-fum!" roared the giant.', cast: ['giant'], scene: "A huge castle kitchen. Jack peeks out from behind a giant copper pot while the comic giant stomps in, sniffing the air." },
      { text: 'The giant counted his gold until he fell fast asleep.', cast: ['giant'], scene: 'The giant snores in a huge chair beside a table piled with gold coins. Jack tiptoes along the edge of the table, wide-eyed.' },
      { text: 'On the table sat a hen. "Lay," said the giant, and she laid an egg of gold.', cast: ['hen'], scene: 'On the giant table, the magic hen sits beside a shining golden egg. Jack crouches beside them, amazed.' },
      { text: 'Jack tucked the hen under his arm and crept away.', cast: ['hen'], scene: 'Close on Jack hugging the hen under one arm, finger to his lips, tiptoeing past a giant boot.' },
      { text: 'The hen squawked, and the giant woke up!', cast: ['giant', 'hen'], scene: 'Jack runs across the giant floor holding the squawking hen; behind him the giant jolts awake in his chair.' },
      { text: 'Down the beanstalk Jack raced, with the giant thundering behind.', cast: ['giant', 'hen'], scene: 'Jack slides and scrambles down the beanstalk holding the hen; far above, the giant climbs down after him.' },
      { text: '"Mother, the axe!" Jack chopped and chopped.', cast: ['mother'], scene: 'At the bottom of the beanstalk in the garden, Jack swings a small axe at the thick stalk while his mother runs toward him.' },
      { text: 'Down came the beanstalk, and the giant was never seen again.', cast: ['mother'], scene: 'Jack and his mother stand in the garden in the foreground, facing the viewer with relieved faces clearly visible, as behind them the cut beanstalk topples into the distance with a huge crash and a puff of leaves.' },
      { text: 'Every morning the hen laid a golden egg, and nobody went hungry again.', cast: ['mother', 'hen'], scene: 'The cottage kitchen, now warm and full of food. The hen sits on the table with a golden egg; Jack and his mother smile.' },
      { text: 'And Jack and his mother lived happily ever after.', cast: ['mother', 'cow', 'hen'], scene: 'The cottage, now cheerful and tidy, at sunset. Jack and his mother wave from the garden; a new white cow and the hen are nearby.' },
    ],
  },
  red: {
    id: 'red',
    title: 'Little Red Riding Hood',
    hero: 'Little Red Riding Hood',
    cover: 4,
    outfit: 'a bright red hooded cape over a cream blouse and a brown skirt or trousers, and little brown boots',
    cast: {
      mother: "Red's mum: a friendly adult village woman with a warm smile, auburn hair tied back, a green dress and a white apron.",
      grandma: 'Grandma: a small, cheerful old woman with white hair in a bun, round spectacles, a lilac nightgown and a frilly white nightcap.',
      wolf: 'The wolf: a lanky grey wolf with a sly grin and yellow eyes, cartoonish and mischievous rather than frightening.',
      woodcutter: 'The woodcutter: a tall, friendly woodcutter with a short brown beard, a red-and-black checked shirt and an axe on his shoulder.',
    },
    pages: [
      { text: 'Little Red Riding Hood lived at the edge of a big green forest.', cast: ['mother'], scene: 'A cozy cottage with a flower garden at the edge of a tall green forest. Red stands by the gate, her red cape bright.' },
      { text: '"Take this basket to Grandma, and don\'t stray from the path," said her mother.', cast: ['mother'], scene: 'A sunny kitchen. Her mother hands Red a wicker basket covered with a checked cloth.' },
      { text: 'Off she went, waving goodbye.', cast: ['mother'], scene: 'Red walks onto a winding forest path, waving back at her mother at the cottage door.' },
      { text: 'In the basket were fresh bread and a honey cake, still warm.', cast: [], scene: 'Close on Red lifting the cloth of her basket to peek at the bread and honey cake, smiling.' },
      { text: 'The path was long, and the trees were very tall.', cast: [], scene: 'A sun-dappled forest path between giant trees. Red walks along it, small among the trunks.' },
      { text: 'A wolf stepped out from behind a tree. "Where are you going, little one?"', cast: ['wolf'], scene: 'The sly wolf leans out from behind a tree trunk, smiling at Red on the path.' },
      { text: '"To Grandma\'s house," said Little Red Riding Hood.', cast: ['wolf'], scene: 'Red answers the wolf politely, pointing down the path; the wolf listens with a sneaky grin.' },
      { text: '"Pick her some flowers," said the wolf, and off he ran.', cast: ['wolf'], scene: 'A meadow of wildflowers beside the path. Red picks flowers while, behind her, the wolf dashes away into the trees.' },
      { text: 'Meanwhile, the wolf raced ahead to Grandma\'s cottage.', cast: ['wolf'], scene: "Grandma's little cottage in a clearing. The wolf sneaks up to the door; far away on the hill, Red is still picking flowers." },
      { text: 'Grandma hid in the wardrobe, and the wolf put on her nightcap.', cast: ['wolf', 'grandma'], scene: "Grandma's bedroom. The wolf climbs into bed wearing Grandma's nightcap; Grandma peeks out from a wardrobe. Through the window, Red is coming up the path." },
      { text: 'Knock, knock! "Come in, dear," said a strange, deep voice.', cast: [], scene: "Red stands at Grandma's front door with her basket and flowers, knocking, a little puzzled." },
      { text: '"Grandma, what big ears you have!"', cast: ['wolf'], scene: "Grandma's bedroom. Red stands by the bed looking at the wolf in a nightcap, whose big ears poke out." },
      { text: '"Grandma, what big eyes you have!"', cast: ['wolf'], scene: 'Red leans closer to the bed, suspicious; the wolf in the nightcap stares back with huge yellow eyes.' },
      { text: '"Grandma, what big teeth you have!" "All the better to eat you with!"', cast: ['wolf'], scene: 'Close on Red gasping as the wolf in the nightcap grins with big, cartoonish teeth.' },
      { text: 'Little Red Riding Hood ran out the door, shouting for help!', cast: ['wolf'], scene: "Red runs out of Grandma's cottage, cape flying; the wolf stumbles after her, tangled in a nightgown." },
      { text: 'A woodcutter heard her and came running through the trees.', cast: ['woodcutter'], scene: 'The woodcutter runs through the forest toward Red, axe on his shoulder; Red points back toward the cottage.' },
      { text: 'The woodcutter chased the wolf deep into the forest, and he never came back.', cast: ['woodcutter', 'wolf'], scene: 'At the cottage door, Red watches the woodcutter shoo the wolf away; the wolf flees into the dark trees.' },
      { text: 'Grandma climbed out of the wardrobe, safe and sound.', cast: ['grandma'], scene: "Grandma's bedroom. Grandma steps out of the wardrobe and Red hugs her." },
      { text: 'They shared the bread and honey cake and laughed together.', cast: ['grandma', 'woodcutter'], scene: "Grandma's cozy table. Red, Grandma and the woodcutter share bread and honey cake by the window." },
      { text: 'And Little Red Riding Hood never strayed from the path again.', cast: ['mother'], scene: 'Red walks home along the forest path at golden hour; her mother waits at the cottage gate with open arms.' },
    ],
  },
};

const IDENTITY =
  'Identity is the top priority: the face must be recognizably the person in the photo. Preserve face shape and width, ' +
  'eye shape, spacing and color, eyebrows, nose, mouth, ears, hairline, hairstyle, hair length, color and texture, skin tone, ' +
  'freckles and moles. Glasses, headbands, clips or bows only if the reference shows them: never add glasses or accessories that are not there. ' +
  'Keep their apparent age and never make them look younger: a child stays a child of the same age with realistic proportions, ' +
  'and an adult is drawn as an adult. Do not beautify or swap features.';

// Character bible: one reference image per recurring character, made once and stored.
export function bibleCastPrompt(story, key) {
  return [
    STYLE,
    `A character reference image for "${story.title}". ${story.cast[key]}`,
    'One full-body view, standing, three-quarter view toward the viewer, on a plain light-grey background, even lighting. Exactly one character.',
    NO_TEXT,
  ].join('\n\n');
}

// The stand-in hero used to pre-generate scenes; every book swaps in the real child.
export function bibleStandInPrompt(story) {
  return [
    STYLE,
    `A character reference image of ${story.hero}, a friendly 8-year-old child wearing ${story.outfit}.`,
    'One full-body view, standing, three-quarter view toward the viewer, on a plain light-grey background, even lighting. Exactly one character.',
    NO_TEXT,
  ].join('\n\n');
}

// A per-book character sheet of the uploaded child, in the story's outfit.
export function heroSheetPrompt(story) {
  return [
    STYLE,
    `Create a character reference sheet of the person in this photo as ${story.hero} from "${story.title}".`,
    IDENTITY,
    `Outfit: ${story.outfit}.`,
    'Two views side by side on a plain light-grey background: on the left a full-body front view, on the right a large head-and-shoulders close-up. ' +
      'Neutral pose, friendly expression, even lighting. Exactly one character, shown twice.',
    NO_TEXT,
  ].join('\n\n');
}

// Pre-generated scene, drawn once per story page with the stand-in hero.
// refs: [stand-in hero, ...cast reference images in page.cast order]
export function scenePrompt(story, index) {
  const page = story.pages[index];
  const slot = TEMPLATE[index];
  const people = [`- ${story.hero}: exactly the child in image 1, wearing ${story.outfit}.`]
    .concat(page.cast.map((key, i) => `- exactly the character in image ${i + 2}: ${story.cast[key]}`));
  return [
    STYLE,
    `Page ${index + 1} of 20 of the children's picture book "${story.title}". The words on this page will be: "${page.text}"`,
    `Characters, each matching their reference image:\n${people.join('\n')}`,
    `Scene: ${page.scene}`,
    `Camera: ${slot.shot}. ${story.hero} is ${slot.hero}. ${story.hero}'s face must be clearly visible and unobstructed.`,
    `Keep the ${slot.quiet} quarter of the image calm and low-detail (sky, wall, floor or grass), with no faces, hands or story objects in it.`,
    'Landscape full-bleed illustration.',
    NO_TEXT,
  ].join('\n\n');
}

// Per book: swap the stand-in for the real child. refs: [scene, reference of the child]
// The reference is the uploaded photo while the book is first made, and the stored character
// sheet for later re-makes (the photo itself is never stored).
export function swapPrompt(story, ref = 'photo') {
  const what = ref === 'photo' ? 'a photo of the child' : 'the character sheet of the child';
  return [
    STYLE,
    `Image 1 is a finished page from "${story.title}". Image 2 is ${what} who is ${story.hero} in this book.`,
    `Replace ${story.hero} in image 1 with the child from image 2: their face, hair, skin tone, glasses and accessories, age and build, drawn in the same style as the rest of image 1. ` +
      `Keep ${story.hero}'s outfit (${story.outfit}), pose, size, position and expression from image 1.`,
    IDENTITY,
    'Change nothing else: every other character, the background, the camera, the lighting and the colors stay exactly as in image 1.',
    NO_TEXT,
  ].join('\n\n');
}

// "Change one thing" from the book page. refs: [page, character sheet]
export function editPrompt(story, instruction) {
  return [
    STYLE,
    `Image 1 is a finished page from "${story.title}". Image 2 is the character sheet for ${story.hero}.`,
    `Edit image 1. Change only this: ${instruction}`,
    `Keep everything else exactly the same, including ${story.hero}'s face, which must match image 2.`,
    NO_TEXT,
  ].join('\n\n');
}

// Vision check of a finished page. refs: [page, reference of the child]
export function analysisPrompt(story, index, ref = 'photo') {
  const page = story.pages[index];
  const what = ref === 'photo' ? 'a real photo of the child' : 'the character sheet of the child';
  const others = page.cast.map((key) => story.cast[key].split(':')[0]).join(', ') || 'nobody else';
  return `You check one illustrated page of a children's picture book before it is printed. Image 1 is the page. Image 2 is ${what} who plays ${story.hero} (the hero can be any gender, and the costume is the story's).
The page's words (printed later, not in the image) are: "${page.text}"
Scene it should show: ${page.scene}
Other characters who should appear: ${others}.

How to judge likeness: the page is a stylized 3D cartoon, so the hero is drawn as a cartoon child with big eyes even if image 2 shows an adult. That is expected. Judge only whether the features that identify the person carried over: hair color, hair length and style, skin tone, face shape, glasses or accessories. 8-10: clearly the same person as a cartoon. 5-7: some identifying features carried over. 0-4: looks like a different person.

Defects are only serious problems a parent would notice: letters or words drawn in the picture, extra or missing arms, legs or fingers, a melted or distorted face, the hero shown twice, the hero missing or facing away, or a named character missing. Small differences from the scene description are not defects; reflect them in scene_match instead.

Return JSON:
{
  "hero_visible": true/false,
  "likeness": 0-10,
  "scene_match": 0-10,
  "defects": ["..."],
  "important": [{"label": "...", "x": 0-1, "y": 0-1, "w": 0-1, "h": 0-1}]
}
"important" lists the bounding box (fractions of image width and height, x/y = top-left corner) of every face, every character's head, and every object the words depend on. Words will be printed on the page and must never cover anything in this list.`;
}
