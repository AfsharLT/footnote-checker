import * as React from "react";
import { createRoot } from "react-dom/client";
import App from "./components/App";
import {
  createLightTheme,
  FluentProvider,
  type BrandVariants,
} from "@fluentui/react-components";
import "./styles.css";

/* global document, Office, module, require, HTMLElement */

const rootElement: HTMLElement | null = document.getElementById("container");
const root = rootElement ? createRoot(rootElement) : undefined;
const footnoteCheckerBrand: BrandVariants = {
  10: "#000b1f",
  20: "#00102d",
  30: "#00163a",
  40: "#001d48",
  50: "#002456",
  60: "#002a65",
  70: "#003074",
  80: "#003381",
  90: "#1d4b91",
  100: "#3c63a1",
  110: "#597bb1",
  120: "#7694c2",
  130: "#94acd2",
  140: "#b2c5e2",
  150: "#d2def0",
  160: "#f1f5fb",
};
const footnoteCheckerTheme = createLightTheme(footnoteCheckerBrand);

/* Render application after Office initializes */
Office.onReady(() => {
  root?.render(
    <FluentProvider className="fc-root-provider" theme={footnoteCheckerTheme}>
      <App />
    </FluentProvider>
  );
});

if ((module as any).hot) {
  (module as any).hot.accept("./components/App", () => {
    const NextApp = require("./components/App").default;
    root?.render(NextApp);
  });
}
