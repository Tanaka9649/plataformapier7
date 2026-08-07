import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import AppShell from "../components/AppShell";
import StatCard from "../components/StatCard";
import { ArrowUpRight } from "lucide-react";
import { client, Company, AdMetricDaily, SocialMetricDaily, ManualRevenue, ManualLead, logAudit } from "../lib/neonClient";
import { useIsMobile } from "../lib/useIsMobile";

const fmtBRL = (n: number) => "R$ " + n.toLocaleString("pt-BR", { minimumFractionDigits: 2 });
const fmtInt = (n: number) => Math.round(n).toLocaleString("pt-BR");
const fmtDate = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");
const NETWORK_LABEL: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  youtube: "YouTube",
  google_my_business: "Google Meu Negócio",
};
const NETWORK_COLOR: Record<string, string> = {
  instagram: "var(--violet-500)",
  facebook: "var(--blue-500)",
  tiktok: "var(--ink)",
  youtube: "var(--red-500)",
  google_my_business: "var(--green-500)",
};
const SOCIAL_PERIODS = [7, 14, 30, 0] as const;
type SocialPeriod = (typeof SOCIAL_PERIODS)[number];

export default function CompanyPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [tab, setTab] = useState<"ads" | "social">("ads");
  const [period, setPeriod] = useState<7 | 14 | 30>(30);
  const [socialNetwork, setSocialNetwork] = useState<string>("all");
  const [socialPeriod, setSocialPeriod] = useState<SocialPeriod>(30);
  const [company, setCompany] = useState<Company | null>(null);
  const [ads, setAds] = useState<AdMetricDaily[] | null>(null);
  const [social, setSocial] = useState<SocialMetricDaily[] | null>(null);
  const [revenue, setRevenue] = useState<ManualRevenue[] | null>(null);
  const [leadsManual, setLeadsManual] = useState<ManualLead[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revError, setRevError] = useState<string | null>(null);
  const [newRevAmount, setNewRevAmount] = useState("");
  const [newRevDate, setNewRevDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [newRevDesc, setNewRevDesc] = useState("");
  const [savingRev, setSavingRev] = useState(false);
  const [leadError, setLeadError] = useState<string | null>(null);
  const [newLeadQty, setNewLeadQty] = useState("");
  const [newLeadDate, setNewLeadDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [newLeadDesc, setNewLeadDesc] = useState("");
  const [savingLead, setSavingLead] = useState(false);

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

      const [a, s, r, ml] = await Promise.all([
        client.from("ad_metrics_daily").select("*").eq("company_id", c.id).order("date", { ascending: true }),
        client.from("social_metrics_daily").select("*").eq("company_id", c.id).order("date", { ascending: false }),
        client.from("manual_revenue").select("*").eq("company_id", c.id).order("revenue_date", { ascending: false }),
        client.from("manual_leads").select("*").eq("company_id", c.id).order("lead_date", { ascending: false }),
      ]);
      if (a.error) return setError(a.error.message);
      if (s.error) return setError(s.error.message);
      if (r.error) return setError(r.error.message);
      if (ml.error) return setError(ml.error.message);
      setAds(a.data as AdMetricDaily[]);
      setSocial(s.data as SocialMetricDaily[]);
      setRevenue((r.data as ManualRevenue[]) ?? []);
      setLeadsManual((ml.data as ManualLead[]) ?? []);
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

  const socialNetworks = Array.from(new Set((social ?? []).map((s) => s.network)));
  const socialCutoff = socialPeriod === 0 ? null : (() => {
    const d = new Date();
    d.setDate(d.getDate() - socialPeriod);
    return d;
  })();
  function summarizeNetwork(network: string) {
    const rows = (social ?? []).filter((s) => s.network === network);
    const sortedAsc = [...rows].sort((a, b) => (a.date < b.date ? -1 : 1));
    const withFollowers = [...sortedAsc].reverse().find((r) => r.followers != null);
    const inPeriod = sortedAsc.filter((r) => socialCutoff === null || new Date(r.date) >= socialCutoff);
    const totalLikes = inPeriod.reduce((s, r) => s + (r.likes ?? 0), 0);
    const totalComments = inPeriod.reduce((s, r) => s + (r.comments ?? 0), 0);
    const activeDays = inPeriod.filter((r) => (r.likes ?? 0) > 0 || (r.comments ?? 0) > 0 || (r.posts ?? 0) > 0);
    const avgEngagement = activeDays.length > 0 ? (totalLikes + totalComments) / activeDays.length : 0;
    const lastUpdated = sortedAsc.length > 0 ? sortedAsc[sortedAsc.length - 1].date : null;
    const recent = [...inPeriod].reverse().slice(0, 8);
    return {
      network,
      followers: withFollowers?.followers ?? null,
      followersAsOf: withFollowers?.date ?? null,
      totalLikes,
      totalComments,
      postCount: activeDays.length,
      avgEngagement,
      lastUpdated,
      chartData: inPeriod.map((r) => ({ label: r.date.slice(5), value: (r.likes ?? 0) + (r.comments ?? 0) })),
      recent,
    };
  }
  const visibleSocialNetworks = socialNetwork === "all" ? socialNetworks : socialNetworks.filter((n) => n === socialNetwork);

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

  const leadsInPeriod = (leadsManual ?? []).filter((l) => new Date(l.lead_date) >= cutoff);
  const leadsTotal = leadsInPeriod.reduce((s, l) => s + Number(l.quantity), 0);
  const cpl = leadsTotal > 0 ? spend / leadsTotal : null;

  const leadsInPrevPeriod = (leadsManual ?? []).filter((l) => {
    const d = new Date(l.lead_date);
    return d >= prevCutoffStart && d < cutoff;
  });
  const prevLeadsTotal = leadsInPrevPeriod.reduce((s, l) => s + Number(l.quantity), 0);
  const prevCpl = prevLeadsTotal > 0 ? prevSpend / prevLeadsTotal : null;
  const leadsDelta = pctDelta(leadsTotal, prevLeadsTotal);
  const cplDelta = cpl !== null && prevCpl !== null && prevCpl > 0 ? ((cpl - prevCpl) / prevCpl) * 100 : null;

  async function addLead() {
    if (!company) return;
    const quantity = parseInt(newLeadQty.trim(), 10);
    if (!newLeadQty.trim() || isNaN(quantity) || quantity <= 0) {
      setLeadError("Informe uma quantidade válida maior que zero.");
      return;
    }
    setLeadError(null);
    setSavingLead(true);
    const { data, error: insErr } = await client
      .from("manual_leads")
      .insert({
        company_id: company.id,
        quantity,
        lead_date: newLeadDate,
        description: newLeadDesc.trim() || null,
      })
      .select();
    setSavingLead(false);
    if (insErr) return setLeadError(insErr.message);
    const created = (data as ManualLead[])?.[0];
    if (created) {
      setLeadsManual((prev) => [created, ...(prev ?? [])].sort((a, b) => (a.lead_date < b.lead_date ? 1 : -1)));
      await logAudit("manual_leads", created.id, "create", null, created);
    }
    setNewLeadQty("");
    setNewLeadDesc("");
    setNewLeadDate(new Date().toISOString().slice(0, 10));
  }

  async function deleteLead(entry: ManualLead) {
    const ok = window.confirm(`Excluir o lançamento de ${entry.quantity} lead${entry.quantity === 1 ? "" : "s"} em ${entry.lead_date.slice(0, 10)}?`);
    if (!ok) return;
    const { error: delErr } = await client.from("manual_leads").delete().eq("id", entry.id);
    if (delErr) return setLeadError(delErr.message);
    setLeadsManual((prev) => (prev ?? []).filter((l) => l.id !== entry.id));
    await logAudit("manual_leads", entry.id, "delete", entry, null);
  }

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
    <AppShell
      breadcrumb={
        company
          ? [{ label: "Empresas", to: "/" }, { label: company.name }]
          : [{ label: "Empresas", to: "/" }]
      }
    >
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
            className="btn-gradient"
            style={{
              borderRadius: 10,
              padding: "11px 20px",
              fontSize: 14,
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <ArrowUpRight size={16} strokeWidth={2.4} />
            Abrir CRM
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
              {ads === null || revenue === null || leadsManual === null ? (
                <PageSkeletonCards count={9} height={78} />
              ) : (
                <>
                  <StatCard label="Investimento" value={fmtBRL(spend)} delta={spendDelta} />
                  <StatCard label="Impressões" value={fmtInt(impressions)} delta={impressionsDelta} />
                  <StatCard label="Cliques" value={fmtInt(clicks)} delta={clicksDelta} />
                  <StatCard label="CPC médio" value={fmtBRL(cpc)} delta={cpcDelta} />
                  <StatCard label="CTR" value={`${ctr.toFixed(2)}%`} delta={ctrDelta} />
                  <StatCard
                    label="Leads (lançados manualmente)"
                    value={fmtInt(leadsTotal)}
                    delta={leadsDelta}
                    hint={leadsTotal === 0 ? "nenhum lançamento neste período" : undefined}
                  />
                  <StatCard
                    label="CPL (custo por lead)"
                    value={cpl !== null ? fmtBRL(cpl) : "—"}
                    delta={cplDelta}
                    hint={cpl === null ? "sem leads lançados no período" : undefined}
                  />
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
                </>
              )}
            </div>
            <div style={{ fontSize: 11.5, color: "var(--ink-faint)", marginTop: -22, marginBottom: 24 }}>
              vs. período anterior ({period} dias antes do período selecionado)
            </div>


            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Evolução diária</h3>
            <MiniBarChart data={adsInPeriod.map((r) => ({ label: r.date.slice(5), value: Number(r.spend) }))} />

            {ads !== null && adsInPeriod.length === 0 && (
              <EmptyState text="Sem dados de tráfego pago nesse período. Verifique se a conta está conectada no Windsor." />
            )}

            <h3 style={{ fontSize: 14, fontWeight: 700, margin: "32px 0 4px" }}>Leads manual</h3>
            <p style={{ fontSize: 12, color: "var(--ink-faint)", margin: "0 0 14px" }}>
              Lance aqui a quantidade de leads recebidos por essa empresa — usada pra calcular o CPL acima e pra somar no
              resumo geral da página inicial. O Meta Ads não devolve conversão real via Windsor, então esses números são
              digitados por vocês.
            </p>

            {leadError && (
              <div style={{ background: "var(--red-50)", color: "var(--red-500)", padding: 10, borderRadius: 8, fontSize: 12.5, marginBottom: 12 }}>
                {leadError}
              </div>
            )}

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20, alignItems: "flex-end" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 11, color: "var(--ink-faint)" }}>Data</label>
                <input
                  type="date"
                  value={newLeadDate}
                  onChange={(e) => setNewLeadDate(e.target.value)}
                  style={{ border: "1px solid var(--border-strong)", borderRadius: 8, padding: "8px 10px", fontSize: 13 }}
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 11, color: "var(--ink-faint)" }}>Quantidade</label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="12"
                  value={newLeadQty}
                  onChange={(e) => setNewLeadQty(e.target.value.replace(/\D/g, ""))}
                  style={{ width: 90, border: "1px solid var(--border-strong)", borderRadius: 8, padding: "8px 10px", fontSize: 13 }}
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 180px" }}>
                <label style={{ fontSize: 11, color: "var(--ink-faint)" }}>Descrição (opcional)</label>
                <input
                  type="text"
                  placeholder="ex: leads da campanha de aniversário"
                  value={newLeadDesc}
                  onChange={(e) => setNewLeadDesc(e.target.value)}
                  style={{ border: "1px solid var(--border-strong)", borderRadius: 8, padding: "8px 10px", fontSize: 13 }}
                />
              </div>
              <button
                onClick={addLead}
                disabled={savingLead}
                style={{
                  background: "var(--blue-500)",
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  padding: "9px 18px",
                  fontSize: 13,
                  fontWeight: 600,
                  opacity: savingLead ? 0.6 : 1,
                }}
              >
                {savingLead ? "Salvando…" : "+ Lançar"}
              </button>
            </div>

            {leadsManual !== null && leadsManual.length === 0 && (
              <EmptyState text="Nenhum lançamento de leads ainda. Use o formulário acima para registrar o primeiro." />
            )}

            {leadsManual !== null && leadsManual.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
                {leadsManual.map((l) => (
                  <div
                    key={l.id}
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
                      {l.lead_date.slice(0, 10).split("-").reverse().join("/")}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 700, fontFamily: "var(--font-mono)", flexShrink: 0 }}>
                      {l.quantity} lead{l.quantity === 1 ? "" : "s"}
                    </span>
                    {l.description && (
                      <span style={{ fontSize: 12.5, color: "var(--ink-soft)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {l.description}
                      </span>
                    )}
                    <button
                      onClick={() => deleteLead(l)}
                      title="Excluir lançamento"
                      aria-label={`Excluir lançamento de ${l.quantity} leads em ${l.lead_date.slice(0, 10)}`}
                      style={{ marginLeft: "auto", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, width: 26, height: 26, fontSize: 12, color: "var(--red-500)", flexShrink: 0 }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
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
                      aria-label={`Excluir lançamento de ${fmtBRL(Number(r.amount))} em ${r.revenue_date.slice(0, 10)}`}
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
            {social === null && (
              <div style={{ display: "grid", gap: 14 }}>
                <PageSkeletonCards count={2} height={180} />
              </div>
            )}

            {social !== null && social.length === 0 && (
              <EmptyState text="Nenhuma rede social conectada para esta empresa ainda." />
            )}

            {social !== null && social.length > 0 && (
              <>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <PeriodChip active={socialNetwork === "all"} onClick={() => setSocialNetwork("all")}>
                      Todas as redes
                    </PeriodChip>
                    {socialNetworks.map((net) => (
                      <PeriodChip key={net} active={socialNetwork === net} onClick={() => setSocialNetwork(net)}>
                        {NETWORK_LABEL[net] ?? net}
                      </PeriodChip>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {SOCIAL_PERIODS.map((p) => (
                      <PeriodChip key={p} active={socialPeriod === p} onClick={() => setSocialPeriod(p)}>
                        {p === 0 ? "Tudo" : `${p}d`}
                      </PeriodChip>
                    ))}
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
                  {visibleSocialNetworks.map((net) => {
                    const s = summarizeNetwork(net);
                    const color = NETWORK_COLOR[net] ?? "var(--blue-500)";
                    return (
                      <div key={net}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                          <span style={{ width: 9, height: 9, borderRadius: "50%", background: color, flexShrink: 0 }} />
                          <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>{NETWORK_LABEL[net] ?? net}</h3>
                          <span style={{ fontSize: 11.5, color: "var(--ink-faint)" }}>
                            {s.lastUpdated ? `atualizado em ${fmtDate(s.lastUpdated)}` : "sem dados"}
                          </span>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14, marginBottom: 16 }}>
                          <StatCard
                            label="Seguidores"
                            value={s.followers != null ? fmtInt(s.followers) : "—"}
                            hint={s.followers != null ? `snapshot de ${fmtDate(s.followersAsOf!)}` : "sem snapshot disponível"}
                          />
                          <StatCard
                            label={`Curtidas (${socialPeriod === 0 ? "tudo" : `${socialPeriod}d`})`}
                            value={fmtInt(s.totalLikes)}
                          />
                          <StatCard
                            label={`Comentários (${socialPeriod === 0 ? "tudo" : `${socialPeriod}d`})`}
                            value={fmtInt(s.totalComments)}
                          />
                          <StatCard
                            label="Engajamento médio/post"
                            value={s.postCount > 0 ? fmtInt(s.avgEngagement) : "—"}
                            hint={s.postCount > 0 ? `${s.postCount} publicação${s.postCount === 1 ? "" : "ões"} no período` : "sem publicações no período"}
                          />
                        </div>

                        {s.chartData.length > 0 ? (
                          <>
                            <div style={{ fontSize: 11.5, color: "var(--ink-faint)", marginBottom: 8 }}>
                              Curtidas + comentários por dia com publicação
                            </div>
                            <MiniBarChart
                              data={s.chartData}
                              color={color}
                              formatTooltip={(v) => `${fmtInt(v)} interações`}
                            />
                          </>
                        ) : (
                          <EmptyState text="Sem publicações registradas nesse período." />
                        )}

                        {s.recent.length > 0 && (
                          <div style={{ marginTop: 16 }}>
                            <div style={{ fontSize: 11.5, color: "var(--ink-faint)", marginBottom: 8 }}>
                              Atividade recente
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                              {s.recent.map((r) => (
                                <div
                                  key={r.id}
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 14,
                                    background: "var(--bg)",
                                    border: "1px solid var(--border)",
                                    borderRadius: 8,
                                    padding: "9px 12px",
                                    fontSize: 12.5,
                                  }}
                                >
                                  <span style={{ color: "var(--ink-faint)", fontFamily: "var(--font-mono)", flexShrink: 0, width: 68 }}>
                                    {fmtDate(r.date)}
                                  </span>
                                  <span style={{ color: "var(--ink-soft)" }}>
                                    {fmtInt(r.likes ?? 0)} curtidas · {fmtInt(r.comments ?? 0)} comentários
                                  </span>
                                  {r.followers != null && (
                                    <span style={{ marginLeft: "auto", color: "var(--ink-faint)", fontFamily: "var(--font-mono)" }}>
                                      {fmtInt(r.followers)} seguidores
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div style={{ fontSize: 11.5, color: "var(--ink-faint)", marginTop: 24 }}>
                  Seguidores mostram o snapshot mais recente da conta — a fonte de dados não guarda histórico diário de
                  seguidores. Curtidas e comentários são somados por dia com pelo menos uma publicação; dias sem post não
                  aparecem no gráfico.
                </div>
              </>
            )}
          </section>
        )}
      </main>
    </AppShell>
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

function MiniBarChart({
  data,
  color = "var(--blue-500)",
  formatTooltip = (v: number) => `R$ ${v.toFixed(2)}`,
}: {
  data: { label: string; value: number }[];
  color?: string;
  formatTooltip?: (value: number) => string;
}) {
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
        <div key={i} title={`${d.label}: ${formatTooltip(d.value)}`} style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 8 }}>
          <div
            style={{
              width: 8,
              height: Math.max((d.value / max) * 88, 2),
              background: color,
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

function PageSkeletonCards({ count = 3, height = 74 }: { count?: number; height?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          style={{
            height,
            borderRadius: "var(--radius-md)",
            background: "linear-gradient(90deg, var(--surface) 25%, var(--surface-hover) 37%, var(--surface) 63%)",
            backgroundSize: "400% 100%",
            animation: "shimmer 1.4s ease infinite",
          }}
        />
      ))}
      <style>{`@keyframes shimmer { 0% { background-position: 100% 0 } 100% { background-position: 0 0 } }`}</style>
    </>
  );
}
