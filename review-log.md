# Review log

Self-review runs of the `storybook-review` skill against the live site, oldest first. Earlier entries are never edited.

## Run 1 — 2026-11-21 — reviewer: self — browser: Claude's built-in browser (not a private window; signed in with Google from scratch)
Total 70 (first run)
PDF 20/40 (capped: text over a face) · UI 17/20 · Money 19/20 · Engineering 14/20
Upload 7:59:09 PM → PDF 8:00:39 PM (90 s), Little Red Riding Hood. Jack: upload 8:00:56 PM, then stuck at 19/20: page 10 was refused by OpenAI's safety filter, and the PDF only became available after I re-made the page by hand.
Balance: 0.00 → fund 5.00 → generate Red 4.01 → generate Jack 3.02 → refund $2.00 to card 1.02. History reconciles: 5.00 − 0.99 − 0.99 − 2.00 = 1.02.
Avg cost per book: $0.55 over 1 book (price $0.99). The Jack book ($0.5x) isn't counted, because a book finished by a manual re-make never gets marked "ready".
Photo: an AI-generated face of an adult woman (no glasses), never used in development.
Not measured: none. Both PDFs were downloaded from the live site and checked on every page (24 pages each: cover, copyright, 20 story pages, The End, About Me). Text is real type (embedded Fredoka), not drawn by the model.

What I saw, page by page:
- **Text over a face: Jack cover.** "starring Rosa" sits across the hero's forehead and the top of her glasses. The cover title doesn't use the layout engine; it's always placed at the top. This alone caps the PDF section at 20.
- **Text touching heads, not faces:**
  - Red: p2 (mother's hair), p9 (wolf's ear), p16 (woodcutter's hat), p17 (back of the woodcutter's head), p19 (Grandma's cap).
  - Jack: p5 (mother at the window), p13 and p16 (hero's hairline).
  - The layout check only protects face and key-object boxes, and the boxes come out tight.
- **Likeness and drift.** The photo has no glasses, yet the hero wears glasses on most pages of both books.
  - Jack: p4 and p6 show an adult woman's face, the other pages show a child, p10 (re-made) is a different-looking child, and glasses come and go.
  - Red: consistent across p1, p10 and p20, but always with the added glasses.
- **About Me portrait (Jack) is cropped to the torso and the hen;** the face is cut off at the top. The crop picked the wrong box.
- **Template:** both books share the same 20-slot rhythm and the same text treatment. ✓
- **Story:** complete and in order. About Me carries the name, age, favorites and bio typed in. ✓
- **UI and money:**
  - The progress bar names the stage ("Stage 3 of 4: Checking each picture"), and thumbnails appeared from about 13 s on.
  - Every page shows its tries ("1 try ✓", "Try 2 of 3", "3 tries ✓").
  - With an empty wallet, the Make button is disabled and says "add money first".
  - Fine at 400 px with no sideways scroll.
  - Sign out and back in: both PDFs download (24 pages each, about 4.7 MB).
- **Cold start:** the first visit hit Render's sleeping server. The page stayed blank, with no message, until a reload.
- **Repo:** no keys in the repo or its history (checked for the class Stripe key and both OpenAI key prefixes). `to-do.md` is specific.

Fix first:
1. **Jack cover title covers the hero's face** (PDF: the section is capped at 20, about −7). Place the cover title with the same layout engine as story pages, using the cover page's boxes, or give the title its own strip.
2. **Upload to PDF takes 90 s, not under 60** (Engineering −6). A retried page waits for the next minute of the 20-images-a-minute OpenAI limit. Fix: hold back 2–3 of the 20 per-minute spots for retries (start the sheet and pages within 17), raise the account's limit, or relax checks that fail on taste rather than defects.
3. **The hero drifts and gains glasses** (PDF −5). Jack p4 and p6 are an adult face; glasses are added on most pages of both books. Fix: say "no glasses" when the photo has none (detect it once, up front), and have the check compare against the first finished page as well as the photo.
4. **A safety refusal kills the page, and the tile just says "Failed"** (UI −1, and a book that can't produce a PDF). Fix: count a refusal as one of the 3 tries and try again; make a failed tile open a panel with the reason and a Try again button.
5. **Cold start shows a blank page** (UI −2). Fix: retry the first data request and show "Waking up the server…" instead of nothing; keep the instance warm.
