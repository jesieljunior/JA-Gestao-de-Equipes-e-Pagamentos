import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import {
  podeCom,
  resolverContextoLegacy,
  type Capacidade,
  type ContextoResolvido,
  type Empresa,
  type PapelUsuario,
  type Usuario,
} from "@/lib/dominio";

export interface Sessao {
  usuario: Usuario;
  empresa: Empresa | null;
  papeis: PapelUsuario[];
  papeisPlataforma: string[];
  contexto: ContextoResolvido;
}

async function carregarSessao(): Promise<Sessao | null> {
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) return null;

  const { data: usuario, error } = await supabase
    .from("usuarios")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw error;
  if (!usuario?.ativo) return null;

  const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user.id);

  const { data: papeisPlataforma } = await supabase
    .from("plataforma_usuarios")
    .select("papel")
    .eq("user_id", user.id);

  let empresa: Empresa | null = null;
  if (usuario.empresa_id) {
    const { data } = await supabase
      .from("empresas")
      .select("*")
      .eq("id", usuario.empresa_id)
      .maybeSingle();
    empresa = data ?? null;
  }

  const contexto = resolverContextoLegacy({
    usuarioId: user.id,
    empresaId: usuario.empresa_id ?? null,
    papeis: (roles ?? []).map((r) => r.role as PapelUsuario),
    papeisPlataforma: (papeisPlataforma ?? []).map((r) => r.papel as string),
  });

  return {
    usuario,
    empresa,
    papeis: (roles ?? []).map((r) => r.role as PapelUsuario),
    papeisPlataforma: (papeisPlataforma ?? []).map((r) => r.papel as string),
    contexto,
  };
}

export function useSessao() {
  const query = useQuery({
    queryKey: ["sessao"],
    queryFn: carregarSessao,
    staleTime: 30_000,
  });

  const sessao = query.data ?? null;
  const papeisPlataforma = sessao?.papeisPlataforma ?? [];
  const contexto =
    sessao?.contexto ??
    resolverContextoLegacy({
      usuarioId: sessao?.usuario.id ?? "",
      empresaId: sessao?.usuario.empresa_id ?? null,
      papeis: sessao?.papeis ?? [],
      papeisPlataforma: sessao?.papeisPlataforma ?? [],
    });

  return {
    ...query,
    sessao,
    contexto,
    empresaId: contexto.empresaId,
    papeis: contexto.papeis,
    papeisPlataforma,
    ehAdminMaster: papeisPlataforma.includes("admin_master"),
    ehSuporte: papeisPlataforma.includes("suporte"),
    ehEquipePlataforma: papeisPlataforma.length > 0,
    pode: (c: Capacidade) => podeCom(contexto.papeis, c),
  };
}
