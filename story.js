// Everything the image model sees lives here. Change prompts here, not in server.js.

// The one style string for the whole book. Used verbatim in every call; never vary it per page.
export const STYLE = 'Modern 3D animated feature — rounded forms, large expressive eyes, soft rim light.';

// Fixed descriptions so recurring characters look the same on every page.
export const JACK_OUTFIT =
  'a patched oatmeal-colored linen tunic with a lace-up collar, a rope belt, brown trousers and worn brown leather boots';

export const CAST = {
  jack:
    'Jack: the child from the reference character sheet. Same face, hair, skin tone, eye color, age and body as on the sheet, ' +
    `wearing exactly the outfit from the sheet (${JACK_OUTFIT}).`,
  mother:
    "Jack's mother: a grown-up adult woman, clearly taller and older than Jack, slim, in her late thirties with the same skin tone and hair color as Jack, hair tied in a loose bun, " +
    'a faded blue dress with a patched cream apron, a tired but kind face.',
  cow:
    'Milky-White: a gentle, thin, all-white dairy cow with a pink nose, a small brass bell on a leather collar and a frayed rope halter.',
  oldMan:
    'The old man: a small, hunched, mysterious old man with a long white beard, a wide-brimmed patched green hat and a long brown traveling cloak.',
};

const IDENTITY =
  'Identity is the top priority: the face must be recognizably the same child as in the photo. Preserve face shape and width, ' +
  'eye shape, spacing and color, eyebrows, nose, mouth, ears, hairline, hairstyle, hair length, color and texture, skin tone, ' +
  'freckles, moles, glasses and hair accessories (headbands, clips, bows) if any, and apparent age (a child stays a child of the same age). Do not beautify, age or swap features.';

const NO_TEXT = 'Do not draw any text, letters, numbers, words, signs, labels, speech bubbles or captions anywhere in the image.';

// The storyboard. `text` is drawn by the PDF layer, never by the image model.
// `textArea` is where that text goes; the framing line keeps that part of the art quiet.
export const PAGES = [
  {
    id: 'cupboard',
    title: 'The empty cupboard',
    text: 'Jack and his mother had nothing left to sell but Milky-White.',
    cast: ['jack', 'mother', 'cow'],
    scene:
      'Inside a bare, poor cottage kitchen in daylight: an open wooden cupboard with completely empty shelves, a cold hearth, ' +
      'a worn wooden table with one empty bowl. Jack and his mother stand in the kitchen. ' +
      'Behind them is the open cottage door, and through it Milky-White the cow is clearly visible standing outside in the sunny yard, a few steps away from the door (the cow is outdoors, not inside or in the doorway).',
    framing:
      'Medium shot from about the knees up. Jack stands nearer the camera with his face and body turned toward the viewer, ' +
      'so his full face is visible from the front, front-lit by soft warm window light; his eyes look sideways at his mother, ' +
      'who stands beside him in three-quarter view. ' +
      'The lower third of the image is quiet and low-detail (plain floor and the lower part of their clothes only; no faces, hands, cow, table or bowl there) — it is reserved for text.',
    textArea: 'bottom',
    enabled: true,
  },
  {
    id: 'trade',
    title: 'The trade',
    text: 'Five magic beans, said the old man. For one cow.',
    cast: ['jack', 'oldMan', 'cow'],
    scene:
      'A dirt road winding to market between green fields on a bright day. The old man holds out his open palm toward Jack; ' +
      'in his palm are exactly five large beans, each a different bright color (red, blue, yellow, purple and green), shown big enough to count. ' +
      "Jack stands on the road holding Milky-White's rope halter in one hand; the cow stands beside him.",
    framing:
      'Medium shot. Jack is shown in three-quarter view (turned partly toward the old man, face still visible), wearing exactly the same clothes as on the character sheet. ' +
      'The top third of the image is open, softly clouded sky with nothing else in it — it is reserved for text.',
    textArea: 'top',
    enabled: true,
  },
  {
    id: 'window',
    title: 'Out the window',
    text: 'Beans! she cried. And out the window they went.',
    cast: ['jack', 'mother'],
    scene:
      "The front of Jack's cottage at dusk, seen from the garden. There are exactly two people in the picture. " +
      "(1) Jack's mother, the grown-up woman with her hair in a bun and a blue dress, clearly an adult, leans out of an open window on the front wall and flings the beans; " +
      'the five colored beans scatter through the air and fall into the garden below. ' +
      '(2) Jack, the child from the character sheet, stands on the ground in the open front doorway right beside that window, ' +
      'his whole body visible, lit from behind by warm firelight, his face turned toward the viewer as he watches the beans fall.',
    framing:
      'The camera is close to the cottage: the doorway and window fill most of the width, and Jack in the doorway is large, ' +
      'his head at least one eighth of the image height so his face is recognizable. ' +
      'Use a darker palette than daytime pages: deep dusk blues and purples with warm window glow. ' +
      'The bottom third of the image is dark, quiet grass with nothing important in it — it is reserved for text.',
    textArea: 'bottom',
    enabled: true,
  },
  // Next iteration. Kept here so the pipeline already handles page 4+.
  {
    id: 'beanstalk',
    title: 'The beanstalk at dawn',
    text: 'In the morning, a beanstalk stood where the beans had fallen, up and up into the clouds.',
    cast: ['jack'],
    scene:
      'Dawn in the cottage garden: an enormous twisting green beanstalk rises from the garden into the clouds. ' +
      'Jack stands at its base in morning light, looking up in wonder.',
    framing: 'Soft pink and gold dawn light. The top third is sky and clouds, reserved for text.',
    textArea: 'top',
    enabled: false,
  },
];

export function characterPrompt() {
  return [
    STYLE,
    'Create a character reference sheet of the child in this photo as Jack from "Jack and the Beanstalk".',
    IDENTITY,
    `Outfit: ${JACK_OUTFIT}.`,
    'Show two full-body views of the same child side by side on a plain light-grey background: on the left a front view, ' +
      'on the right a three-quarter view. Neutral standing pose, friendly expression, even lighting. Exactly one character, shown twice.',
    NO_TEXT,
  ].join('\n\n');
}

export function pagePrompt(page, number) {
  return [
    STYLE,
    `This is page ${number} of a children's picture book of "Jack and the Beanstalk". ` +
      'The reference image is the character sheet for Jack; Jack must look exactly like that child on every page.',
    'Characters in this picture:\n' + page.cast.map((c) => `- ${CAST[c]}`).join('\n'),
    `Scene: ${page.scene}`,
    `Composition: ${page.framing} Landscape full-bleed illustration.`,
    NO_TEXT,
  ].join('\n\n');
}

export function editPrompt(instruction) {
  return [
    STYLE,
    'Image 1 is a finished page from a picture book. Image 2 is the character sheet for Jack.',
    `Edit image 1. Change only this: ${instruction}`,
    'Keep everything else exactly the same: composition, camera, characters, Jack\'s face (it must match image 2), clothes, lighting, palette, ' +
      'and the empty text area.',
    NO_TEXT,
  ].join('\n\n');
}
