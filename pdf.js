import PDFDocument from 'pdfkit';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const FONT = require.resolve('@fontsource/fredoka/files/fredoka-latin-600-normal.woff');

// 11 x 7.33 in landscape, matching the 3:2 (1536x1024) art.
const W = 792;
const H = 528;

const toBuffer = (dataUrl) => Buffer.from(dataUrl.split(',')[1], 'base64');

// Draws a full-bleed image scaled to cover the page.
function drawCover(doc, img) {
  doc.image(img, 0, 0, { cover: [W, H], align: 'center', valign: 'center' });
}

// Story text goes on top of the art, over a soft gradient so it reads on any background.
function drawStoryText(doc, text, area) {
  const band = H * 0.3;
  const top = area === 'top';
  const y0 = top ? 0 : H - band;
  const grad = doc.linearGradient(0, y0, 0, y0 + band);
  grad.stop(0, '#000', top ? 0.55 : 0).stop(1, '#000', top ? 0 : 0.55);
  doc.save().rect(0, y0, W, band).fill(grad).restore();

  doc.font(FONT).fontSize(30).fillColor('#fff');
  const opts = { width: W - 120, align: 'center', lineGap: 4 };
  const h = doc.heightOfString(text, opts);
  const y = top ? 44 : H - 44 - h;
  doc.fillColor('#000').fillOpacity(0.45).text(text, 62, y + 2, opts);
  doc.fillColor('#fff').fillOpacity(1).text(text, 60, y, opts);
}

function drawAboutMe(doc, about, character) {
  doc.rect(0, 0, W, H).fill('#fbf6e9');
  if (character) doc.image(toBuffer(character), 40, 64, { fit: [360, 400], align: 'center', valign: 'center' });
  const x = 430;
  const w = W - x - 50;
  doc.font(FONT).fillColor('#3f8a3a').fontSize(22).text('About Me', x, 70, { width: w });
  doc.fillColor('#23311f').fontSize(40).text(about.name || 'Jack', x, 100, { width: w });
  let y = doc.y + 18;
  for (const [label, value] of [['Age', about.age], ['Favorite things', about.favorites], ['About me', about.bio]]) {
    if (!value) continue;
    doc.fillColor('#66705f').fontSize(14).text(label, x, y, { width: w });
    doc.fillColor('#23311f').fontSize(18).text(value, x, doc.y + 2, { width: w, lineGap: 2 });
    y = doc.y + 14;
  }
}

// pages: [{ image, text, textArea }] in book order.
export function buildBook({ pages, about, character }) {
  const doc = new PDFDocument({ size: [W, H], margin: 0, autoFirstPage: false, info: { Title: 'Jack and the Beanstalk' } });
  for (const p of pages) {
    doc.addPage();
    drawCover(doc, toBuffer(p.image));
    drawStoryText(doc, p.text, p.textArea);
  }
  doc.addPage();
  drawAboutMe(doc, about, character);
  doc.end();
  return doc;
}
