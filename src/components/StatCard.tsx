export default function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
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
      <div style={{ fontSize: 24, fontWeight: 700, color: "var(--ink)", fontFamily: "var(--font-mono)" }}>
        {value}
      </div>
      {hint && (
        <div style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: 6 }}>{hint}</div>
      )}
    </div>
  );
}
