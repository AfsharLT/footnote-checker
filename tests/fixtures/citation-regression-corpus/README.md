# Citation regression corpus

`v1/footnotes.json` is the immutable text fixture extracted from the 80 real footnotes in
`Test Add Inn.docx`. Text is stored exactly as extracted from the WordprocessingML note paragraphs;
leading spaces, NBSPs, thin spaces, combining characters, malformed punctuation, and paragraph
offsets are intentional test data.

`v1/expectations.json` is the reviewed contract. Exact boundaries are asserted only where they are
currently defensible. Every other footnote explicitly uses `boundaryStatus: "uncertain"`; this is a
deliberate assertion that the case must remain in the corpus without inventing precise boundaries.
Fixture expectations must never be imported by production parsing code.

## Adding a case

1. Add a new version directory rather than rewriting a released corpus version.
2. Preserve the original `contentText` and paragraph offsets.
3. Add exact sequence, item, narrative, and qualifier spans only after verifying that
   `rawText === contentText.slice(start, end)`.
4. Use an explicit uncertainty reason when a stable boundary cannot yet be justified.
5. Add a focused production-independent assertion to `citation-regression-corpus.test.ts`.

POC 17.1 intentionally records `(Anm. X)` only as unresolved internal references. Source registry
and back-reference resolution belong to POC 17.2.
