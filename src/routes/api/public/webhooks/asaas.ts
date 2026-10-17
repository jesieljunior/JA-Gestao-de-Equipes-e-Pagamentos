/**
 * Webhook do Asaas. Confirma cobranças pagas (credita o saldo da agência) e
 * o resultado das transferências Pix aos freelancers.
 *
 * O Asaas envia o cabeçalho `asaas-access-token` com o valor configurado no
 * painel; ele é a autenticação desta rota pública.
 */

import { createFileRoute } from "@tanstack/react-router";

import { gerarChaveWebhookAsaas, type EventoAsaasWebhook } from "@/lib/webhook-idempotencia";

type EventoAsaas = EventoAsaasWebhook;

const PAGAS = new Set(["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED", "PAYMENT_RECEIVED_IN_CASH"]);

export const Route = createFileRoute("/api/public/webhooks/asaas")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const esperado = process.env["ASAAS_WEBHOOK_TOKEN"];
        const recebido = request.headers.get("asaas-access-token");
        if (!esperado || recebido !== esperado) {
          return new Response("Unauthorized", { status: 401 });
        }

        let corpo: EventoAsaas;
        try {
          corpo = (await request.json()) as EventoAsaas;
        } catch {
          return new Response("Bad Request", { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const evento = corpo.event ?? "";
        const chaveIdempotencia = gerarChaveWebhookAsaas(corpo);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: webhookJaProcessado } = await (supabaseAdmin as any)
          .from("webhook_eventos")
          .select("id")
          .eq("chave_idempotencia", chaveIdempotencia)
          .maybeSingle();

        if (webhookJaProcessado) {
          return new Response("ok");
        }

        if (PAGAS.has(evento) && corpo.payment?.id) {
          const { data: cobranca } = await supabaseAdmin
            .from("cobrancas")
            .select("id, empresa_id, valor, status, descricao")
            .eq("parceiro_cobranca_id", corpo.payment.id)
            .maybeSingle();

          if (cobranca && cobranca.status !== "pago") {
            const { data: taxaPendente } = await supabaseAdmin
              .from("taxas_plataforma")
              .select("id, valor")
              .eq("cobranca_id", cobranca.id)
              .eq("status", "pendente")
              .maybeSingle();

            const valorCredito = taxaPendente
              ? Math.max(0, Number(cobranca.valor) - Number(taxaPendente.valor))
              : Number(cobranca.valor);

            await supabaseAdmin
              .from("cobrancas")
              .update({ status: "pago", pago_em: new Date().toISOString() })
              .eq("id", cobranca.id);

            await supabaseAdmin.from("movimentos_saldo").insert({
              empresa_id: cobranca.empresa_id,
              tipo: "credito",
              valor: valorCredito,
              descricao: `Cobrança paga — ${cobranca.descricao}`,
              cobranca_id: cobranca.id,
            });

            await supabaseAdmin
              .from("fundings")
              .update({
                status: "available",
                valor_disponivel: valorCredito,
                referencia_parceiro: corpo.payment.id,
              })
              .eq("cobranca_id", cobranca.id)
              .eq("status", "pending");

            if (taxaPendente) {
              await supabaseAdmin
                .from("taxas_plataforma")
                .update({ status: "cobrada" })
                .eq("id", taxaPendente.id);
            }
          }
        }

        if (evento === "PAYMENT_OVERDUE" && corpo.payment?.id) {
          await supabaseAdmin
            .from("cobrancas")
            .update({ status: "vencido" })
            .eq("parceiro_cobranca_id", corpo.payment.id);
        }

        if (evento === "TRANSFER_FAILED" && corpo.transfer?.externalReference) {
          const pagamentoId = corpo.transfer.externalReference;
          const { data: pagamento } = await supabaseAdmin
            .from("pagamentos")
            .select("id, valor, fechamento_id")
            .eq("id", pagamentoId)
            .maybeSingle();

          if (pagamento) {
            await supabaseAdmin
              .from("pagamentos")
              .update({
                status: "falhou",
                erro: corpo.transfer.failReason ?? "Transferência recusada pelo banco.",
              })
              .eq("id", pagamento.id);

            // Estorna o débito de saldo do Pix que não saiu.
            const { data: movimento } = await supabaseAdmin
              .from("movimentos_saldo")
              .select("empresa_id")
              .eq("pagamento_id", pagamento.id)
              .eq("tipo", "debito")
              .maybeSingle();

            if (movimento) {
              await supabaseAdmin.from("movimentos_saldo").insert({
                empresa_id: movimento.empresa_id,
                tipo: "credito",
                valor: pagamento.valor,
                descricao: "Estorno de Pix recusado",
                pagamento_id: pagamento.id,
              });
            }
          }
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: erroWebhookLog } = await (supabaseAdmin as any)
          .from("webhook_eventos")
          .insert({
            chave_idempotencia: chaveIdempotencia,
            evento: evento,
            payload: corpo,
            status: "processado",
          });

        if (erroWebhookLog && erroWebhookLog.code !== "23505") {
          throw erroWebhookLog;
        }

        return new Response("ok");
      },
    },
  },
});
