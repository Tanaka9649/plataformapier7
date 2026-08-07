import { useEffect, useState } from "react";
import AppShell from "../components/AppShell";
import { client, Company, CrmPipeline, CrmStage, CrmCustomField, AppUser, Integration, getOrCreateAppUserId } from "../lib/neonClient";
import { useIsMobile } from "../lib/useIsMobile";

const PALETTE = ["#3068e8", "#1a9c6b", "#c98a1a", "#e0483f", "#8b5cf6", "#0ea5e9", "#94a3b8"];
const COLOR_NAMES: Record<string, string> = {
  "#3068e8": "azul",
  "#1a9c6b": "verde",
  "#c98a1a": "âmbar",
  "#e0483f": "vermelho",
  "#8b5cf6": "roxo",
  "#0ea5e9": "ciano",
  "#94a3b8": "cinza",
};

const FIELD_TYPE_LABELS: Record<CrmCustomField["field_type"], string> = {
  texto: "Texto curto",
  texto_longo: "Texto longo",
  numero: "Número",
  moeda: "Moeda (R$)",
  data: "Data",
  telefone: "Telefone",
  email: "E-mail",
  caixa_selecao: "Caixa de seleção (sim/não)",
  selecao: "Seleção única",
  multipla_selecao: "Seleção múltipla",
};

const PROVIDER_LABELS: Record<string, string> = {
  meta_ads: "Meta Ads",
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  google_my_business: "Google Meu Negócio",
};

export default function ConfiguracoesPage() {
  const isMobile = useIsMobile();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [newCompanyName, setNewCompanyName] = useState("");
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);

  const [users, setUsers] = useState<AppUser[]>([]);
  const [currentAppUserId, setCurrentAppUserId] = useState<string | null>(null);
  const [usersError, setUsersError] = useState<string | null>(null);

  const [pipeline, setPipeline] = useState<CrmPipeline | null>(null);
  const [stages, setStages] = useState<CrmStage[]>([]);
  const [leadCountByStage, setLeadCountByStage] = useState<Record<string, number>>({});
  const [customFields, setCustomFields] = useState<CrmCustomField[]>([]);
  const [newFieldName, setNewFieldName] = useState("");
  const [newFieldType, setNewFieldType] = useState<CrmCustomField["field_type"]>("texto");
  const [newFieldOptions, setNewFieldOptions] = useState("");
  const [integrations, setIntegrations] = useState<Integration[]>([]);

  const activeStages = stages.filter((s) => !s.archived).sort((a, b) => a.position - b.position);
  const archivedStages = stages.filter((s) => s.archived);

  useEffect(() => {
    loadCompanies();
    loadUsers();
    getOrCreateAppUserId().then(setCurrentAppUserId);
  }, []);

  async function loadUsers() {
    const { data, error: uErr } = await client.from("app_users").select("*").order("full_name", { ascending: true });
    if (uErr) return setUsersError(uErr.message);
    setUsers((data as AppUser[]) ?? []);
  }

  async function changeUserRole(userId: string, role: AppUser["role"]) {
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role } : u)));
    const { error: updErr } = await client.from("app_users").update({ role }).eq("id", userId);
    if (updErr) setUsersError(updErr.message);
  }

  async function toggleUserActive(user: AppUser) {
    if (user.id === currentAppUserId && user.active) {
      const ok = window.confirm("Você está prestes a desativar seu próprio acesso. Tem certeza?");
      if (!ok) return;
    }
    const nextActive = !user.active;
    setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, active: nextActive } : u)));
    const { error: updErr } = await client.from("app_users").update({ active: nextActive }).eq("id", user.id);
    if (updErr) setUsersError(updErr.message);
  }

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

    client
      .from("crm_custom_fields")
      .select("*")
      .eq("company_id", companyId)
      .order("position", { ascending: true })
      .then(({ data, error: fErr }) => {
        if (fErr) return setError(fErr.message);
        setCustomFields((data as CrmCustomField[]) ?? []);
      });

    client
      .from("integrations")
      .select("*")
      .eq("company_id", companyId)
      .then(({ data, error: iErr }) => {
        if (iErr) return setError(iErr.message);
        setIntegrations((data as Integration[]) ?? []);
      });

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

  async function addCustomField() {
    if (!selectedCompanyId || !newFieldName.trim()) return;
    const needsOptions = newFieldType === "selecao" || newFieldType === "multipla_selecao";
    const options = needsOptions
      ? newFieldOptions
          .split(",")
          .map((o) => o.trim())
          .filter(Boolean)
      : null;
    if (needsOptions && (!options || options.length < 2)) {
      setError("Pra seleção única/múltipla, informe pelo menos 2 opções separadas por vírgula.");
      return;
    }
    setError(null);
    const { data, error: insErr } = await client
      .from("crm_custom_fields")
      .insert({
        company_id: selectedCompanyId,
        name: newFieldName.trim(),
        field_type: newFieldType,
        options,
        position: customFields.length,
      })
      .select();
    if (insErr) return setError(insErr.message);
    const created = (data as CrmCustomField[])?.[0];
    if (created) setCustomFields((prev) => [...prev, created]);
    setNewFieldName("");
    setNewFieldOptions("");
    setNewFieldType("texto");
  }

  async function deleteCustomField(fieldId: string) {
    const ok = window.confirm("Excluir este campo? Os valores já preenchidos nos leads também serão apagados.");
    if (!ok) return;
    const { error: delErr } = await client.from("crm_custom_fields").delete().eq("id", fieldId);
    if (delErr) return setError(delErr.message);
    setCustomFields((prev) => prev.filter((f) => f.id !== fieldId));
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

  async function updateWipLimit(stageId: string, raw: string) {
    const trimmed = raw.trim();
    const parsed = trimmed === "" ? null : parseInt(trimmed, 10);
    // entrada inválida (ex: texto) não deve virar 0 silenciosamente — 0 bloquearia visualmente a coluna inteira
    const value = parsed === null || isNaN(parsed) ? null : Math.max(0, parsed);
    setStages((prev) => prev.map((s) => (s.id === stageId ? { ...s, wip_limit: value } : s)));
    await client.from("crm_stages").update({ wip_limit: value }).eq("id", stageId);
  }

  async function moveStage(stageId: string, direction: -1 | 1) {
    const idx = activeStages.findIndex((s) => s.id === stageId);
    const swapIdx = idx + direction;
    if (idx === -1 || swapIdx < 0 || swapIdx >= activeStages.length) return;
    const reordered = [...activeStages];
    [reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]];
    const updated = reordered.map((s, i) => ({ ...s, position: i }));
    setStages((prev) => prev.map((s) => updated.find((u) => u.id === s.id) ?? s));
    await Promise.all(updated.map((s) => client.from("crm_stages").update({ position: s.position }).eq("id", s.id)));
  }

  async function deleteStage(stageId: string) {
    const count = leadCountByStage[stageId] ?? 0;
    if (count > 0) {
      const target = activeStages.find((s) => s.id !== stageId);
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

  async function archiveStage(stageId: string) {
    const target = stages.find((s) => s.id === stageId);
    if (!target) return;
    const count = leadCountByStage[stageId] ?? 0;
    const ok = window.confirm(
      count > 0
        ? `Arquivar "${target.name}"? Ela e os ${count} lead(s) dentro dela ficam ocultos até você desarquivar.`
        : `Arquivar a coluna "${target.name}"?`
    );
    if (!ok) return;
    const { error: updErr } = await client.from("crm_stages").update({ archived: true }).eq("id", stageId);
    if (updErr) return setError(updErr.message);
    setStages((prev) => prev.map((s) => (s.id === stageId ? { ...s, archived: true } : s)));
  }

  async function unarchiveStage(stageId: string) {
    const nextPosition = activeStages.length > 0 ? Math.max(...activeStages.map((s) => s.position)) + 1 : 0;
    const { error: updErr } = await client.from("crm_stages").update({ archived: false, position: nextPosition }).eq("id", stageId);
    if (updErr) return setError(updErr.message);
    setStages((prev) => prev.map((s) => (s.id === stageId ? { ...s, archived: false, position: nextPosition } : s)));
  }

  async function duplicateStage(stageId: string) {
    const source = activeStages.find((s) => s.id === stageId);
    if (!source || !pipeline) return;
    const insertAt = activeStages.findIndex((s) => s.id === stageId) + 1;

    // abre espaço na posição seguinte à original, empurrando as colunas ativas depois dela
    const toShift = activeStages.filter((s) => s.position >= insertAt);
    if (toShift.length > 0) {
      await Promise.all(toShift.map((s) => client.from("crm_stages").update({ position: s.position + 1 }).eq("id", s.id)));
    }

    const { data, error: insErr } = await client
      .from("crm_stages")
      .insert({
        pipeline_id: pipeline.id,
        name: `${source.name} (cópia)`,
        color: source.color,
        position: insertAt,
        wip_limit: source.wip_limit ?? null,
      })
      .select();
    if (insErr) return setError(insErr.message);
    const created = (data as CrmStage[])?.[0];
    if (!created) return;

    setStages((prev) => {
      const shifted = prev.map((s) => (!s.archived && s.position >= insertAt ? { ...s, position: s.position + 1 } : s));
      return [...shifted, created];
    });
  }

  const [newStageName, setNewStageName] = useState("");
  async function addStage() {
    if (!pipeline || !newStageName.trim()) return;
    const { data, error: insErr } = await client
      .from("crm_stages")
      .insert({ pipeline_id: pipeline.id, name: newStageName.trim(), position: activeStages.length, color: PALETTE[activeStages.length % PALETTE.length] })
      .select();
    if (insErr) return setError(insErr.message);
    const created = (data as CrmStage[])?.[0];
    if (created) setStages((prev) => [...prev, created]);
    setNewStageName("");
  }

  return (
    <AppShell breadcrumb={[{ label: "Configurações" }]}>
      <main style={{ maxWidth: 1000, margin: "0 auto", padding: isMobile ? "24px 16px 60px" : "36px 32px 80px" }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 24px" }}>Configurações</h1>

        {error && (
          <div style={{ background: "var(--red-50)", color: "var(--red-500)", padding: 12, borderRadius: 10, fontSize: 13, marginBottom: 20 }}>
            {error}
          </div>
        )}

        <section style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>Usuários</h2>
          {usersError && (
            <div style={{ background: "var(--red-50)", color: "var(--red-500)", padding: 10, borderRadius: 8, fontSize: 12.5, marginBottom: 12 }}>
              {usersError}
            </div>
          )}
          <div style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
            {users.map((u) => (
              <div
                key={u.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  flexWrap: isMobile ? "wrap" : "nowrap",
                  padding: "12px 16px",
                  borderBottom: "1px solid var(--border)",
                  opacity: u.active ? 1 : 0.6,
                }}
              >
                <div style={{ flex: "1 1 160px", minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {u.full_name || u.email || "—"}
                    {u.id === currentAppUserId && <span style={{ color: "var(--ink-faint)", fontWeight: 500 }}> (você)</span>}
                  </div>
                  {u.full_name && u.email && (
                    <div style={{ fontSize: 11.5, color: "var(--ink-faint)" }}>{u.email}</div>
                  )}
                </div>
                <select
                  value={u.role}
                  onChange={(e) => changeUserRole(u.id, e.target.value as AppUser["role"])}
                  style={{ border: "1px solid var(--border-strong)", borderRadius: 8, padding: "6px 8px", fontSize: 12.5, background: "var(--surface)" }}
                >
                  <option value="operator">Operador</option>
                  <option value="admin">Admin</option>
                </select>
                <button
                  onClick={() => toggleUserActive(u)}
                  style={{
                    fontSize: 11.5,
                    fontWeight: 600,
                    padding: "4px 10px",
                    borderRadius: 20,
                    border: "none",
                    background: u.active ? "var(--green-50)" : "var(--surface)",
                    color: u.active ? "var(--green-500)" : "var(--ink-faint)",
                  }}
                >
                  {u.active ? "Ativo" : "Inativo"}
                </button>
              </div>
            ))}
            {users.length === 0 && (
              <div style={{ padding: 16, fontSize: 12.5, color: "var(--ink-faint)" }}>
                Nenhum usuário ainda — a conta é criada automaticamente no primeiro login de cada pessoa.
              </div>
            )}
          </div>
          <p style={{ fontSize: 11.5, color: "var(--ink-faint)", marginTop: 8 }}>
            Não existe criação manual de usuário aqui — cada pessoa cria o próprio acesso na tela de login. Esta lista serve
            pra gerenciar papel (admin/operador) e ativar/desativar acesso de quem já entrou pelo menos uma vez.
          </p>
        </section>

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
                {activeStages.map((s, i) => (
                  <div
                    key={s.id}
                    style={{
                      display: "flex",
                      flexWrap: isMobile ? "wrap" : "nowrap",
                      rowGap: 8,
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
                          aria-label={`Cor ${COLOR_NAMES[color] ?? color} pra coluna "${s.name}"`}
                          aria-pressed={s.color === color}
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
                      style={{ flex: "1 1 130px", minWidth: 0, border: "1px solid var(--border-strong)", borderRadius: 6, padding: "5px 8px", fontSize: 13 }}
                    />
                    <span style={{ fontSize: 11.5, color: "var(--ink-faint)", minWidth: isMobile ? "auto" : 60, textAlign: "right" }}>
                      {leadCountByStage[s.id] ?? 0}{isMobile ? "" : " lead(s)"}
                    </span>
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <label style={{ fontSize: 11, color: "var(--ink-faint)", whiteSpace: "nowrap" }}>Limite</label>
                      <input
                        type="number"
                        min={0}
                        placeholder="—"
                        defaultValue={s.wip_limit ?? ""}
                        onBlur={(e) => updateWipLimit(s.id, e.target.value)}
                        title="Limite de cards nesta coluna (vazio = sem limite)"
                        style={{ width: 48, border: "1px solid var(--border-strong)", borderRadius: 6, padding: "5px 6px", fontSize: 12.5, textAlign: "center" }}
                      />
                    </div>
                    <button onClick={() => moveStage(s.id, -1)} disabled={i === 0} style={arrowBtn} aria-label={`Mover coluna "${s.name}" pra cima`}>
                      ↑
                    </button>
                    <button onClick={() => moveStage(s.id, 1)} disabled={i === activeStages.length - 1} style={arrowBtn} aria-label={`Mover coluna "${s.name}" pra baixo`}>
                      ↓
                    </button>
                    <button onClick={() => duplicateStage(s.id)} title="Duplicar coluna" style={arrowBtn} aria-label={`Duplicar coluna "${s.name}"`}>
                      ⧉
                    </button>
                    <button onClick={() => archiveStage(s.id)} title="Arquivar coluna" style={arrowBtn} aria-label={`Arquivar coluna "${s.name}"`}>
                      🗄
                    </button>
                    <button onClick={() => deleteStage(s.id)} style={{ ...arrowBtn, color: "var(--red-500)" }} aria-label={`Excluir coluna "${s.name}"`}>
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

                {archivedStages.length > 0 && (
                  <div style={{ marginTop: 28 }}>
                    <h3 style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-faint)", marginBottom: 10 }}>
                      Colunas arquivadas
                    </h3>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {archivedStages.map((s) => (
                        <div
                          key={s.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            background: "var(--surface)",
                            border: "1px solid var(--border)",
                            borderRadius: 10,
                            padding: "10px 12px",
                            opacity: 0.75,
                          }}
                        >
                          <span style={{ width: 8, height: 8, borderRadius: "50%", background: s.color }} />
                          <span style={{ flex: 1, fontSize: 13, color: "var(--ink-soft)" }}>{s.name}</span>
                          <button
                            onClick={() => unarchiveStage(s.id)}
                            style={{ background: "var(--bg)", border: "1px solid var(--border-strong)", borderRadius: 8, padding: "5px 12px", fontSize: 12.5, color: "var(--ink)" }}
                          >
                            Desarquivar
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {selectedCompanyId && (
          <section style={{ marginTop: 40 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>Campos personalizados</h2>
            <p style={{ fontSize: 12.5, color: "var(--ink-faint)", marginTop: -8, marginBottom: 16 }}>
              Campos extras que aparecem no painel de detalhes de cada lead desta empresa.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
              {customFields.map((f) => (
                <div
                  key={f.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    background: "var(--bg)",
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                    padding: "10px 12px",
                    flexWrap: isMobile ? "wrap" : "nowrap",
                  }}
                >
                  <span style={{ flex: "1 1 140px", fontSize: 13, fontWeight: 600 }}>{f.name}</span>
                  <span style={{ fontSize: 11.5, color: "var(--ink-faint)", background: "var(--surface)", borderRadius: 20, padding: "3px 10px" }}>
                    {FIELD_TYPE_LABELS[f.field_type]}
                  </span>
                  {f.options && f.options.length > 0 && (
                    <span style={{ fontSize: 11, color: "var(--ink-faint)" }}>{f.options.join(", ")}</span>
                  )}
                  <button
                    onClick={() => deleteCustomField(f.id)}
                    style={{ marginLeft: "auto", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, width: 26, height: 26, fontSize: 12, color: "var(--red-500)" }}
                    aria-label={`Excluir campo "${f.name}"`}
                  >
                    ✕
                  </button>
                </div>
              ))}
              {customFields.length === 0 && (
                <div style={{ fontSize: 12.5, color: "var(--ink-faint)" }}>Nenhum campo personalizado ainda.</div>
              )}
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 160px" }}>
                <label style={{ fontSize: 11, color: "var(--ink-faint)" }}>Nome do campo</label>
                <input
                  placeholder="ex: Origem do orçamento"
                  value={newFieldName}
                  onChange={(e) => setNewFieldName(e.target.value)}
                  style={{ border: "1px solid var(--border-strong)", borderRadius: 8, padding: "8px 10px", fontSize: 13 }}
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 11, color: "var(--ink-faint)" }}>Tipo</label>
                <select
                  value={newFieldType}
                  onChange={(e) => setNewFieldType(e.target.value as CrmCustomField["field_type"])}
                  style={{ border: "1px solid var(--border-strong)", borderRadius: 8, padding: "8px 10px", fontSize: 13, background: "var(--bg)" }}
                >
                  {Object.entries(FIELD_TYPE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              {(newFieldType === "selecao" || newFieldType === "multipla_selecao") && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 200px" }}>
                  <label style={{ fontSize: 11, color: "var(--ink-faint)" }}>Opções (separadas por vírgula)</label>
                  <input
                    placeholder="ex: Baixo, Médio, Alto"
                    value={newFieldOptions}
                    onChange={(e) => setNewFieldOptions(e.target.value)}
                    style={{ border: "1px solid var(--border-strong)", borderRadius: 8, padding: "8px 10px", fontSize: 13 }}
                  />
                </div>
              )}
              <button
                onClick={addCustomField}
                style={{ background: "var(--blue-500)", color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 13, fontWeight: 600 }}
              >
                + Adicionar campo
              </button>
            </div>
          </section>
        )}

        {selectedCompanyId && (
          <section style={{ marginTop: 40 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>Integrações</h2>
            <p style={{ fontSize: 12.5, color: "var(--ink-faint)", marginTop: -8, marginBottom: 16 }}>
              Só leitura — mostra o que está conectado pra essa empresa. Pra conectar ou desconectar uma integração, isso é
              feito direto no Windsor.ai, não aqui.
            </p>
            <div style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
              {integrations.map((i) => (
                <div
                  key={i.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "12px 16px",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  <span style={{ flex: "1 1 140px", fontSize: 13, fontWeight: 600 }}>
                    {PROVIDER_LABELS[i.provider] ?? i.provider}
                  </span>
                  <span
                    style={{
                      fontSize: 11.5,
                      fontWeight: 600,
                      padding: "4px 10px",
                      borderRadius: 20,
                      background: i.status === "connected" ? "var(--green-50)" : "var(--surface)",
                      color: i.status === "connected" ? "var(--green-500)" : "var(--ink-faint)",
                    }}
                  >
                    {i.status === "connected" ? "Conectado" : i.status === "not_connected" ? "Não conectado" : i.status}
                  </span>
                  <span style={{ fontSize: 11.5, color: "var(--ink-faint)", marginLeft: "auto" }}>
                    {i.last_sync_at
                      ? `Última sincronização: ${new Date(i.last_sync_at).toLocaleString("pt-BR")}`
                      : "Nunca sincronizado"}
                  </span>
                </div>
              ))}
              {integrations.length === 0 && (
                <div style={{ padding: 16, fontSize: 12.5, color: "var(--ink-faint)" }}>
                  Nenhuma integração registrada pra essa empresa ainda.
                </div>
              )}
            </div>
          </section>
        )}
      </main>
    </AppShell>
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
