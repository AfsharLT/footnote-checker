type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | undefined {
  return typeof value === "object" && value !== null ? (value as UnknownRecord) : undefined;
}

function readString(record: UnknownRecord | undefined, key: string): string | undefined {
  const value = record?.[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function compactDiagnostic(value: string): string {
  const compacted = value.replace(/\s+/g, " ").trim();
  return compacted.length <= 300 ? compacted : `${compacted.slice(0, 297)}...`;
}

export function formatReaderError(error: unknown): string {
  const errorRecord = asRecord(error);
  const debugInfo = asRecord(errorRecord?.debugInfo);
  const name = readString(errorRecord, "name");
  const code = readString(errorRecord, "code") ?? readString(debugInfo, "code");
  const message =
    readString(errorRecord, "message") ??
    readString(debugInfo, "message") ??
    "Die Fußnoten konnten nicht ausgelesen werden.";
  const errorLocation = readString(debugInfo, "errorLocation");
  const statement = readString(debugInfo, "statement");
  const surroundingStatements = Array.isArray(debugInfo?.surroundingStatements)
    ? debugInfo.surroundingStatements.filter(
        (item): item is string => typeof item === "string" && item.length > 0
      )
    : [];
  const lines = ["Reader-Fehler:"];

  if (name) lines.push(`Name: ${compactDiagnostic(name)}`);
  if (code) lines.push(`Code: ${compactDiagnostic(code)}`);
  lines.push(`Message: ${compactDiagnostic(message)}`);
  if (errorLocation) lines.push(`Debug Location: ${compactDiagnostic(errorLocation)}`);
  if (statement) lines.push(`Statement: ${compactDiagnostic(statement)}`);
  if (surroundingStatements.length > 0) {
    lines.push(
      `Surrounding: ${surroundingStatements.slice(0, 3).map(compactDiagnostic).join(" | ")}`
    );
  }

  return lines.join("\n");
}
