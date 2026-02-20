import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, message: error?.message || "Error de render" };
  }

  componentDidCatch(error) {
    // eslint-disable-next-line no-console
    console.error("UI crash:", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: "100vh", background: "#0d0f10", color: "#f4f4f5", padding: "24px" }}>
          <h1 style={{ color: "#cc5a17", fontSize: "20px", marginBottom: "10px" }}>
            Error en la interfaz
          </h1>
          <p style={{ marginBottom: "8px" }}>
            {this.state.message}
          </p>
          <p style={{ color: "#a1a1aa" }}>
            Revisar la consola del navegador (F12) para el stack completo.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
