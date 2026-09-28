<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# PosterMaker

AI poster generation: an orchestrator plans a poster, generates its assets, composes it, and
exports print-ready PDF. Headless Chromium does the rendering, Vercel Blob stores the output.

`README.md` is still the stock `create-next-app` text — **this file is the orientation**, not
the README.

## Commands

```bash
npm run dev
npm run build
npm run lint         # eslint
```

**No test script exists.** Don't claim tests pass — verify by generating a poster and opening
the result. `.claude/launch.json` is configured; prefer `preview_start` for the dev server.

## Layout

```
app/actions.ts     server actions — the entry point for generation
app/api/           route handlers
app/p/             poster view routes
lib/ai/            planner + orchestrator (Vercel AI SDK)
lib/poster/        composition, media system, print-readiness checks
docs/superpowers/specs/2026-07-30-lenticular-output-design.md
```

Two output classes exist and are deliberately split: **art** vs **document**. They have
different print-readiness rules — don't collapse them into one path.

## Gotchas

- **PDF export runs headless Chromium** via `puppeteer-core` + `@sparticuz/chromium`. That
  pairing exists because full `puppeteer` doesn't fit in a serverless function. Never swap in
  plain `puppeteer` or add a local Chrome path — it works locally and fails on Vercel.
- Generated assets go to **Vercel Blob**, not the repo. A missing `BLOB_READ_WRITE_TOKEN` is
  the usual cause of "generation succeeded but nothing appears".
- Print-readiness checks are there to catch output that looks fine on screen and prints
  wrong (bleed, DPI, colour). Don't bypass a failing check to make a demo work.
- Lenticular print output is designed but check `docs/superpowers/specs/` for what's actually
  implemented before assuming it ships.
- Never push to `main` — branch per task, PR.
