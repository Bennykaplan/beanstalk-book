# Beanstalk Storybook

Upload a child's photo and get a *Jack and the Beanstalk* picture book starring them, downloaded as one PDF. This iteration builds the first 3 pages plus an About Me page.

**Live:** https://book.everchargeelectric.com · **Sample book:** [samples/JackAndTheBeanstalk.pdf](samples/JackAndTheBeanstalk.pdf) · **What's left:** [to-do.md](to-do.md)

## How it works

1. **Character sheet.** The photo becomes one reference image of the child as Jack (front and three-quarter views). That one image, plus one style string, goes into every page call, so Jack looks the same on every page.
2. **Pages.** Each page is one image call: the style string, the fixed cast descriptions (mother, Milky-White, the old man), the scene, and a framing line that keeps the text area of the art empty.
3. **Edit.** "Change one thing" sends the existing page back to the model with an edit instruction, instead of regenerating the page.
4. **PDF.** `pdf.js` lays each page out full-bleed and draws the story text on top in Fredoka over a soft gradient. The image model never draws text. The last page is About Me, built from what the uploader typed.

| File | What's in it |
| --- | --- |
| `story.js` | The style string, the cast, the storyboard and every prompt. Prompt work happens here. |
| `server.js` | Express API: `/api/character`, `/api/page`, `/api/edit`, `/api/pdf`. One model call per request, no retries or loops. |
| `pdf.js` | PDF layout (pdfkit). |
| `public/index.html` | The app. |
| `test.mjs` | Makes a whole book for one photo against a running server, for prompt testing. |

The style string is exactly: `Modern 3D animated feature — rounded forms, large expressive eyes, soft rim light.`

## Prompt iterations

I tested each version on three different uploads and looked at every page.

1. **v1:** Page 2 worked first time. Page 1 showed Jack in profile with the cow inside the doorway. Page 3 left Jack out entirely and drew the mother looking like the child. The character sheet dropped the girl's headband.
2. **v2:** Page 3 now says "exactly two people" and numbers them. The mother is "clearly an adult, taller than Jack". Page 1 asks for a knees-up medium shot with Jack facing the viewer. Accessories were added to the identity list. Result: Jack and the mother are both on page 3, and the headband stays.
3. **v3:** Jack's face on page 3 was too small to recognize, so the prompt now sets a minimum head size and a closer camera. The cow is pushed "a few steps away from the door". The edit endpoint fixed small slips without changing the rest of the page.

The remaining problems are in [to-do.md](to-do.md).

## Run locally

```bash
npm install
cp .env.example .env   # then put your GEMINI_API_KEY in .env
npm start              # http://localhost:3020
```

`.env` is in `.gitignore`. The key is never committed. On Render it's set in the service's Environment settings.
