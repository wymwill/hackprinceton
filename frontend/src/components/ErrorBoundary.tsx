import { Component, type ErrorInfo, type ReactNode } from "react";
import { useLocation } from "react-router-dom";

type Props = { children: ReactNode; resetKey?: string };
type State = { error: Error | null };

/**
 * Catches a crash while drawing a screen and shows a way out, instead of a blank page.
 * Changing `resetKey` (the route) clears it, so moving to another screen tries again.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Screen crashed:", error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="boot" role="alert">
        <span className="brand-name">Bookie</span>
        <section className="panel tagged" style={{ width: "min(440px, 100%)", textAlign: "left" }}>
          <span className="plabel">Something went wrong</span>
          <div className="pbody stack">
            <p>This screen hit an error and couldn't load. Your coins and bets are safe: they're kept on the server.</p>
            <div className="row">
              <button type="button" className="btn primary" onClick={() => window.location.reload()}>
                Reload
              </button>
              <a className="btn ghost" href="/">
                Go home
              </a>
            </div>
            <details className="hint">
              <summary>Details</summary>
              <code style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{this.state.error.message}</code>
            </details>
          </div>
        </section>
      </div>
    );
  }
}

/** The boundary for screens: navigating to another page clears the error. */
export function RouteErrorBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return <ErrorBoundary resetKey={pathname}>{children}</ErrorBoundary>;
}
