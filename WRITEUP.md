# What I did: Print it and ship it (and Charge for the book)

**Live:** https://book.everchargeelectric.com · **Code:** https://github.com/Bennykaplan/beanstalk-book · **Pricing math:** [PRICING.md](PRICING.md) · **What's left:** [to-do.md](to-do.md) · **Self-review log:** [review-log.md](review-log.md)

## The product
Upload a photo of a child, choose *Jack and the Beanstalk* or *Little Red Riding Hood*, and in about a minute the child is the hero of a 20-page illustrated book. It's saved to your account (Google sign-in) as a PDF you can download any time, and you can order it printed and shipped as an 11 × 8.5 in hardcover.

## Print it and ship it
- **Print API:** Lulu Print API, sandbox only (`api.sandbox.lulu.com`). The code refuses to start if pointed anywhere else. Sandbox orders are real to Lulu's system but are never printed, shipped or charged.
- **Review first, nothing sent before approval.** "Order a printed copy" opens a 3-step checkout:
  1. **Open the proof PDF:** the exact book that will be printed.
  2. **Tick that you've checked every page, and approve.** The server refuses to approve until the proof has actually been opened, and refuses to order until it's approved.
  3. **Enter the US delivery address:** it's validated, then Lulu quotes the real price.
  4. **Place the order:** the price comes out of the wallet and the app creates the Lulu print job. Lulu downloads the interior and cover PDFs from signed, unguessable URLs.
- **It looks like a real book:**
  - **Front cover:** "Jack and the Beanstalk" / "starring Maya", placed over the cover art where it covers no face.
  - **Inside page:** copyright notice and publisher.
  - **Story:** starts on the next page and runs 20 pages, then "The End".
  - **Back cover:** About Me, with the child's character art, name, age, favorite things and a short bio.
  - **Print layout:** the cover is one spread (back, spine, front) at the exact size Lulu's cover-dimensions API gives for this book.
- **What the child's details go through:**
  - **Name:** letters only, and capitalized.
  - **Every field:** a quick local word list, then OpenAI's moderation API (free).
  - **The name:** an AI check that it's a real-sounding name, not an insult, epithet or joke.
  - **Errors:** shown on the exact field.
  - **The photo:** checked by moderation too.
- **Pricing:** see PRICING.md.
  - **Digital book:** $0.99, costing about $0.56 in AI calls (37% margin).
  - **Printed book:** the printer's total plus $9, rounded up to .99. That's $29.99 with standard shipping, against a $20.09 printer cost (29% margin).

## Charge for the book (the homework this builds on)
- **Wallet (Stripe test mode, class sandbox key in `.env` only):**
  - **Add money:** with Stripe Checkout.
  - **Balance and history:** see the balance, and a history page listing every credit and debit with what caused it (top-up, book, print order, refund, credit).
  - **Refunds:** request one, and it's processed through Stripe's Refunds API as two separate history rows.
  - **Books:** each one takes $0.99, and is refunded automatically if no page could be made.
- **Cost tracking:** every image call, retry and picture check is logged with its real cost. The wallet page shows the average cost per book next to the $0.99, and each book shows its own cost.
- **One 20-page template for both stories:** each slot fixes the camera and keeps one band of the picture calm for words.
- **Character bible in the database:**
  - **Every recurring character:** a reference image (mother, cow, old man, giant, giant's wife, hen; mum, grandma, wolf, woodcutter) plus a stand-in hero.
  - **All 40 scenes:** pre-generated from those images.
  - **Per book:** the child is edited into the 20 scenes, and their own character sheet is stored in the bible against their book.
- **Quality loop:**
  - **Every page:** checked by a vision model for likeness, scene and defects (drawn text, wrong limbs, missing hero).
  - **Redone if it fails:** up to 3 tries in all, and if none passes, the best is kept.
  - **Tries are shown:** on every thumbnail and in the page viewer.
- **Text never hides the story:** the check also returns boxes around every face and key object. `layout.js` puts the words in whichever band (top, bottom or middle) misses every box. If none does, the picture shrinks and the words get their own strip below it. That's a layout rule, not a hope.
- **Speed:**
  - **Pages:** all 20 run in parallel; the measured real book took about a minute, and the first page appeared after 13 seconds.
  - **Page load:** static, cached files.
  - **Progress:** a bar that names the stage, and thumbnails that appear as each page finishes.
  - **Images:** stored in Postgres, so books and PDFs are still there on the next login.

## What I learned
- **My first real book cost $9.16.** The picture check compared a cartoon child against an adult photo and failed every page, so every page paid for 3 tries at the expensive settings. Making the check judge the right things fixed the pass rate. Testing four quality settings side by side cut the cost per page from 15¢ to 2.5¢ without losing the likeness.
- **OpenAI's safety filter refused "Jack's mother ... in her late thirties"** but accepted "Jack's mum, a friendly adult village woman".
- **Running tests against a stale local server cost real money once.** An old test server was still answering on the port, so a "test of the fix" ran the old, expensive code. Check which process answers before spending.
