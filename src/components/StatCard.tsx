export default function StatCard({
  label,
  value,
  hint,
  delta,
}: {
  label: string;
  value: string;
  hint?: string;
  /** variação percentual vs. período anterior; null = sem base de comparação (período anterior sem dados) */
  delta?: number | null;
}) {
  return (
    <div
      style={{
        background: "var(--bg)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        padding: "18px 20px",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div style={{ fontSize: 12, color: "var(--ink-faint)", fontWeight: 500, marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <div style={{ fontSize: 24, fontWeight: 700, color: "var(--ink)", fontFamily: "var(--font-mono)" }}>
          {value}
        </div>
        {delta !== undefined && delta !== null && Number.isFinite(delta) && (
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: delta > 0 ? "var(--green-500)" : delta < 0 ? "var(--red-500)" : "var(--ink-faint)",
            }}
          >
            {delta > 0 ? "+" : ""}
            {delta.toFixed(1)}%
          </span>
        )}
      </div>
      {hint && (
        <div style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: 6 }}>{hint}</div>
      )}
    </div>
  );
}
