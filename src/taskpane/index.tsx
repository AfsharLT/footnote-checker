import * as React from "react";
import { createRoot } from "react-dom/client";
import App from "./components/App";
import { TaskpaneErrorBoundary } from "./components/TaskpaneErrorBoundary";
import { createLightTheme, FluentProvider, type BrandVariants } from "@fluentui/react-components";
import "./styles.css";

/* global document, Office, module, require, HTMLElement */

const rootElement: HTMLElement | null = document.getElementById("container");
const root = rootElement ? createRoot(rootElement) : undefined;
const footnoteCheckerBrand: BrandVariants = {
  10: "#03090b",
  20: "#081215",
  30: "#0c1a20",
  40: "#10242b",
  50: "#132930",
  60: "#152d35",
  70: "#173038",
  80: "#18313A",
  90: "#304851",
  100: "#496069",
  110: "#647c84",
  120: "#81979d",
  130: "#a1b4b9",
  140: "#c0cdd0",
  150: "#dde5e7",
  160: "#f3f6f7",
};
const footnoteCheckerTheme = createLightTheme(footnoteCheckerBrand);

function renderApplication(Component: React.ComponentType): void {
  root?.render(
    <FluentProvider className="fc-root-provider" theme={footnoteCheckerTheme}>
      <TaskpaneErrorBoundary>
        <Component />
      </TaskpaneErrorBoundary>
    </FluentProvider>
  );
}

/* Render application after Office initializes */
Office.onReady(() => {
  renderApplication(App);
});

if ((module as any).hot) {
  (module as any).hot.accept("./components/App", () => {
    const NextApp = require("./components/App").default;
    renderApplication(NextApp);
  });
}
