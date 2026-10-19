import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const carregarVisaoMaster = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!context.contexto.papeisPlataforma.includes("admin_master"))
      throw new Error("Acesso restrito à administração master.");
    const db = context.supabase;
    const [
      empresas,
      eventos,
      colaboradores,
      pontos,
      pagamentos,
      movimentos,
      cobrancas,
      atendimentos,
    ] = await Promise.all([
      db.from("empresas").select("id,nome,ativa"),
      db.from("eventos").select("id,empresa_id,status"),
      db.from("freelancers").select("id,empresa_id"),
      db.from("pontos").select("id,status,escalas!inner(equipes!inner(eventos!inner(empresa_id)))"),
      db
        .from("pagamentos")
        .select(
          "id,valor,status,fechamentos!inner(escalas!inner(equipes!inner(eventos!inner(empresa_id))))",
        ),
      db.from("movimentos_saldo").select("empresa_id,tipo,valor"),
      db.from("cobrancas").select("empresa_id,tipo,status,valor"),
      db
        .from("suporte_atendimentos")
        .select("id,empresa_id,usuario_id,iniciado_em,encerrado_em,motivo")
        .order("iniciado_em", { ascending: false }),
    ]);
    if (empresas.error) {
      console.error("[carregarVisaoMaster] Erro ao carregar empresas:", empresas.error);
      throw new Error("Não foi possível carregar as empresas da plataforma.");
    }

    return {
      empresas: Array.isArray(empresas.data) ? empresas.data : [],
      eventos: Array.isArray(eventos.data) ? eventos.data : [],
      colaboradores: Array.isArray(colaboradores.data) ? colaboradores.data : [],
      pontos: Array.isArray(pontos.data) ? pontos.data : [],
      pagamentos: Array.isArray(pagamentos.data) ? pagamentos.data : [],
      movimentos: Array.isArray(movimentos.data) ? movimentos.data : [],
      cobrancas: Array.isArray(cobrancas.data) ? cobrancas.data : [],
      atendimentos: Array.isArray(atendimentos.data) ? atendimentos.data : [],
    };
  });
export const alterarAtivacaoSuporte = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ usuarioId: z.string().uuid(), ativo: z.boolean() }).parse(input),
  )
  .handler(async ({ context, data }) => {
    if (!context.contexto.papeisPlataforma.includes("admin_master"))
      throw new Error("Acesso restrito à administração master.");
    if (data.usuarioId === context.userId)
      throw new Error("Não é permitido alterar a própria ativação.");
    const role = await context.supabase
      .from("plataforma_usuarios")
      .select("papel")
      .eq("user_id", data.usuarioId);
    if (
      role.error ||
      !role.data?.some((r) => r.papel === "suporte") ||
      role.data.some((r) => r.papel === "admin_master")
    )
      throw new Error("A operação é exclusiva para contas de suporte.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const audit = await supabaseAdmin.from("logs_auditoria").insert({
      ator_id: context.userId,
      ator_contexto: "admin_master",
      acao: data.ativo ? "suporte_ativado" : "suporte_desativado",
      recurso_tipo: "usuario",
      recurso_id: data.usuarioId,
      resultado: "sucesso",
      detalhes: { ativo: data.ativo },
    });
    if (audit.error) throw new Error("Não foi possível auditar a alteração.");
    const r = await supabaseAdmin
      .from("usuarios")
      .update({ ativo: data.ativo })
      .eq("id", data.usuarioId);
    if (r.error) throw new Error("Não foi possível alterar a ativação.");
    return { ativo: data.ativo };
  });
