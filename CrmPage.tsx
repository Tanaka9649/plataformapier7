import { useEffect, useState, useCallback, lazy, Suspense } from "react";
import { useParams } from "react-router-dom";
import AppShell from "../components/AppShell";
import StatCard from "../components/StatCard";
import LeadDetailPanel from "../components/LeadDetailPanel";
import { client, Company, CrmPipeline, CrmStage, CrmLead, getOrCreateAppUserId, getCurrentUserRole, logAudit } from "../lib/neonClient";
import { useIsMobile } from "../lib/useIsMobile";
import { Search, Upload, Phone, MessageCircle, Plus } from "lucide-react";

// xlsx sozinho é ~7MB de fonte — só carrega quando a pessoa realmente abre "Importar leads",
// em vez de entrar no bundle inicial do CRM pra todo mundo.
const ImportLeadsModal = lazy(() => import("../components/ImportLeadsModal"));

const fmtBRL = (n: number) => "R$ " + n.toLocaleString("pt-BR", { minimumFractionDigits: 2 });
const fmtInt = (n: number) => Math.round(n).toLocaleString("pt-BR");
const initials = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

type Tag = { id: string; name: string; color: string };

export default function CrmPage() {
  const { slug } = useParams();
  const [company, setCompany] = useState<Company | null>(null);
  const [pipeline, setPipeline] = useState<CrmPipeline | null>(null);
  const [stages, setStages] = useState<CrmStage[]>([]);
  const [leads, setLeads] = useState<CrmLead[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dragLeadId, setDragLeadId] = useState<string | null>(null);
  const [dragOverStageId, setDragOverStageId] = useState<string | null>(null);
  const [addingLeadStage, setAddingLeadStage] = useState<string | null>(null);
  const [newLeadName, setNewLeadName] = useState("");
  const [addingStage, setAddingStage] = useState(false);
  const [newStageName, setNewStageName] = useState("");
  const [selectedLead, setSelectedLead] = useState<CrmLead | null>(null);
  const [leadTags, setLeadTags] = useState<Record<string, Tag[]>>({});
  const [showImport, setShowImport] = useState(false);
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState<string>("");
  const [mobileStageId, setMobileStageId] = useState<string>("");
  const isMobile = useIsMobile();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    getCurrentUserRole().then((r) => setIsAdmin(r === "admin"));
  }, []);

  const filteredLeads = leads.filter((l) => {
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const matches =
        l.name.toLowerCase().includes(q) ||
        (l.phone ?? "").toLowerCase().includes(q) ||
        (l.city ?? "").toLowerCase().includes(q);
      if (!matches) return false;
    }
    if (tagFilter) {
      const tags = leadTags[l.id] ?? [];
      if (!tags.some((t) => t.id === tagFilter)) return false;
    }
    return true;
  });

  const allTagsFlat = Array.from(
    new Map(Object.values(leadTags).flat().map((t) => [t.id, t])).values()
  );

  const openPotentialValue = filteredLeads
    .filter((l) => l.closed_value == null)
    .reduce((s, l) => s + Number(l.potential_value ?? 0), 0);
  const closedValue = filteredLeads.reduce((s, l) => s + Number(l.closed_value ?? 0), 0);

  const load = useCallback(async () => {
    if (!slug) return;
    const { data: companies, error: cErr } = await client.from("companies").select("*").eq("slug", slug);
    if (cErr) return setError(cErr.message);
    const c = (companies as Company[])?.[0];
    if (!c) return setError("Empresa não encontrada.");
    setCompany(c);

    const { data: pipelines, error: pErr } = await client
      .from("crm_pipelines")
      .select("*")
      .eq("company_id", c.id)
      .eq("is_default", true);
    if (pErr) return setError(pErr.message);
    const p = (pipelines as CrmPipeline[])?.[0];
    if (!p) return setError("Nenhum pipeline configurado para esta empresa ainda.");
    setPipeline(p);

    const [s, l] = await Promise.all([
      client.from("crm_stages").select("*").eq("pipeline_id", p.id).eq("archived", false).order("position", { ascending: true }),
      client
        .from("crm_leads")
        .select("*")
        .eq("company_id", c.id)
        .eq("archived", false)
        .order("updated_at", { ascending: false }),
    ]);
    if (s.error) return setError(s.error.message);
    if (l.error) return setError(l.error.message);
    setStages(s.data as CrmStage[]);
    setLeads(l.data as CrmLead[]);
    if (!mobileStageId && (s.data as CrmStage[])?.length) {
      setMobileStageId((s.data as CrmStage[])[0].id);
    }

    const leadIds = ((l.data as CrmLead[]) ?? []).map((ld) => ld.id);
    if (leadIds.length > 0) {
      const [tagsRes, linkRes] = await Promise.all([
        client.from("crm_tags").select("id,name,color").eq("company_id", c.id),
        client.from("crm_lead_tags").select("lead_id,tag_id").in("lead_id", leadIds),
      ]);
      if (!tagsRes.error && !linkRes.error) {
        const tagsById: Record<string, Tag> = {};
        (tagsRes.data as (Tag & { id: string })[]).forEach((t) => (tagsById[t.id] = t));
        const grouped: Record<string, Tag[]> = {};
        (linkRes.data as { lead_id: string; tag_id: string }[]).forEach((row) => {
          const tag = tagsById[row.tag_id];
          if (!tag) return;
          if (!grouped[row.lead_id]) grouped[row.lead_id] = [];
          grouped[row.lead_id].push(tag);
        });
        setLeadTags(grouped);
      }
    }
  }, [slug]);

  useEffect(() => {
    load();
  }, [load]);

  async function moveLead(leadId: string, toStageId: string) {
    const lead = leads.find((l) => l.id === leadId);
    if (!lead || lead.stage_id === toStageId) return;
    const fromStageId = lead.stage_id;

    // atualização otimista
    setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, stage_id: toStageId } : l)));

    const { error: updErr } = await client
      .from("crm_leads")
      .update({ stage_id: toStageId, updated_at: new Date().toISOString() })
      .eq("id", leadId);

    if (updErr) {
      // desfaz a movimentação em caso de falha
      setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, stage_id: fromStageId } : l)));
      setError(`Não foi possível mover o lead: ${updErr.message}`);
      return;
    }

    const userId = await getOrCreateAppUserId();
    await client.from("crm_lead_history").insert({
      lead_id: leadId,
      from_stage_id: fromStageId,
      to_stage_id: toStageId,
      user_id: userId,
    });
    await logAudit("crm_leads", leadId, "move_stage", { stage_id: fromStageId }, { stage_id: toStageId });
  }

  async function createLead(stageId: string) {
    if (!company || !pipeline || !newLeadName.trim()) return;
    const { data, error: insErr } = await client
      .from("crm_leads")
      .insert({
        company_id: company.id,
        pipeline_id: pipeline.id,
        stage_id: stageId,
        name: newLeadName.trim(),
      })
      .select();
    if (insErr) return setError(`Não foi possível criar o lead: ${insErr.message}`);
    const created = (data as CrmLead[])?.[0];
    if (created) {
      setLeads((prev) => [created, ...prev]);
      await logAudit("crm_leads", created.id, "create", null, created);
    }
    setNewLeadName("");
    setAddingLeadStage(null);
  }

  async function createStage() {
    if (!pipeline || !newStageName.trim()) return;
    const { data, error: insErr } = await client
      .from("crm_stages")
      .insert({ pipeline_id: pipeline.id, name: newStageName.trim(), position: stages.length })
      .select();
    if (insErr) return setError(`Não foi possível criar a coluna: ${insErr.message}`);
    const created = (data as CrmStage[])?.[0];
    if (created) setStages((prev) => [...prev, created]);
    setNewStageName("");
    setAddingStage(false);
  }

  return (
    <AppShell
      breadcrumb={
        company
          ? [
              { label: "Empresas", to: "/" },
              { label: company.name, to: `/empresa/${slug}` },
              { label: "CRM" },
            ]
          : [{ label: "Empresas", to: "/" }]
      }
    >
      <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {error && (
        <div style={{ background: "var(--red-50)", color: "var(--red-500)", padding: "10px 32px", fontSize: 13 }}>
          {error}
        </div>
      )}

      <div style={{ padding: isMobile ? "16px 16px 0" : "20px 32px 0" }}>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(3, 1fr)" : "repeat(3, minmax(160px, 220px))", gap: 12, marginBottom: 4 }}>
          <StatCard label="Leads no funil" value={fmtInt(filteredLeads.length)} />
          <StatCard
            label="Valor potencial em aberto"
            value={fmtBRL(openPotentialValue)}
            hint={openPotentialValue === 0 ? "sem valor potencial lançado" : undefined}
          />
          <StatCard
            label="Valor fechado"
            value={fmtBRL(closedValue)}
            hint={closedValue === 0 ? "nenhum negócio fechado ainda" : undefined}
          />
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          alignItems: "center",
          justifyContent: "space-between",
          padding: isMobile ? "16px 16px 0" : "20px 32px 0",
        }}
      >
        <div style={{ display: "flex", gap: 8, flex: 1, minWidth: 200, maxWidth: 460 }}>
          <div style={{ position: "relative", flex: 1 }}>
            <Search size={14} strokeWidth={2.2} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "var(--ink-faint)", pointerEvents: "none" }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome, telefone ou cidade…"
              style={{
                width: "100%",
                border: "1px solid var(--border-strong)",
                borderRadius: 8,
                padding: "8px 12px 8px 32px",
                fontSize: 13,
                background: "var(--bg)",
              }}
            />
          </div>
          {allTagsFlat.length > 0 && (
            <select
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              style={{ border: "1px solid var(--border-strong)", borderRadius: 8, padding: "0 8px", fontSize: 12.5, background: "var(--bg)", color: "var(--ink-soft)" }}
            >
              <option value="">Todas as etiquetas</option>
              {allTagsFlat.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          )}
        </div>
        <button
          onClick={() => setShowImport(true)}
          disabled={!pipeline}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: "var(--bg)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: "8px 14px",
            fontSize: 12.5,
            fontWeight: 600,
            color: "var(--ink-soft)",
          }}
        >
          <Upload size={14} strokeWidth={2.2} />
          Importar leads
        </button>
      </div>

      {isMobile && stages.length > 0 && (
        <div style={{ display: "flex", gap: 6, overflowX: "auto", padding: "12px 16px 0" }}>
          {stages.map((s) => (
            <button
              key={s.id}
              onClick={() => setMobileStageId(s.id)}
              style={{
                flexShrink: 0,
                fontSize: 12.5,
                fontWeight: 600,
                padding: "6px 12px",
                borderRadius: 20,
                border: mobileStageId === s.id ? `1px solid ${s.color}` : "1px solid var(--border)",
                background: mobileStageId === s.id ? s.color + "1A" : "var(--surface)",
                color: mobileStageId === s.id ? s.color : "var(--ink-faint)",
              }}
            >
              {s.name} · {filteredLeads.filter((l) => l.stage_id === s.id).length}
            </button>
          ))}
        </div>
      )}

      <div style={{ flex: 1, overflowX: isMobile ? "hidden" : "auto", padding: isMobile ? "16px" : "24px 32px" }}>
        <div style={{ display: "flex", gap: 16, height: "100%", minWidth: isMobile ? "auto" : "min-content" }}>
          {(isMobile ? stages.filter((s) => s.id === mobileStageId) : stages).map((stage) => {
            const stageLeads = filteredLeads.filter((l) => l.stage_id === stage.id);
            const overWip = stage.wip_limit != null && stageLeads.length > stage.wip_limit;
            const isDropTarget = dragOverStageId === stage.id;
            return (
              <div
                key={stage.id}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (dragOverStageId !== stage.id) setDragOverStageId(stage.id);
                }}
                onDragLeave={() => setDragOverStageId((cur) => (cur === stage.id ? null : cur))}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragLeadId) moveLead(dragLeadId, stage.id);
                  setDragLeadId(null);
                  setDragOverStageId(null);
                }}
                style={{
                  width: isMobile ? "100%" : 268,
                  flexShrink: 0,
                  background: "var(--surface)",
                  borderRadius: "var(--radius-md)",
                  borderTop: `3px solid ${stage.color}`,
                  boxShadow: isDropTarget ? `0 0 0 2px ${stage.color}` : "none",
                  outline: isDropTarget ? `2px dashed ${stage.color}` : "2px dashed transparent",
                  outlineOffset: -2,
                  padding: 12,
                  display: "flex",
                  flexDirection: "column",
                  transition: "box-shadow var(--duration-fast) var(--ease), outline-color var(--duration-fast) var(--ease)",
                }}
              >
                <div style={{ padding: "6px 6px 10px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>{stage.name}</span>
                    <span
                      style={{
                        fontSize: 11.5,
                        fontWeight: 700,
                        padding: "1px 7px",
                        borderRadius: 20,
                        marginLeft: "auto",
                        background: overWip ? "var(--red-50)" : "var(--surface-hover)",
                        color: overWip ? "var(--red-500)" : "var(--ink-faint)",
                      }}
                    >
                      {stageLeads.length}
                      {stage.wip_limit != null ? `/${stage.wip_limit}` : ""}
                    </span>
                  </div>
                  {stage.wip_limit != null && (
                    <div style={{ background: "var(--border)", borderRadius: 20, height: 3, marginTop: 8, overflow: "hidden" }}>
                      <div
                        style={{
                          width: `${Math.min((stageLeads.length / stage.wip_limit) * 100, 100)}%`,
                          height: "100%",
                          borderRadius: 20,
                          background: overWip ? "var(--red-500)" : stage.color,
                          transition: "width var(--duration-base) var(--ease)",
                        }}
                      />
                    </div>
                  )}
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1, minHeight: 40 }}>
                  {stageLeads.map((lead) => (
                    <div
                      key={lead.id}
                      className="card-hover"
                      draggable={!isMobile}
                      onDragStart={() => setDragLeadId(lead.id)}
                      onDragEnd={() => {
                        setDragLeadId(null);
                        setDragOverStageId(null);
                      }}
                      onClick={() => setSelectedLead(lead)}
                      style={{
                        background: "var(--bg)",
                        border: "1px solid var(--border)",
                        borderLeft: `3px solid ${stage.color}`,
                        borderRadius: 10,
                        padding: "11px 13px",
                        boxShadow: "var(--shadow-xs)",
                        cursor: "grab",
                        opacity: dragLeadId === lead.id ? 0.4 : 1,
                        transform: dragLeadId === lead.id ? "scale(0.97)" : "scale(1)",
                        transition: "opacity var(--duration-fast) var(--ease), transform var(--duration-fast) var(--ease)",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
                        <span
                          style={{
                            flexShrink: 0,
                            width: 24,
                            height: 24,
                            borderRadius: "50%",
                            background: stage.color + "1A",
                            color: stage.color,
                            fontSize: 10.5,
                            fontWeight: 700,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            marginTop: 1,
                          }}
                        >
                          {initials(lead.name)}
                        </span>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: 13.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {lead.name}
                          </div>
                          {lead.city && (
                            <div style={{ fontSize: 11.5, color: "var(--ink-faint)", marginTop: 1 }}>{lead.city}</div>
                          )}
                        </div>
                      </div>

                      {lead.phone && (
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
                          <div style={{ fontSize: 12, color: "var(--ink-faint)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {lead.phone}
                          </div>
                          <a
                            href={`tel:${lead.phone.replace(/\D/g, "")}`}
                            onClick={(e) => e.stopPropagation()}
                            title="Ligar"
                            style={{
                              flexShrink: 0,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              width: 22,
                              height: 22,
                              borderRadius: "50%",
                              background: "var(--surface)",
                              color: "var(--ink-soft)",
                            }}
                          >
                            <Phone size={11} strokeWidth={2.2} />
                          </a>
                          <a
                            href={`https://wa.me/55${lead.phone.replace(/\D/g, "")}`}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            title="WhatsApp"
                            style={{
                              flexShrink: 0,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              width: 22,
                              height: 22,
                              borderRadius: "50%",
                              background: "var(--green-50)",
                              color: "var(--green-500)",
                            }}
                          >
                            <MessageCircle size={11} strokeWidth={2.2} />
                          </a>
                        </div>
                      )}
                      {leadTags[lead.id]?.length > 0 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 }}>
                          {leadTags[lead.id].map((t) => (
                            <span
                              key={t.id}
                              style={{
                                fontSize: 10,
                                fontWeight: 600,
                                padding: "2px 7px",
                                borderRadius: 20,
                                background: t.color + "1A",
                                color: t.color,
                              }}
                            >
                              {t.name}
                            </span>
                          ))}
                        </div>
                      )}
                      {lead.score != null && (
                        <div style={{ fontSize: 11.5, color: "var(--amber-500)", marginTop: 8, letterSpacing: -0.5 }}>
                          {"★".repeat(lead.score)}
                          {"☆".repeat(10 - lead.score)}
                        </div>
                      )}
                      {isMobile && (
                        <select
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            e.stopPropagation();
                            if (e.target.value) moveLead(lead.id, e.target.value);
                          }}
                          value=""
                          style={{
                            marginTop: 8,
                            width: "100%",
                            border: "1px solid var(--border-strong)",
                            borderRadius: 6,
                            padding: "5px 6px",
                            fontSize: 11.5,
                            color: "var(--ink-soft)",
                          }}
                        >
                          <option value="">Mover para…</option>
                          {stages
                            .filter((s) => s.id !== stage.id)
                            .map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name}
                              </option>
                            ))}
                        </select>
                      )}
                    </div>
                  ))}

                  {stageLeads.length === 0 && (
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--ink-faint)",
                        padding: "16px 10px",
                        textAlign: "center",
                        border: "1px dashed var(--border-strong)",
                        borderRadius: 8,
                      }}
                    >
                      Sem leads nesta etapa.
                    </div>
                  )}
                </div>

                {addingLeadStage === stage.id ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
                    <input
                      autoFocus
                      value={newLeadName}
                      onChange={(e) => setNewLeadName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && createLead(stage.id)}
                      placeholder="Nome do lead"
                      style={{
                        border: "1px solid var(--border-strong)",
                        borderRadius: 8,
                        padding: "8px 10px",
                        fontSize: 13,
                        background: "var(--bg)",
                      }}
                    />
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        onClick={() => createLead(stage.id)}
                        style={{ background: "var(--blue-500)", color: "#fff", border: "none", borderRadius: 8, padding: "6px 10px", fontSize: 12.5, fontWeight: 600 }}
                      >
                        Adicionar
                      </button>
                      <button
                        onClick={() => setAddingLeadStage(null)}
                        style={{ background: "none", border: "none", color: "var(--ink-faint)", fontSize: 12.5 }}
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setAddingLeadStage(stage.id)}
                    style={{
                      marginTop: 8,
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                      background: "none",
                      border: "none",
                      color: "var(--ink-faint)",
                      fontSize: 12.5,
                      fontWeight: 500,
                      textAlign: "left",
                      padding: "7px 6px",
                      borderRadius: 6,
                    }}
                  >
                    <Plus size={13} strokeWidth={2.4} />
                    Novo lead
                  </button>
                )}
              </div>
            );
          })}

          {isAdmin && (
            <div style={{ width: isMobile ? "100%" : 220, flexShrink: 0, display: isMobile && !addingStage ? "none" : "block" }}>
              {addingStage ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <input
                    autoFocus
                    value={newStageName}
                    onChange={(e) => setNewStageName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && createStage()}
                    placeholder="Nome da coluna"
                    style={{ border: "1px solid var(--border-strong)", borderRadius: 8, padding: "8px 10px", fontSize: 13, background: "var(--bg)" }}
                  />
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={createStage} style={{ background: "var(--blue-500)", color: "#fff", border: "none", borderRadius: 8, padding: "6px 10px", fontSize: 12.5, fontWeight: 600 }}>
                      Criar
                    </button>
                    <button onClick={() => setAddingStage(false)} style={{ background: "none", border: "none", color: "var(--ink-faint)", fontSize: 12.5 }}>
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setAddingStage(true)}
                  className="card-hover"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    border: "1px dashed var(--border-strong)",
                    borderRadius: "var(--radius-md)",
                    padding: "14px",
                    width: "100%",
                    background: "none",
                    color: "var(--ink-faint)",
                    fontSize: 13,
                    fontWeight: 500,
                  }}
                >
                  <Plus size={14} strokeWidth={2.4} />
                  Nova coluna
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {selectedLead && company && (
        <LeadDetailPanel
          lead={selectedLead}
          companyId={company.id}
          stages={stages}
          onClose={() => {
            setSelectedLead(null);
            load();
          }}
          onUpdated={(updated) => {
            setLeads((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
            setSelectedLead(updated);
          }}
        />
      )}

      {showImport && company && pipeline && (
        <Suspense
          fallback={
            <div
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(16,26,46,0.35)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 60,
                color: "#fff",
                fontSize: 13,
              }}
            >
              Carregando…
            </div>
          }
        >
          <ImportLeadsModal
            companyId={company.id}
            pipelineId={pipeline.id}
            stages={stages}
            onClose={() => setShowImport(false)}
            onImported={load}
          />
        </Suspense>
      )}
      </div>
    </AppShell>
  );
}
