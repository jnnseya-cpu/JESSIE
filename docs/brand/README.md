# Brand — the mark

Extracted from source, not traced from a screenshot. The geometry here is
byte-identical to the shipped master: all four paths, the circle and every
stroke weight were compared against `apps/frontend/public/icons/mark.svg`
and match.

The mark is drawn in code, in two places that must stay in step:

- `apps/frontend/app/ui.tsx` — the `Mark()` component the site renders.
- `apps/frontend/public/icons/mark.svg` — the file the manifest and
  favicons point at.

Everything in this folder is derived from those. **If the mark ever
changes, change it there and regenerate these** — do not edit a file in
this folder by hand, or the website and the advertising will drift apart
and nobody will notice until both are in front of the same person.

## What the mark is

A quest ring open at the top right, a JM monogram drawn as strokes rather
than set in a font, and a route in the teal-to-lime Movement Energy
gradient that rises out through the gap and finishes above and beyond the
M. The journey continues past the letters rather than closing on them.

The letters are strokes, not type, so the mark renders identically
everywhere and needs no webfont to be correct.

Deliberately not: a heart, a weighing scale, a running figure, a medical
cross, a dumbbell, a footprint, an apple, or a pulse line.

## The files

| File | Background | Use it for |
| --- | --- | --- |
| `mark.svg` | Navy tile, baked in | **The default.** App icon, avatar, favicon, anywhere a container is wanted |
| `mark-on-dark.svg` | Transparent | Navy or dark photography. Letters are off-white |
| `mark-on-light.svg` | Transparent | White or pale photography. Letters are navy |
| `mark-mono-white.svg` | Transparent | Busy photography, embroidery, one-colour print |
| `mark-mono-navy.svg` | Transparent | Pale one-colour print |
| `lockup-on-light.svg` | Transparent | Mark plus wordmark, for light grounds |
| `lockup-on-dark.svg` | Transparent | Mark plus wordmark, for dark grounds |

PNGs sit beside each: marks at 512 and 1024 square, lockups at 1200 wide.
All transparent except `mark.svg`, which carries its own tile. For
anything print or large, use the SVG — it has no resolution.

## Choosing one, in one rule

**Put the mark on the ground it was drawn for, or it disappears.** The
monogram is off-white in the standard mark, so on a white background it
vanishes. That is not a fault to fix with a drop shadow; it is why
`mark-on-light` and `mark-mono-navy` exist.

For Facebook creative specifically: the five plate and movement images in
`facebook-ads-brief.md` are mostly mid-tone photography, so
`mark-mono-white.svg` is the safe default over an image, and
`lockup-on-light.svg` is right on the plain navy or white end cards.

## The lockup, and its proportions

Taken from `.brand` and `.brand__mark` in `globals.css`, at four times
the header size so it stays crisp:

- Mark 26px, an 11px gap, then the name at 16px.
- Inter, weight 600, letter-spacing −0.01em.
- The wordmark's cap-height is centred on the mark's centre. Measured in
  a browser after rendering, not assumed: drift 0.1px.

Inter is self-hosted in `apps/frontend/public/fonts`. The lockup SVGs
reference the family by name, so a tool without Inter installed will
substitute and the spacing will be wrong — **use the PNGs unless you have
Inter**, or convert the text to outlines in your design tool first.

## Clear space and minimum size

- **Clear space**: the height of the mark's own corner radius on every
  side. In the lockup files that space is already built into the canvas,
  so butting the artwork against something else still leaves it.
- **Minimum size**: 24px for the mark on screen, 10mm in print. Below
  that the ring's 1.8 stroke and the route's 2.8 stroke stop separating
  and it reads as a smudge.

## Do not

- Re-colour the route. The teal-to-lime gradient is the one element that
  carries meaning, and a flat fill removes it.
- Add a drop shadow or a glow to make a variant work on the wrong ground.
  Pick the right variant instead.
- Rotate, skew, outline, or set the monogram in an actual typeface.
- Put the navy-tiled `mark.svg` on a navy background. Use
  `mark-on-dark.svg`.
- Crop the ring. It is open at the top right on purpose.

## Regenerating

The variants are produced from one geometry string so a palette change
cannot make one drift from another. If the master changes, the five mark
SVGs and the two lockups are rebuilt from it, and the PNGs are rendered
through headless Chromium with Inter loaded from the repository. Verify
by eye on light, dark and photographic grounds before committing — the
first attempt at the lockups rendered without the mark at all and the
export reported success.
