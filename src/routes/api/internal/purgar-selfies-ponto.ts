import { createFileRoute } from "@tanstack/react-router";

import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

export const Route = createFileRoute("/api/internal/purgar-selfies-ponto")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = await authenticateCronRequest(request);
        if (unauthorized) return unauthorized;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: expiradas, error } = await supabaseAdmin
          .from("pontos")
          .select("id, foto_url")
          .or("foto_url.not.is.null,gps_lat.not.is.null,gps_lng.not.is.null")
          .lte("evidencia_expira_em", new Date().toISOString())
          .limit(500);
        if (error) return Response.json({ error: error.message }, { status: 500 });

        const caminhos = (expiradas ?? [])
          .map((ponto) => ponto.foto_url)
          .filter((caminho): caminho is string => Boolean(caminho));
        if (!expiradas?.length) return Response.json({ removidas: 0 });

        const { error: storageError } = caminhos.length
          ? await supabaseAdmin.storage.from("selfies-ponto").remove(caminhos)
          : { error: null };
        if (storageError) return Response.json({ error: storageError.message }, { status: 500 });

        const ids = (expiradas ?? []).map((ponto) => ponto.id);
        const { error: updateError } = await supabaseAdmin
          .from("pontos")
          .update({ foto_url: null, gps_lat: null, gps_lng: null })
          .in("id", ids);
        if (updateError) return Response.json({ error: updateError.message }, { status: 500 });
        return Response.json({ removidas: ids.length });
      },
    },
  },
});
