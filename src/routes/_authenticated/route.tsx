import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";
import { carregarDadosAcesso, resolverDestinoAcesso } from "@/lib/auth-navigation";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    try {
      let user = null;
      const { data: sessData } = await supabase.auth.getSession();
      if (sessData?.session?.user) {
        user = sessData.session.user;
      } else {
        const { data: userData, error } = await supabase.auth.getUser();
        if (!error && userData?.user) {
          user = userData.user;
        }
      }

      if (!user) throw redirect({ to: "/auth" });

      const dadosAcesso = await carregarDadosAcesso(supabase, user.id);

      if (!dadosAcesso.ativo) {
        await supabase.auth.signOut();
        throw redirect({ to: "/auth" });
      }

      const destino = resolverDestinoAcesso(dadosAcesso, location.pathname);
      if (destino !== location.pathname) {
        throw redirect({ to: destino });
      }

      return { user: data.user, contexto: dadosAcesso.contexto };
    } catch (e) {
      if (e && typeof e === "object" && "to" in e) throw e;
      throw redirect({ to: "/auth" });
    }
  },
  component: () => <Outlet />,
});
