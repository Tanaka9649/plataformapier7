import { useEffect, useState } from "react";
import { getCurrentUserRole } from "../lib/neonClient";

/**
 * Camada de UX — a checagem REAL de segurança está no banco (RLS via is_admin()
 * nas tabelas companies, crm_pipelines, crm_stages, crm_custom_fields, app_users).
 * Isto aqui só evita mostrar a tela de Configurações pra quem não é admin;
 * mesmo que alguém burle isso, as escritas seriam recusadas pelo Postgres.
 */
export default function RequireAdmin({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<"admin" | "operator" | "checking">("checking");

  useEffect(() => {
    let cancelled = false;
    getCurrentUserRole().then((r) => {
      // se não conseguir determinar o papel, trata como não-admin (falha fechado)
      if (!cancelled) setRole(r ?? "operator");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (role === "checking") {
    return (
      <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ink-faint)", fontSize: 14 }}>
        Verificando permissão…
      </div>
    );
  }

  if (role !== "admin") {
    return (
      <div
        style={{
          height: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          padding: 24,
          textAlign: "center",
        }}
      >
        <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--ink)", margin: 0 }}>Acesso restrito</h2>
        <p style={{ fontSize: 13, color: "var(--ink-faint)", maxWidth: 320, margin: 0 }}>
          Só administradores podem acessar Configurações. Fale com um admin da sua equipe se precisar de alguma
          mudança aqui.
        </p>
        <a href="/" style={{ fontSize: 13, color: "var(--blue-500)", fontWeight: 600 }}>
          Voltar pro início
        </a>
      </div>
    );
  }

  return <>{children}</>;
}
