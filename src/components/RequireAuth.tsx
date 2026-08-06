import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { client, getOrCreateAppUserId } from "../lib/neonClient";

export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const { data, isPending } = client.auth.useSession();
  const [activeCheck, setActiveCheck] = useState<"checking" | "active" | "inactive">("checking");

  useEffect(() => {
    if (isPending || !data?.session) return;
    let cancelled = false;
    (async () => {
      const appUserId = await getOrCreateAppUserId();
      // se a checagem falhar por algum motivo, não bloqueia o acesso — evita travar todo mundo por uma falha de rede
      if (!appUserId) {
        if (!cancelled) setActiveCheck("active");
        return;
      }
      const { data: rows } = await client.from("app_users").select("active").eq("id", appUserId);
      const row = (rows as { active: boolean }[])?.[0];
      if (!cancelled) setActiveCheck(row && row.active === false ? "inactive" : "active");
    })();
    return () => {
      cancelled = true;
    };
  }, [isPending, data?.session]);

  if (isPending || (data?.session && activeCheck === "checking")) {
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

  if (activeCheck === "inactive") {
    client.auth.signOut();
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
