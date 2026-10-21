/**
 * Regras de domínio da plataforma Já — Gestão de Equipes e Pagamentos,
 * portadas do backend original. Nenhum estado ou regra inventado.
 */

import type { Database } from "@/integrations/supabase/types";

export type Tabelas = Database["public"]["Tables"];
export type Enums = Database["public"]["Enums"];

export type PapelUsuario = Enums["papel_usuario"];
export type StatusEvento = Enums["status_evento"];
export type StatusEscala = Enums["status_escala"];
export type StatusPonto = Enums["status_ponto"];
export type StatusFechamento = Enums["status_fechamento"];
export type StatusPagamento = Enums["status_pagamento"];
export type TipoPonto = Enums["tipo_ponto"];
export type TipoValor = Enums["tipo_valor"];
export type MetodoCheck = Enums["metodo_check"];
export type TipoVinculo = "frela" | "clt";

export type Empresa = Tabelas["empresas"]["Row"];
export type Usuario = Tabelas["usuarios"]["Row"];
export type Configuracao = Tabelas["configuracoes"]["Row"];
export type Cliente = Tabelas["clientes"]["Row"];
export type Freelancer = Tabelas["freelancers"]["Row"];
export type Evento = Tabelas["eventos"]["Row"];
export type Equipe = Tabelas["equipes"]["Row"];
export type Escala = Tabelas["escalas"]["Row"];
export type Ponto = Tabelas["pontos"]["Row"];
export type Ocorrencia = Tabelas["ocorrencias"]["Row"];
export type Fechamento = Tabelas["fechamentos"]["Row"];
export type Pagamento = Tabelas["pagamentos"]["Row"];
export type Plano = Tabelas["planos"]["Row"];
export type Cupom = Tabelas["cupons"]["Row"];
export type Assinatura = Tabelas["assinaturas"]["Row"];
export type PapelPlataforma = Enums["papel_plataforma"];

export const ROTULO_PAPEL_PLATAFORMA: Record<PapelPlataforma, string> = {
  admin_master: "Administração Já",
  suporte: "Suporte Já",
};

/** Sequência oficial do PAS cap. 07. CANCELADO fica fora, é exceção. */
export const ORDEM_STATUS_EVENTO: StatusEvento[] = [
  "planejamento",
  "escala",
  "confirmacoes",
  "pronto",
  "em_execucao",
  "encerrando",
  "fechamento",
  "pagamento",
  "concluido",
  "arquivado",
];

export const ROTULO_STATUS_EVENTO: Record<StatusEvento, string> = {
  planejamento: "Planejamento",
  escala: "Escala",
  confirmacoes: "Confirmações",
  pronto: "Pronto",
  em_execucao: "Em execução",
  encerrando: "Encerrando",
  fechamento: "Fechamento",
  pagamento: "Pagamento",
  concluido: "Concluído",
  arquivado: "Arquivado",
  cancelado: "Cancelado",
};

export const ROTULO_PAPEL: Record<PapelUsuario, string> = {
  admin: "Administrador",
  coordenador: "Coordenador",
  financeiro: "Financeiro",
  supervisor: "Supervisor",
};

export const ROTULO_TIPO_PONTO: Record<TipoPonto, string> = {
  entrada: "Entrada",
  saida: "Saída",
  inicio_intervalo: "Início do intervalo",
  fim_intervalo: "Fim do intervalo",
};

export const ROTULO_METODO: Record<MetodoCheck, string> = {
  qrcode: "QR Code",
  selfie: "Selfie",
  manual: "Manual",
};

export const ROTULO_TIPO_VINCULO: Record<TipoVinculo, string> = {
  frela: "Frela",
  clt: "CLT",
};

/** Próximo estado permitido, ou null se o evento já terminou a sequência. */
export function proximoStatus(atual: StatusEvento): StatusEvento | null {
  if (atual === "cancelado") return null;
  const i = ORDEM_STATUS_EVENTO.indexOf(atual);
  if (i < 0 || i === ORDEM_STATUS_EVENTO.length - 1) return null;
  return ORDEM_STATUS_EVENTO[i + 1] ?? null;
}

export function podeCancelar(atual: StatusEvento): boolean {
  return !["concluido", "arquivado", "cancelado"].includes(atual);
}

/**
 * Espelha estado_evento_service.transicionar: só avança um passo por vez,
 * nunca volta, e cancelar só antes de concluir.
 */
export function validarTransicao(atual: StatusEvento, novo: StatusEvento): string | null {
  if (novo === "cancelado") {
    return podeCancelar(atual)
      ? null
      : `Evento em "${ROTULO_STATUS_EVENTO[atual]}" não pode mais ser cancelado`;
  }
  if (atual === "cancelado") return "Evento cancelado não pode mudar de estado";
  const esperado = proximoStatus(atual);
  if (!esperado) return `Evento já está no último estado ("${ROTULO_STATUS_EVENTO[atual]}")`;
  if (novo !== esperado) {
    return `Não é possível ir de "${ROTULO_STATUS_EVENTO[atual]}" direto para "${ROTULO_STATUS_EVENTO[novo]}" — passe por "${ROTULO_STATUS_EVENTO[esperado]}" primeiro`;
  }
  return null;
}

const arredonda = (n: number) => Math.round(n * 100) / 100;

function horasIntervalos(pontos: Ponto[]): number {
  let total = 0;
  let inicio: number | null = null;
  for (const p of pontos) {
    if (p.status !== "aprovado") continue;
    if (p.tipo === "inicio_intervalo") {
      inicio = new Date(p.registrado_em).getTime();
    } else if (p.tipo === "fim_intervalo" && inicio !== null) {
      total += (new Date(p.registrado_em).getTime() - inicio) / 3_600_000;
      inicio = null;
    }
  }
  return total;
}

/**
 * Porte de fechamento_service.calcular_fechamento_da_escala: usa apenas
 * pontos APROVADOS. Sem entrada+saída aprovadas, fecha 0h e R$ 0,00 —
 * mas o fechamento é gerado do mesmo jeito, para ficar no histórico.
 */
export function calcularFechamento(
  escala: Pick<Escala, "valor_combinado" | "tipo_valor">,
  pontosDaEscala: Ponto[],
): { horas: number; valor: number; requerRevisao: boolean; motivoRevisao: string | null } {
  const pontos = [...pontosDaEscala].sort(
    (a, b) => new Date(a.registrado_em).getTime() - new Date(b.registrado_em).getTime(),
  );

  const entrada = pontos.find((p) => p.tipo === "entrada" && p.status === "aprovado");
  const saida = [...pontos].reverse().find((p) => p.tipo === "saida" && p.status === "aprovado");
  const combinado = Number(escala.valor_combinado);

  if (!Number.isFinite(combinado) || combinado < 0.01) {
    return {
      horas: 0,
      valor: 0,
      requerRevisao: true,
      motivoRevisao: "Valor combinado inválido.",
    };
  }

  if (!entrada || !saida) {
    return {
      horas: 0,
      valor: escala.tipo_valor === "diaria" ? arredonda(combinado) : 0,
      requerRevisao: true,
      motivoRevisao: "Sem entrada e saída aprovadas.",
    };
  }
  const ini = new Date(entrada.registrado_em).getTime();
  const fim = new Date(saida.registrado_em).getTime();
  if (fim <= ini) {
    return {
      horas: 0,
      valor: escala.tipo_valor === "diaria" ? arredonda(combinado) : 0,
      requerRevisao: true,
      motivoRevisao: "A saída não está depois da entrada.",
    };
  }

  const bruto = (fim - ini) / 3_600_000;
  const horas = arredonda(Math.max(bruto - horasIntervalos(pontos), 0));
  const valor =
    escala.tipo_valor === "diaria" ? arredonda(combinado) : arredonda(horas * combinado);

  return { horas, valor, requerRevisao: false, motivoRevisao: null };
}

export function calcularFolhaClt({
  salarioBase,
  diasBase = 30,
  faltasNaoJustificadas,
  descontoAbonado = false,
}: {
  salarioBase: number;
  diasBase?: number;
  faltasNaoJustificadas: number;
  descontoAbonado?: boolean;
}): { descontoCalculado: number; valorFinal: number } {
  if (salarioBase <= 0 || diasBase <= 0 || faltasNaoJustificadas < 0) {
    throw new Error("Valores inválidos para calcular a folha CLT.");
  }
  const descontoCalculado = arredonda(
    (salarioBase / diasBase) * Math.min(faltasNaoJustificadas, diasBase),
  );
  const descontoAplicado = descontoAbonado ? 0 : descontoCalculado;
  return {
    descontoCalculado,
    valorFinal: arredonda(Math.max(salarioBase - descontoAplicado, 0)),
  };
}

export const moeda = (v: number | string) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v));

export const dataHora = (v: string | null) =>
  v
    ? new Date(v).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

export const dataCurta = (v: string | null) =>
  v ? new Date(v).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }) : "—";

export const hora = (v: string | null) =>
  v ? new Date(v).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—";

export type ContextoTipo = "platform" | "organization";

export interface ContextoResolvido {
  usuarioId: string;
  empresaId: string | null;
  papeis: PapelUsuario[];
  papeisPlataforma: PapelPlataforma[];
  hasOrganizationContext: boolean;
  hasPlatformContext: boolean;
  hasAnyContext: boolean;
  organizationContext: { empresaId: string } | null;
  platformContext: { papeis: PapelPlataforma[] } | null;
}

export function resolverContextoLegacy({
  usuarioId,
  empresaId,
  papeis = [],
  papeisPlataforma = [],
}: {
  usuarioId: string;
  empresaId: string | null;
  papeis?: PapelUsuario[];
  papeisPlataforma?: string[];
}): ContextoResolvido {
  const papeisPlataformaValidados = papeisPlataforma.filter(
    (papel): papel is PapelPlataforma => papel === "admin_master" || papel === "suporte",
  );

  const organizationContext = empresaId && !papeisPlataformaValidados.length ? { empresaId } : null;
  const platformContext = papeisPlataformaValidados.length
    ? { papeis: papeisPlataformaValidados }
    : null;

  return {
    usuarioId,
    empresaId: organizationContext?.empresaId ?? null,
    papeis: organizationContext ? papeis : [],
    papeisPlataforma: papeisPlataformaValidados,
    hasOrganizationContext: Boolean(organizationContext),
    hasPlatformContext: Boolean(platformContext),
    hasAnyContext: Boolean(organizationContext || platformContext),
    organizationContext,
    platformContext,
  };
}

/** Permissões de UI. A autorização real vive nas políticas do banco. */
export type Capacidade =
  | "cadastros.gerenciar"
  | "configuracoes.gerenciar"
  | "eventos.gerenciar"
  | "operacao.supervisionar"
  | "fechamento.aprovar"
  | "financeiro.gerenciar"
  | "relatorios.ver";

const MATRIZ: Record<PapelUsuario, Capacidade[]> = {
  admin: [
    "cadastros.gerenciar",
    "configuracoes.gerenciar",
    "eventos.gerenciar",
    "operacao.supervisionar",
    "fechamento.aprovar",
    "financeiro.gerenciar",
    "relatorios.ver",
  ],
  coordenador: [
    "cadastros.gerenciar",
    "eventos.gerenciar",
    "operacao.supervisionar",
    "fechamento.aprovar",
  ],
  financeiro: ["financeiro.gerenciar", "relatorios.ver"],
  supervisor: ["operacao.supervisionar"],
};

export function podeCom(papeis: PapelUsuario[], capacidade: Capacidade): boolean {
  return papeis.some((p) => MATRIZ[p]?.includes(capacidade));
}

export const ROTULO_STATUS_ESCALA: Record<StatusEscala, string> = {
  convidado: "Convidado",
  confirmado: "Confirmado",
  recusado: "Recusado",
  substituido: "Substituído",
};

export const ROTULO_STATUS_PONTO: Record<StatusPonto, string> = {
  pendente: "Pendente",
  aprovado: "Aprovado",
  recusado: "Recusado",
};

export const ROTULO_STATUS_FECHAMENTO: Record<StatusFechamento, string> = {
  pendente_aprovacao: "Pendente de aprovação",
  aprovado: "Aprovado",
  contestado: "Contestado",
};

export const ROTULO_STATUS_PAGAMENTO: Record<StatusPagamento, string> = {
  pendente: "Pendente",
  agendado: "Agendado",
  executado: "Pago",
  falhou: "Falhou",
};

export const ROTULO_TIPO_VALOR: Record<TipoValor, string> = {
  diaria: "Diária",
  hora: "Por hora",
};

export type Tom = "neutro" | "pendente" | "ok" | "ativo" | "erro" | "pago";

export const TOM_POR_STATUS: Record<string, Tom> = {
  planejamento: "neutro",
  escala: "neutro",
  confirmacoes: "pendente",
  pronto: "ok",
  em_execucao: "ativo",
  encerrando: "ativo",
  fechamento: "pendente",
  pagamento: "pendente",
  concluido: "pago",
  arquivado: "neutro",
  cancelado: "erro",
  convidado: "pendente",
  confirmado: "ok",
  recusado: "erro",
  substituido: "neutro",
  pendente: "pendente",
  aprovado: "ok",
  pendente_aprovacao: "pendente",
  contestado: "erro",
  agendado: "ativo",
  executado: "pago",
  falhou: "erro",
  rascunho: "neutro",
  aguardando_pagamento: "pendente",
  pago: "pago",
  vencido: "erro",
  cobrada: "pago",
  isenta: "neutro",
};

/** Modelos de cobrança da plataforma sobre a agência. */
export type ModeloCobranca = Enums["modelo_cobranca"];

export const ROTULO_MODELO_COBRANCA: Record<ModeloCobranca, string> = {
  percentual_evento: "Percentual sobre o evento",
  taxa_fixa_pix: "Taxa fixa por Pix",
  assinatura_percentual: "Mensalidade + percentual",
};

export const DESCRICAO_MODELO_COBRANCA: Record<ModeloCobranca, string> = {
  percentual_evento:
    "Cobramos uma única vez por evento, sobre o total dos fechamentos aprovados. Recomendado.",
  taxa_fixa_pix: "Um valor fixo é cobrado a cada Pix enviado a um freelancer.",
  assinatura_percentual: "Mensalidade fixa da agência somada a um percentual menor por evento.",
};

export const ROTULO_STATUS_COBRANCA: Record<string, string> = {
  rascunho: "Rascunho",
  aguardando_pagamento: "Aguardando pagamento",
  pago: "Pago",
  vencido: "Vencido",
  cancelado: "Cancelado",
};

export const ROTULO_STATUS: Record<string, string> = {
  ...ROTULO_STATUS_EVENTO,
  ...ROTULO_STATUS_ESCALA,
  ...ROTULO_STATUS_FECHAMENTO,
  ...ROTULO_STATUS_PAGAMENTO,
  ...ROTULO_STATUS_COBRANCA,
  pendente: "Pendente",
  aprovado: "Aprovado",
  recusado: "Recusado",
};

export const soDigitos = (v: string) => v.replace(/\D+/g, "");

/** PostgREST pode tipar relação aninhada como objeto ou lista; normaliza. */
export const lista = <T>(v: T | T[] | null | undefined): T[] =>
  Array.isArray(v) ? v : v ? [v] : [];

export const um = <T>(v: T | T[] | null | undefined): T | null => lista(v)[0] ?? null;

export const formatarCpf = (v: string) => {
  const d = soDigitos(v).slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2");
};
