import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { client } from "../lib/neonClient";
import { Navigate } from "react-router-dom";

export default function LoginPage() {
  const { data } = client.auth.useSession();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"entrar" | "criar_primeiro_acesso">("entrar");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (data?.session) return <Navigate to="/" replace />;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === "entrar") {
        const res = await client.auth.signIn.email({ email, password });
        if (res.error) throw new Error(res.error.message || "Não foi possível entrar.");
      } else {
        const res = await client.auth.signUp.email({ email, password, name: name || email });
        if (res.error) throw new Error(res.error.message || "Não foi possível criar o acesso.");
      }
      navigate("/", { replace: true });
    } catch (err: any) {
      setError(err.message || "Algo deu errado. Confira os dados e tente de novo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--gradient-brand-radial), var(--bg)",
        padding: 24,
      }}
    >
      <div
        className="fade-in-up"
        style={{
          width: "100%",
          maxWidth: 380,
          background: "var(--bg)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-xl)",
          padding: "40px 36px",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 28 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: "var(--blue-500)",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 700,
              fontSize: 15,
              marginBottom: 14,
            }}
          >
            P7
          </div>
          <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: "var(--ink)" }}>
            PIER7 Marketing & CRM
          </h1>
          <p style={{ fontSize: 13, color: "var(--ink-faint)", margin: "4px 0 0" }}>
            {mode === "entrar" ? "Entre para continuar" : "Criar primeiro acesso"}
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {mode === "criar_primeiro_acesso" && (
            <Field label="Nome">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Seu nome"
                style={inputStyle}
              />
            </Field>
          )}
          <Field label="E-mail ou usuário">
            <input
              type="text"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="pier7dados@pier7.com.br"
              style={inputStyle}
            />
          </Field>
          <Field label="Senha">
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              style={inputStyle}
            />
          </Field>

          {error && (
            <div
              style={{
                background: "var(--red-50)",
                color: "var(--red-500)",
                fontSize: 13,
                padding: "10px 12px",
                borderRadius: 10,
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: 6,
              background: "var(--blue-500)",
              color: "#fff",
              border: "none",
              borderRadius: 10,
              padding: "12px 16px",
              fontSize: 14,
              fontWeight: 600,
              opacity: loading ? 0.7 : 1,
              boxShadow: loading ? "none" : "var(--shadow-glow)",
            }}
          >
            {loading ? "Aguarde…" : mode === "entrar" ? "Entrar" : "Criar acesso e entrar"}
          </button>
        </form>

        <button
          onClick={() =>
            setMode(mode === "entrar" ? "criar_primeiro_acesso" : "entrar")
          }
          style={{
            marginTop: 18,
            background: "none",
            border: "none",
            color: "var(--ink-faint)",
            fontSize: 12.5,
            width: "100%",
            textAlign: "center",
          }}
        >
          {mode === "entrar"
            ? "Primeiro acesso à plataforma? Criar usuário"
            : "Já tenho uma conta — entrar"}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 12.5, color: "var(--ink-soft)", fontWeight: 500 }}>{label}</span>
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  border: "1px solid var(--border-strong)",
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 14,
  color: "var(--ink)",
  background: "var(--surface)",
};
