# Beanstalk Storybook

Upload a child's photo and get a *Jack and the Beanstalk* picture book starring them, downloaded as one PDF. This iteration builds the first 3 pages plus an About Me page.

**Live:** https://book.everchargeelectric.com · **Sample book:** [samples/JackAndTheBeanstalk.pdf](samples/JackAndTheBeanstalk.pdf) · **What's left:** [to-do.md](to-do.md)

## How it works

All image calls use OpenAI's **image edit endpoint** (`/v1/images/edits`, model `gpt-image-1.5`, `input_fidelity: high`), because every picture starts from a reference image.

1. **Character sheet.** The photo becomes one reference image of the child as Jack (front and three-quarter views). That one image, plus one style string, goes into every page call, so Jack looks the same on every page.
2. **Pages.** Each page is one image call: the style string, the fixed cast descriptions (mother, Milky-White, the old man), the scene, and a framing line that keeps the text area of the art empty.
3. **Edit.** "Change one thing" sends the existing page (plus the character sheet) back to the edit endpoint with an instruction, instead of regenerating the page.
4. **PDF.** `pdf.js` lays each page out full-bleed and draws the story text on top in Fredoka over a soft gradient. The image model never draws text. The last page is About Me, built from what the uploader typed.

| File | What's in it |
| --- | --- |
| `story.js` | The style string, the cast, the storyboard and every prompt. Prompt work happens here. |
| `server.js` | Express API: `/api/character`, `/api/page`, `/api/edit`, `/api/pdf`. One model call per request, no retries or loops. |
| `pdf.js` | PDF layout (pdfkit). |
| `public/index.html` | The app. |
| `test.mjs` | Makes a whole book for one photo against a running server, for prompt testing. |

The style string is exactly: `Modern 3D animated feature — rounded forms, large expressive eyes, soft rim light.`

## How the prompt was developed

I tried prompts by hand in the OpenAI Playground (Images) first, then used AI (Claude) to rewrite the prompt after every round. Each round I tested on three different uploads and wrote down what was wrong.

1. **Round 1:** Page 2 worked first time. Page 1 showed Jack in profile with the cow inside the doorway. Page 3 left Jack out completely and drew the mother looking like the child. The character sheet dropped the girl's headband.
2. **Round 2:** Page 3 now says "exactly two people" and numbers them. The mother is "clearly an adult, taller than Jack". Page 1 asks for a knees-up medium shot with Jack facing the viewer. Accessories were added to the identity list. Result: both people are on page 3, and the headband stays.
3. **Round 3:** Jack's face on page 3 was too small to recognize, so the prompt now sets a minimum head size and a closer camera. The cow is pushed "a few steps away from the door".
4. **Model choice:** I started on the cheapest model, `gpt-image-1-mini`, as the homework says. It came out flat 2D and the child didn't look like the photo. `gpt-image-2` came out nearly photorealistic. `gpt-image-1.5` with `input_fidelity: high` kept both the 3D style and the face, so that's what the app uses.
5. **Edit endpoint:** for "same page, one thing different" (a missing accessory, say), editing the page kept everything else identical, where regenerating would have changed the whole picture.

Rounds 1–3 were first worked out on Gemini's image model, then rerun on OpenAI. The prompts carried over unchanged. What's still wrong is in [to-do.md](to-do.md).

## Run locally

```bash
npm install
cp .env.example .env   # then put your OPENAI_API_KEY in .env
npm start              # http://localhost:3020
```

`.env` is in `.gitignore`. The key is never committed. On Render it's set in the service's Environment settings.
