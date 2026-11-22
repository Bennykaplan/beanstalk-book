// Where the words go on each page. The rule: words never cover a face or anything the page
// needs you to see. The vision check returns boxes around those things; this picks a band of
// the page (top, middle or bottom) that misses every box. If none does, the page switches to a
// "panel" layout: the picture shrinks and the words sit on their own strip below it, so nothing
// is ever covered. The cover title follows the same rule (coverTitle below).

// The printed page is 11.25 x 8.75 in (with bleed); the art is 3:2, so it's cropped at the sides.
export const PAGE_W = 810;
export const PAGE_H = 630;
const ART_ASPECT = 1.5;
export const SAFE = 45 / PAGE_H; // 0.125 in bleed + 0.5 in safety margin, as a fraction of height
// Room kept clear around every box. It also covers the soft shadow drawn behind the words,
// which reaches about 0.04 of the page height past the text itself.
const MARGIN = 0.05;

// Art fractions -> fractions of an area of width w and height h that the art fills by cropping.
export function mapBoxes(important = [], w = PAGE_W, h = PAGE_H) {
  const crop = Math.max(0, (1 - (w / h) / ART_ASPECT) / 2); // fraction of the art cut off each side
  return important.map((raw) => {
    const b = /head|face/i.test(raw.label || '') ? padHead(raw) : raw;
    return { label: b.label, x: (b.x - crop) / (1 - 2 * crop), y: b.y, w: b.w / (1 - 2 * crop), h: b.h };
  });
}

// The vision model's head boxes often stop at the forehead or sit a little low.
export function padHead(b) {
  const up = b.h * 0.45;
  const side = b.w * 0.15;
  return { ...b, x: b.x - side, y: b.y - up, w: b.w + 2 * side, h: b.h + up + b.h * 0.1 };
}

export const clearOf = (boxes, y0, y1) => !boxes.some((b) => b.y < y1 + MARGIN && b.y + b.h > y0 - MARGIN && b.x < 1 && b.x + b.w > 0);

// Rough height of the text block as a fraction of the page height, at a given font size in points.
export function textBandHeight(text, fontSize) {
  const charsPerLine = Math.floor((PAGE_W - 2 * 60) / (fontSize * 0.52));
  const lines = Math.ceil(text.length / charsPerLine) || 1;
  return (lines * fontSize * 1.28 + fontSize * 1.1) / PAGE_H;
}

// important: boxes in art fractions from the vision check. quiet: the template's preferred band.
export function placeText(text, important = [], quiet = 'bottom') {
  const boxes = mapBoxes(important);
  const order = quiet === 'top' ? ['top', 'bottom', 'middle'] : ['bottom', 'top', 'middle'];
  for (const fontSize of [28, 23]) {
    const h = textBandHeight(text, fontSize);
    for (const zone of order) {
      const y0 = zone === 'top' ? SAFE : zone === 'bottom' ? 1 - SAFE - h : 0.5 - h / 2;
      if (clearOf(boxes, y0, y0 + h)) return { mode: 'band', zone, fontSize, y0, y1: y0 + h };
    }
  }
  return { mode: 'panel', fontSize: 24 };
}

// The cover title on an area w x h (points): over the art at the top or bottom if that band is
// clear of every face and key object, otherwise on its own strip above the picture.
export function coverTitle(important, w, h, blockH, safe) {
  const boxes = mapBoxes(important, w, h);
  for (const zone of ['top', 'bottom']) {
    const y0 = zone === 'top' ? safe : h - safe - blockH;
    if (clearOf(boxes, y0 / h, (y0 + blockH) / h)) return { mode: 'band', zone, y0 };
  }
  return { mode: 'strip' };
}
