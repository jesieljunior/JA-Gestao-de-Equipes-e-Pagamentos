import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireCapability } from "@/lib/autorizacao.server";

const tipoPonto = z.enum(["entrada", "inicio_intervalo", "fim_intervalo", "saida"]);

async function contextoOperacao(
  supabase: Parameters<typeof requireCapability>[0],
  userId: string,
  escalaId: string,
) {
  const contexto = await requireCapability(supabase, userId, "operacao.supervisionar");
  const { data: empresaId, error } = await supabase.rpc("empresa_da_escala", {
    _escala_id: escalaId,
  });
  if (error || !empresaId || empresaId !== contexto.empresaId) {
    throw new Error("Escala não encontrada nesta agência.");
  }
  return { contexto, empresaId };
}

export const decidirPonto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      pontoId: z.string().uuid(),
      escalaId: z.string().uuid(),
      status: z.enum(["aprovado", "recusado"]),
      motivo: z.string().trim().max(500).optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { empresaId } = await contextoOperacao(context.supabase, context.userId, data.escalaId);
    if (data.status === "recusado" && !data.motivo) throw new Error("Informe o motivo da recusa.");
    const { data: ponto, error } = await context.supabase
      .from("pontos")
      .update({
        status: data.status,
        motivo_recusa: data.status === "recusado" ? (data.motivo ?? null) : null,
        aprovado_por_id: context.userId,
        aprovado_em: new Date().toISOString(),
      })
      .eq("id", data.pontoId)
      .eq("escala_id", data.escalaId)
      .eq("status", "pendente")
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!ponto) throw new Error("Este ponto já foi decidido.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("logs_auditoria").insert({
      empresa_id: empresaId,
      ator_id: context.userId,
      ator_contexto: "organizacao",
      acao: data.status === "aprovado" ? "ponto_aprovado" : "ponto_recusado",
      recurso_tipo: "ponto",
      recurso_id: data.pontoId,
      resultado: "sucesso",
      detalhes: { escala_id: data.escalaId, motivo: data.motivo ?? null },
    });
    return { ok: true };
  });

export const lancarPontoManual = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      escalaId: z.string().uuid(),
      tipo: tipoPonto,
      registradoEm: z.string().datetime(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { empresaId } = await contextoOperacao(context.supabase, context.userId, data.escalaId);
    const { data: ponto, error } = await context.supabase.from("pontos").insert({
      escala_id: data.escalaId,
      tipo: data.tipo,
      metodo: "manual",
      registrado_em: data.registradoEm,
      status: "aprovado",
      aprovado_por_id: context.userId,
      aprovado_em: new Date().toISOString(),
    }).select("id").single();
    if (error) throw error;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("logs_auditoria").insert({
      empresa_id: empresaId,
      ator_id: context.userId,
      ator_contexto: "organizacao",
      acao: "ponto_manual_criado",
      recurso_tipo: "ponto",
      recurso_id: ponto.id,
      resultado: "sucesso",
      detalhes: { escala_id: data.escalaId, tipo: data.tipo, registrado_em: data.registradoEm },
    });
    return { ok: true };
  });

export const rotacionarQrEvento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ eventoId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const contexto = await requireCapability(context.supabase, context.userId, "eventos.gerenciar");
    const { data: evento } = await context.supabase
      .from("eventos")
      .select("empresa_id, data_fim")
      .eq("id", data.eventoId)
      .maybeSingle();
    if (!evento || evento.empresa_id !== contexto.empresaId) throw new Error("Evento não encontrado.");
    const geradoEm = new Date();
    const expiraEm = evento.data_fim
      ? new Date(new Date(evento.data_fim).getTime() + 12 * 60 * 60_000).toISOString()
      : null;
    const token = crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
    const { error } = await context.supabase.from("eventos").update({
      qr_code_token: token,
      qr_code_gerado_em: geradoEm.toISOString(),
      qr_code_expira_em: expiraEm,
    }).eq("id", data.eventoId);
    if (error) throw error;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("logs_auditoria").insert({
      empresa_id: evento.empresa_id,
      ator_id: context.userId,
      ator_contexto: "organizacao",
      acao: "qr_ponto_rotacionado",
      recurso_tipo: "evento",
      recurso_id: data.eventoId,
      resultado: "sucesso",
      detalhes: { expira_em: expiraEm },
    });
    return { token, expiraEm };
  });