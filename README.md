# Beanstalk Storybook

Upload a photo of a child, pick *Jack and the Beanstalk* or *Little Red Riding Hood*, and in about a minute they're the hero of a 20-page illustrated book. Download the PDF, or order it printed as an 11 × 8.5 in hardcover.

**Live:** https://book.everchargeelectric.com · **Write-up:** [WRITEUP.md](WRITEUP.md) · **Pricing:** [PRICING.md](PRICING.md) · **What's left:** [to-do.md](to-do.md) · **Self-review log:** [review-log.md](review-log.md)

Test mode throughout: payments use Stripe's test sandbox and print orders use Lulu's sandbox.

## How it works

1. **Character bible and scenes, made once** (`pregen.mjs` → `assets/` → database). Every recurring character gets a reference image, then all 20 scenes of each story are drawn from those references with a stand-in hero.
2. **A book** (`pipeline.js`). The child's photo is edited into the 20 scenes of the chosen story, all at once (OpenAI image edits). Each page is checked by a vision model; a failed page is redone, up to 3 tries, and if none passes the best is kept. A character sheet of the child is stored in the bible for the back cover and later edits.
3. **Words placed where they cover nothing** (`layout.js`). The check returns boxes around every face and key object; the words go in a band that misses them all, or on their own strip below the picture.
4. **PDFs** (`pdf.js`). A reading copy, plus the printer's two files: a 24-page interior (copyright page, 20 story pages, The End, 2 blank) and a wrap-around cover spread sized by Lulu's API.
5. **Money** (`wallet.js`). Stripe Checkout tops up a wallet; each book takes $0.99; refunds go back to the card through Stripe; every movement is a ledger row. Every AI call's real cost is logged, and the wallet page shows the average cost per book.
6. **Printing** (`lulu.js`). Proof → approve → address → live Lulu quote → order, in Lulu's sandbox.

| File | What's in it |
| --- | --- |
| `stories.js` | The style string, the 20-page template, both storyboards, the cast, and every prompt. |
| `pipeline.js` | Making a book: parallel pages, the 3-try check loop, the character sheet. |
| `images.js` | OpenAI calls (image edits, vision checks), the per-minute queue, and a free mock mode. |
| `layout.js` | Where the words go on each page. |
| `pdf.js` | Reading PDF, print interior, cover spread. |
| `wallet.js`, `costs.js` | Stripe wallet, ledger, refunds; cost of every API call. |
| `validate.js` | About Me checks: name shape, word list, moderation, real-name check; photo moderation. |
| `lulu.js` | Lulu Print API (sandbox only). |
| `auth.js`, `db.js`, `log.js`, `seed.js` | Google sign-in, Postgres schema, JSON logs, loading `assets/` into the database. |
| `public/` | The app (`index.html`, `app.js`) and the privacy page. |
| `test.mjs` | End-to-end test with free mock images: wallet, refunds, book, retries, ownership, print-order rules. |

## Run locally

```bash
npm install
cp .env.example .env   # add OPENAI_API_KEY, STRIPE_SECRET_KEY, LULU_CLIENT_KEY, LULU_CLIENT_SECRET
npm start              # http://localhost:3020
```

`IMAGE_PROVIDER=mock` and `DEV_LOGIN=1` in `.env` make it free to run and test: `node test.mjs <photo>`.

`.env` is in `.gitignore`; no key is ever committed. On Render the same settings go in the service's Environment page.
