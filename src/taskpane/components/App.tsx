import * as React from "react";
import { useState } from "react";
import { Button, makeStyles, tokens } from "@fluentui/react-components";
import { FootnoteSnapshot, readFootnotes } from "../taskpane";

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
  const [message, setMessage] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [hasError, setHasError] = useState<boolean>(false);

  const handleReadFootnotes = async () => {
    setIsLoading(true);
    setHasError(false);
    setMessage("");

    try {
      const footnoteSnapshots = await readFootnotes();
      setFootnotes(footnoteSnapshots);

      if (footnoteSnapshots.length === 0) {
        setMessage("Das Dokument enthält keine Fußnoten.");
      }
    } catch (error) {
      setFootnotes([]);
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
            </article>
          ))}
        </section>
      </div>
    </main>
  );
};

export default App;
