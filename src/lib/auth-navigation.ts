import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import type { ContextoResolvido, PapelUsuario } from "@/lib/dominio";
import { resolverContextoLegacy } from "@/lib/dominio";

export type DestinoAcesso =
  "/auth" | "/onboarding" | "/painel" | "/admin" | "/suporte" | "/acessos-teste";

export interface DadosUsuarioAcesso {
  usuarioId: string;
  ativo: boolean;
  empresaId: string | null;
  contexto: ContextoResolvido;
}

/**
 * Carrega de forma unificada os dados de perfil, papéis de agência e papéis de plataforma.
 */
export async function carregarDadosAcesso(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<DadosUsuarioAcesso> {
  const [{ data: usuario }, { data: roles }, { data: papeisPlataforma }] = await Promise.all([
    supabase.from("usuarios").select("empresa_id, ativo").eq("id", userId).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", userId),
    supabase.from("plataforma_usuarios").select("papel").eq("user_id", userId),
  ]);

  const contexto = resolverContextoLegacy({
    usuarioId: userId,
    empresaId: usuario?.empresa_id ?? null,
    papeis: (roles ?? []).map((r) => r.role as PapelUsuario),
    papeisPlataforma: (papeisPlataforma ?? []).map((r) => r.papel as string),
  });

  return {
    usuarioId: userId,
    ativo: usuario ? usuario.ativo : true,
    empresaId: usuario?.empresa_id ?? null,
    contexto,
  };
}

/**
 * Determina a rota permitida / destino para o usuário autenticado de acordo com seus privilégios.
 */
export function resolverDestinoAcesso(
  dados: {
    ativo: boolean;
    contexto: ContextoResolvido;
  },
  caminhoAtual?: string,
): string {
  // 1. Usuário desativado é bloqueado
  if (!dados.ativo) {
    return "/auth";
  }

  // 2. Contexto de plataforma (Master / Suporte)
  if (dados.contexto.hasPlatformContext) {
    const isMaster = dados.contexto.papeisPlataforma.includes("admin_master");
    if (isMaster) {
      if (
        caminhoAtual &&
        (caminhoAtual.startsWith("/admin") ||
          caminhoAtual.startsWith("/acessos-teste") ||
          caminhoAtual.startsWith("/suporte"))
      ) {
        return caminhoAtual;
      }
      return "/admin";
    }

    // Suporte
    if (caminhoAtual && caminhoAtual.startsWith("/suporte")) {
      return caminhoAtual;
    }
    return "/suporte";
  }

  // 3. Usuário de agência acessando rotas restritas de plataforma
  if (
    caminhoAtual &&
    (caminhoAtual.startsWith("/admin") ||
      caminhoAtual.startsWith("/suporte") ||
      caminhoAtual.startsWith("/acessos-teste"))
  ) {
    return "/painel";
  }

  // 4. Usuário sem empresa (precisa cadastrar agência no onboarding)
  const semEmpresa = !dados.contexto.organizationContext;
  const estaNoOnboarding = caminhoAtual?.startsWith("/onboarding");

  if (semEmpresa) {
    return estaNoOnboarding && caminhoAtual ? caminhoAtual : "/onboarding";
  }

  // 5. Usuário com empresa que tenta voltar para onboarding vai para o painel
  if (estaNoOnboarding) {
    return "/painel";
  }

  return caminhoAtual && caminhoAtual !== "/auth" && caminhoAtual !== "/"
    ? caminhoAtual
    : "/painel";
}

export interface ExtracaoToken {
  tipo: "tokens_hash" | "token_param" | "codigo_puro";
  accessToken?: string;
  refreshToken?: string;
  token?: string;
  tokenType?: "email" | "magiclink";
}

/**
 * Extrai token, link de autenticação ou código puro inserido pelo usuário.
 */
export function extrairTokenOuLink(input: string): ExtracaoToken {
  const limpo = input.trim();

  // Caso 1: URL contendo hash #access_token=...&refresh_token=...
  if (limpo.includes("#access_token=")) {
    const hash = limpo.split("#")[1];
    const params = new URLSearchParams(hash);
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    if (accessToken && refreshToken) {
      return {
        tipo: "tokens_hash",
        accessToken,
        refreshToken,
      };
    }
  }

  // Caso 2: URL contendo query param ?token=...
  if (limpo.includes("token=")) {
    try {
      const url = new URL(limpo);
      const token = url.searchParams.get("token");
      const tokenType = (url.searchParams.get("type") as "email" | "magiclink") ?? "email";
      if (token) {
        return {
          tipo: "token_param",
          token,
          tokenType,
        };
      }
    } catch {
      // url inválida, cai no formato de token puro
    }
  }

  return {
    tipo: "codigo_puro",
    token: limpo,
    tokenType: "email",
  };
}
