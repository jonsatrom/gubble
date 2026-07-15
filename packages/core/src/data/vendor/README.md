# vendor/unicode-16.0.0/ — the frozen ruler

These two files are unmodified downloads from the Unicode Consortium's
public UCD mirror (`https://www.unicode.org/Public/16.0.0/ucd/`), fetched
2026-07-15:

- `EastAsianWidth.txt` — East_Asian_Width property assignments
- `emoji-data.txt` — Emoji properties, we consume `Emoji_Presentation`
- `DerivedGeneralCategory.txt` — General_Category assignments, we consume
  `Mn`/`Me` (combining marks) so the census can count zalgo stack-depth
  without `\p{M}` regexes, which defer to the engine's own ICU tables and
  would reopen the unversioned-ruler leak this directory exists to close

They are committed here **on purpose, unmodified, forever** — this is the
"freeze the ruler" ruling from the width-table interview (GUBBLE-SPEC.md
§19 RATIFIED, §5.1). gubble-core never fetches Unicode data live. A width
measurement taken today and a width measurement taken on the same input in
three years must agree, because Directive 1 ("determinism or death") does
not carve out an exception for "well, Unicode changed." If we ever
deliberately move to a newer Unicode version, that's a new subdirectory
here (`unicode-17.0.0/` etc.), a `measure` bump in the document header
format, and a decision worth a comment explaining why — not a silent
`npm update`.

`../generated/*.generated.ts` is what actually ships in `@gubble/core` —
these two `.txt` files are the receipts, kept so a future reader (including
future us) can verify the generated ranges without taking our word for it,
or re-run `scripts/vendor-unicode-data.mjs` against a different version.

License: these files are Unicode, Inc. data files, distributed under the
[Unicode License v3](https://www.unicode.org/license.txt) (formerly
"Unicode Terms of Use") — permits use, copy, modify, and distribution
provided the copyright/permission notice is retained. Both files carry
that notice in their own header comments; we haven't touched them.
