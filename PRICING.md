# Pricing: what a book costs us, and what we charge

All numbers are measured, not guessed: AI costs come from the `usage` OpenAI returns on every call (logged per call in `generation_log.cost_usd`), and printing costs come from Lulu's own price calculator (`/print-job-cost-calculations/`, sandbox, November 2026).

## The business model

Two products, both paid from a prepaid wallet topped up by card (Stripe):

1. **The digital book: $0.99.** Making a 20-page book takes $0.99 from the wallet. The customer gets the PDF and can come back to it any time.
2. **The printed book: printer's price + $9.00, rounded up to the next .99.** An 11 × 8.5 inch hardcover, printed and shipped by Lulu. The printer's price depends on the address and the shipping speed, so the app gets a live quote at checkout and the customer sees one final price before ordering.

## Cost of one digital book

| Item | Calls | Cost each | Cost |
| --- | --- | --- | --- |
| Child drawn into each page (`gpt-image-1.5`, low quality, low input fidelity, 1536 × 1024) | 20 | $0.025 | $0.50 |
| Character sheet of the child, for the About Me page and later edits | 1 | ~$0.03 | $0.03 |
| Picture check of each page (`gpt-4.1-mini`, vision) | 20 | $0.0016 | $0.03 |
| Name, About Me and photo checks (moderation is free; one name check) | 1 | ~$0.0003 | $0.00 |
| **Total, when every page passes on the first try** | | | **≈ $0.56** |

Measured on a real 20-page book: 19 pages made and checked for **$0.51**, every one passing on the first try. (The 20th failed only because the account ran out of credit.)

**Retries are the risk.** A page that fails the picture check is redone, up to 3 tries. If every page needed all 3, a book would cost about $1.60. In testing with the current check, 19 of 19 pages passed first time; with the earlier, too-strict check, every page took 3 tries and the book cost $9.16 at the old settings. The wallet page shows the live average cost per book next to the $0.99 price, so this is watched, not assumed.

**Why low quality.** I tested one page at four settings:

| Setting | Cost per page | Time | Likeness |
| --- | --- | --- | --- |
| Medium quality, high input fidelity | $0.152 | 20 s | Good |
| Medium quality, low input fidelity | $0.068 | 16 s | Good |
| **Low quality, low input fidelity** | **$0.025** | **9 s** | **Good, slightly less fine detail** |

At the original setting, a book cost about $3.15, more than three times the $0.99 price. Low/low is the only setting where the $0.99 book makes money and finishes in about a minute.

## Margin on the digital book

| | Amount |
| --- | --- |
| Price | $0.99 |
| AI cost (measured) | −$0.56 |
| Card fees: Stripe takes 2.9% + $0.30 per top-up, so on a $10 top-up that pays for 10 books, about $0.06 per book | −$0.06 |
| **Margin** | **≈ $0.37 (37%)** |

If a book needed retries on half its pages, the AI cost would rise to about $1.06, and that book would lose money. A book needing all 3 tries on every page would lose about $0.67.

## Cost and price of a printed book

Lulu's sandbox quote for one 24-page, full-colour, 11 × 8.5 in casewrap hardcover (`1100X0850.FC.STD.CW.080CW444.MXX`), shipped to Washington, DC:

| | Standard mail | Priority mail | Expedited |
| --- | --- | --- | --- |
| Printing and binding | $12.50 | $12.50 | $12.50 |
| Shipping | $5.69 | $14.74 | $20.74 |
| Tax | $1.15 | $2.44 | $2.05 |
| **Printer's total** | **$20.09** | **$29.68** | **$36.04** |
| **Our price** (printer's total + $9, up to .99) | **$29.99** | **$38.99** | **$45.99** |

Our margin on standard mail:

| | Amount |
| --- | --- |
| Price | $29.99 |
| Printer (print + ship + tax) | −$20.09 |
| Card fees on the money for it (2.9% + $0.30) | −$1.17 |
| **Margin** | **≈ $8.73 (29%)** |

A customer who wants their book printed pays **$0.99 + $29.99 = $30.98** in all with standard mail. We keep about $9.10 of that.

The interior is 24 pages because that's the hardcover's minimum: copyright page, 20 story pages, "The End", and 2 blank pages. The covers are a separate file.

## What would change the numbers

- **Volume printing:** Lulu's price is per book, with no volume discount at this scale.
- **Print quality:** low-quality art is 1536 pixels wide across 11.25 inches, about 137 dpi. Lulu recommends 300. Printed books may look a little soft. Making printed books' pages at high quality (or upscaling them) would add about $1–3 per printed book, which the $9 margin could absorb.
- **OpenAI price changes:** `gpt-image-1.5` is now marked deprecated. When it's retired, its replacement's prices change the table above.
