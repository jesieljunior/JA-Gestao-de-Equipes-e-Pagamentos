import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";
import { resolverContextoLegacy } from "@/lib/dominio";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) throw redirect({ to: "/auth" });

      let { data: usuario } = await supabase
        .from("usuarios")
        .select("empresa_id, ativo")
        .eq("id", data.user.id)
        .maybeSingle();

      if (!usuario) {
        try {
          const nomeMeta =
            data.user.user_metadata?.nome ||
            data.user.user_metadata?.full_name ||
            data.user.email?.split("@")[0] ||
            "Usuário";
          await supabase.from("usuarios").upsert({
            id: data.user.id,
            nome: nomeMeta,
            email: data.user.email ?? "",
            ativo: true,
          });
          const { data: usuarioCriado } = await supabase
            .from("usuarios")
            .select("empresa_id, ativo")
            .eq("id", data.user.id)
            .maybeSingle();
          if (usuarioCriado) usuario = usuarioCriado;
        } catch {
          // Segue para onboarding com usuário novo
        }
      }

      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", data.user.id);

      const { data: papeisPlataforma } = await supabase
        .from("plataforma_usuarios")
        .select("papel")
        .eq("user_id", data.user.id);

      const contexto = resolverContextoLegacy({
        usuarioId: data.user.id,
        empresaId: usuario?.empresa_id ?? null,
        papeis: (roles ?? []).map((r) => r.role),
        papeisPlataforma: (papeisPlataforma ?? []).map((r) => r.papel as string),
      });

      // Desvia para /auth apenas se a conta foi explicitamente desativada
      if (usuario && usuario.ativo === false) {
        await supabase.auth.signOut();
        throw redirect({ to: "/auth" });
      }

      if (contexto.hasPlatformContext) {
        const master = contexto.papeisPlataforma.includes("admin_master");
        const permitida =
          location.pathname.startsWith("/suporte") ||
          (master &&
            (location.pathname.startsWith("/admin") ||
              location.pathname.startsWith("/acessos-teste")));
        if (!permitida) throw redirect({ to: master ? "/admin" : "/suporte" });
        return { user: data.user, contexto };
      }

      if (
        location.pathname.startsWith("/admin") ||
        location.pathname.startsWith("/suporte") ||
        location.pathname.startsWith("/acessos-teste")
      ) {
        throw redirect({ to: "/painel" });
      }

      const semEmpresa = !contexto.organizationContext;
      const naOnboarding = location.pathname.startsWith("/onboarding");
      if (semEmpresa && !naOnboarding) throw redirect({ to: "/onboarding" });
      if (!semEmpresa && naOnboarding) throw redirect({ to: "/painel" });

      return { user: data.user, contexto };
    } catch (e) {
      if (e && typeof e === "object" && "to" in e) throw e;
      throw redirect({ to: "/auth" });
    }
  },
  component: () => <Outlet />,
});
