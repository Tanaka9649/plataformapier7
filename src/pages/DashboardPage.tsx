import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import TopBar from "../components/TopBar";
import StatCard from "../components/StatCard";
import { client, Company, AdMetricDaily, SocialMetricDaily } from "../lib/neonClient";
import { useIsMobile } from "../lib/useIsMobile";

const fmtBRL = (n: number) => "R$ " + n.toLocaleString("pt-BR", { minimumFractionDigits: 2 });
const fmtInt = (n: number) => Math.round(n).toLocaleString("pt-BR");

export default function DashboardPage() {
  const isMobile = useIsMobile();
  const [companies, setCompanies] = useState<Company[] | null>(null);
  const [ads, setAds] = useState<AdMetricDaily[] | null>(null);
  const [social, setSocial] = useState<SocialMetricDaily[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [c, a, s] = await Promise.all([
        client.from("companies").select("id,name,slug,status").order("name", { ascending: true }),
        client.from("ad_metrics_daily").select("company_id,date,spend,impressions,clicks,leads"),
        client.from("social_metrics_daily").select("company_id,network,followers"),
      ]);
      if (c.error) return setError(c.error.message);
      if (a.error) return setError(a.error.message);
      if (s.error) return setError(s.error.message);
      setCompanies(c.data as Company[]);
      setAds(a.data as AdMetricDaily[]);
      setSocial(s.data as SocialMetricDaily[]);
    })();
  }, []);

  // os cards e o comparativo dizem "(30d)" — filtra de verdade pros últimos 30 dias,
  // em vez de somar o histórico inteiro (bug: a query não tinha filtro de data nenhum)
  const cutoff30 = new Date();
  cutoff30.setDate(cutoff30.getDate() - 30);
  const adsLast30 = (ads ?? []).filter((r) => new Date(r.date) >= cutoff30);

  const totalSpend = adsLast30.reduce((sum, r) => sum + Number(r.spend), 0);
  const totalClicks = adsLast30.reduce((sum, r) => sum + Number(r.clicks), 0);
  const totalLeads = adsLast30.reduce((sum, r) => sum + Number(r.leads), 0);
  const totalFollowers = social?.reduce((sum, r) => sum + (r.followers ?? 0), 0) ?? 0;

  return (
    <div>
      <TopBar />
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: isMobile ? "24px 16px 60px" : "40px 32px 80px" }}>
        <h1 style={{ fontSize: isMobile ? 20 : 24, fontWeight: 700, margin: "0 0 6px" }}>Empresas</h1>
        <p style={{ color: "var(--ink-faint)", fontSize: 14, margin: "0 0 24px" }}>
          Selecione uma empresa para ver tráfego pago, redes sociais ou abrir o CRM.
        </p>

        {error && <ErrorBanner message={error} />}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            gap: 14,
            marginBottom: 48,
          }}
        >
          {companies?.map((c) => (
            <Link
              key={c.id}
              to={`/empresa/${c.slug}`}
              style={{
                background: "var(--bg)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                padding: "20px",
                boxShadow: "var(--shadow-sm)",
                transition: "box-shadow .15s ease, transform .15s ease",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "var(--shadow-md)")}
              onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "var(--shadow-sm)")}
            >
              <div style={{ fontWeight: 600, fontSize: 15, color: "var(--ink)" }}>{c.name}</div>
              <div
                style={{
                  marginTop: 8,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 12,
                  color: c.status === "active" ? "var(--green-500)" : "var(--ink-faint)",
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: c.status === "active" ? "var(--green-500)" : "var(--ink-faint)",
                  }}
                />
                {c.status === "active" ? "Ativa" : "Inativa"}
              </div>
            </Link>
          ))}
          {companies === null && !error && (
            <SkeletonCards />
          )}
        </div>

        <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 16px" }}>Resumo geral</h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 14,
            marginBottom: 32,
          }}
        >
          {ads === null && !error ? (
            <SkeletonCards count={4} height={78} />
          ) : (
            <>
              <StatCard label="Investimento total (30d)" value={fmtBRL(totalSpend)} />
              <StatCard label="Cliques totais" value={fmtInt(totalClicks)} />
              <StatCard label="Leads via Ads" value={fmtInt(totalLeads)} hint="campo populado por integração automática" />
              <StatCard label="Seguidores (soma das redes)" value={fmtInt(totalFollowers)} />
            </>
          )}
        </div>

        {companies && companies.length > 0 && (
          <>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 16px" }}>Comparativo entre empresas</h2>
            <CompanyComparison companies={companies} ads={adsLast30} isMobile={isMobile} />
          </>
        )}
      </main>
    </div>
  );
}

function CompanyComparison({ companies, ads, isMobile }: { companies: Company[]; ads: AdMetricDaily[]; isMobile: boolean }) {
  const byCompany = companies.map((c) => {
    const spend = ads.filter((a) => a.company_id === c.id).reduce((s, a) => s + Number(a.spend), 0);
    return { name: c.name, spend };
  });
  const max = Math.max(...byCompany.map((c) => c.spend), 1);

  return (
    <div style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: isMobile ? 16 : 20, boxShadow: "var(--shadow-sm)" }}>
      <div style={{ fontSize: 11.5, color: "var(--ink-faint)", fontWeight: 600, marginBottom: 16 }}>
        Investimento em tráfego pago por empresa (30d)
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {byCompany
          .sort((a, b) => b.spend - a.spend)
          .map((c) =>
            isMobile ? (
              <div key={c.name} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
                  <span style={{ color: "var(--ink-soft)", fontWeight: 500 }}>{c.name}</span>
                  <span style={{ fontFamily: "var(--font-mono)", color: "var(--ink)" }}>{fmtBRL(c.spend)}</span>
                </div>
                <div style={{ background: "var(--surface)", borderRadius: 6, height: 14, position: "relative" }}>
                  <div
                    style={{
                      width: `${(c.spend / max) * 100}%`,
                      background: "var(--blue-500)",
                      height: "100%",
                      borderRadius: 6,
                      minWidth: c.spend > 0 ? 3 : 0,
                    }}
                  />
                </div>
              </div>
            ) : (
              <div key={c.name} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 130, fontSize: 12.5, color: "var(--ink-soft)", fontWeight: 500, flexShrink: 0 }}>
                  {c.name}
                </div>
                <div style={{ flex: 1, background: "var(--surface)", borderRadius: 6, height: 18, position: "relative" }}>
                  <div
                    style={{
                      width: `${(c.spend / max) * 100}%`,
                      background: "var(--blue-500)",
                      height: "100%",
                      borderRadius: 6,
                      minWidth: c.spend > 0 ? 3 : 0,
                    }}
                  />
                </div>
                <div style={{ width: 90, textAlign: "right", fontSize: 12.5, fontFamily: "var(--font-mono)", color: "var(--ink)", flexShrink: 0 }}>
                  {fmtBRL(c.spend)}
                </div>
              </div>
            )
          )}
      </div>
    </div>
  );
}

function SkeletonCards({ count = 3, height = 74 }: { count?: number; height?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          style={{
            height,
            borderRadius: "var(--radius-md)",
            background:
              "linear-gradient(90deg, var(--surface) 25%, var(--surface-hover) 37%, var(--surface) 63%)",
            backgroundSize: "400% 100%",
            animation: "shimmer 1.4s ease infinite",
          }}
        />
      ))}
      <style>{`@keyframes shimmer { 0% { background-position: 100% 0 } 100% { background-position: 0 0 } }`}</style>
    </>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      style={{
        background: "var(--red-50)",
        color: "var(--red-500)",
        padding: "12px 16px",
        borderRadius: 10,
        fontSize: 13.5,
        marginBottom: 20,
      }}
    >
      Não consegui carregar os dados: {message}
    </div>
  );
}
