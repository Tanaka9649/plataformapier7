import { Navigate } from "react-router-dom";
import { client } from "../lib/neonClient";

export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const { data, isPending } = client.auth.useSession();

  if (isPending) {
    return (
      <div
        style={{
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--ink-faint)",
          fontSize: 14,
        }}
      >
        Verificando sessão…
      </div>
    );
  }

  if (!data?.session) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
