import React from "react";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
    this.handleReset = this.handleReset.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("[ErrorBoundary] Uncaught render error:", error, errorInfo);
  }

  handleReset() {
    this.setState({ error: null });
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-screen w-full flex-col items-center justify-center gap-4 bg-slate-950 p-6 text-center text-white">
          <h1 className="text-lg font-semibold">Something went wrong</h1>
          <p className="max-w-md text-sm text-slate-400">
            {this.state.error?.message || "An unexpected error occurred while rendering this page."}
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={this.handleReset}
              className="rounded-md bg-slate-800 px-4 py-2 text-sm font-medium hover:bg-slate-700"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-500"
            >
              Reload page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
