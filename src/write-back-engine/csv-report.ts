import {
  WRITEBACK_REPORT_HEADERS,
  type WriteBackReportHeader,
  type WriteBackReportRow,
} from "./batch-report";

const UTF8_BOM = "\ufeff";

function neutralizeFormula(value: string): string {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

function quoteCsvField(value: string): string {
  return `"${neutralizeFormula(value).replace(/"/g, '""')}"`;
}

export function serializeWriteBackReportCsv(rows: readonly WriteBackReportRow[]): string {
  const serialize = (values: readonly string[]) => values.map(quoteCsvField).join(";");
  const header = serialize(WRITEBACK_REPORT_HEADERS);
  const body = rows.map((row) =>
    serialize(WRITEBACK_REPORT_HEADERS.map((column: WriteBackReportHeader) => row[column]))
  );
  return `${UTF8_BOM}${[header, ...body].join("\r\n")}`;
}

function twoDigits(value: number): string {
  return String(value).padStart(2, "0");
}

export function writeBackReportFileName(date = new Date()): string {
  return `Footnote-Checker-Bericht-${date.getFullYear()}-${twoDigits(
    date.getMonth() + 1
  )}-${twoDigits(date.getDate())}-${twoDigits(date.getHours())}${twoDigits(date.getMinutes())}.csv`;
}
