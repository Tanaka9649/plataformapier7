import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { client, getCurrentUserRole } from "../lib/neonClient";
import { useIsMobile } from "../lib/useIsMobile";

export default function TopBar({
  breadcrumb,
}: {
  breadcrumb?: { label: string; to?: string }[];
}) {
  const isMobile = useIsMobile();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    getCurrentUserRole().then((r) => setIsAdmin(r === "admin"));
  }, []);

  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        padding: isMobile ? "12px 16px" : "18px 32px",
        borderBottom: "1px solid var(--border)",
        boxShadow: "var(--shadow-xs)",
        background: "var(--bg)",
        position: "sticky",
        top: 0,
        zIndex: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 8 : 14, overflowX: "auto", minWidth: 0 }}>
        <Link to="/" style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              background: "var(--blue-500)",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 700,
              fontSize: 12,
              flexShrink: 0,
            }}
          >
            P7
          </div>
          {!isMobile && <span style={{ fontWeight: 700, fontSize: 14.5, color: "var(--ink)" }}>PIER7</span>}
        </Link>
        {breadcrumb?.map((b, i) => (
          <span key={i} style={{ display: "flex", alignItems: "center", gap: isMobile ? 8 : 14, flexShrink: 0 }}>
            <span style={{ color: "var(--ink-faint)", fontSize: 13 }}>/</span>
            {b.to ? (
              <Link to={b.to} style={{ fontSize: 13.5, color: "var(--ink-soft)", fontWeight: 500, whiteSpace: "nowrap" }}>
                {b.label}
              </Link>
            ) : (
              <span style={{ fontSize: 13.5, color: "var(--ink)", fontWeight: 600, whiteSpace: "nowrap" }}>
                {b.label}
              </span>
            )}
          </span>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 6 : 10, flexShrink: 0 }}>
        {isAdmin && !isMobile && (
          <Link to="/configuracoes" style={{ fontSize: 13, color: "var(--ink-soft)", fontWeight: 500 }}>
            Configurações
          </Link>
        )}
        {isAdmin && isMobile && (
          <Link
            to="/configuracoes"
            title="Configurações"
            aria-label="Configurações"
            style={{
              width: 32,
              height: 32,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 8,
              border: "1px solid var(--border)",
              fontSize: 14,
              color: "var(--ink-soft)",
            }}
          >
            ⚙
          </Link>
        )}
        <button
          onClick={() => client.auth.signOut().then(() => (window.location.href = "/login"))}
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: isMobile ? "7px 10px" : "7px 14px",
            fontSize: 13,
            color: "var(--ink-soft)",
            fontWeight: 500,
          }}
        >
          Sair
        </button>
      </div>
    </header>
  );
}
