import { useEffect, useState } from "react";

/**
 * Hook de detecção de tela mobile, extraído do que já existia em CrmPage.tsx
 * para reuso em outras páginas (Dashboard, Empresa, Configurações).
 * Mesmo breakpoint padrão (720px) usado no Kanban.
 */
export function useIsMobile(breakpoint = 720) {
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth < breakpoint : false
  );
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [breakpoint]);
  return isMobile;
}
