import type { CsvParseResult, LegacyMappingParseResult, LegacyWorkMappingRow } from "./types";

export function parseSemicolonCsv(csvText: string): CsvParseResult {
  const text = csvText.charCodeAt(0) === 0xfeff ? csvText.slice(1) : csvText;
  const rows: string[][] = [];
  const errors: string[] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const finishField = (): void => {
    row.push(field);
    field = "";
  };
  const finishRow = (): void => {
    finishField();
    rows.push(row);
    row = [];
  };

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (inQuotes && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (character === ";" && !inQuotes) {
      finishField();
    } else if ((character === "\r" || character === "\n") && !inQuotes) {
      finishRow();
      if (character === "\r" && text[index + 1] === "\n") index += 1;
    } else {
      field += character;
    }
  }

  if (inQuotes) errors.push("CSV contains an unterminated quoted field");
  if (field.length > 0 || row.length > 0) finishRow();

  return { success: errors.length === 0, rows, errors };
}

export function encodeSemicolonCsvRow(values: readonly string[]): string {
  return values
    .map((value) => {
      const escaped = value.replace(/"/g, '""');
      return /[;"\r\n]/.test(value) ? `"${escaped}"` : escaped;
    })
    .join(";");
}

function isEmptyRow(row: readonly string[]): boolean {
  return row.every((field) => field.trim() === "");
}

function legacyRow(fields: readonly string[]): LegacyWorkMappingRow {
  return {
    mappingId: fields[0],
    workType: fields[1],
    legalArea: fields[2],
    canonicalCitation: fields[3],
    searchVariant: fields[4],
    searchMode: fields[5],
    wholeWord: fields[6],
    analysisAction: fields[7],
    reviewAction: fields[8],
    correctionAction: fields[9],
    safetyLevel: fields[10],
    automaticCorrectionAllowed: fields[11],
    commentCode: fields[12],
    examplePattern: fields[13],
    notes: fields[14],
    active: fields[15],
    version: fields[16],
    date: fields[17],
  };
}

export function parseLegacyWorkMappingCsv(csvText: string): LegacyMappingParseResult {
  const parsed = parseSemicolonCsv(csvText);
  const errors = [...parsed.errors];
  const nonEmptyRows = parsed.rows.filter((row) => !isEmptyRow(row));
  if (nonEmptyRows.length === 0) {
    return { success: false, rows: [], errors: [...errors, "Legacy CSV is empty"] };
  }

  const header = nonEmptyRows[0];
  if (header.length !== 18)
    errors.push(`Legacy CSV header has ${header.length}; expected 18 columns`);

  const rows: LegacyWorkMappingRow[] = [];
  nonEmptyRows.slice(1).forEach((fields, rowIndex) => {
    if (fields.length !== 18) {
      errors.push(`Legacy CSV row ${rowIndex + 2} has ${fields.length}; expected 18 columns`);
      return;
    }
    rows.push(legacyRow(fields));
  });

  return { success: errors.length === 0, rows, errors };
}
