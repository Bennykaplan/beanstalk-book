# To-do: Beanstalk storybook (first 3 pages)

What still needs work in this build, from testing it on several different uploads (an 8-year-old girl, a man in his 20s with glasses, a man in his 30s with curly hair and glasses).

## Faces and consistency
- **Glasses drop off on page 3.** Jack has glasses on the character sheet and on pages 1–2, but on page 3 (dusk, backlit in the doorway) he sometimes loses them. The Edit box fixes it ("give Jack his glasses back") without redrawing the page, but it should be right the first time.
- **Adults are drawn as young children.** Every prompt says "the child", so an adult upload becomes a kid version of that person, about age 6. That fits this book (the uploader is meant to be a child), but likeness is weaker for adults and older kids come out younger than they are.
- **The mother isn't locked to a reference.** She's described in words (blue dress, apron, bun, same hair color as Jack), so she's close between pages 1 and 3 but not identical: her face and age shift a little. Fix: make a mother character sheet once and pass it as a second reference on her pages.
- **The old man's hat changes shape** between runs (wide-brimmed vs. pointed wizard hat). Only matters once he appears on more than one page.

## Composition and the text areas
- **Page 1's lower third isn't empty.** The prompt reserves it for text, but Jack's body and the mother's apron still end up there, so the story text sits over the characters. It's readable because of the dark gradient, but the art and text overlap.
- **Page 2's sky isn't fully clear.** The old man's hat and Jack's head reach into the top third, close to the text.
- **Page 1: "full face, looking at his mother" is a compromise.** Jack's face is visible but he's turned three-quarters toward her. The model won't do a fully front-facing face with eyes on someone beside him.
- **The five beans are sometimes four or six.**

## Pipeline
- **Started on the cheap model, had to move up.** `gpt-image-1-mini` came out flat 2D (not the 3D animated style) and the child didn't look like the photo. `gpt-image-2` was nearly photorealistic. `gpt-image-1.5` with `input_fidelity: high` is the one that holds both the style and the face, but it costs more per page. Worth retesting mini with a stronger style prompt before scaling to 20 pages.
- **Each page takes 30–60 seconds** and is made one click at a time. That's on purpose (no loops around the API call), but a 20-page book needs a better flow, like a "next page" button with progress, or a server-side job the user starts and comes back to.
- **Nothing is saved.** Refreshing the browser loses the character sheet and every page. A 20-page book needs saving (at least in the browser) so one mistake doesn't cost the whole book.
- **Page 4 (the beanstalk at dawn) is stubbed in `story.js`** (`enabled: false`). The two scenes from Part 1 (planting, climbing) still need to become pages in the right place in the story.
- **The rate limit is per IP and kept in memory,** so it resets whenever Render restarts the free instance.
