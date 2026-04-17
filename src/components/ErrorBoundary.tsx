import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  /** Rendered when an error is caught. Receives a "try again" callback that resets the boundary. */
  fallback?: (args: { error: Error; reset: () => void }) => ReactNode;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches render errors in the subtree and shows a friendly fallback.
 *
 * We intentionally do not surface the underlying error message to the user —
 * those can leak internal details. The original error is logged to the console
 * with a stable shape so future RUM/observability wiring can pick it up.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[ui] render error", {
      name: error.name,
      message: error.message,
      componentStack: info.componentStack,
    });
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    if (this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback({ error: this.state.error, reset: this.reset });
      }
      return (
        <div className="error-fallback" role="alert">
          <h2 className="error-fallback-title">Something went wrong.</h2>
          <p className="error-fallback-text">
            The page hit an unexpected error. You can try again, or navigate
            elsewhere using the menu above.
          </p>
          <button type="button" className="btn" onClick={this.reset}>
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
