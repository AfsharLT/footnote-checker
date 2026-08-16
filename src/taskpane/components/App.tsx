import * as React from "react";
import { useState } from "react";
import { Button, makeStyles, tokens } from "@fluentui/react-components";
import {
  CharacterFormat,
  DocumentFormattingSnapshot,
  FootnoteReadResult,
  FootnoteSnapshot,
  FormattingRun,
  readFootnotes,
} from "../taskpane";

function formatBoolean(value: boolean | undefined): string {
  if (value === undefined) {
    return "Nicht verfügbar";
  }

  return value ? "Ja" : "Nein";
}

function formatValue(value: string | number | null | undefined): string {
  return value === undefined || value === null || value === "" ? "–" : value.toString();
}

const characterFormatLabels: Record<keyof CharacterFormat, string> = {
  fontName: "Font",
  fontSize: "Size",
  bold: "Bold",
  italic: "Italic",
  underline: "Underline",
  strikeThrough: "Strike",
  superscript: "Superscript",
  subscript: "Subscript",
  fontColor: "Color",
  highlightColor: "Highlight",
  characterSpacing: "Character Spacing",
};

function formatCharacterValue(
  property: keyof CharacterFormat,
  value: CharacterFormat[keyof CharacterFormat]
): string {
  if (value === undefined) {
    return "unavailable";
  }

  if (value === "" || value === "Mixed" || (value === null && property !== "highlightColor")) {
    return "mixed";
  }

  if (value === null) {
    return "none";
  }

  if (typeof value === "boolean") {
    return value.toString();
  }

  const unit = property === "fontSize" || property === "characterSpacing" ? " pt" : "";
  return `${value}${unit}`;
}

function describeFormattingRun(run: FormattingRun): string {
  return (Object.keys(characterFormatLabels) as Array<keyof CharacterFormat>)
    .filter((property) => Object.prototype.hasOwnProperty.call(run, property))
    .map(
      (property) =>
        `${characterFormatLabels[property]}: ${formatCharacterValue(property, run[property])}`
    )
    .join(" · ");
}

const useStyles = makeStyles({
  root: {
    minHeight: "100vh",
    boxSizing: "border-box",
    padding: "40px 24px",
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorNeutralForeground1,
  },
  content: {
    maxWidth: "520px",
    margin: "0 auto",
  },
  title: {
    margin: "0 0 8px",
    color: "#12355b",
    fontSize: "28px",
    lineHeight: "36px",
    fontWeight: tokens.fontWeightSemibold,
  },
  description: {
    margin: "0 0 28px",
    color: tokens.colorNeutralForeground2,
    fontSize: tokens.fontSizeBase400,
    lineHeight: tokens.lineHeightBase400,
  },
  button: {
    width: "100%",
    minHeight: "44px",
    backgroundColor: "#12355b",
    color: tokens.colorNeutralForegroundOnBrand,
    ":hover": {
      backgroundColor: "#0d2947",
    },
    ":hover:active": {
      backgroundColor: "#091f36",
    },
  },
  results: {
    minHeight: "180px",
    marginTop: "24px",
    padding: "20px",
    boxSizing: "border-box",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  resultItem: {
    ":not(:last-child)": {
      marginBottom: "24px",
      paddingBottom: "24px",
      borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    },
  },
  resultTitle: {
    margin: "0 0 8px",
    color: "#12355b",
    fontSize: tokens.fontSizeBase400,
    lineHeight: tokens.lineHeightBase400,
    fontWeight: tokens.fontWeightSemibold,
  },
  resultText: {
    margin: "4px 0 0",
    color: tokens.colorNeutralForeground1,
    fontSize: tokens.fontSizeBase300,
    lineHeight: tokens.lineHeightBase400,
    whiteSpace: "pre-wrap",
  },
  message: {
    margin: 0,
    color: tokens.colorNeutralForeground2,
  },
  error: {
    margin: 0,
    color: tokens.colorPaletteRedForeground1,
  },
});

const App: React.FC = () => {
  const styles = useStyles();
  const [footnotes, setFootnotes] = useState<FootnoteSnapshot[]>([]);
  const [documentFormatting, setDocumentFormatting] = useState<DocumentFormattingSnapshot | null>(
    null
  );
  const [readerMetrics, setReaderMetrics] = useState<FootnoteReadResult["readerMetrics"] | null>(
    null
  );
  const [message, setMessage] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [hasError, setHasError] = useState<boolean>(false);

  const handleReadFootnotes = async () => {
    setIsLoading(true);
    setHasError(false);
    setMessage("");
    setReaderMetrics(null);

    try {
      const result = await readFootnotes();
      setFootnotes(result.footnotes);
      setDocumentFormatting(result.documentFormatting);
      setReaderMetrics(result.readerMetrics);

      if (result.footnotes.length === 0) {
        setMessage("Das Dokument enthält keine Fußnoten.");
      }
    } catch (error) {
      setFootnotes([]);
      setDocumentFormatting(null);
      setReaderMetrics(null);
      setHasError(true);
      setMessage(
        error instanceof Error
          ? error.message
          : "Die Fußnoten konnten nicht ausgelesen werden. Bitte versuchen Sie es erneut."
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className={styles.root}>
      <div className={styles.content}>
        <h1 className={styles.title}>Footnote Checker</h1>
        <p className={styles.description}>Analyse und Prüfung juristischer Fußnoten</p>
        <Button
          className={styles.button}
          appearance="primary"
          size="large"
          disabled={isLoading}
          onClick={handleReadFootnotes}
        >
          {isLoading ? "Fußnoten werden ausgelesen …" : "Fußnoten auslesen"}
        </Button>
        <section className={styles.results} aria-label="Ergebnisse" aria-live="polite">
          {message && <p className={hasError ? styles.error : styles.message}>{message}</p>}
          {readerMetrics && (
            <article className={styles.resultItem}>
              <h2 className={styles.resultTitle}>Reader</h2>
              <p className={styles.resultText}>Fußnoten: {readerMetrics.footnoteCount}</p>
              <p className={styles.resultText}>Dauer: {readerMetrics.durationMs} ms</p>
              <p className={styles.resultText}>
                complete: {readerMetrics.completeCount} · partial: {readerMetrics.partialCount} ·
                failed: {readerMetrics.failedCount}
              </p>
            </article>
          )}
          {documentFormatting && (
            <article className={styles.resultItem}>
              <h2 className={styles.resultTitle}>Dokumentformatierung</h2>
              <p className={styles.resultText}>
                Automatische Silbentrennung: {formatBoolean(documentFormatting.autoHyphenation)}
              </p>
              <p className={styles.resultText}>
                Großbuchstaben trennen: {formatBoolean(documentFormatting.hyphenateCaps)}
              </p>
              <p className={styles.resultText}>
                Aufeinanderfolgende Trennstriche:{" "}
                {formatValue(documentFormatting.consecutiveHyphensLimit)}
              </p>
              <p className={styles.resultText}>
                Silbentrennungszone: {formatValue(documentFormatting.hyphenationZone)}
              </p>
            </article>
          )}
          {footnotes.map((footnote) => (
            <article className={styles.resultItem} key={footnote.id}>
              <h2 className={styles.resultTitle}>Fußnote {footnote.ordinal}</h2>
              <p className={styles.resultText}>ID: {footnote.id}</p>
              <p className={styles.resultText}>
                Label: {footnote.displayLabel || "Nicht verfügbar"}
              </p>
              <p className={styles.resultText}>Text: {footnote.contentText}</p>
              <p className={styles.resultText}>Länge: {footnote.contentLength}</p>
              <p className={styles.resultText}>Hash: {footnote.originalTextHash}</p>
              <p className={styles.resultText}>Read Status: {footnote.readStatus}</p>
              {footnote.readWarnings.length === 0 ? (
                <p className={styles.resultText}>Warnings: keine</p>
              ) : (
                <div className={styles.resultText}>
                  Warnings:
                  <ul>
                    {footnote.readWarnings.map((warning) => (
                      <li key={warning.code}>{warning.code}</li>
                    ))}
                  </ul>
                </div>
              )}
              <p className={styles.resultText}>Kontext davor: {footnote.locator.contextBefore}</p>
              <p className={styles.resultText}>Kontext danach: {footnote.locator.contextAfter}</p>
              {footnote.locator.paragraphIndex !== undefined && (
                <p className={styles.resultText}>Absatzindex: {footnote.locator.paragraphIndex}</p>
              )}
              <p className={styles.resultText}>Absätze: {footnote.paragraphCount}</p>
              <div className={styles.resultText}>
                Geschützte Strukturen:
                <ul>
                  <li>Hyperlinks: {footnote.hyperlinks.length}</li>
                  <li>Fields: {footnote.fields.length}</li>
                  <li>Bookmarks: {footnote.bookmarks.length}</li>
                  <li>Content Controls: {footnote.contentControls.length}</li>
                </ul>
              </div>
              {footnote.protectedRanges.length === 0 ? (
                <p className={styles.resultText}>Protected Ranges: keine</p>
              ) : (
                <div className={styles.resultText}>
                  Protected Ranges:
                  <ul>
                    {footnote.protectedRanges.map((range, rangeIndex) => (
                      <li key={`${range.type}-${range.start}-${range.end}-${rangeIndex}`}>
                        {range.type} [{range.start}, {range.end})
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {footnote.hyperlinks.length === 0 ? (
                <p className={styles.resultText}>Hyperlinks: keine</p>
              ) : (
                <div className={styles.resultText}>
                  Hyperlinks:
                  <ul>
                    {footnote.hyperlinks.map((hyperlink, hyperlinkIndex) => (
                      <li key={`${hyperlink.target}-${hyperlinkIndex}`}>
                        {hyperlink.displayText}: {hyperlink.target}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className={styles.resultText}>
                Base Format:
                <ul>
                  {(Object.keys(characterFormatLabels) as Array<keyof CharacterFormat>).map(
                    (property) => (
                      <li key={property}>
                        {characterFormatLabels[property]}:{" "}
                        {formatCharacterValue(property, footnote.baseCharacterFormat?.[property])}
                      </li>
                    )
                  )}
                </ul>
              </div>
              <p className={styles.resultText}>
                {footnote.formattingRuns.length === 0
                  ? "Formatting Runs: keine Abweichungen"
                  : `Formatting Runs: ${footnote.formattingRuns.length}`}
              </p>
              {footnote.formattingRuns.map((run, runIndex) => (
                <p className={styles.resultText} key={`${run.start}-${run.end}-${runIndex}`}>
                  Run {runIndex + 1}: [{run.start}, {run.end}) · {describeFormattingRun(run)}
                </p>
              ))}
              {footnote.paragraphFormats.map((paragraph) => (
                <p className={styles.resultText} key={`paragraph-format-${paragraph.index}`}>
                  Absatz {paragraph.index + 1}: Style {formatValue(paragraph.styleName)} ·
                  Zeilenabstand {formatValue(paragraph.lineSpacing)} · Vor/Nach{" "}
                  {formatValue(paragraph.spaceBefore)}/{formatValue(paragraph.spaceAfter)} · Einzüge
                  L/R/Erste {formatValue(paragraph.leftIndent)}/{formatValue(paragraph.rightIndent)}
                  /{formatValue(paragraph.firstLineIndent)} · Ausrichtung{" "}
                  {formatValue(paragraph.alignment)}
                </p>
              ))}
            </article>
          ))}
        </section>
      </div>
    </main>
  );
};

export default App;
