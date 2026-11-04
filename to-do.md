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
- **The per-image progress bars are estimates.** OpenAI reports nothing until an image is finished, so each bar fills based on a typical 60 seconds and stops at 92% until the image really arrives. "Done" and "Failed" are real; the percentage in between isn't.
- **A server restart loses images in progress.** Generation runs inside the web process, and Render's free instance can restart. Finished images are safe in the database; interrupted ones show as failed after 6 minutes with a Try again button. A real job queue would resume them.
- **Parallel generation is capped at 4 images across all users,** because OpenAI limits image calls per minute. A 20-page book would mostly wait in line, so the bars need testing at that size.
- **Render's free Postgres expires after about 30 days** and holds 1 GB. Images are stored in the database, so that's only about 2,000 pictures. Real use needs a paid database, or moving the images to object storage (S3).
- **Spending limits are simple daily caps** (25 images per user, 150 overall). They stop a runaway bill, but once they're hit, the whole app stops for the day.
- **A failed character sheet needs the photo again,** because the photo is deliberately not stored. The app asks for it.
- **Logs only go to Render's log page,** which keeps them for a limited time on the free plan. `generation_log` in the database is the long-term record of what each image cost in time, but nothing displays it yet.
- **Page 4 (the beanstalk at dawn) is stubbed in `story.js`** (`enabled: false`). The two scenes from Part 1 (planting, climbing) still need to become pages in the right place in the story.
- **Google sign-in can't be tested automatically.** The test script uses a local-only dev login, which is off on Render, so the real Google flow is only checked by hand.
