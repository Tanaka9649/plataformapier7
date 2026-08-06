import { useState } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { client, CrmStage } from "../lib/neonClient";

type FieldKey = "name" | "phone" | "city" | "segment" | "revenue" | "ignore";

const FIELD_LABELS: Record<FieldKey, string> = {
  name: "Nome (obrigatório)",
  phone: "Telefone",
  city: "Cidade",
  segment: "Segmentação",
  revenue: "Faturamento",
  ignore: "Não importar",
};

function normalizePhone(raw: string) {
  return raw.replace(/\D/g, "");
}

export default function ImportLeadsModal({
  companyId,
  pipelineId,
  stages,
  onClose,
  onImported,
}: {
  companyId: string;
  pipelineId: string;
  stages: CrmStage[];
  onClose: () => void;
  onImported: () => void;
}) {
  const [step, setStep] = useState<"upload" | "map" | "result">("upload");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, FieldKey>>({});
  const [targetStageId, setTargetStageId] = useState(stages[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ imported: number; duplicates: number; invalid: number } | null>(null);

  function handleFile(file: File) {
    setError(null);
    setFileName(file.name);
    const isExcel = /\.xlsx?$/i.test(file.name);

    if (isExcel) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target!.result as ArrayBuffer);
          const wb = XLSX.read(data, { type: "array" });
          const sheet = wb.Sheets[wb.SheetNames[0]];
          const json = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "" });
          if (json.length === 0) {
            setError("A planilha parece estar vazia.");
            return;
          }
          const hs = Object.keys(json[0]);
          setHeaders(hs);
          setRows(json.map((r) => Object.fromEntries(hs.map((h) => [h, String(r[h] ?? "")]))));
          autoMap(hs);
          setStep("map");
        } catch (err: any) {
          setError(`Não foi possível ler o arquivo Excel: ${err.message}`);
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      Papa.parse<Record<string, string>>(file, {
        header: true,
        skipEmptyLines: true,
        complete: (res) => {
          if (res.errors.length > 0 && res.data.length === 0) {
            setError(`Erro ao ler CSV: ${res.errors[0].message}`);
            return;
          }
          const hs = res.meta.fields ?? [];
          if (hs.length === 0) {
            setError("Não encontrei cabeçalho no CSV.");
            return;
          }
          setHeaders(hs);
          setRows(res.data);
          autoMap(hs);
          setStep("map");
        },
        error: (err) => setError(`Erro ao ler CSV: ${err.message}`),
      });
    }
  }

  function autoMap(hs: string[]) {
    const guess: Record<string, FieldKey> = {};
    hs.forEach((h) => {
      const norm = h.trim().toLowerCase();
      if (["nome", "name", "lead"].includes(norm)) guess[h] = "name";
      else if (["telefone", "phone", "celular", "whatsapp", "fone"].includes(norm)) guess[h] = "phone";
      else if (["cidade", "city"].includes(norm)) guess[h] = "city";
      else if (["segmento", "segmentação", "segmentacao", "segment"].includes(norm)) guess[h] = "segment";
      else if (["faturamento", "revenue", "valor"].includes(norm)) guess[h] = "revenue";
      else guess[h] = "ignore";
    });
    setMapping(guess);
  }

  const nameColumn = Object.entries(mapping).find(([, v]) => v === "name")?.[0];
  const phoneColumn = Object.entries(mapping).find(([, v]) => v === "phone")?.[0];

  async function runImport() {
    if (!nameColumn) {
      setError('É preciso mapear uma coluna para "Nome".');
      return;
    }
    if (!targetStageId) {
      setError("Escolha a coluna inicial do Kanban.");
      return;
    }
    setImporting(true);
    setError(null);

    // duplicidade dentro do próprio arquivo, por telefone normalizado
    const seenPhones = new Set<string>();
    const candidates: {
      name: string;
      phone: string | null;
      city: string | null;
      segment: string | null;
      revenue: number | null;
    }[] = [];
    let invalid = 0;
    let fileDuplicates = 0;

    for (const row of rows) {
      const name = (row[nameColumn] ?? "").trim();
      if (!name) {
        invalid++;
        continue;
      }
      const rawPhone = phoneColumn ? (row[phoneColumn] ?? "").trim() : "";
      const normPhone = rawPhone ? normalizePhone(rawPhone) : "";
      if (normPhone) {
        if (seenPhones.has(normPhone)) {
          fileDuplicates++;
          continue;
        }
        seenPhones.add(normPhone);
      }
      const cityCol = Object.entries(mapping).find(([, v]) => v === "city")?.[0];
      const segmentCol = Object.entries(mapping).find(([, v]) => v === "segment")?.[0];
      const revenueCol = Object.entries(mapping).find(([, v]) => v === "revenue")?.[0];
      // formato brasileiro: "." é separador de milhar, "," é decimal — ex "1.500,00" -> 1500.00
      const revenueRaw = revenueCol ? (row[revenueCol] ?? "").replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".") : "";
      candidates.push({
        name,
        phone: rawPhone || null,
        city: cityCol ? (row[cityCol] ?? "").trim() || null : null,
        segment: segmentCol ? (row[segmentCol] ?? "").trim() || null : null,
        revenue: revenueRaw && !isNaN(Number(revenueRaw)) ? Number(revenueRaw) : null,
      });
    }

    // duplicidade contra o banco, por telefone
    let dbDuplicates = 0;
    const phonesToCheck = candidates.map((c) => c.phone).filter(Boolean) as string[];
    let existingPhones = new Set<string>();
    if (phonesToCheck.length > 0) {
      const { data: existing } = await client
        .from("crm_leads")
        .select("phone")
        .eq("company_id", companyId)
        .not("phone", "is", null);
      existingPhones = new Set(
        ((existing as { phone: string }[]) ?? []).map((r) => normalizePhone(r.phone))
      );
    }

    const toInsert = candidates.filter((c) => {
      if (c.phone && existingPhones.has(normalizePhone(c.phone))) {
        dbDuplicates++;
        return false;
      }
      return true;
    });

    let imported = 0;
    if (toInsert.length > 0) {
      const { error: insErr } = await client.from("crm_leads").insert(
        toInsert.map((c) => ({
          company_id: companyId,
          pipeline_id: pipelineId,
          stage_id: targetStageId,
          name: c.name,
          phone: c.phone,
          city: c.city,
          segment: c.segment,
          revenue: c.revenue,
        }))
      );
      if (insErr) {
        setError(`Erro ao importar: ${insErr.message}`);
        setImporting(false);
        return;
      }
      imported = toInsert.length;
    }

    await client.from("imports").insert({
      company_id: companyId,
      file_name: fileName,
      total_rows: rows.length,
      valid_rows: imported,
      invalid_rows: invalid,
      duplicate_rows: fileDuplicates + dbDuplicates,
    });

    setResult({ imported, duplicates: fileDuplicates + dbDuplicates, invalid });
    setImporting(false);
    setStep("result");
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(16,26,46,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60 }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: 640, maxWidth: "92%", maxHeight: "88vh", overflowY: "auto", background: "var(--bg)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-lg)", padding: 28 }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>Importar leads</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, color: "var(--ink-faint)" }}>✕</button>
        </div>

        {error && (
          <div style={{ background: "var(--red-50)", color: "var(--red-500)", padding: 10, borderRadius: 8, fontSize: 12.5, marginBottom: 16 }}>
            {error}
          </div>
        )}

        {step === "upload" && (
          <div>
            <p style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 16 }}>
              Envie um arquivo CSV ou XLSX. A primeira linha deve conter os nomes das colunas.
            </p>
            <label
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                border: "1px dashed var(--border-strong)",
                borderRadius: "var(--radius-md)",
                padding: 40,
                cursor: "pointer",
                color: "var(--ink-faint)",
                fontSize: 13,
              }}
            >
              Clique para escolher um arquivo (.csv, .xlsx)
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                style={{ display: "none" }}
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
            </label>
          </div>
        )}

        {step === "map" && (
          <div>
            <p style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 12 }}>
              <b>{fileName}</b> — {rows.length} linha(s) encontradas. Relacione cada coluna a um campo do CRM.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
              {headers.map((h) => (
                <div key={h} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{h}</div>
                  <select
                    value={mapping[h] ?? "ignore"}
                    onChange={(e) => setMapping({ ...mapping, [h]: e.target.value as FieldKey })}
                    style={{ flex: 1, border: "1px solid var(--border-strong)", borderRadius: 8, padding: "6px 8px", fontSize: 12.5 }}
                  >
                    {(Object.keys(FIELD_LABELS) as FieldKey[]).map((k) => (
                      <option key={k} value={k}>
                        {FIELD_LABELS[k]}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 11.5, color: "var(--ink-faint)", fontWeight: 600, marginBottom: 6 }}>Coluna inicial no Kanban</div>
              <select
                value={targetStageId}
                onChange={(e) => setTargetStageId(e.target.value)}
                style={{ width: "100%", border: "1px solid var(--border-strong)", borderRadius: 8, padding: "8px 10px", fontSize: 13 }}
              >
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ fontSize: 11.5, color: "var(--ink-faint)", marginBottom: 14 }}>
              Prévia (primeiras 3 linhas):
              <div style={{ marginTop: 6, fontFamily: "var(--font-mono)", fontSize: 11, background: "var(--surface)", borderRadius: 8, padding: 10, overflowX: "auto" }}>
                {rows.slice(0, 3).map((r, i) => (
                  <div key={i}>{nameColumn ? r[nameColumn] : "(mapeie o nome)"} {phoneColumn ? `· ${r[phoneColumn]}` : ""}</div>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setStep("upload")} style={{ background: "none", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 16px", fontSize: 13, color: "var(--ink-soft)" }}>
                Voltar
              </button>
              <button
                onClick={runImport}
                disabled={importing}
                style={{ background: "var(--blue-500)", color: "#fff", border: "none", borderRadius: 8, padding: "8px 20px", fontSize: 13, fontWeight: 600, opacity: importing ? 0.7 : 1 }}
              >
                {importing ? "Importando…" : `Importar ${rows.length} linha(s)`}
              </button>
            </div>
          </div>
        )}

        {step === "result" && result && (
          <div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
              <ResultRow label="Importados com sucesso" value={result.imported} color="var(--green-500)" />
              <ResultRow label="Ignorados por duplicidade (telefone já existia)" value={result.duplicates} color="var(--amber-500)" />
              <ResultRow label="Ignorados por falta de nome" value={result.invalid} color="var(--red-500)" />
            </div>
            <button
              onClick={() => {
                onImported();
                onClose();
              }}
              style={{ background: "var(--blue-500)", color: "#fff", border: "none", borderRadius: 8, padding: "9px 20px", fontSize: 13, fontWeight: 600 }}
            >
              Concluir
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ResultRow({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--surface)", borderRadius: 8, padding: "10px 14px" }}>
      <span style={{ fontSize: 13, color: "var(--ink-soft)" }}>{label}</span>
      <span style={{ fontSize: 16, fontWeight: 700, color, fontFamily: "var(--font-mono)" }}>{value}</span>
    </div>
  );
}
