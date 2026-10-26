# To-do: Beanstalk storybook (first 3 pages)

What still needs work in this build, from testing it on several different uploads (an 8-year-old girl, a woman in her 20s, a man in his 30s).

## Faces and consistency
- **Adults are drawn as children.** Every prompt says "the child", so an adult upload comes out as a kid version of that person. It's fine for this book (the uploader is meant to be a child), but likeness is weaker for adults. If adults should be supported, add a "keep their real age" option.
- **Jack's face is smallest on page 3.** Even after asking for a closer camera, Jack in the doorway is the smallest face in the book. On some runs it is hard to tell that it's the same child as on page 1.
- **The mother changes slightly between pages 1 and 3.** Same blue dress and bun, but her face isn't locked to a reference image the way Jack's is. On page 3 she sometimes looks younger, almost a second child at the window. Fix: generate a mother character sheet once and pass it as a second reference on her pages.
- **Small accessories drift.** Headbands and glasses usually carry over from the character sheet, but not on every page. When one drops, the Edit box fixes it ("give Jack his headband back") without redrawing the page.

## Composition and the text areas
- **Page 1's lower third isn't fully quiet.** The prompt reserves it for text, but Jack's and his mother's legs, and sometimes the table, still end up there. The text is still readable because of the dark gradient behind it, but the art and text overlap.
- **Page 1: Jack's "full face, looking at his mother" is a compromise.** He faces the viewer and glances sideways. The model can't reliably show a full front face and eyes on the mother at the same time.
- **Page 3 sometimes adds an odd fire.** "Lit by firelight from behind" occasionally becomes flames right in the doorway next to Jack. Should be "warm lamplight from inside the cottage".
- **Milky-White drifts into the doorway on page 1** instead of standing out in the yard.
- **The five beans aren't always exactly five,** and they're tiny on page 2 unless the old man is close to the camera.

## Pipeline
- **PDF is large (~8 MB for 4 pages)** because the art is embedded as PNG. Converting pages to JPEG before building the PDF would cut it to about 1–2 MB. That matters once it's 20 pages.
- **Pages are made one click at a time.** On purpose (no loops around the API call), but a 20-page book will need a better flow, like a queue the user starts page by page with progress shown.
- **Nothing is saved server-side.** Refreshing the page loses the character sheet and pages. A 20-page book needs saving (at least in the browser) so one failure doesn't cost the whole book.
- **Page 4 (beanstalk at dawn) is stubbed in `story.js`** (`enabled: false`), and the two Part 1 scenes (planting, climbing) still need to become pages in the right place in the story.
- **The prompts were developed with Gemini (Google AI Studio), not the OpenAI Playground.** My key is for Gemini. The edit step uses Gemini's image-in / image-out editing, the equivalent of OpenAI's image edit endpoint.
- **Rate limit is per IP and in memory,** so it resets whenever Render restarts the free instance.
