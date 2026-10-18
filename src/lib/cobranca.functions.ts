import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrganizationContext } from "./autorizacao.server";
import { calcularFatura } from "./cobranca-v2";

export const carregarCobranca = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const empresaId = requireOrganizationContext(context).empresaId;
    if (!empresaId) throw new Error("Agência não encontrada.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const abertura = await supabaseAdmin.rpc("abrir_ciclo_cobranca", { _empresa_id: empresaId });
    if (abertura.error) throw new Error("Não foi possível abrir o ciclo de cobrança.");
    const db = context.supabase;
    const [uso, ciclo, faturas, planos, taxas] = await Promise.all([
      db.rpc("resumo_uso_empresa", { _empresa_id: empresaId }),
      db.from("ciclos_cobranca").select("*").eq("id", abertura.data).single(),
      db
        .from("faturas_plataforma")
        .select("*")
        .eq("empresa_id", empresaId)
        .order("ciclo_inicio", { ascending: false }),
      db.from("planos").select("*").eq("ativo", true).order("ordem"),
      db.from("taxas_meio_pagamento").select("*").eq("ativo", true),
    ]);
    for (const resultado of [uso, ciclo, faturas, planos, taxas])
      if (resultado.error) throw new Error("Não foi possível carregar a cobrança.");
    const resumo = uso.data?.[0];
    if (!resumo || !ciclo.data) throw new Error("Plano não encontrado.");
    const c = ciclo.data;
    const preco = {
      id: c.plano_id ?? "",
      nome: c.plano_nome,
      mensalidade: c.mensalidade,
      participacoes_incluidas: c.participacoes_incluidas,
      valor_excedente: c.valor_excedente,
    };
    const bruto = calcularFatura(preco, resumo.participacoes_usadas).bruto;
    const desconto =
      c.trial_ate && new Date(c.trial_ate) >= new Date(c.fim)
        ? bruto
        : c.desconto_tipo === "isencao"
          ? bruto
          : c.desconto_tipo === "percentual"
            ? (bruto * c.desconto_valor) / 100
            : c.desconto_tipo === "valor"
              ? c.desconto_valor
              : 0;
    return {
      uso: resumo,
      ciclo: c,
      estimativa: calcularFatura(preco, resumo.participacoes_usadas, desconto),
      faturas: faturas.data ?? [],
      planos: planos.data ?? [],
      taxas: taxas.data ?? [],
    };
  });
