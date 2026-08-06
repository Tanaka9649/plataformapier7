import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import TopBar from "../components/TopBar";
import StatCard from "../components/StatCard";
import { client, Company, AdMetricDaily, SocialMetricDaily, ManualRevenue, logAudit } from "../lib/neonClient";
import { useIsMobile } from "../lib/useIsMobile";

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
  const isMobile = useIsMobile();
  const [tab, setTab] = useState<"ads" | "social">("ads");
  const [period, setPeriod] = useState<7 | 14 | 30>(30);
  const [socialNetwork, setSocialNetwork] = useState<string>("all");
  const [company, setCompany] = useState<Company | null>(null);
  const [ads, setAds] = useState<AdMetricDaily[] | null>(null);
  const [social, setSocial] = useState<SocialMetricDaily[] | null>(null);
  const [revenue, setRevenue] = useState<ManualRevenue[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revError, setRevError] = useState<string | null>(null);
  const [newRevAmount, setNewRevAmount] = useState("");
  const [newRevDate, setNewRevDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [newRevDesc, setNewRevDesc] = useState("");
  const [savingRev, setSavingRev] = useState(false);

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

      const [a, s, r] = await Promise.all([
        client.from("ad_metrics_daily").select("*").eq("company_id", c.id).order("date", { ascending: true }),
        client.from("social_metrics_daily").select("*").eq("company_id", c.id).order("date", { ascending: false }),
        client.from("manual_revenue").select("*").eq("company_id", c.id).order("revenue_date", { ascending: false }),
      ]);
      if (a.error) return setError(a.error.message);
      if (s.error) return setError(s.error.message);
      if (r.error) return setError(r.error.message);
      setAds(a.data as AdMetricDaily[]);
      setSocial(s.data as SocialMetricDaily[]);
      setRevenue((r.data as ManualRevenue[]) ?? []);
      setSocialNetwork("all");
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

  // período anterior, mesma duração, imediatamente antes do período atual — para "vs. período anterior"
  const prevCutoffStart = new Date(cutoff);
  prevCutoffStart.setDate(prevCutoffStart.getDate() - period);
  const adsInPrevPeriod = (ads ?? []).filter((r) => {
    const d = new Date(r.date);
    return d >= prevCutoffStart && d < cutoff;
  });
  const prevSpend = adsInPrevPeriod.reduce((s, r) => s + Number(r.spend), 0);
  const prevImpressions = adsInPrevPeriod.reduce((s, r) => s + Number(r.impressions), 0);
  const prevClicks = adsInPrevPeriod.reduce((s, r) => s + Number(r.clicks), 0);
  const prevCpc = prevClicks > 0 ? prevSpend / prevClicks : 0;
  const prevCtr = prevImpressions > 0 ? (prevClicks / prevImpressions) * 100 : 0;

  // null = sem dado no período anterior para comparar (evita mostrar "+∞%" ou um número enganoso)
  const pctDelta = (current: number, prev: number): number | null => (prev > 0 ? ((current - prev) / prev) * 100 : null);
  const spendDelta = pctDelta(spend, prevSpend);
  const impressionsDelta = pctDelta(impressions, prevImpressions);
  const clicksDelta = pctDelta(clicks, prevClicks);
  const cpcDelta = pctDelta(cpc, prevCpc);
  const ctrDelta = pctDelta(ctr, prevCtr);

  const revenueInPeriod = (revenue ?? []).filter((r) => new Date(r.revenue_date) >= cutoff);
  const revenueTotal = revenueInPeriod.reduce((s, r) => s + Number(r.amount), 0);
  const roas = spend > 0 ? revenueTotal / spend : null;

  const revenueInPrevPeriod = (revenue ?? []).filter((r) => {
    const d = new Date(r.revenue_date);
    return d >= prevCutoffStart && d < cutoff;
  });
  const prevRevenueTotal = revenueInPrevPeriod.reduce((s, r) => s + Number(r.amount), 0);
  const prevRoas = prevSpend > 0 ? prevRevenueTotal / prevSpend : null;
  const revenueDelta = pctDelta(revenueTotal, prevRevenueTotal);
  const roasDelta = roas !== null && prevRoas !== null && prevRoas > 0 ? ((roas - prevRoas) / prevRoas) * 100 : null;

  async function addRevenue() {
    if (!company) return;
    // formato brasileiro: "." é separador de milhar, "," é decimal — ex "1.500,00" -> 1500.00
    const amount = parseFloat(newRevAmount.trim().replace(/\./g, "").replace(",", "."));
    if (!newRevAmount.trim() || isNaN(amount) || amount <= 0) {
      setRevError("Informe um valor válido maior que zero.");
      return;
    }
    setRevError(null);
    setSavingRev(true);
    const { data, error: insErr } = await client
      .from("manual_revenue")
      .insert({
        company_id: company.id,
        amount,
        revenue_date: newRevDate,
        description: newRevDesc.trim() || null,
      })
      .select();
    setSavingRev(false);
    if (insErr) return setRevError(insErr.message);
    const created = (data as ManualRevenue[])?.[0];
    if (created) {
      setRevenue((prev) => [created, ...(prev ?? [])].sort((a, b) => (a.revenue_date < b.revenue_date ? 1 : -1)));
      await logAudit("manual_revenue", created.id, "create", null, created);
    }
    setNewRevAmount("");
    setNewRevDesc("");
    setNewRevDate(new Date().toISOString().slice(0, 10));
  }

  async function deleteRevenue(entry: ManualRevenue) {
    const ok = window.confirm(`Excluir o lançamento de ${fmtBRL(Number(entry.amount))} em ${entry.revenue_date.slice(0, 10)}?`);
    if (!ok) return;
    const { error: delErr } = await client.from("manual_revenue").delete().eq("id", entry.id);
    if (delErr) return setRevError(delErr.message);
    setRevenue((prev) => (prev ?? []).filter((r) => r.id !== entry.id));
    await logAudit("manual_revenue", entry.id, "delete", entry, null);
  }

  return (
    <div>
      <TopBar
        breadcrumb={
          company
            ? [{ label: "Empresas", to: "/" }, { label: company.name }]
            : [{ label: "Empresas", to: "/" }]
        }
      />
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: isMobile ? "24px 16px 60px" : "36px 32px 80px" }}>
        {error && (
          <div style={{ background: "var(--red-50)", color: "var(--red-500)", padding: 14, borderRadius: 10, marginBottom: 20 }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28, flexWrap: "wrap", gap: 12 }}>
          <h1 style={{ fontSize: isMobile ? 19 : 24, fontWeight: 700, margin: 0 }}>{company?.name ?? "…"}</h1>
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
            <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
              {[7, 14, 30].map((p) => (
                <PeriodChip key={p} active={period === p} onClick={() => setPeriod(p as 7 | 14 | 30)}>
                  {p}d
                </PeriodChip>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 32 }}>
              <StatCard label="Investimento" value={fmtBRL(spend)} delta={spendDelta} />
              <StatCard label="Impressões" value={fmtInt(impressions)} delta={impressionsDelta} />
              <StatCard label="Cliques" value={fmtInt(clicks)} delta={clicksDelta} />
              <StatCard label="CPC médio" value={fmtBRL(cpc)} delta={cpcDelta} />
              <StatCard label="CTR" value={`${ctr.toFixed(2)}%`} delta={ctrDelta} />
              <StatCard
                label="Receita (lançada manualmente)"
                value={fmtBRL(revenueTotal)}
                delta={revenueDelta}
                hint={revenueTotal === 0 ? "nenhum lançamento neste período" : undefined}
              />
              <StatCard
                label="ROAS"
                value={roas !== null ? `${roas.toFixed(2)}x` : "—"}
                delta={roasDelta}
                hint={roas === null ? "sem investimento ou receita no período" : undefined}
              />
            </div>
            <div style={{ fontSize: 11.5, color: "var(--ink-faint)", marginTop: -22, marginBottom: 24 }}>
              vs. período anterior ({period} dias antes do período selecionado)
            </div>

            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Evolução diária</h3>
            <MiniBarChart data={adsInPeriod.map((r) => ({ label: r.date.slice(5), value: Number(r.spend) }))} />

            {ads !== null && adsInPeriod.length === 0 && (
              <EmptyState text="Sem dados de tráfego pago nesse período. Verifique se a conta está conectada no Windsor." />
            )}

            <h3 style={{ fontSize: 14, fontWeight: 700, margin: "32px 0 4px" }}>Receita manual</h3>
            <p style={{ fontSize: 12, color: "var(--ink-faint)", margin: "0 0 14px" }}>
              Lance aqui a receita gerada por essa empresa — usada pra calcular o ROAS acima. Ainda não tem integração
              automática de vendas, então esses valores são digitados por vocês.
            </p>

            {revError && (
              <div style={{ background: "var(--red-50)", color: "var(--red-500)", padding: 10, borderRadius: 8, fontSize: 12.5, marginBottom: 12 }}>
                {revError}
              </div>
            )}

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20, alignItems: "flex-end" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 11, color: "var(--ink-faint)" }}>Data</label>
                <input
                  type="date"
                  value={newRevDate}
                  onChange={(e) => setNewRevDate(e.target.value)}
                  style={{ border: "1px solid var(--border-strong)", borderRadius: 8, padding: "8px 10px", fontSize: 13 }}
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 11, color: "var(--ink-faint)" }}>Valor (R$)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="1.500,00"
                  value={newRevAmount}
                  onChange={(e) => setNewRevAmount(e.target.value)}
                  style={{ width: 120, border: "1px solid var(--border-strong)", borderRadius: 8, padding: "8px 10px", fontSize: 13 }}
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 180px" }}>
                <label style={{ fontSize: 11, color: "var(--ink-faint)" }}>Descrição (opcional)</label>
                <input
                  type="text"
                  placeholder="ex: 3 vendas fechadas via campanha X"
                  value={newRevDesc}
                  onChange={(e) => setNewRevDesc(e.target.value)}
                  style={{ border: "1px solid var(--border-strong)", borderRadius: 8, padding: "8px 10px", fontSize: 13 }}
                />
              </div>
              <button
                onClick={addRevenue}
                disabled={savingRev}
                style={{
                  background: "var(--blue-500)",
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  padding: "9px 18px",
                  fontSize: 13,
                  fontWeight: 600,
                  opacity: savingRev ? 0.6 : 1,
                }}
              >
                {savingRev ? "Salvando…" : "+ Lançar"}
              </button>
            </div>

            {revenue !== null && revenue.length === 0 && (
              <EmptyState text="Nenhum lançamento de receita ainda. Use o formulário acima para registrar o primeiro." />
            )}

            {revenue !== null && revenue.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {revenue.map((r) => (
                  <div
                    key={r.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      background: "var(--bg)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      padding: "9px 12px",
                    }}
                  >
                    <span style={{ fontSize: 12, color: "var(--ink-faint)", fontFamily: "var(--font-mono)", flexShrink: 0 }}>
                      {r.revenue_date.slice(0, 10).split("-").reverse().join("/")}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 700, fontFamily: "var(--font-mono)", flexShrink: 0 }}>
                      {fmtBRL(Number(r.amount))}
                    </span>
                    {r.description && (
                      <span style={{ fontSize: 12.5, color: "var(--ink-soft)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {r.description}
                      </span>
                    )}
                    <button
                      onClick={() => deleteRevenue(r)}
                      title="Excluir lançamento"
                      style={{ marginLeft: "auto", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, width: 26, height: 26, fontSize: 12, color: "var(--red-500)", flexShrink: 0 }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {tab === "social" && (
          <section>
            {social !== null && social.length === 0 && (
              <EmptyState text="Nenhuma rede social conectada para esta empresa ainda." />
            )}
            {social !== null && social.length > 0 && (
              <>
                <div style={{ fontSize: 11.5, color: "var(--ink-faint)", marginBottom: 16 }}>
                  A comparação com o período anterior ainda não está disponível aqui — a fonte de dados guarda só o snapshot mais
                  recente de cada rede, sem histórico diário. Assim que houver histórico, a comparação entra igual à de Tráfego pago.
                </div>
                <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
                  <PeriodChip active={socialNetwork === "all"} onClick={() => setSocialNetwork("all")}>
                    Todas
                  </PeriodChip>
                  {Array.from(new Set(social.map((s) => s.network))).map((net) => (
                    <PeriodChip key={net} active={socialNetwork === net} onClick={() => setSocialNetwork(net)}>
                      {NETWORK_LABEL[net] ?? net}
                    </PeriodChip>
                  ))}
                </div>
              </>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
              {social?.filter((s) => socialNetwork === "all" || s.network === socialNetwork).map((s) => (
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
