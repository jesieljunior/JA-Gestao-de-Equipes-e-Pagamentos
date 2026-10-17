import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const revisarCadastroFiscal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        empresaId: z.string().uuid(),
        decisao: z.enum(["validado", "rejeitado"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: papel } = await context.supabase
      .from("plataforma_usuarios")
      .select("papel")
      .eq("user_id", context.userId)
      .eq("papel", "admin_master")
      .maybeSingle();
    if (!papel) throw new Error("Somente a administração pode revisar o cadastro fiscal.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: empresa, error: leituraError } = await supabaseAdmin
      .from("empresas")
      .select("id, cnpj, razao_social, regime_fiscal, municipio, uf, codigo_servico")
      .eq("id", data.empresaId)
      .maybeSingle();
    if (leituraError || !empresa) throw new Error("Agência não encontrada.");

    if (data.decisao === "validado") {
      const completo = [
        empresa.cnpj,
        empresa.razao_social,
        empresa.regime_fiscal,
        empresa.municipio,
        empresa.uf,
        empresa.codigo_servico,
      ].every((valor) => Boolean(valor?.trim()));
      if (!completo) throw new Error("O cadastro fiscal ainda está incompleto.");
    }

    const { error } = await supabaseAdmin
      .from("empresas")
      .update({
        fiscal_status: data.decisao,
        fiscal_validado_em: data.decisao === "validado" ? new Date().toISOString() : null,
        fiscal_validado_por: data.decisao === "validado" ? context.userId : null,
      })
      .eq("id", data.empresaId);
    if (error) throw new Error("Não foi possível atualizar a validação fiscal.");
    return { ok: true };
  });
