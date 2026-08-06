import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import TopBar from "../components/TopBar";
import StatCard from "../components/StatCard";
import { client, Company, AdMetricDaily, SocialMetricDaily } from "../lib/neonClient";

const fmtBRL = (n: number) => "R$ " + n.toLocaleString("pt-BR", { minimumFractionDigits: 2 });
const fmtInt = (n: number) => Math.round(n).toLocaleString("pt-BR");
const NETWORK_LABEL: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  youtube: "YouTube",
  google_my_business: "Google Meu Negócio",
};

export default function CompanyPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"ads" | "social">("ads");
  const [period, setPeriod] = useState<7 | 14 | 30>(30);
  const [company, setCompany] = useState<Company | null>(null);
  const [ads, setAds] = useState<AdMetricDaily[] | null>(null);
  const [social, setSocial] = useState<SocialMetricDaily[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    (async () => {
      const { data: companies, error: cErr } = await client
        .from("companies")
        .select("*")
        .eq("slug", slug);
      if (cErr) return setError(cErr.message);
      const c = (companies as Company[])?.[0];
      if (!c) return setError("Empresa não encontrada.");
      setCompany(c);

      const [a, s] = await Promise.all([
        client.from("ad_metrics_daily").select("*").eq("company_id", c.id).order("date", { ascending: true }),
        client.from("social_metrics_daily").select("*").eq("company_id", c.id).order("date", { ascending: false }),
      ]);
      if (a.error) return setError(a.error.message);
      if (s.error) return setError(s.error.message);
      setAds(a.data as AdMetricDaily[]);
      setSocial(s.data as SocialMetricDaily[]);
    })();
  }, [slug]);

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - period);
  const adsInPeriod = (ads ?? []).filter((r) => new Date(r.date) >= cutoff);
  const spend = adsInPeriod.reduce((s, r) => s + Number(r.spend), 0);
  const impressions = adsInPeriod.reduce((s, r) => s + Number(r.impressions), 0);
  const clicks = adsInPeriod.reduce((s, r) => s + Number(r.clicks), 0);
  const cpc = clicks > 0 ? spend / clicks : 0;
  const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;

  return (
    <div>
      <TopBar
        breadcrumb={
          company
            ? [{ label: "Empresas", to: "/" }, { label: company.name }]
            : [{ label: "Empresas", to: "/" }]
        }
      />
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "36px 32px 80px" }}>
        {error && (
          <div style={{ background: "var(--red-50)", color: "var(--red-500)", padding: 14, borderRadius: 10, marginBottom: 20 }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28, flexWrap: "wrap", gap: 12 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>{company?.name ?? "…"}</h1>
          <button
            onClick={() => navigate(`/empresa/${slug}/crm`)}
            style={{
              background: "var(--ink)",
              color: "#fff",
              border: "none",
              borderRadius: 10,
              padding: "11px 20px",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            Abrir CRM →
          </button>
        </div>

        <div style={{ display: "flex", gap: 6, marginBottom: 28, borderBottom: "1px solid var(--border)" }}>
          <TabButton active={tab === "ads"} onClick={() => setTab("ads")}>
            Tráfego pago
          </TabButton>
          <TabButton active={tab === "social"} onClick={() => setTab("social")}>
            Redes sociais
          </TabButton>
        </div>

        {tab === "ads" && (
          <section>
            <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
              {[7, 14, 30].map((p) => (
                <PeriodChip key={p} active={period === p} onClick={() => setPeriod(p as 7 | 14 | 30)}>
                  {p}d
                </PeriodChip>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 32 }}>
              <StatCard label="Investimento" value={fmtBRL(spend)} />
              <StatCard label="Impressões" value={fmtInt(impressions)} />
              <StatCard label="Cliques" value={fmtInt(clicks)} />
              <StatCard label="CPC médio" value={fmtBRL(cpc)} />
              <StatCard label="CTR" value={`${ctr.toFixed(2)}%`} />
            </div>

            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Evolução diária</h3>
            <MiniBarChart data={adsInPeriod.map((r) => ({ label: r.date.slice(5), value: Number(r.spend) }))} />

            {ads !== null && adsInPeriod.length === 0 && (
              <EmptyState text="Sem dados de tráfego pago nesse período. Verifique se a conta está conectada no Windsor." />
            )}
          </section>
        )}

        {tab === "social" && (
          <section>
            {social !== null && social.length === 0 && (
              <EmptyState text="Nenhuma rede social conectada para esta empresa ainda." />
            )}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
              {social?.map((s) => (
                <div
                  key={s.id}
                  style={{
                    background: "var(--bg)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-md)",
                    padding: 20,
                    boxShadow: "var(--shadow-sm)",
                  }}
                >
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--blue-600)", marginBottom: 10 }}>
                    {NETWORK_LABEL[s.network] ?? s.network}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {s.followers != null && <Row label="Seguidores" value={fmtInt(s.followers)} />}
                    {s.views != null && <Row label="Views" value={fmtInt(s.views)} />}
                    {s.likes != null && <Row label="Curtidas" value={fmtInt(s.likes)} />}
                    {s.comments != null && <Row label="Comentários" value={fmtInt(s.comments)} />}
                    {s.posts != null && <Row label="Publicações" value={fmtInt(s.posts)} />}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
      <span style={{ color: "var(--ink-faint)" }}>{label}</span>
      <span style={{ fontWeight: 600, fontFamily: "var(--font-mono)" }}>{value}</span>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: "none",
        border: "none",
        borderBottom: active ? "2px solid var(--blue-500)" : "2px solid transparent",
        padding: "10px 4px",
        marginRight: 24,
        fontSize: 14,
        fontWeight: 600,
        color: active ? "var(--ink)" : "var(--ink-faint)",
      }}
    >
      {children}
    </button>
  );
}

function PeriodChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? "var(--blue-500)" : "var(--surface)",
        color: active ? "#fff" : "var(--ink-soft)",
        border: "1px solid " + (active ? "var(--blue-500)" : "var(--border)"),
        borderRadius: 8,
        padding: "5px 12px",
        fontSize: 12.5,
        fontWeight: 600,
      }}
    >
      {children}
    </button>
  );
}

function MiniBarChart({ data }: { data: { label: string; value: number }[] }) {
  if (data.length === 0) return null;
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        gap: 3,
        height: 120,
        padding: "12px 4px",
        background: "var(--surface)",
        borderRadius: "var(--radius-md)",
        overflowX: "auto",
      }}
    >
      {data.map((d, i) => (
        <div key={i} title={`${d.label}: R$ ${d.value.toFixed(2)}`} style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 8 }}>
          <div
            style={{
              width: 8,
              height: Math.max((d.value / max) * 88, 2),
              background: "var(--blue-500)",
              borderRadius: 3,
            }}
          />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div
      style={{
        border: "1px dashed var(--border-strong)",
        borderRadius: "var(--radius-md)",
        padding: 28,
        textAlign: "center",
        color: "var(--ink-faint)",
        fontSize: 13.5,
        marginBottom: 20,
      }}
    >
      {text}
    </div>
  );
}
