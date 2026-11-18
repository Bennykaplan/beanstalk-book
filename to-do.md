# To-do: Beanstalk storybook

What still needs work, from building and testing it. Earlier feedback from real people and AI reviewers is in [feedback/README.md](feedback/README.md).

## Quality
- **Print resolution is low.** Pages are made at low quality, 1536 px across an 11.25 in page (about 137 dpi; Lulu recommends 300). On screen they look fine; printed they may look soft. Fix: re-make the pages at high quality only when someone orders a printed copy (about $1–3 more per printed book, which the $9 print margin can absorb), or upscale them.
- **The swap sometimes changes other characters.** "Change nothing else" isn't always obeyed. In one test the mother's face started to look like the child's. The picture check doesn't look at other characters' faces yet.
- **Likeness is "the same person as a cartoon", not exact.** The check scores most pages 6–7 out of 10: hair, skin tone and face shape carry over, and the style's big eyes take over the rest. Adults become children, by design. This was also the top complaint from real people in the last round.
- **Jack's scene 9 shows him in profile,** looking up at the castle; his face is visible but not frontal.
- **The picture check's accuracy isn't measured.** After I made it fairer, it passed all 20 pages of a book I'd also judge acceptable, but I haven't measured how often it passes a bad page. It needs a labelled set of good and bad pages.

## Speed and cost
- **Under 60 seconds depends on the OpenAI account's rate limit.** At the lowest paid level, OpenAI allows 20 images a minute: exactly one book's 20 pages. A second book started in the same minute waits, and so do retries. Higher account levels (150 a minute) remove this.
- **Retries cost money.** A page that fails is redone up to 3 times. If many pages fail, a book costs more than the $0.99 charged. The wallet page shows the live average so this is visible.
- **`gpt-image-1.5` is deprecated.** It still works today, but it will be retired; the prompts, settings and cost table will need redoing on its replacement.

## Printing
- **Sandbox only.** Orders are created in Lulu's sandbox and never printed. Real printing needs a production Lulu account and payment to Lulu.
- **US addresses only,** and three shipping options (standard, priority, expedited). Lulu's "Ground" isn't offered for this book.
- **Order status is only refreshed when the order page is opened.** Lulu can send webhooks on status changes; the app doesn't listen for them yet.
- **Lulu's file validation isn't called before ordering.** Lulu checks the files after the order is placed; calling `/validate-interior/` and `/validate-cover/` first would catch a bad file before the customer pays.

## Accounts and money
- **Refunds go back to the card a deposit came from,** up to what's left of that deposit and of the wallet. Money already spent on books can't be refunded to the card.
- **No admin view.** Every credit, debit and API cost is in the database, but there's no page for the owner to see totals across all users.
- **Render's free Postgres expires after about 30 days** and holds 1 GB. Each book is about 2.5 MB of images, so roughly 400 books.

## Content checks
- **The name check uses an AI judgement.** It rejects insults, epithets and jokes, but could wrongly reject a rare real name. There's no way for a parent to override it yet.
- **The word list is deliberately short;** the moderation API does the real work.
