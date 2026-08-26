import { formatReaderError } from "../../src/taskpane/reader-error";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function runReaderErrorTests(): void {
  const formatted = formatReaderError({
    name: "OfficeExtension.Error",
    code: "GeneralException",
    message: "A general exception occurred.",
    debugInfo: {
      errorLocation: "Range.getOoxml",
      statement: "context.sync()",
      surroundingStatements: ["range.getOoxml()", "context.sync()"],
    },
  });

  assert(formatted.includes("Name: OfficeExtension.Error"), "Error name must be displayed");
  assert(formatted.includes("Code: GeneralException"), "Error code must be displayed");
  assert(formatted.includes("Meldung: A general exception occurred."), "Message must be displayed");
  assert(formatted.includes("Fehlerstelle: Range.getOoxml"), "Location must be displayed");
  assert(formatted.includes("Anweisung: context.sync()"), "Statement must be displayed");
  assert(formatted.includes("Umgebung:"), "Surrounding statements must be displayed");

  const fallback = formatReaderError("unexpected");
  assert(
    fallback.includes("Fehler beim Auslesen der Fußnoten:"),
    "Fallback must retain the development heading"
  );
  assert(fallback.includes("Die Fußnoten konnten nicht"), "Fallback message must be understandable");
}

runReaderErrorTests();
