import { Link } from "react-router-dom";
import { client } from "../lib/neonClient";

export default function TopBar({
  breadcrumb,
}: {
  breadcrumb?: { label: string; to?: string }[];
}) {
  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "18px 32px",
        borderBottom: "1px solid var(--border)",
        background: "var(--bg)",
        position: "sticky",
        top: 0,
        zIndex: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <Link to="/" style={{ display: "flex", alignItems: "center", gap: 10 }}>
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
            }}
          >
            P7
          </div>
          <span style={{ fontWeight: 700, fontSize: 14.5, color: "var(--ink)" }}>
            PIER7
          </span>
        </Link>
        {breadcrumb?.map((b, i) => (
          <span key={i} style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ color: "var(--ink-faint)", fontSize: 13 }}>/</span>
            {b.to ? (
              <Link to={b.to} style={{ fontSize: 13.5, color: "var(--ink-soft)", fontWeight: 500 }}>
                {b.label}
              </Link>
            ) : (
              <span style={{ fontSize: 13.5, color: "var(--ink)", fontWeight: 600 }}>
                {b.label}
              </span>
            )}
          </span>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Link to="/configuracoes" style={{ fontSize: 13, color: "var(--ink-soft)", fontWeight: 500 }}>
          Configurações
        </Link>
        <button
          onClick={() => client.auth.signOut().then(() => (window.location.href = "/login"))}
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: "7px 14px",
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
