import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Building2, Settings, LogOut, ChevronsLeft, ChevronsRight, X } from "lucide-react";
import { client, getCurrentUserRole } from "../lib/neonClient";
import { useIsMobile } from "../lib/useIsMobile";

export default function Sidebar({
  mobileOpen,
  onCloseMobile,
}: {
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}) {
  const location = useLocation();
  const isMobile = useIsMobile();
  const [collapsed, setCollapsed] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    getCurrentUserRole().then((r) => setIsAdmin(r === "admin"));
  }, []);

  const items = [
    { to: "/", label: "Empresas", icon: Building2, active: location.pathname === "/" },
    ...(isAdmin
      ? [{ to: "/configuracoes", label: "Configurações", icon: Settings, active: location.pathname === "/configuracoes" }]
      : []),
  ];

  if (isMobile && !mobileOpen) return null;

  const width = !isMobile && collapsed ? 72 : 232;

  return (
    <>
      {isMobile && (
        <div
          onClick={onCloseMobile}
          style={{ position: "fixed", inset: 0, background: "rgba(16,26,46,0.45)", zIndex: 40 }}
        />
      )}
      <aside
        style={{
          position: isMobile ? "fixed" : "sticky",
          top: 0,
          left: 0,
          height: "100vh",
          width,
          flexShrink: 0,
          background: "var(--bg)",
          borderRight: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          zIndex: 50,
          transition: "width var(--duration-base) var(--ease)",
          boxShadow: isMobile ? "var(--shadow-xl)" : "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "18px 16px", borderBottom: "1px solid var(--border)", minHeight: 66 }}>
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              background: "var(--gradient-button)",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 700,
              fontSize: 12,
              flexShrink: 0,
              boxShadow: "var(--shadow-glow)",
            }}
          >
            P7
          </div>
          {(!collapsed || isMobile) && <span style={{ fontWeight: 700, fontSize: 14.5, color: "var(--ink)" }}>PIER7</span>}
          {isMobile && (
            <button
              onClick={onCloseMobile}
              aria-label="Fechar menu"
              style={{ marginLeft: "auto", background: "none", border: "none", color: "var(--ink-faint)", display: "flex" }}
            >
              <X size={18} />
            </button>
          )}
        </div>

        <nav style={{ flex: 1, padding: "12px 10px", display: "flex", flexDirection: "column", gap: 3 }}>
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={onCloseMobile}
                title={collapsed && !isMobile ? item.label : undefined}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "9px 12px",
                  borderRadius: 8,
                  fontSize: 13.5,
                  fontWeight: 600,
                  color: item.active ? "var(--blue-600)" : "var(--ink-soft)",
                  background: item.active ? "var(--blue-50)" : "transparent",
                  transition: "background var(--duration-fast) var(--ease), color var(--duration-fast) var(--ease)",
                }}
              >
                <Icon size={18} strokeWidth={2.1} style={{ flexShrink: 0 }} />
                {(!collapsed || isMobile) && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        <div style={{ padding: 10, borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 4 }}>
          <button
            onClick={() => client.auth.signOut().then(() => (window.location.href = "/login"))}
            aria-label="Sair da plataforma"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "9px 12px",
              borderRadius: 8,
              fontSize: 13.5,
              fontWeight: 600,
              color: "var(--ink-faint)",
              background: "none",
              border: "none",
              width: "100%",
              textAlign: "left",
            }}
          >
            <LogOut size={18} style={{ flexShrink: 0 }} />
            {(!collapsed || isMobile) && <span>Sair</span>}
          </button>
          {!isMobile && (
            <button
              onClick={() => setCollapsed((c) => !c)}
              aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "9px 12px",
                borderRadius: 8,
                fontSize: 12.5,
                color: "var(--ink-faint)",
                background: "none",
                border: "none",
              }}
            >
              {collapsed ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}
              {!collapsed && <span>Recolher</span>}
            </button>
          )}
        </div>
      </aside>
    </>
  );
}
