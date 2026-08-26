import * as React from "react";
import { CircleAlert, RefreshCw, RotateCcw } from "lucide-react";
import { NeonButton } from "@/components/ui/neon-button";

interface TaskpaneErrorBoundaryState {
  error?: Error;
  componentStack?: string;
}

export class TaskpaneErrorBoundary extends React.Component<
  React.PropsWithChildren,
  TaskpaneErrorBoundaryState
> {
  state: TaskpaneErrorBoundaryState = {};

  static getDerivedStateFromError(error: unknown): TaskpaneErrorBoundaryState {
    return {
      error: error instanceof Error ? error : new Error("Unbekannter Oberflächenfehler"),
    };
  }

  componentDidCatch(_error: Error, info: React.ErrorInfo): void {
    this.setState({ componentStack: info.componentStack });
  }

  private retry = () => this.setState({ error: undefined, componentStack: undefined });

  render(): React.ReactNode {
    const { error, componentStack } = this.state;
    if (!error) return this.props.children;
    return (
      <main className="fc-app">
        <div className="fc-shell">
          <section className="fc-error-boundary" role="alert">
            <CircleAlert size={24} aria-hidden="true" />
            <div>
              <h1>Die Oberfläche konnte nicht angezeigt werden</h1>
              <p>Bitte versuchen Sie es erneut. Das Word-Dokument wurde dadurch nicht verändert.</p>
            </div>
            <div className="fc-error-boundary__actions">
              <NeonButton variant="primary" onClick={this.retry}>
                <RotateCcw size={16} aria-hidden="true" />
                Erneut versuchen
              </NeonButton>
              <NeonButton variant="secondary" onClick={() => window.location.reload()}>
                <RefreshCw size={16} aria-hidden="true" />
                Neu laden
              </NeonButton>
            </div>
            <details>
              <summary>Technische Details</summary>
              <pre className="fc-error-details">
                {[error.name, error.message, error.stack, componentStack]
                  .filter(Boolean)
                  .join("\n")}
              </pre>
            </details>
          </section>
        </div>
      </main>
    );
  }
}
