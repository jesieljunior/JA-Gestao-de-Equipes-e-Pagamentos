import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/internal/processar-pagamentos")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const esperado = process.env["CRON_SECRET"];
        const recebido = request.headers.get("authorization");
        if (!esperado || recebido !== `Bearer ${esperado}`) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { processarPagamentosAgendados } = await import("@/lib/pagamentos.server");
        const resultado = await processarPagamentosAgendados(supabaseAdmin);
        return Response.json(resultado);
      },
    },
  },
});
