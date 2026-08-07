import React, { Suspense, lazy, Component } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import "./styles/tokens.css";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import RequireAuth from "./components/RequireAuth";
import RequireAdmin from "./components/RequireAdmin";
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
          <p style={{ fontSize: 12, color: "#8592a8", marginBottom: 16 }}>
            Copie esse texto e envie — isso diz exatamente o que travou.
          </p>
          <button
            onClick={() => window.location.assign("/")}
            style={{
              background: "#3068e8",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "9px 18px",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Voltar pro início
          </button>
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
              <RequireAdmin>
                <Suspense fallback={<PageLoadingFallback />}>
                  <ConfiguracoesPage />
                </Suspense>
              </RequireAdmin>
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
