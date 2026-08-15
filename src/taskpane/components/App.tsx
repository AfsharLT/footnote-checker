import * as React from "react";
import { Button, makeStyles, tokens } from "@fluentui/react-components";

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
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
  },
});

const App: React.FC = () => {
  const styles = useStyles();

  return (
    <main className={styles.root}>
      <div className={styles.content}>
        <h1 className={styles.title}>Footnote Checker</h1>
        <p className={styles.description}>Analyse und Prüfung juristischer Fußnoten</p>
        <Button className={styles.button} appearance="primary" size="large">
          Fußnoten auslesen
        </Button>
        <section className={styles.results} aria-label="Ergebnisse" />
      </div>
    </main>
  );
};

export default App;
