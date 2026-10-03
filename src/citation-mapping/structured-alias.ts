export const BEARBEITER_PLACEHOLDER = "{Bearbeiter}";

const BEARBEITER_PATTERN = String.raw`[A-ZÄÖÜ][\p{L}\p{M}'’.-]*(?:\s*\/\s*[A-ZÄÖÜ][\p{L}\p{M}'’.-]*)*`;

export interface StructuredAliasMatch {
  start: number;
  end: number;
  matchedText: string;
  bearbeiterText: string;
  bearbeiterStart: number;
  bearbeiterEnd: number;
  workText?: string;
  workStart?: number;
  workEnd?: number;
}

export interface CompiledStructuredAlias {
  alias: string;
  match(text: string): StructuredAliasMatch | undefined;
}

function escapeLiteral(value: string): string {
  return value
    .split(/(\s+)/u)
    .map((part) =>
      /^\s+$/u.test(part) ? String.raw`\s*` : part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    )
    .join("");
}

export function compileStructuredAlias(alias: string): CompiledStructuredAlias | undefined {
  const placeholderIndex = alias.indexOf(BEARBEITER_PLACEHOLDER);
  if (placeholderIndex < 0) return undefined;
  if (
    alias.indexOf(BEARBEITER_PLACEHOLDER, placeholderIndex + BEARBEITER_PLACEHOLDER.length) >= 0
  ) {
    return undefined;
  }
  const before = alias.slice(0, placeholderIndex);
  const after = alias.slice(placeholderIndex + BEARBEITER_PLACEHOLDER.length);
  const pattern = new RegExp(
    String.raw`^\s*${escapeLiteral(before)}(${BEARBEITER_PATTERN})${escapeLiteral(after)}(?=$|[\s,;.(§])`,
    "iu"
  );
  return {
    alias,
    match(text) {
      const result = pattern.exec(text);
      if (!result) return undefined;
      const leadingWhitespace = /^\s*/u.exec(result[0])?.[0].length ?? 0;
      const start = (result.index ?? 0) + leadingWhitespace;
      const end = (result.index ?? 0) + result[0].length;
      const prefix = new RegExp(String.raw`^\s*${escapeLiteral(before)}`, "iu").exec(result[0]);
      const bearbeiterStart = (result.index ?? 0) + (prefix?.[0].length ?? 0);
      const bearbeiterEnd = bearbeiterStart + result[1].length;
      const tail = text.slice(bearbeiterEnd, end);
      const workSeparator = /^\s*(?:,\s*in\s*:\s*|\/\s*)/iu.exec(tail);
      const prefixWork = /\/\s*$/u.test(before);
      const workStart = prefixWork
        ? start
        : workSeparator
          ? bearbeiterEnd + workSeparator[0].length
          : undefined;
      const workEnd = prefixWork
        ? bearbeiterStart - (/\/\s*$/u.exec(text.slice(start, bearbeiterStart))?.[0].length ?? 0)
        : workStart === undefined
          ? undefined
          : end;
      return {
        start,
        end,
        matchedText: text.slice(start, end),
        bearbeiterText: result[1],
        bearbeiterStart,
        bearbeiterEnd,
        ...(workStart !== undefined && workEnd !== undefined
          ? {
              workText: text.slice(workStart, workEnd),
              workStart,
              workEnd,
            }
          : {}),
      };
    },
  };
}
