import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import type { Capacidade, ContextoResolvido, PapelUsuario } from "@/lib/dominio";
import { podeCom, resolverContextoLegacy } from "@/lib/dominio";

export async function resolveContextoAutorizacao(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<ContextoResolvido> {
  const [
    { data: usuario, error: usuarioError },
    { data: roles, error: rolesError },
    { data: plataforma, error: plataformaError },
  ] = await Promise.all([
    supabase.from("usuarios").select("empresa_id, ativo").eq("id", userId).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", userId),
    supabase.from("plataforma_usuarios").select("papel").eq("user_id", userId),
  ]);

  if (!usuario?.ativo) throw new Error("Conta desativada ou indisponível.");
  if (usuarioError) throw new Error("Não foi possível verificar o contexto do usuário.");
  if (rolesError) throw new Error("Não foi possível verificar suas permissões.");
  if (plataformaError) throw new Error("Não foi possível verificar o contexto da plataforma.");

  return resolverContextoLegacy({
    usuarioId: userId,
    empresaId: usuario?.empresa_id ?? null,
    papeis: (roles ?? []).map((item) => item.role as PapelUsuario),
    papeisPlataforma: (plataforma ?? []).map((item) => item.papel as string),
  });
}

export function requireAuth(context: { userId?: string | null } | null): string {
  if (!context?.userId) throw new Error("Autenticação necessária.");
  return context.userId;
}

export function requireOrganizationContext(
  context: { contexto?: ContextoResolvido | null } | null,
): ContextoResolvido {
  const resolved = context?.contexto ?? null;
  if (!resolved?.organizationContext) {
    throw new Error("Contexto de organização necessário.");
  }
  return resolved;
}

export function requirePlatformContext(
  context: { contexto?: ContextoResolvido | null } | null,
): ContextoResolvido {
  const resolved = context?.contexto ?? null;
  if (!resolved?.platformContext) {
    throw new Error("Contexto de plataforma necessário.");
  }
  return resolved;
}

export async function requireCapability(
  supabase: SupabaseClient<Database>,
  userId: string,
  capacidade: Capacidade,
): Promise<ContextoResolvido> {
  const contexto = await resolveContextoAutorizacao(supabase, userId);
  if (!contexto.organizationContext || !podeCom(contexto.papeis, capacidade)) {
    throw new Error("Você não tem permissão para realizar esta ação.");
  }
  return contexto;
}

export function requireResourceAccess(
  context: { contexto?: ContextoResolvido | null } | null,
  empresaId: string | null | undefined,
  options?: { allowPlatform?: boolean },
): ContextoResolvido {
  const resolved = context?.contexto ?? null;
  if (!empresaId) {
    if (resolved?.papeisPlataforma.includes("admin_master") && options?.allowPlatform) return resolved;
    throw new Error("Recurso sem organização vinculada.");
  }

  if (resolved?.papeisPlataforma.includes("admin_master") && options?.allowPlatform) {
    return resolved;
  }

  const organizacao = requireOrganizationContext(context);
  if (organizacao.empresaId !== empresaId) {
    throw new Error("Você não tem acesso a este recurso.");
  }
  return organizacao;
}

export async function exigirCapacidade(
  supabase: SupabaseClient<Database>,
  userId: string,
  capacidade: Capacidade,
) {
  await requireCapability(supabase, userId, capacidade);
}
