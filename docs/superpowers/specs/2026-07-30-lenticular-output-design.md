# Lenticular print output

**Status:** approved design, not yet implemented
**Date:** 2026-07-30

## Purpose

Add a third kind of poster to PosterMaker: a **lenticular** poster that takes 2–3
images and produces an interlaced print file for a physical lenticular lens sheet.
Tilting the finished print reveals either a flip between images or an illusion of
depth.

This is not a variation on the existing poster pipeline. Existing posters render
HTML to a PDF at 300 dpi and the printer's own scaling is harmless. A lenticular
print is a pixel-exact optical device: every column of the image sits under a
specific lens, and any rescaling destroys the effect. It needs its own path.

## Hardware this targets

Nick's own equipment. These are constraints, not preferences.

| | |
|---|---|
| Printer | Canon imagePROGRAF TC-21, **2400 dpi horizontal × 1200 dpi vertical**, 4-ink CMYK pigment |
| Feed | Letter cut sheet in the tray (tray accepts 8.3″–12″ wide; photo paper ~10 sheets) |
| Unprintable border | 5 mm on all sides, no borderless mode — already encoded as `PRINTABLE_INSET_IN` |
| Lens sheets | OWLHAUS transparent adhesive-back, 17.12 × 13.18 in, 0.6 mm, 5 per pack |
| | ASIN B0BY2JF23B — **50 LPI** · ASIN B0CPYHNRGW — **100 LPI** |

The horizontal axis carries 2× the vertical resolution. Lenticules must run
vertically for a left–right effect, so the interlaced strips are vertical and the
frames are encoded along the horizontal axis — the 2400 dpi one. The asymmetry
works in our favour, and it is why orientation is fixed rather than free.

## Geometry

**Art area: 7.8 × 10.4 in on US Letter, interlaced at 1200 ppi → 9360 × 12480 px.**

| Choice | Reason |
|---|---|
| 7.8 in wide | Whole number of lenses at *both* pitches: 390 @ 50 LPI, 780 @ 100 LPI. Any multiple of 0.02 in achieves this; 7.8 is the largest that still clears the 5 mm border with room for registration marks. |
| 7.8 : 10.4 | Exactly 3:4, an aspect the media catalog and image generation already produce. |
| Margins | 0.35 in left/right, 0.30 in top/bottom. Printable inset is 0.19685 in, leaving a 0.153 in side band and a 0.103 in top/bottom band *inside* the printable area for registration marks. |
| 1200 ppi | Half the printer's 2400 dpi horizontal addressability. Gives 24 px per lens at 50 LPI and 12 px at 100 LPI. |

### Frame budget

| Sheet | px per lens | Frames × px | Mode |
|---|---|---|---|
| 50 LPI | 24 | 8 × 3 px | depth |
| 100 LPI | 12 | 4 × 3 px, or 2 × 6 px | flip |

Three pixels per frame is the floor for this printer: below that, pigment dot gain
on adjacent frames bleeds into one another and the effect muddies. The 2 × 6 px
option exists because a two-image flip with 6 px of separation is the most
forgiving configuration available and is therefore the right first physical test.

### Cutting the lens sheets

Each 17.12 × 13.18 in sheet yields **two Letter-size lenses**, packed 2-across ×
1-down (2 × 8.5 = 17.0 ≤ 17.12; 11 ≤ 13.18). Ten lenses per pack. The offcut is a
**17.12 × 2.18 in strip**, which is the pitch-test strip.

Yield does not depend on which axis the ribs run along, but the resulting poster
orientation does:

- Ribs parallel to the sheet's 13.18 in edge → cut piece is **portrait** 8.5 × 11 with vertical ribs.
- Ribs parallel to the sheet's 17.12 in edge → cut piece is **landscape** 11 × 8.5 with vertical ribs.

`ribAxis` is therefore a project field, set once after inspecting a sheet by eye.
It selects the poster orientation; it never changes the cut plan.

## The pitch problem

This is the reason the design is shaped the way it is.

A sheet sold as "100 LPI" measures roughly 99.7 LPI after manufacturing tolerance.
At 1200 ppi that is **12.036 px per lens, not 12**. Rounding to whole pixels drifts
0.036 px per lens; across 780 lenses that accumulates to **28 px of error**, and the
image visibly de-syncs from the lens toward one edge of the print.

The fix is to never compute per-lens. Derive the frame index from the absolute
column with float math:

```ts
const pxPerLens = ppi / truePitchLpi;          // 12.036, kept as a float
const phase = (x % pxPerLens) / pxPerLens;     // position within the lens, 0..1
const frame = Math.min(frameCount - 1, Math.floor(phase * frameCount));
```

Error stays bounded at ±0.5 px across the whole sheet instead of accumulating.

`truePitchLpi` comes from a printed pitch test: a ladder of patches interlaced at
pitches spanning nominal ±1.0 LPI in 0.1 steps, each labelled. Printed on plain
paper, viewed through the offcut strip, the patch that appears uniform rather than
banded gives the true pitch. It is measured once per pack and reused.

## Modes

Both modes take 2–3 images and feed the same interlacer. They differ only in how
images become frames.

**Flip** — images are discrete frames, passed through 1:1. Any ordinary opaque
image works. Targets the 100 LPI sheet.

**Depth** — images are back-to-front layers. The frame producer synthesises N views
by offsetting each layer horizontally in proportion to its depth. Layers in front
of the rearmost one must carry an alpha channel, or they occlude everything behind
them and no parallax is visible. Targets the 50 LPI sheet.

Because depth mode composites real layers rather than displacing pixels of a single
image, the background behind a foreground layer genuinely exists. No inpainting is
needed and frames register perfectly by construction, which is the usual source of
ghosting.

## Architecture

Interlacing is a pure per-row column gather: output pixel `(x, y)` is
`frame[f(x)]` at `(x, y)`. Nothing depends on other rows. A naive implementation
holding 8 frames of 9360 × 12480 px would need ~2.8 GB of RAM; streaming
band-by-band needs a few tens of MB regardless of poster size.

The print file also has to end up on the machine attached to the printer. A 350 MB
round trip through Blob storage adds cost and one more opportunity for something to
rescale the file. So the math lives in shared, tested modules; the app renders a
low-resolution proof; a local CLI writes the real file.

| Module | Responsibility | Depends on |
|---|---|---|
| `lib/lenticular/pitch.ts` | Pure math: `pxPerLens`, `frameIndexForColumn`, frame-budget validation, pitch-test ladder generation | nothing |
| `lib/lenticular/frames.ts` | Frame producers. `flipFrames(layers)` → 1:1 descriptors; `depthFrames(layers, n, maxParallaxIn)` → N descriptors with per-layer x-offsets. Returns descriptors, never pixels | types only |
| `lib/lenticular/interlace.ts` | Band-streaming column gather against a `RowSource` interface. No image library | `pitch.ts` |
| `lib/lenticular/sharp-adapter.ts` | The only file importing `sharp`. Implements `RowSource`, writes the TIFF | `interlace.ts` |
| `lib/lenticular/render-frames.ts` | Puppeteer adapter — renders frame descriptors to PNGs at target ppi, reusing `render.tsx` | existing export machinery |
| `lib/lenticular/quality.ts` | Lenticular print-readiness checks, feeding the existing quality panel | `pitch.ts`, `dimensions.ts` |
| `scripts/lenticular.ts` | CLI orchestrator, run as `npm run lenticular -- <projectId>` | all of the above |

Splitting `pitch.ts` from `interlace.ts` is what makes the risky part testable: the
math that decides whether a print succeeds has no I/O, so it is verified by fast
unit tests rather than by consuming a lens sheet.

## Data model

`PosterIntent` gains `"lenticular"` alongside `"art"` and `"document"`. The project
gains one optional field:

```ts
export interface LenticularSpec {
  mode: "flip" | "depth";
  nominalLpi: 50 | 100;
  truePitchLpi?: number;        // from the pitch test; print is blocked until set
  ribAxis: "vertical" | "horizontal";
  frameCount: number;           // 2 | 4 flip, 8 depth
  interlacePpi: number;         // 1200
  maxParallaxIn: number;        // depth mode: total travel of the nearest layer
  layers: LenticularLayer[];    // 2–3, ordered back to front
}

export interface LenticularLayer {
  assetId: string;
  depth: number;                // 0 = back, 1 = front
}
```

Layers reference assets from the existing upload and asset-generation paths. No new
image input plumbing.

## Data flow

1. User creates a lenticular project, picks mode and sheet, supplies 2–3 images.
2. App shows a low-resolution proof and lenticular print-readiness checks.
3. User prints the pitch-test page, measures true pitch, records it on the project.
4. `npm run lenticular -- <projectId>` renders frames with local Chrome, streams the
   interlace through sharp, and writes a 1200 ppi TIFF to disk.
5. User prints the TIFF at 100% scale, cuts a lens to size, laminates it aligned to
   the interlace direction.

## Error handling

Failures are cheap before the sheet is consumed and expensive after, so these are
hard blocks rather than warnings:

- Writing a print file with `truePitchLpi` unset. Overridable only via an explicit
  `--assume-nominal` flag, which exists so the first flip test can be printed before
  a pitch measurement exists.
- `pxPerFrame < 2` — frame count too high for the chosen pitch.
- Depth mode where any layer other than the rearmost lacks an alpha channel.
- Output pixel dimensions not exactly `round(artIn × ppi)`. This asserts the
  "never resize the interlaced file" guarantee rather than trusting it.

Warnings, surfaced in the existing quality panel:

- Source image effective ppi below 1200, computed with `blockEffectiveDpi()`.
- Depth mode with `maxParallaxIn` large enough that the rearmost layer's edge enters
  the art area, which would show a moving seam.

## Testing

- **Unit** — `frameIndexForColumn` at integer pitch (12.0) and fractional (12.036),
  asserting bounded error at column 9359, where accumulated drift would surface.
- **Golden** — interlace two 8 × 2 px solid frames at 4 px per lens; assert the exact
  output column pattern.
- **Property** — every output column maps to exactly one frame, and every frame
  appears exactly once per lens.
- **Physical** — the pitch-test page is the acceptance test for the whole chain.

## Sequencing

1. `pitch.ts` and its tests.
2. Pitch-test page generator.
3. *Print the pitch test and measure.* — physical step, blocks nothing before it.
4. Flip mode end to end, 2 frames × 6 px on the 100 LPI sheet.
5. Depth mode, 8 frames × 3 px on the 50 LPI sheet.

Step 3 is deliberately early: it is a plain-paper print that validates the optical
assumptions before any interlacing code exists.

## Out of scope

- Depth-map displacement from a single image. Needs a depth model and inpainting;
  the layered approach delivers depth without either.
- Retrofitting lenticular output onto existing `art` or `document` projects.
- Roll-fed lenticular. The sheets are 17.12 in and the tray path is sufficient.
- Automated pitch detection from a scan. Measuring by eye takes under a minute.
