import {
  UnsupportedHostCapabilityError,
  unsupportedCapabilityTechnicalDetails,
} from "./host-capabilities";

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
  if (error instanceof UnsupportedHostCapabilityError) {
    return unsupportedCapabilityTechnicalDetails(error.capabilities);
  }
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
  const lines = ["Fehler beim Auslesen der Fußnoten:"];

  if (name) lines.push(`Name: ${compactDiagnostic(name)}`);
  if (code) lines.push(`Code: ${compactDiagnostic(code)}`);
  lines.push(`Meldung: ${compactDiagnostic(message)}`);
  if (errorLocation) lines.push(`Fehlerstelle: ${compactDiagnostic(errorLocation)}`);
  if (statement) lines.push(`Anweisung: ${compactDiagnostic(statement)}`);
  if (surroundingStatements.length > 0) {
    lines.push(`Umgebung: ${surroundingStatements.slice(0, 3).map(compactDiagnostic).join(" | ")}`);
  }

  return lines.join("\n");
}

export function readerErrorUserMessage(error: unknown): string {
  return error instanceof UnsupportedHostCapabilityError
    ? error.message
    : "Die Fußnoten konnten nicht vollständig verarbeitet werden. Bitte versuchen Sie es erneut.";
}
