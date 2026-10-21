/**
 * Recarga de saldo pela própria agência: ela escolhe o valor e a forma de
 * pagamento, o Asaas gera Pix / boleto / fatura de cartão e o saldo entra
 * quando o pagamento é confirmado.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const recargaSchema = z.object({
  valor: z.number().positive().max(1_000_000),
  forma: z.enum(["pix", "cartao", "boleto"]),
});

const dataMais = (dias: number) => {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
};

export const iniciarRecarga = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => recargaSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { exigirCapacidade } = await import("./autorizacao.server");
    await exigirCapacidade(supabase, userId, "financeiro.gerenciar");

    const { data: usuario } = await supabase
      .from("usuarios")
      .select("empresa_id, nome, email")
      .eq("id", userId)
      .maybeSingle();
    const empresaId = usuario?.empresa_id;
    if (!empresaId) throw new Error("Usuário sem agência.");
    const { exigirRecursoPlano } = await import("./plano.server");
    await exigirRecursoPlano(supabase, empresaId, "financeiro");

    const { data: empresa } = await supabase
      .from("empresas")
      .select("nome, cnpj, email_cobranca")
      .eq("id", empresaId)
      .maybeSingle();
    if (!empresa) throw new Error("Agência não encontrada.");

    const documento = (empresa.cnpj ?? "").replace(/\D+/g, "");
    if (documento.length !== 11 && documento.length !== 14)
      throw new Error(
        "O CNPJ da agência está incompleto. Corrija em Configurações antes de adicionar saldo.",
      );

    const vencimento = data.forma === "boleto" ? dataMais(3) : dataMais(0);

    const { data: registro, error: erroInsert } = await supabase
      .from("cobrancas")
      .insert({
        empresa_id: empresaId,
        tipo: "aporte_agencia",
        descricao: "Recarga de saldo Já",
        valor: data.valor,
        forma: data.forma,
        vencimento,
        status: "rascunho",
      })
      .select("id")
      .single();
    if (erroInsert || !registro) throw new Error(erroInsert?.message ?? "Falha ao registrar.");

    const { data: funding, error: erroFunding } = await supabase
      .from("fundings")
      .insert({
        empresa_id: empresaId,
        finalidade: "Pagamentos de prestadores",
        valor_total: data.valor,
        status: "pending",
        cobranca_id: registro.id,
        chave_idempotencia: crypto.randomUUID(),
        criado_por: userId,
      })
      .select("id")
      .single();
    if (erroFunding || !funding) {
      throw new Error(erroFunding?.message ?? "Falha ao registrar a disponibilização.");
    }

    try {
      const { garantirClienteAsaas, criarCobrancaAsaas, obterPixQrCode } =
        await import("./asaas.server");

      const clienteAsaasId = await garantirClienteAsaas({
        nome: empresa.nome,
        cpfCnpj: documento,
        email: empresa.email_cobranca ?? usuario?.email ?? null,
        telefone: null,
        referenciaExterna: empresaId,
      });

      const cobranca = await criarCobrancaAsaas({
        clienteAsaasId,
        valor: data.valor,
        forma: data.forma,
        vencimento,
        descricao: "Recarga de saldo Já",
        referenciaExterna: registro.id,
      });

      const pix = data.forma === "pix" ? await obterPixQrCode(cobranca.id) : null;
      const link = cobranca.invoiceUrl ?? cobranca.bankSlipUrl ?? null;

      await supabase
        .from("cobrancas")
        .update({
          status: "aguardando_pagamento",
          parceiro_cobranca_id: cobranca.id,
          link_pagamento: link,
          pix_copia_cola: pix?.payload ?? null,
        })
        .eq("id", registro.id);

      return {
        id: registro.id,
        link,
        pixCopiaCola: pix?.payload ?? null,
        pixImagem: pix?.imagem ?? null,
      };
    } catch (e) {
      const mensagem = e instanceof Error ? e.message : "Falha no parceiro de pagamento.";
      await supabase.from("cobrancas").update({ erro: mensagem }).eq("id", registro.id);
      throw new Error(mensagem);
    }
  });
