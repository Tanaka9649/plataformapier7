import { useEffect, useState } from "react";
import { client, CrmLead, CrmCustomField, CrmCustomFieldValue, logAudit } from "../lib/neonClient";

type Tag = { id: string; company_id: string; name: string; color: string };
type Note = { id: string; lead_id: string; body: string; created_at: string };
type HistoryEntry = {
  id: string;
  from_stage_id: string | null;
  to_stage_id: string | null;
  changed_at: string;
  user_id: string | null;
};
type Stage = { id: string; name: string; color: string };
type Task = { id: string; title: string; due_at: string | null; done: boolean; created_at: string };

export default function LeadDetailPanel({
  lead,
  companyId,
  stages,
  onClose,
  onUpdated,
}: {
  lead: CrmLead;
  companyId: string;
  stages: Stage[];
  onClose: () => void;
  onUpdated: (updated: CrmLead) => void;
}) {
  const [form, setForm] = useState({
    name: lead.name,
    phone: lead.phone ?? "",
    city: lead.city ?? "",
    segment: lead.segment ?? "",
    revenue: lead.revenue?.toString() ?? "",
    score: lead.score ?? 0,
    next_action: lead.next_action ?? "",
    origin: lead.origin ?? "",
    loss_reason: lead.loss_reason ?? "",
    potential_value: lead.potential_value?.toString() ?? "",
    closed_value: lead.closed_value?.toString() ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [leadTagIds, setLeadTagIds] = useState<string[]>([]);
  const [newTagName, setNewTagName] = useState("");

  const [notes, setNotes] = useState<Note[]>([]);
  const [newNote, setNewNote] = useState("");

  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDue, setNewTaskDue] = useState("");

  const [customFields, setCustomFields] = useState<CrmCustomField[]>([]);
  // custom_field_id -> valor atual (string; para multipla_selecao, valores separados por "|")
  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  // custom_field_id -> id da linha em crm_custom_field_values, se já existir (pra saber se é insert ou update)
  const [customValueRowIds, setCustomValueRowIds] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      const [tagsRes, leadTagsRes, notesRes, historyRes, tasksRes, customFieldsRes, customValuesRes] = await Promise.all([
        client.from("crm_tags").select("*").eq("company_id", companyId),
        client.from("crm_lead_tags").select("tag_id").eq("lead_id", lead.id),
        client.from("crm_notes").select("*").eq("lead_id", lead.id).order("created_at", { ascending: false }),
        client
          .from("crm_lead_history")
          .select("*")
          .eq("lead_id", lead.id)
          .order("changed_at", { ascending: false }),
        client.from("crm_tasks").select("*").eq("lead_id", lead.id).order("due_at", { ascending: true }),
        client.from("crm_custom_fields").select("*").eq("company_id", companyId).order("position", { ascending: true }),
        client.from("crm_custom_field_values").select("*").eq("lead_id", lead.id),
      ]);
      if (tagsRes.error) return setError(tagsRes.error.message);
      setAllTags(tagsRes.data as Tag[]);
      setLeadTagIds(((leadTagsRes.data as { tag_id: string }[]) ?? []).map((t) => t.tag_id));
      setNotes((notesRes.data as Note[]) ?? []);
      const historyRows = (historyRes.data as HistoryEntry[]) ?? [];
      setHistory(historyRows);
      setTasks((tasksRes.data as Task[]) ?? []);
      setCustomFields((customFieldsRes.data as CrmCustomField[]) ?? []);

      const values: Record<string, string> = {};
      const rowIds: Record<string, string> = {};
      ((customValuesRes.data as CrmCustomFieldValue[]) ?? []).forEach((v) => {
        values[v.custom_field_id] = v.value ?? "";
        rowIds[v.custom_field_id] = v.id;
      });
      setCustomValues(values);
      setCustomValueRowIds(rowIds);

      const userIds = Array.from(new Set(historyRows.map((h) => h.user_id).filter(Boolean))) as string[];
      if (userIds.length > 0) {
        const { data: users } = await client.from("app_users").select("id,full_name,email").in("id", userIds);
        const map: Record<string, string> = {};
        ((users as { id: string; full_name: string | null; email: string | null }[]) ?? []).forEach((u) => {
          map[u.id] = u.full_name || u.email || "—";
        });
        setUserNames(map);
      }
    })();
  }, [lead.id, companyId]);

  async function saveCustomValue(fieldId: string, value: string) {
    setCustomValues((prev) => ({ ...prev, [fieldId]: value }));
    const existingRowId = customValueRowIds[fieldId];
    if (existingRowId) {
      const { error: updErr } = await client.from("crm_custom_field_values").update({ value }).eq("id", existingRowId);
      if (updErr) setError(updErr.message);
    } else {
      const { data, error: insErr } = await client
        .from("crm_custom_field_values")
        .insert({ lead_id: lead.id, custom_field_id: fieldId, value })
        .select();
      if (insErr) return setError(insErr.message);
      const created = (data as CrmCustomFieldValue[])?.[0];
      if (created) setCustomValueRowIds((prev) => ({ ...prev, [fieldId]: created.id }));
    }
  }

  function toggleMultiSelectValue(fieldId: string, option: string) {
    const current = (customValues[fieldId] ?? "").split("|").filter(Boolean);
    const next = current.includes(option) ? current.filter((o) => o !== option) : [...current, option];
    saveCustomValue(fieldId, next.join("|"));
  }

  async function addTask() {
    if (!newTaskTitle.trim()) return;
    const { data, error: insErr } = await client
      .from("crm_tasks")
      .insert({
        lead_id: lead.id,
        title: newTaskTitle.trim(),
        due_at: newTaskDue ? new Date(newTaskDue).toISOString() : null,
      })
      .select();
    if (insErr) return setError(insErr.message);
    const created = (data as Task[])?.[0];
    if (created) setTasks((prev) => [...prev, created].sort((a, b) => (a.due_at ?? "").localeCompare(b.due_at ?? "")));
    setNewTaskTitle("");
    setNewTaskDue("");
  }

  async function toggleTaskDone(taskId: string, done: boolean) {
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, done } : t)));
    await client.from("crm_tasks").update({ done }).eq("id", taskId);
  }

  async function save() {
    setSaving(true);
    const { data, error: updErr } = await client
      .from("crm_leads")
      .update({
        name: form.name,
        phone: form.phone || null,
        city: form.city || null,
        segment: form.segment || null,
        revenue: form.revenue ? Number(form.revenue) : null,
        score: form.score || null,
        next_action: form.next_action || null,
        origin: form.origin || null,
        loss_reason: form.loss_reason || null,
        potential_value: form.potential_value ? Number(form.potential_value) : null,
        closed_value: form.closed_value ? Number(form.closed_value) : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", lead.id)
      .select();
    setSaving(false);
    if (updErr) return setError(updErr.message);
    const updated = (data as CrmLead[])?.[0];
    if (updated) {
      onUpdated(updated);
      setSavedAt(Date.now());
      await logAudit("crm_leads", lead.id, "update", lead, updated);
    }
  }

  async function toggleTag(tagId: string) {
    const has = leadTagIds.includes(tagId);
    if (has) {
      await client.from("crm_lead_tags").delete().eq("lead_id", lead.id).eq("tag_id", tagId);
      setLeadTagIds((prev) => prev.filter((t) => t !== tagId));
    } else {
      const { error: insErr } = await client.from("crm_lead_tags").insert({ lead_id: lead.id, tag_id: tagId });
      if (insErr) return setError(insErr.message);
      setLeadTagIds((prev) => [...prev, tagId]);
    }
  }

  async function createTag() {
    if (!newTagName.trim()) return;
    const palette = ["#3068e8", "#1a9c6b", "#c98a1a", "#e0483f", "#8b5cf6", "#0ea5e9"];
    const color = palette[allTags.length % palette.length];
    const { data, error: insErr } = await client
      .from("crm_tags")
      .insert({ company_id: companyId, name: newTagName.trim(), color })
      .select();
    if (insErr) return setError(insErr.message);
    const created = (data as Tag[])?.[0];
    if (created) setAllTags((prev) => [...prev, created]);
    setNewTagName("");
  }

  async function addNote() {
    if (!newNote.trim()) return;
    const { data, error: insErr } = await client
      .from("crm_notes")
      .insert({ lead_id: lead.id, body: newNote.trim() })
      .select();
    if (insErr) return setError(insErr.message);
    const created = (data as Note[])?.[0];
    if (created) setNotes((prev) => [created, ...prev]);
    setNewNote("");
  }

  const stageName = (id: string | null) => stages.find((s) => s.id === id)?.name ?? "—";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(16,26,46,0.25)",
        display: "flex",
        justifyContent: "flex-end",
        zIndex: 50,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 420,
          maxWidth: "100%",
          background: "var(--bg)",
          height: "100%",
          overflowY: "auto",
          boxShadow: "var(--shadow-lg)",
          padding: "24px 24px 60px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>Detalhes do lead</h2>
          <button onClick={onClose} aria-label="Fechar painel de detalhes do lead" style={{ background: "none", border: "none", fontSize: 18, color: "var(--ink-faint)" }}>
            ✕
          </button>
        </div>

        {error && (
          <div style={{ background: "var(--red-50)", color: "var(--red-500)", padding: 10, borderRadius: 8, fontSize: 12.5, marginBottom: 14 }}>
            {error}
          </div>
        )}

        <FieldGroup label="Nome">
          <input style={inputStyle} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </FieldGroup>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <FieldGroup label="Telefone">
            <input style={inputStyle} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </FieldGroup>
          <FieldGroup label="Cidade">
            <input style={inputStyle} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          </FieldGroup>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <FieldGroup label="Segmentação">
            <input style={inputStyle} value={form.segment} onChange={(e) => setForm({ ...form, segment: e.target.value })} />
          </FieldGroup>
          <FieldGroup label="Faturamento (R$)">
            <input
              style={inputStyle}
              type="number"
              value={form.revenue}
              onChange={(e) => setForm({ ...form, revenue: e.target.value })}
            />
          </FieldGroup>
        </div>
        <FieldGroup label="Próxima ação">
          <input style={inputStyle} value={form.next_action} onChange={(e) => setForm({ ...form, next_action: e.target.value })} />
        </FieldGroup>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <FieldGroup label="Origem do lead">
            <input style={inputStyle} value={form.origin} onChange={(e) => setForm({ ...form, origin: e.target.value })} placeholder="Ex: Meta Ads, indicação…" />
          </FieldGroup>
          <FieldGroup label="Motivo da perda">
            <input style={inputStyle} value={form.loss_reason} onChange={(e) => setForm({ ...form, loss_reason: e.target.value })} />
          </FieldGroup>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <FieldGroup label="Valor potencial (R$)">
            <input style={inputStyle} type="number" value={form.potential_value} onChange={(e) => setForm({ ...form, potential_value: e.target.value })} />
          </FieldGroup>
          <FieldGroup label="Valor fechado (R$)">
            <input style={inputStyle} type="number" value={form.closed_value} onChange={(e) => setForm({ ...form, closed_value: e.target.value })} />
          </FieldGroup>
        </div>
        <FieldGroup label={`Qualificação — ${form.score}/10`}>
          <div style={{ display: "flex", gap: 3 }}>
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                onClick={() => setForm({ ...form, score: n })}
                aria-label={`Definir qualificação como ${n} de 10`}
                aria-pressed={n <= form.score}
                style={{ background: "none", border: "none", fontSize: 18, color: n <= form.score ? "var(--amber-500)" : "var(--border-strong)" }}
              >
                ★
              </button>
            ))}
          </div>
        </FieldGroup>

        {customFields.length > 0 && (
          <>
            <Divider />
            <SectionLabel>Campos personalizados</SectionLabel>
            {customFields.map((f) => (
              <FieldGroup key={f.id} label={f.name}>
                <CustomFieldInput
                  field={f}
                  value={customValues[f.id] ?? ""}
                  onChange={(v) => saveCustomValue(f.id, v)}
                  onToggleMulti={(opt) => toggleMultiSelectValue(f.id, opt)}
                />
              </FieldGroup>
            ))}
          </>
        )}

        <button
          onClick={save}
          disabled={saving}
          style={{ background: "var(--blue-500)", color: "#fff", border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 13, fontWeight: 600, marginTop: 4 }}
        >
          {saving ? "Salvando…" : savedAt ? "Salvo ✓" : "Salvar alterações"}
        </button>

        <Divider />

        <SectionLabel>Etiquetas</SectionLabel>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
          {allTags.map((t) => {
            const active = leadTagIds.includes(t.id);
            return (
              <button
                key={t.id}
                onClick={() => toggleTag(t.id)}
                style={{
                  fontSize: 11.5,
                  padding: "4px 10px",
                  borderRadius: 20,
                  border: `1px solid ${active ? t.color : "var(--border)"}`,
                  background: active ? t.color + "1A" : "var(--surface)",
                  color: active ? t.color : "var(--ink-faint)",
                  fontWeight: 600,
                }}
              >
                {t.name}
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <input
            placeholder="Nova etiqueta"
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createTag()}
            style={{ ...inputStyle, flex: 1 }}
          />
          <button onClick={createTag} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "0 12px", fontSize: 12.5, color: "var(--ink-soft)" }}>
            + Criar
          </button>
        </div>

        <Divider />

        <SectionLabel>Notas</SectionLabel>
        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          <input
            placeholder="Adicionar observação…"
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addNote()}
            style={{ ...inputStyle, flex: 1 }}
          />
          <button onClick={addNote} style={{ background: "var(--blue-500)", color: "#fff", border: "none", borderRadius: 8, padding: "0 14px", fontSize: 12.5, fontWeight: 600 }}>
            Adicionar
          </button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {notes.map((n) => (
            <div key={n.id} style={{ background: "var(--surface)", borderRadius: 8, padding: "8px 12px" }}>
              <div style={{ fontSize: 13 }}>{n.body}</div>
              <div style={{ fontSize: 10.5, color: "var(--ink-faint)", marginTop: 4 }}>
                {new Date(n.created_at).toLocaleString("pt-BR")}
              </div>
            </div>
          ))}
          {notes.length === 0 && <div style={{ fontSize: 12.5, color: "var(--ink-faint)" }}>Sem observações ainda.</div>}
        </div>

        <Divider />

        <SectionLabel>Tarefas</SectionLabel>
        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          <input
            placeholder="Nova tarefa…"
            value={newTaskTitle}
            onChange={(e) => setNewTaskTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addTask()}
            style={{ ...inputStyle, flex: 2 }}
          />
          <input
            type="date"
            value={newTaskDue}
            onChange={(e) => setNewTaskDue(e.target.value)}
            style={{ ...inputStyle, flex: 1 }}
          />
          <button
            onClick={addTask}
            style={{ background: "var(--blue-500)", color: "#fff", border: "none", borderRadius: 8, padding: "0 14px", fontSize: 12.5, fontWeight: 600 }}
          >
            +
          </button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {tasks.map((t) => (
            <label
              key={t.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 13,
                padding: "6px 10px",
                background: "var(--surface)",
                borderRadius: 8,
                textDecoration: t.done ? "line-through" : "none",
                color: t.done ? "var(--ink-faint)" : "var(--ink)",
              }}
            >
              <input type="checkbox" checked={t.done} onChange={(e) => toggleTaskDone(t.id, e.target.checked)} />
              <span style={{ flex: 1 }}>{t.title}</span>
              {t.due_at && (
                <span style={{ fontSize: 11, color: "var(--ink-faint)" }}>
                  {new Date(t.due_at).toLocaleDateString("pt-BR")}
                </span>
              )}
            </label>
          ))}
          {tasks.length === 0 && <div style={{ fontSize: 12.5, color: "var(--ink-faint)" }}>Sem tarefas ainda.</div>}
        </div>

        <Divider />

        <SectionLabel>Histórico de movimentação</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {history.map((h) => (
            <div key={h.id} style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              {stageName(h.from_stage_id)} → <b>{stageName(h.to_stage_id)}</b>
              <span style={{ color: "var(--ink-faint)" }}>
                {" "}
                · {new Date(h.changed_at).toLocaleString("pt-BR")}
                {h.user_id && userNames[h.user_id] ? ` · ${userNames[h.user_id]}` : ""}
              </span>
            </div>
          ))}
          {history.length === 0 && <div style={{ fontSize: 12.5, color: "var(--ink-faint)" }}>Nenhuma movimentação registrada.</div>}
        </div>
      </div>
    </div>
  );
}

function CustomFieldInput({
  field,
  value,
  onChange,
  onToggleMulti,
}: {
  field: import("../lib/neonClient").CrmCustomField;
  value: string;
  onChange: (v: string) => void;
  onToggleMulti: (option: string) => void;
}) {
  switch (field.field_type) {
    case "texto_longo":
      return (
        <textarea
          defaultValue={value}
          onBlur={(e) => onChange(e.target.value)}
          rows={3}
          style={{ ...inputStyle, resize: "vertical" }}
        />
      );
    case "numero":
      return <input type="number" defaultValue={value} onBlur={(e) => onChange(e.target.value)} style={inputStyle} />;
    case "moeda":
      return (
        <input
          type="number"
          step="0.01"
          placeholder="R$ 0,00"
          defaultValue={value}
          onBlur={(e) => onChange(e.target.value)}
          style={inputStyle}
        />
      );
    case "data":
      return <input type="date" defaultValue={value} onChange={(e) => onChange(e.target.value)} style={inputStyle} />;
    case "telefone":
      return <input type="tel" defaultValue={value} onBlur={(e) => onChange(e.target.value)} style={inputStyle} />;
    case "email":
      return <input type="email" defaultValue={value} onBlur={(e) => onChange(e.target.value)} style={inputStyle} />;
    case "caixa_selecao":
      return (
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
          <input type="checkbox" checked={value === "true"} onChange={(e) => onChange(e.target.checked ? "true" : "false")} />
          Sim
        </label>
      );
    case "selecao":
      return (
        <select value={value} onChange={(e) => onChange(e.target.value)} style={{ ...inputStyle, background: "var(--surface)" }}>
          <option value="">—</option>
          {(field.options ?? []).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );
    case "multipla_selecao": {
      const selected = value.split("|").filter(Boolean);
      return (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {(field.options ?? []).map((opt) => {
            const active = selected.includes(opt);
            return (
              <button
                key={opt}
                onClick={() => onToggleMulti(opt)}
                type="button"
                style={{
                  fontSize: 11.5,
                  padding: "4px 10px",
                  borderRadius: 20,
                  border: `1px solid ${active ? "var(--blue-500)" : "var(--border)"}`,
                  background: active ? "var(--blue-500)1A" : "var(--surface)",
                  color: active ? "var(--blue-600)" : "var(--ink-faint)",
                  fontWeight: 600,
                }}
              >
                {opt}
              </button>
            );
          })}
        </div>
      );
    }
    case "texto":
    default:
      return <input type="text" defaultValue={value} onBlur={(e) => onChange(e.target.value)} style={inputStyle} />;
  }
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11.5, color: "var(--ink-faint)", fontWeight: 600, marginBottom: 5 }}>{label}</div>
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink)", marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.4 }}>{children}</div>;
}

function Divider() {
  return <div style={{ height: 1, background: "var(--border)", margin: "20px 0" }} />;
}

const inputStyle: React.CSSProperties = {
  border: "1px solid var(--border-strong)",
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 13,
  width: "100%",
  background: "var(--surface)",
  color: "var(--ink)",
};
