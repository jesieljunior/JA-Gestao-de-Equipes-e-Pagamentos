/**
 * Núcleo do Pix de saída ao freelancer sem taxa percentual da Já.
 * Recebe o cliente Supabase de fora para servir tanto a agência (RLS do
 * usuário) quanto o suporte da plataforma (cliente administrativo).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

async function exigirCadastroFiscalValidado(supabase: any, empresaId: string) {
  const { data, error } = await supabase.rpc("empresa_fiscal_validada", { _empresa_id: empresaId });
  if (error || !data)
    throw new Error("Pix bloqueado: complete e aguarde a validação fiscal da agência.");
}

/** Resolve a empresa do pagamento seguindo a cadeia de dependência do pagamento. */
export async function resolverEmpresaDoPagamento(
  supabase: any,
  pagamentoId: string,
): Promise<string> {
  const { data: pagamento } = await supabase
    .from("pagamentos")
    .select("id, fechamento_id")
    .eq("id", pagamentoId)
    .maybeSingle();
  if (!pagamento) throw new Error("Pagamento não encontrado.");

  const { data: fechamento } = await supabase
    .from("fechamentos")
    .select("id, escala_id")
    .eq("id", pagamento.fechamento_id)
    .maybeSingle();
  if (!fechamento) throw new Error("Fechamento do pagamento não encontrado.");

  const { data: escala } = await supabase
    .from("escalas")
    .select("id, equipe_id")
    .eq("id", fechamento.escala_id)
    .maybeSingle();
  if (!escala) throw new Error("Escala do pagamento não encontrada.");

  const { data: equipe } = await supabase
    .from("equipes")
    .select("id, evento_id")
    .eq("id", escala.equipe_id)
    .maybeSingle();
  if (!equipe) throw new Error("Equipe do pagamento não encontrada.");

  const { data: evento } = await supabase
    .from("eventos")
    .select("id, empresa_id")
    .eq("id", equipe.evento_id)
    .maybeSingle();
  if (!evento?.empresa_id) throw new Error("Não foi possível identificar a agência do pagamento.");

  return evento.empresa_id as string;
}

/** Valida saldo, envia o Pix, debita o saldo sem debitar receita SaaS. */
export async function enviarPix(supabase: any, pagamentoId: string, empresaId?: string | null) {
  const { data: pagamento } = await supabase
    .from("pagamentos")
    .select(
      "id, valor, status, fechamento_id, chave_idempotencia, fechamentos(escala_id, escalas(freelancers(nome, chave_pix), equipes(evento_id, eventos(nome, empresa_id))))",
    )
    .eq("id", pagamentoId)
    .maybeSingle();
  if (!pagamento) throw new Error("Pagamento não encontrado.");
  if (pagamento.status === "executado") throw new Error("Pagamento já executado.");

  const primeiro = <T>(v: T | T[] | null | undefined): T | null =>
    Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

  const fechamento: any = primeiro(pagamento.fechamentos);
  const escala: any = primeiro(fechamento?.escalas);
  const freelancer: any = primeiro(escala?.freelancers);
  const equipe: any = primeiro(escala?.equipes);
  const evento: any = primeiro(equipe?.eventos);

  const chavePix: string | undefined = freelancer?.chave_pix;
  const empresaResolvida = empresaId ?? evento?.empresa_id ?? null;
  if (!chavePix) throw new Error("Freelancer sem chave Pix cadastrada.");
  if (!empresaResolvida) throw new Error("Não foi possível identificar a agência do pagamento.");

  if (evento?.empresa_id && empresaResolvida !== evento.empresa_id) {
    throw new Error("Pagamento vinculado a outra agência.");
  }

  const valor = Number(pagamento.valor);
  const empresaDestino = empresaResolvida;
  try {
    if (!Number.isFinite(valor) || valor < 0.01) {
      throw new Error("Pagamento inválido: corrija o fechamento para um valor mínimo de R$ 0,01.");
    }
    const { exigirRecursoPlano } = await import("./plano.server");
    await exigirRecursoPlano(supabase, empresaDestino, "financeiro");
    if (pagamento.status === "agendado")
      await exigirRecursoPlano(supabase, empresaDestino, "agendamento_pix");
    await exigirCadastroFiscalValidado(supabase, empresaDestino);
    const { data: saldo } = await supabase.rpc("saldo_empresa", { _empresa_id: empresaDestino });
    if (Number(saldo ?? 0) < valor)
      throw new Error(
        `Saldo insuficiente: disponível R$ ${Number(saldo ?? 0).toFixed(2)}, necessário R$ ${valor.toFixed(2)}. Adicione saldo para continuar.`,
      );

    const { transferirPix } = await import("./asaas.server");
    const transferencia = await transferirPix({
      valor,
      chavePix,
      descricao: `Já — ${freelancer?.nome ?? "freelancer"} · ${evento?.nome ?? "evento"}`,
      referenciaExterna: pagamento.id,
      chaveIdempotencia: pagamento.chave_idempotencia,
    });

    await supabase
      .from("pagamentos")
      .update({
        status: "executado",
        executado_em: new Date().toISOString(),
        txid_parceiro: transferencia.id,
        parceiro_transferencia_id: transferencia.id,
        chave_pix_destino: chavePix,
        erro: null,
      })
      .eq("id", pagamento.id);

    await supabase.from("movimentos_saldo").insert({
      empresa_id: empresaDestino,
      tipo: "debito",
      valor,
      descricao: `Pix para ${freelancer?.nome ?? "freelancer"}`,
      pagamento_id: pagamento.id,
    });

    return { ok: true, txid: transferencia.id as string, taxa: 0 };
  } catch (e) {
    const mensagem = e instanceof Error ? e.message : "Falha ao enviar o Pix.";
    await supabase
      .from("pagamentos")
      .update({ status: "falhou", erro: mensagem })
      .eq("id", pagamento.id);
    throw new Error(mensagem);
  }
}

/** Processa pagamentos agendados vencidos; o cron externo deve chamar esta função. */
export async function processarPagamentosAgendados(supabase: any, limite = 50) {
  const agora = new Date().toISOString();
  const { data: pagamentos, error } = await supabase
    .from("pagamentos")
    .select("id")
    .eq("status", "agendado")
    .not("data_agendada", "is", null)
    .lte("data_agendada", agora)
    .order("data_agendada", { ascending: true })
    .limit(limite);
  if (error) throw error;

  const resultados = { processados: 0, falhos: 0 };
  for (const pagamento of pagamentos ?? []) {
    try {
      await enviarPix(supabase, pagamento.id);
      resultados.processados += 1;
    } catch {
      resultados.falhos += 1;
    }
  }
  return resultados;
}
