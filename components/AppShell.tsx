import { useState } from "react";
import { Link } from "react-router-dom";
import { Menu } from "lucide-react";
import Sidebar from "./Sidebar";
import { useIsMobile } from "../lib/useIsMobile";

export default function AppShell({
  breadcrumb,
  children,
}: {
  breadcrumb?: { label: string; to?: string }[];
  children: React.ReactNode;
}) {
  const isMobile = useIsMobile();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} />
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        {(isMobile || (breadcrumb && breadcrumb.length > 0)) && (
          <header
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: isMobile ? "12px 16px" : "14px 24px",
              borderBottom: "1px solid var(--border)",
              background: "var(--bg)",
              position: "sticky",
              top: 0,
              zIndex: 20,
              boxShadow: "var(--shadow-xs)",
            }}
          >
            {isMobile && (
              <button
                onClick={() => setMobileOpen(true)}
                aria-label="Abrir menu"
                style={{ background: "none", border: "none", color: "var(--ink-soft)", display: "flex", flexShrink: 0 }}
              >
                <Menu size={20} />
              </button>
            )}
            {breadcrumb?.map((b, i) => (
              <span key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, minWidth: 0 }}>
                {i > 0 && <span style={{ color: "var(--ink-faint)" }}>/</span>}
                {b.to ? (
                  <Link to={b.to} style={{ color: "var(--ink-soft)", fontWeight: 500, whiteSpace: "nowrap" }}>
                    {b.label}
                  </Link>
                ) : (
                  <span style={{ color: "var(--ink)", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {b.label}
                  </span>
                )}
              </span>
            ))}
          </header>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
      </div>
    </div>
  );
}
