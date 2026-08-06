import { useEffect, useState } from "react";
import TopBar from "../components/TopBar";
import { client, Company, CrmPipeline, CrmStage } from "../lib/neonClient";

const PALETTE = ["#3068e8", "#1a9c6b", "#c98a1a", "#e0483f", "#8b5cf6", "#0ea5e9", "#94a3b8"];

export default function ConfiguracoesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [newCompanyName, setNewCompanyName] = useState("");
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);

  const [pipeline, setPipeline] = useState<CrmPipeline | null>(null);
  const [stages, setStages] = useState<CrmStage[]>([]);
  const [leadCountByStage, setLeadCountByStage] = useState<Record<string, number>>({});

  useEffect(() => {
    loadCompanies();
  }, []);

  async function loadCompanies() {
    const { data, error: cErr } = await client.from("companies").select("*").order("name", { ascending: true });
    if (cErr) return setError(cErr.message);
    setCompanies((data as Company[]) ?? []);
  }

  async function toggleCompanyStatus(c: Company) {
    const newStatus = c.status === "active" ? "inactive" : "active";
    const { error: updErr } = await client.from("companies").update({ status: newStatus }).eq("id", c.id);
    if (updErr) return setError(updErr.message);
    setCompanies((prev) => prev.map((x) => (x.id === c.id ? { ...x, status: newStatus } : x)));
  }

  async function createCompany() {
    if (!newCompanyName.trim()) return;
    const slug = newCompanyName
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
    const { data, error: insErr } = await client
      .from("companies")
      .insert({ name: newCompanyName.trim(), slug, status: "active" })
      .select();
    if (insErr) return setError(insErr.message);
    const created = (data as Company[])?.[0];
    if (created) {
      setCompanies((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      // cria pipeline padrão automaticamente, igual às empresas existentes
      const { data: pl } = await client
        .from("crm_pipelines")
        .insert({ company_id: created.id, name: "Pipeline Padrão", is_default: true })
        .select();
      const p = (pl as CrmPipeline[])?.[0];
      if (p) {
        const defaults = ["Novo Lead", "Primeiro Contato", "Ligação Realizada", "Negociação", "Proposta", "Fechado", "Perdido"];
        await client
          .from("crm_stages")
          .insert(defaults.map((name, i) => ({ pipeline_id: p.id, name, color: PALETTE[i % PALETTE.length], position: i })));
      }
    }
    setNewCompanyName("");
  }

  async function selectCompany(companyId: string) {
    setSelectedCompanyId(companyId);
    setError(null);
    const { data: pipelines, error: pErr } = await client
      .from("crm_pipelines")
      .select("*")
      .eq("company_id", companyId)
      .eq("is_default", true);
    if (pErr) return setError(pErr.message);
    const p = (pipelines as CrmPipeline[])?.[0];
    setPipeline(p ?? null);
    if (!p) {
      setStages([]);
      return;
    }
    const [stagesRes, leadsRes] = await Promise.all([
      client.from("crm_stages").select("*").eq("pipeline_id", p.id).order("position", { ascending: true }),
      client.from("crm_leads").select("stage_id").eq("company_id", companyId).eq("archived", false),
    ]);
    if (stagesRes.error) return setError(stagesRes.error.message);
    setStages((stagesRes.data as CrmStage[]) ?? []);
    const counts: Record<string, number> = {};
    ((leadsRes.data as { stage_id: string }[]) ?? []).forEach((l) => {
      counts[l.stage_id] = (counts[l.stage_id] ?? 0) + 1;
    });
    setLeadCountByStage(counts);
  }

  async function renameStage(stageId: string, name: string) {
    setStages((prev) => prev.map((s) => (s.id === stageId ? { ...s, name } : s)));
  }

  async function commitStageName(stageId: string, name: string) {
    await client.from("crm_stages").update({ name }).eq("id", stageId);
  }

  async function recolorStage(stageId: string, color: string) {
    setStages((prev) => prev.map((s) => (s.id === stageId ? { ...s, color } : s)));
    await client.from("crm_stages").update({ color }).eq("id", stageId);
  }

  async function moveStage(stageId: string, direction: -1 | 1) {
    const idx = stages.findIndex((s) => s.id === stageId);
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= stages.length) return;
    const reordered = [...stages];
    [reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]];
    const updated = reordered.map((s, i) => ({ ...s, position: i }));
    setStages(updated);
    await Promise.all(updated.map((s) => client.from("crm_stages").update({ position: s.position }).eq("id", s.id)));
  }

  async function deleteStage(stageId: string) {
    const count = leadCountByStage[stageId] ?? 0;
    if (count > 0) {
      const target = stages.find((s) => s.id !== stageId);
      if (!target) {
        setError("Não é possível excluir a única coluna que resta enquanto ela tiver leads.");
        return;
      }
      const ok = window.confirm(
        `Esta coluna tem ${count} lead(s). Eles serão movidos para "${target.name}" antes da exclusão. Continuar?`
      );
      if (!ok) return;
      await client.from("crm_leads").update({ stage_id: target.id }).eq("stage_id", stageId);
    }
    const { error: delErr } = await client.from("crm_stages").delete().eq("id", stageId);
    if (delErr) return setError(delErr.message);
    setStages((prev) => prev.filter((s) => s.id !== stageId));
  }

  const [newStageName, setNewStageName] = useState("");
  async function addStage() {
    if (!pipeline || !newStageName.trim()) return;
    const { data, error: insErr } = await client
      .from("crm_stages")
      .insert({ pipeline_id: pipeline.id, name: newStageName.trim(), position: stages.length, color: PALETTE[stages.length % PALETTE.length] })
      .select();
    if (insErr) return setError(insErr.message);
    const created = (data as CrmStage[])?.[0];
    if (created) setStages((prev) => [...prev, created]);
    setNewStageName("");
  }

  return (
    <div>
      <TopBar breadcrumb={[{ label: "Configurações" }]} />
      <main style={{ maxWidth: 1000, margin: "0 auto", padding: "36px 32px 80px" }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 24px" }}>Configurações</h1>

        {error && (
          <div style={{ background: "var(--red-50)", color: "var(--red-500)", padding: 12, borderRadius: 10, fontSize: 13, marginBottom: 20 }}>
            {error}
          </div>
        )}

        <section style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>Empresas</h2>
          <div style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
            {companies.map((c) => (
              <div
                key={c.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "12px 16px",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <button
                  onClick={() => selectCompany(c.id)}
                  style={{
                    background: "none",
                    border: "none",
                    fontSize: 13.5,
                    fontWeight: selectedCompanyId === c.id ? 700 : 500,
                    color: selectedCompanyId === c.id ? "var(--blue-600)" : "var(--ink)",
                    textAlign: "left",
                  }}
                >
                  {c.name}
                </button>
                <button
                  onClick={() => toggleCompanyStatus(c)}
                  style={{
                    fontSize: 11.5,
                    fontWeight: 600,
                    padding: "4px 10px",
                    borderRadius: 20,
                    border: "none",
                    background: c.status === "active" ? "var(--green-50)" : "var(--surface)",
                    color: c.status === "active" ? "var(--green-500)" : "var(--ink-faint)",
                  }}
                >
                  {c.status === "active" ? "Ativa" : "Inativa"}
                </button>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <input
              placeholder="Nome da nova empresa"
              value={newCompanyName}
              onChange={(e) => setNewCompanyName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createCompany()}
              style={{ flex: 1, border: "1px solid var(--border-strong)", borderRadius: 8, padding: "9px 12px", fontSize: 13 }}
            />
            <button onClick={createCompany} style={{ background: "var(--blue-500)", color: "#fff", border: "none", borderRadius: 8, padding: "0 16px", fontSize: 13, fontWeight: 600 }}>
              + Adicionar empresa
            </button>
          </div>
        </section>

        {selectedCompanyId && (
          <section>
            <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>
              Pipeline — {companies.find((c) => c.id === selectedCompanyId)?.name}
            </h2>
            {!pipeline ? (
              <div style={{ color: "var(--ink-faint)", fontSize: 13 }}>Nenhum pipeline configurado.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {stages.map((s, i) => (
                  <div
                    key={s.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      background: "var(--bg)",
                      border: "1px solid var(--border)",
                      borderRadius: 10,
                      padding: "10px 12px",
                    }}
                  >
                    <div style={{ display: "flex", gap: 3 }}>
                      {PALETTE.map((color) => (
                        <button
                          key={color}
                          onClick={() => recolorStage(s.id, color)}
                          style={{
                            width: 16,
                            height: 16,
                            borderRadius: "50%",
                            background: color,
                            border: s.color === color ? "2px solid var(--ink)" : "1px solid transparent",
                          }}
                        />
                      ))}
                    </div>
                    <input
                      value={s.name}
                      onChange={(e) => renameStage(s.id, e.target.value)}
                      onBlur={(e) => commitStageName(s.id, e.target.value)}
                      style={{ flex: 1, border: "1px solid var(--border-strong)", borderRadius: 6, padding: "5px 8px", fontSize: 13 }}
                    />
                    <span style={{ fontSize: 11.5, color: "var(--ink-faint)", minWidth: 60, textAlign: "right" }}>
                      {leadCountByStage[s.id] ?? 0} lead(s)
                    </span>
                    <button onClick={() => moveStage(s.id, -1)} disabled={i === 0} style={arrowBtn}>
                      ↑
                    </button>
                    <button onClick={() => moveStage(s.id, 1)} disabled={i === stages.length - 1} style={arrowBtn}>
                      ↓
                    </button>
                    <button onClick={() => deleteStage(s.id)} style={{ ...arrowBtn, color: "var(--red-500)" }}>
                      ✕
                    </button>
                  </div>
                ))}
                <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                  <input
                    placeholder="Nova coluna"
                    value={newStageName}
                    onChange={(e) => setNewStageName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addStage()}
                    style={{ flex: 1, border: "1px solid var(--border-strong)", borderRadius: 8, padding: "9px 12px", fontSize: 13 }}
                  />
                  <button onClick={addStage} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "0 16px", fontSize: 13, color: "var(--ink-soft)" }}>
                    + Coluna
                  </button>
                </div>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

const arrowBtn: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  width: 26,
  height: 26,
  fontSize: 12,
  color: "var(--ink-soft)",
};
