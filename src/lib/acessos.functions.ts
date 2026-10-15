import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  requireCapability,
  requireOrganizationContext,
  requirePlatformContext,
} from "@/lib/autorizacao.server";

const papelSchema = z.enum(["admin", "coordenador", "financeiro", "supervisor"]);

function senhaTemporaria() {
  return `Pc!${crypto.randomUUID().replaceAll("-", "").slice(0, 14)}9a`;
}

async function criarUsuario(
  email: string,
  nome: string,
  senha: string,
  empresaId: string | null,
  papelAgencia?: z.infer<typeof papelSchema>,
  papelPlataforma?: "admin_master" | "suporte",
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
    user_metadata: { nome },
  });
  if (error || !data.user) throw new Error(error?.message ?? "Não foi possível criar o acesso.");

  const userId = data.user.id;
  try {
    const { error: usuarioError } = await supabaseAdmin
      .from("usuarios")
      .upsert({ id: userId, nome, email, empresa_id: empresaId, ativo: true });
    if (usuarioError) throw usuarioError;

    if (papelAgencia) {
      const { error: papelError } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: userId, role: papelAgencia });
      if (papelError) throw papelError;
    }
    if (papelPlataforma) {
      const { error: plataformaError } = await supabaseAdmin
        .from("plataforma_usuarios")
        .insert({ user_id: userId, papel: papelPlataforma });
      if (plataformaError) throw plataformaError;
    }
    return { email, senha, nome };
  } catch (erro) {
    await supabaseAdmin.auth.admin.deleteUser(userId);
    throw erro;
  }
}

export const criarAcessoEquipe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        nome: z.string().trim().min(2).max(120),
        email: z.string().trim().email().toLowerCase(),
        papel: papelSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    requireOrganizationContext(context);
    await requireCapability(context.supabase, context.userId, "configuracoes.gerenciar");
    const { data: ator } = await context.supabase
      .from("usuarios")
      .select("empresa_id")
      .eq("id", context.userId)
      .maybeSingle();
    if (!ator?.empresa_id) throw new Error("Usuário sem agência.");

    const senha = senhaTemporaria();
    const acesso = await criarUsuario(data.email, data.nome, senha, ator.empresa_id, data.papel);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("logs_auditoria").insert({
      empresa_id: ator.empresa_id,
      ator_id: context.userId,
      ator_contexto: "organizacao",
      acao: "acesso_equipe_criado",
      recurso_tipo: "usuario",
      resultado: "sucesso",
      detalhes: { email: data.email, papel: data.papel },
    });
    return acesso;
  });

export const criarAcessosTeste = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ empresaId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    requirePlatformContext(context);
    const { data: papel } = await context.supabase
      .from("plataforma_usuarios")
      .select("papel")
      .eq("user_id", context.userId)
      .eq("papel", "admin_master")
      .maybeSingle();
    if (!papel) throw new Error("Apenas a administração master pode criar acessos de teste.");

    const sufixo = `${Date.now()}-${crypto.randomUUID().slice(0, 6)}`;
    const acessos = [];
    acessos.push(
      await criarUsuario(
        `agencia.${sufixo}@example.com`,
        "Teste Agência",
        senhaTemporaria(),
        data.empresaId,
        "admin",
      ),
    );
    acessos.push(
      await criarUsuario(
        `suporte.${sufixo}@example.com`,
        "Teste Suporte",
        senhaTemporaria(),
        null,
        undefined,
        "suporte",
      ),
    );
    acessos.push(
      await criarUsuario(
        `master.${sufixo}@example.com`,
        "Teste Admin Master",
        senhaTemporaria(),
        null,
        undefined,
        "admin_master",
      ),
    );

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("logs_auditoria").insert({
      empresa_id: data.empresaId,
      ator_id: context.userId,
      ator_contexto: "admin_master",
      acao: "acessos_teste_criados",
      recurso_tipo: "empresa",
      recurso_id: data.empresaId,
      resultado: "sucesso",
      detalhes: { quantidade: acessos.length },
    });
    return acessos;
  });
