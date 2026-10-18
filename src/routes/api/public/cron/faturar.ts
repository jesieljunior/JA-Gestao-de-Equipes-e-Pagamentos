import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

export const Route = createFileRoute("/api/public/cron/faturar")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = await authenticateCronRequest(request);
        if (unauthorized) return unauthorized;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const agora = new Date().toISOString();
        const { data: ciclos, error } = await supabaseAdmin
          .from("ciclos_cobranca")
          .select("empresa_id, inicio")
          .lte("fim", agora)
          .order("fim")
          .limit(500);
        if (error) return Response.json({ error: "Falha ao consultar ciclos." }, { status: 500 });
        let fechadas = 0,
          falhas = 0;
        for (const ciclo of ciclos ?? []) {
          const resultado = await supabaseAdmin.rpc("fechar_fatura_ciclo", {
            _empresa_id: ciclo.empresa_id,
            _ref: ciclo.inicio,
          });
          if (resultado.error) falhas++;
          else fechadas++;
        }
        const { data: assinaturas } = await supabaseAdmin
          .from("assinaturas")
          .select("empresa_id")
          .in("status", ["ativa", "trial", "em_trial"]);
        for (const assinatura of assinaturas ?? []) {
          const resultado = await supabaseAdmin.rpc("abrir_ciclo_cobranca", {
            _empresa_id: assinatura.empresa_id,
          });
          if (resultado.error) falhas++;
        }
        return Response.json({ fechadas, falhas });
      },
    },
  },
});
