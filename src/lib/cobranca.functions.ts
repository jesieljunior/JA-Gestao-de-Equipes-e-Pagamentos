import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrganizationContext } from "./autorizacao.server";
import { calcularFatura } from "./cobranca-v2";

export const carregarCobranca = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const empresaId = requireOrganizationContext(context).empresaId;
    if (!empresaId) throw new Error("Agência não encontrada.");

    const agora = new Date().toISOString();
    const daqui30Dias = new Date(Date.now() + 30 * 24 * 60 * 60_000).toISOString();
    const fallbackRetorno = () => ({
      uso: {
        plano_nome: "Free",
        plano_codigo: "free",
        eventos_usados: 0,
        limite_eventos: 1 as number | null,
        participacoes_usadas: 0,
        clt_ativos: 0,
        limite_clt: null as number | null,
        limite_pessoas_evento: null as number | null,
        limite_supervisores: null as number | null,
        aviso_vendas: false,
      },
      ciclo: {
        id: null,
        plano_id: null as string | null,
        plano_nome: "Free",
        mensalidade: 0,
        participacoes_incluidas: 5,
        valor_excedente: 0,
        inicio: agora,
        fim: daqui30Dias,
        trial_ate: null as string | null,
        desconto_tipo: null as string | null,
        desconto_valor: 0,
      },
      estimativa: { total: 0, excedentes: 0, valorExcedente: 0, bruto: 0, desconto: 0 },
      faturas: [],
      planos: [],
      taxas: [],
    });

    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const abertura = await supabaseAdmin.rpc("abrir_ciclo_cobranca", {
        _empresa_id: empresaId,
      });

      if (abertura.error || !abertura.data) {
        return fallbackRetorno();
      }

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

      const resumo = uso.data?.[0];
      if (!resumo || !ciclo.data) {
        return fallbackRetorno();
      }

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
    } catch (err) {
      console.warn("[carregarCobranca] Usando fallback para plano Free:", err);
      return fallbackRetorno();
    }
  });
