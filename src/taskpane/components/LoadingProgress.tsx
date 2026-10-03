/* global window, performance */
import * as React from "react";
import { useEffect, useState } from "react";
import { Progress } from "@/components/ui/progress";
import type { LoadingDisplay } from "../loading-progress";

// The heartbeat renders only this small panel, never the result list.
export function LoadingProgress({ display }: { display: LoadingDisplay }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    setSeconds(0);
    if (!display.active) return undefined;
    const startedAt = performance.now();
    const timer = window.setInterval(
      () => setSeconds(Math.floor((performance.now() - startedAt) / 1000)),
      100
    );
    const stopHeartbeat = () => window.clearInterval(timer);
    window.addEventListener("pagehide", stopHeartbeat);
    return () => {
      stopHeartbeat();
      window.removeEventListener("pagehide", stopHeartbeat);
    };
  }, [display.active]);
  return (
    <section className="fc-progress-panel" aria-label="Status der Fußnotenprüfung">
      <strong role="status" aria-live="polite" aria-atomic="true">
        {display.label}
      </strong>
      <Progress
        value={display.percent}
        active={display.active}
        label="Fortschritt der Fußnotenprüfung"
      />
      <span>
        {display.detail} · {display.percent} %
      </span>
      {display.active && (
        <span className="fc-progress-activity">
          <span className="fc-activity-dot" aria-hidden="true" />
          {seconds >= 8
            ? `Verarbeitung läuft weiter · ${seconds} s`
            : `Verarbeitung läuft · ${seconds} s`}
        </span>
      )}
    </section>
  );
}
