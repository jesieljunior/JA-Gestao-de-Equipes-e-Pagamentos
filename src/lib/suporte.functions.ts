import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePlatformContext } from "@/lib/autorizacao.server";

const atendimentoSchema = z.object({ atendimentoId: z.string().uuid() });

export const localizarEmpresasSuporte = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    requirePlatformContext(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const empresas = await supabaseAdmin.from("empresas").select("id,nome,cnpj,ativa").order("nome");
    const atendimento = await context.supabase.from("suporte_atendimentos").select("*").eq("usuario_id", context.userId).is("encerrado_em", null).maybeSingle();
    if (empresas.error || atendimento.error) throw new Error("Não foi possível localizar empresas.");
    return { empresas: empresas.data ?? [], atendimento: atendimento.data };
  });

export const iniciarAtendimentoSuporte = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ empresaId: z.string().uuid(), motivo: z.string().trim().min(5).max(1000) }).parse(input))
  .handler(async ({ context, data }) => {
    requirePlatformContext(context);
    const r = await context.supabase.rpc("iniciar_atendimento", { _empresa_id: data.empresaId, _motivo: data.motivo });
    if (r.error) throw new Error(r.error.message);
    return r.data;
  });

export const encerrarAtendimentoSuporte = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => atendimentoSchema.parse(input))
  .handler(async ({ context, data }) => {
    requirePlatformContext(context);
    const r = await context.supabase.rpc("encerrar_atendimento", { _atendimento_id: data.atendimentoId });
    if (r.error) throw new Error(r.error.message);
    return { encerrado: true };
  });

export const listarDadosSuporte = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => atendimentoSchema.parse(input))
  .handler(async ({ context, data }) => {
    requirePlatformContext(context);
    const atendimento = await context.supabase.from("suporte_atendimentos").select("*").eq("id",data.atendimentoId).eq("usuario_id",context.userId).is("encerrado_em",null).maybeSingle();
    if (atendimento.error || !atendimento.data) throw new Error("Atendimento não autorizado ou encerrado.");
    const empresaId = atendimento.data.empresa_id;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const audit = await supabaseAdmin.from("logs_auditoria").insert({ empresa_id: empresaId, ator_id: context.userId, ator_contexto: context.contexto.papeisPlataforma.includes("admin_master") ? "admin_master" : "suporte", acao: "atendimento_consulta", recurso_tipo: "atendimento", recurso_id: data.atendimentoId, resultado: "sucesso", detalhes: { finalidade: atendimento.data.motivo } });
    if (audit.error) throw new Error("Não foi possível auditar a consulta.");
    const [eventos, colaboradores, equipes, escalas, pontos, ocorrencias, fechamentos, pagamentos, cobrancas] = await Promise.all([
      supabaseAdmin.from("eventos").select("id,nome,status,data_inicio,data_fim,local").eq("empresa_id",empresaId),
      supabaseAdmin.from("freelancers").select("id,nome,funcao,ativo,tipo_vinculo").eq("empresa_id",empresaId),
      supabaseAdmin.from("equipes").select("id,nome,eventos!inner(empresa_id)").eq("eventos.empresa_id",empresaId),
      supabaseAdmin.from("escalas").select("id,status,valor_combinado,equipes!inner(eventos!inner(empresa_id))").eq("equipes.eventos.empresa_id",empresaId),
      supabaseAdmin.from("pontos").select("id,tipo,status,registrado_em,fora_horario,escalas!inner(equipes!inner(eventos!inner(empresa_id)))").eq("escalas.equipes.eventos.empresa_id",empresaId),
      supabaseAdmin.from("ocorrencias").select("id,descricao,criado_em,escalas!inner(equipes!inner(eventos!inner(empresa_id)))").eq("escalas.equipes.eventos.empresa_id",empresaId),
      supabaseAdmin.from("fechamentos").select("id,status,horas_trabalhadas,valor_calculado,escalas!inner(equipes!inner(eventos!inner(empresa_id)))").eq("escalas.equipes.eventos.empresa_id",empresaId),
      supabaseAdmin.from("pagamentos").select("id,valor,status,erro,criado_em,fechamentos!inner(escalas!inner(equipes!inner(eventos!inner(empresa_id))))").eq("fechamentos.escalas.equipes.eventos.empresa_id",empresaId),
      supabaseAdmin.from("cobrancas").select("id,descricao,valor,status,erro,criado_em").eq("empresa_id",empresaId),
    ]);
    for (const r of [eventos,colaboradores,equipes,escalas,pontos,ocorrencias,fechamentos,pagamentos,cobrancas]) if (r.error) throw new Error("Falha na consulta do atendimento.");
    return { empresaId, eventos:eventos.data ?? [], colaboradores:colaboradores.data ?? [], equipes:equipes.data ?? [], escalas:escalas.data ?? [], pontos:pontos.data ?? [], ocorrencias:ocorrencias.data ?? [], fechamentos:fechamentos.data ?? [], pagamentos:pagamentos.data ?? [], cobrancas:cobrancas.data ?? [] };
  });

// Retired money-moving support endpoints fail closed, including direct requests.
export const reenviarPixSuporte = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(() => { throw new Error("Suporte não tem autorização para executar Pix."); });
export const conferirCobrancaSuporte = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(() => { throw new Error("Suporte não tem autorização para alterar cobranças ou saldos."); });
