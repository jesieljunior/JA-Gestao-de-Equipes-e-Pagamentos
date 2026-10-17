import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { ChaveRecurso } from "./cobranca-v2";

export async function exigirRecursoPlano(
  db: SupabaseClient<Database>,
  empresaId: string,
  recurso: ChaveRecurso,
) {
  const { data, error } = await db.rpc("recurso_habilitado", {
    _empresa_id: empresaId,
    _recurso: recurso,
  });
  if (error || data !== true)
    throw new Error("Recurso indisponível no seu plano. Consulte Plano e uso para fazer upgrade.");
}
