# Typefaces

Inter and Manrope, self-hosted.

`globals.css` named these two families from the start and nothing ever
loaded them: no `@font-face`, no `next/font`, no stylesheet link. Every
visitor got Arial or Liberation Sans wearing tracking measured for Inter,
and every italic was a browser-synthesised oblique rather than a drawn
one. These files are the design system's §8 actually being delivered.

## Why the files are in the repository

A webfont CDN sends every visitor's IP address to a third party on every
page load — including behind the login and on the health surfaces, where
this platform allows no measurement at all. Self-hosting also means the
build cannot fail because a font host is unreachable, and means the
`@font-face` declarations can carry `unicode-range`, so a reader who
never types a Latin Extended character never downloads that file.

## What is here

| File | Family | Style | Subset |
| --- | --- | --- | --- |
| `inter-latin.woff2` | Inter | roman, weight 300–800, optical size 14–32 | Latin |
| `inter-latin-ext.woff2` | Inter | roman | Latin Extended |
| `inter-italic-latin.woff2` | Inter | italic | Latin |
| `inter-italic-latin-ext.woff2` | Inter | italic | Latin Extended |
| `manrope-latin.woff2` | Manrope | roman, weight 400–800 | Latin |
| `manrope-latin-ext.woff2` | Manrope | roman | Latin Extended |

All six are the variable builds, which is why `font-optical-sizing: auto`
and a weight *range* in the `@font-face` blocks do anything at all.

## Replacing one

The URLs are not content-hashed, and `vercel.json` serves them
`immutable` for a year. **Rename the file when you replace it**, or a
returning reader keeps the old one until the cache expires.

After replacing, re-measure the metric-matched fallback:

    node scripts/measure-fallback.mjs

and paste the four values into the `* Fallback` `@font-face` blocks at the
top of `globals.css`. Those are what stop the page reflowing when the
webfont swaps in, and they are specific to the file.

## Licences

Both families are the SIL Open Font License 1.1, which permits
self-hosting and redistribution, including commercially, provided the
licence travels with the files. It is here: `inter-OFL.txt`,
`manrope-OFL.txt`.
