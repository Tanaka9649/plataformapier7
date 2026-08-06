import React, { Suspense, lazy, Component } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import "./styles/tokens.css";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import RequireAuth from "./components/RequireAuth";
import { clientInitError } from "./lib/neonClient";

// Só o Dashboard e o Login entram no bundle inicial — as demais telas carregam sob demanda,
// igual já era feito com o CRM e Configurações.
const CompanyPage = lazy(() => import("./pages/CompanyPage"));
const ConfiguracoesPage = lazy(() => import("./pages/ConfiguracoesPage"));

// O CRM só deve carregar quando o usuário clicar em "Abrir CRM" — lazy load real.
const CrmPage = lazy(() => import("./pages/CrmPage"));

function PageLoadingFallback({ label = "Carregando…" }: { label?: string }) {
  return (
    <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ink-faint)", fontSize: 14 }}>
      {label}
    </div>
  );
}

class ErrorBoundary extends Component<{ children: React.ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("Erro capturado pela ErrorBoundary:", error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, maxWidth: 640, margin: "0 auto", fontFamily: "system-ui, sans-serif" }}>
          <h2 style={{ fontSize: 16, color: "#e0483f" }}>A plataforma encontrou um erro</h2>
          <pre
            style={{
              whiteSpace: "pre-wrap",
              fontSize: 12,
              background: "#fdecea",
              color: "#e0483f",
              padding: 12,
              borderRadius: 8,
            }}
          >
            {this.state.error.message}
            {"\n"}
            {this.state.error.stack}
          </pre>
          <p style={{ fontSize: 12, color: "#8592a8" }}>
            Copie esse texto e envie — isso diz exatamente o que travou.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

function Root() {
  if (clientInitError) {
    return (
      <div style={{ padding: 40, maxWidth: 640, margin: "0 auto", fontFamily: "system-ui, sans-serif" }}>
        <h2 style={{ fontSize: 16, color: "#e0483f" }}>Não foi possível iniciar a conexão com o banco</h2>
        <pre
          style={{
            whiteSpace: "pre-wrap",
            fontSize: 12,
            background: "#fdecea",
            color: "#e0483f",
            padding: 12,
            borderRadius: 8,
          }}
        >
          {clientInitError}
        </pre>
        <p style={{ fontSize: 12, color: "#8592a8" }}>
          Copie esse texto e envie — isso diz exatamente o que travou.
        </p>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <DashboardPage />
            </RequireAuth>
          }
        />
        <Route
          path="/empresa/:slug"
          element={
            <RequireAuth>
              <Suspense fallback={<PageLoadingFallback />}>
                <CompanyPage />
              </Suspense>
            </RequireAuth>
          }
        />
        <Route
          path="/empresa/:slug/crm"
          element={
            <RequireAuth>
              <Suspense fallback={<PageLoadingFallback label="Carregando CRM…" />}>
                <CrmPage />
              </Suspense>
            </RequireAuth>
          }
        />
        <Route
          path="/configuracoes"
          element={
            <RequireAuth>
              <Suspense fallback={<PageLoadingFallback />}>
                <ConfiguracoesPage />
              </Suspense>
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <Root />
    </ErrorBoundary>
  </React.StrictMode>
);
