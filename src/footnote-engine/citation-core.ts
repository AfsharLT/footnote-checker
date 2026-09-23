const PERSON_TOKEN = String.raw`[A-ZÄÖÜ][\p{L}\p{M}'’.-]*`;
const PERSON_SEQUENCE = String.raw`${PERSON_TOKEN}(?:\s*\/\s*${PERSON_TOKEN})*`;
const JOURNAL_TOKEN = String.raw`(?:NJW|NStZ(?:-RR)?|JZ|JuS|JA|JR|StV|wistra|ZfIStW|KriPoZ|ZStW|GA|MDR|ZIP|NZG|GmbHR|DStR|DStZ|BB|NZWiSt|Jahrbuch\s+für\s+Recht\s+und\s+Ethik)`;

const STRONG_CITATION_OPENINGS: readonly RegExp[] = [
  new RegExp(
    String.raw`^${PERSON_SEQUENCE}\s*,\s*${JOURNAL_TOKEN}\s+(?:19|20)\d{2}\s*,\s*\d+`,
    "iu"
  ),
  new RegExp(String.raw`^${PERSON_SEQUENCE}\s*,\s*in\s*:\s*[^;]{2,120}(?:§§?|Art\.)\s*\d`, "iu"),
  new RegExp(
    String.raw`^[^,;]{2,80}\/${PERSON_SEQUENCE}\s*,[^;]{0,120}(?:Rn\.|Rdn\.?|Rdnr\.)\s*\d`,
    "iu"
  ),
  new RegExp(
    String.raw`^${PERSON_SEQUENCE}\s*,\s*[^,;]{2,100},\s*(?:\d+\.\s*Aufl\.\s*)?(?:19|20)\d{2}\s*,\s*S\.\s*\d`,
    "iu"
  ),
];

export function hasStrongCitationCoreOpening(value: string): boolean {
  const candidate = value.trimStart();
  return STRONG_CITATION_OPENINGS.some((pattern) => pattern.test(candidate));
}

function hasExistingCitationEvidence(value: string): boolean {
  return (
    /(?:§§?|Art\.)\s*\d/iu.test(value) ||
    /\b(?:Rn\.|Rdn\.?|Rdnr\.|S\.)\s*\d/iu.test(value) ||
    /\(\s*Anm\.\s*\d+\s*\)/iu.test(value) ||
    new RegExp(String.raw`\b${JOURNAL_TOKEN}\s+(?:19|20)\d{2}\s*,\s*\d+`, "iu").test(value)
  );
}

/**
 * Finds a source-local citation start only when the text after a colon has a
 * strong bibliographic grammar. The returned offset is absolute in the
 * FootnoteSnapshot.contentText coordinate system.
 */
export function findLocalCitationCoreStart(text: string, start: number, end: number): number {
  let candidateStart = start;
  for (let index = start; index < end; index += 1) {
    if (text[index] !== ":") continue;
    let afterColon = index + 1;
    while (afterColon < end && /\s/u.test(text[afterColon])) afterColon += 1;
    if (
      afterColon < end &&
      !hasExistingCitationEvidence(text.slice(candidateStart, index)) &&
      hasStrongCitationCoreOpening(text.slice(afterColon, end))
    ) {
      candidateStart = afterColon;
    }
  }
  return candidateStart;
}
