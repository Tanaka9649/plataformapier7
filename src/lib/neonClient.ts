import { createClient } from "@neondatabase/neon-js";
import { BetterAuthReactAdapter } from "@neondatabase/neon-js/auth/react/adapters";

const AUTH_URL =
  "https://ep-old-recipe-a6tw3thg.neonauth.us-west-2.aws.neon.tech/neondb/auth";
const DATA_API_URL =
  "https://ep-old-recipe-a6tw3thg.apirest.us-west-2.aws.neon.tech/neondb/rest/v1";

export let clientInitError: string | null = null;

function buildClient() {
  try {
    return createClient({
      auth: {
        url: AUTH_URL,
        adapter: BetterAuthReactAdapter(),
      },
      dataApi: { url: DATA_API_URL },
    });
  } catch (e: any) {
    clientInitError = `Falha ao iniciar o cliente Neon: ${e?.message || String(e)}`;
    console.error(clientInitError, e);
    return null;
  }
}

export const client: ReturnType<typeof createClient> = buildClient() as any;

/**
 * app_users é uma tabela própria da plataforma (diferente do neon_auth.user).
 * Na primeira ação de um usuário autenticado, garantimos que exista uma linha
 * correspondente em app_users, e devolvemos o id dela — é isso que as tabelas
 * de auditoria/histórico referenciam via foreign key.
 */
let cachedAppUserId: string | null = null;

export async function getOrCreateAppUserId(): Promise<string | null> {
  if (cachedAppUserId) return cachedAppUserId;
  const { data: sessionData } = await client.auth.getSession();
  const authUser = sessionData?.user;
  if (!authUser) return null;

  const { data: existing } = await client
    .from("app_users")
    .select("id")
    .eq("neon_auth_user_id", authUser.id);
  const found = (existing as { id: string }[])?.[0];
  if (found) {
    cachedAppUserId = found.id;
    return found.id;
  }

  const { data: created, error: insErr } = await client
    .from("app_users")
    .insert({
      neon_auth_user_id: authUser.id,
      full_name: authUser.name ?? authUser.email ?? null,
      email: authUser.email ?? null,
    })
    .select();
  if (insErr) {
    console.error("Não foi possível criar app_users:", insErr.message);
    return null;
  }
  const newId = (created as { id: string }[])?.[0]?.id ?? null;
  cachedAppUserId = newId;
  return newId;
}

export async function logAudit(
  entity: string,
  entityId: string | null,
  action: string,
  oldData: unknown,
  newData: unknown
) {
  const userId = await getOrCreateAppUserId();
  await client.from("audit_logs").insert({
    entity,
    entity_id: entityId,
    action,
    old_data: oldData,
    new_data: newData,
    user_id: userId,
  });
}


// Tipos das tabelas usadas pela plataforma
export type ManualRevenue = {
  id: string;
  company_id: string;
  amount: number;
  description: string | null;
  revenue_date: string;
  created_at: string;
};

export type Integration = {
  id: string;
  company_id: string;
  provider: string;
  status: string;
  external_id: string | null;
  last_sync_at: string | null;
};

export type AppUser = {
  id: string;
  neon_auth_user_id: string | null;
  full_name: string | null;
  email: string | null;
  role: "admin" | "operator";
  active: boolean;
  created_at: string;
};

export type Company = { id: string; name: string; slug: string; status: string };

export type AdMetricDaily = {
  id: string;
  company_id: string;
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  reach: number;
  leads: number;
};

export type SocialMetricDaily = {
  id: string;
  company_id: string;
  network: string;
  date: string;
  followers: number | null;
  reach: number | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  posts: number | null;
};

export type CrmPipeline = { id: string; company_id: string; name: string };
export type CrmStage = {
  id: string;
  pipeline_id: string;
  name: string;
  color: string;
  position: number;
  wip_limit: number | null;
  archived: boolean;
};
export type CrmCustomField = {
  id: string;
  company_id: string;
  name: string;
  field_type: "texto" | "texto_longo" | "numero" | "moeda" | "data" | "telefone" | "email" | "caixa_selecao" | "selecao" | "multipla_selecao";
  options: string[] | null;
  position: number;
};
export type CrmCustomFieldValue = {
  id: string;
  lead_id: string;
  custom_field_id: string;
  value: string | null;
};

export type CrmLead = {
  id: string;
  company_id: string;
  pipeline_id: string;
  stage_id: string;
  name: string;
  phone: string | null;
  city: string | null;
  segment: string | null;
  revenue: number | null;
  score: number | null;
  next_action: string | null;
  origin: string | null;
  loss_reason: string | null;
  potential_value: number | null;
  closed_value: number | null;
  updated_at: string;
};
