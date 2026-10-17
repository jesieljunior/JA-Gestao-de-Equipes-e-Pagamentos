import { createHash } from "node:crypto";

import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/start-server-core";
import { z } from "zod";

const tokenSchema = z.object({ token: z.string().min(8).max(128) });

const identificarSchema = tokenSchema.extend({
  cpf: z.string().regex(/^\d{11}$/, "CPF deve ter 11 dígitos"),
});

const registrarSchema = identificarSchema.extend({
  escalaId: z.string().uuid(),
  tipo: z.enum(["entrada", "saida", "inicio_intervalo", "fim_intervalo"]),
  fotoBase64: z.string().max(4_000_000).nullable().optional(),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
  consentiuSelfie: z.boolean().optional(),
});

const SEQUENCIA = ["entrada", "inicio_intervalo", "fim_intervalo", "saida"] as const;

const hash = (valor: string) => createHash("sha256").update(valor).digest("hex");

function enderecoDaRequisicao() {
  return (
    getRequestHeader("cf-connecting-ip") ??
    getRequestHeader("x-forwarded-for")?.split(",")[0]?.trim() ??
    "indisponivel"
  );
}

async function limitarTentativas(token: string, cpf: string | null, acao: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const desde = new Date(Date.now() - 10 * 60_000).toISOString();
  const tokenHash = hash(token);
  const cpfHash = cpf ? hash(cpf) : null;
  const ipHash = hash(enderecoDaRequisicao());
  const { count } = await supabaseAdmin
    .from("tentativas_ponto_publico")
    .select("id", { count: "exact", head: true })
    .eq("token_hash", tokenHash)
    .eq("ip_hash", ipHash)
    .gte("criado_em", desde);
  if ((count ?? 0) >= 20) {
    throw new Error("Muitas tentativas. Aguarde 10 minutos e tente novamente.");
  }
  const registrar = async (sucesso: boolean) => {
    await supabaseAdmin.from("tentativas_ponto_publico").insert({
      token_hash: tokenHash,
      cpf_hash: cpfHash,
      ip_hash: ipHash,
      acao,
      sucesso,
    });
  };
  return { registrar };
}

function validarValidadeQr(evento: { data_fim: string | null; qr_code_expira_em: string | null }) {
  const expiraEm =
    evento.qr_code_expira_em ??
    (evento.data_fim
      ? new Date(new Date(evento.data_fim).getTime() + 12 * 60 * 60_000).toISOString()
      : null);
  if (expiraEm && Date.now() > new Date(expiraEm).getTime()) {
    throw new Error("Este QR Code expirou 12 horas após o encerramento do evento.");
  }
  return expiraEm;
}

/** Contexto público mínimo do evento a partir do token do QR Code. */
export const obterContextoPonto = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => tokenSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: evento } = await supabaseAdmin
      .from("eventos")
      .select("id, nome, local, status, empresa_id, data_inicio, data_fim, qr_code_expira_em")
      .eq("qr_code_token", data.token)
      .maybeSingle();

    if (!evento) throw new Error("QR Code inválido.");
    const expiraEm = validarValidadeQr(evento);

    const { data: config } = await supabaseAdmin
      .from("configuracoes")
      .select("checkin_exige_selfie, checkin_exige_gps, selfie_retencao_dias")
      .eq("empresa_id", evento.empresa_id)
      .maybeSingle();

    const { data: plano } = await supabaseAdmin.rpc("plano_da_empresa", {
      _empresa_id: evento.empresa_id,
    });
    return {
      pontoBasico: plano?.codigo === "free",
      evento: {
        nome: evento.nome,
        local: evento.local,
        status: evento.status,
        data_inicio: evento.data_inicio,
        data_fim: evento.data_fim,
        qr_code_expira_em: expiraEm,
      },
      exigeSelfie: config?.checkin_exige_selfie ?? false,
      exigeGps: config?.checkin_exige_gps ?? false,
    };
  });

async function localizarEscala(token: string, cpf: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: evento } = await supabaseAdmin
    .from("eventos")
    .select("id, empresa_id, status, data_fim, qr_code_expira_em")
    .eq("qr_code_token", token)
    .maybeSingle();
  if (!evento) throw new Error("QR Code inválido.");
  validarValidadeQr(evento);

  const { data: freelancer } = await supabaseAdmin
    .from("freelancers")
    .select("id, nome")
    .eq("empresa_id", evento.empresa_id)
    .eq("cpf", cpf)
    .maybeSingle();
  if (!freelancer) throw new Error("CPF não encontrado nesta agência.");

  const { data: equipes } = await supabaseAdmin
    .from("equipes")
    .select("id")
    .eq("evento_id", evento.id);
  const ids = (equipes ?? []).map((q) => q.id);
  if (ids.length === 0) throw new Error("Você não está escalado neste evento.");

  const { data: escala } = await supabaseAdmin
    .from("escalas")
    .select("id, status")
    .eq("freelancer_id", freelancer.id)
    .in("equipe_id", ids)
    .neq("status", "substituido")
    .maybeSingle();
  if (!escala) throw new Error("Você não está escalado neste evento.");
  if (escala.status === "recusado") throw new Error("Sua participação neste evento foi recusada.");

  return { supabaseAdmin, evento, freelancer, escala };
}

/** Identifica o freelancer pelo CPF e devolve os pontos que ele já registrou. */
export const identificarNoPonto = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => identificarSchema.parse(input))
  .handler(async ({ data }) => {
    const tentativa = await limitarTentativas(data.token, data.cpf, "identificacao");
    let localizado: Awaited<ReturnType<typeof localizarEscala>>;
    try {
      localizado = await localizarEscala(data.token, data.cpf);
      await tentativa.registrar(true);
    } catch (error) {
      await tentativa.registrar(false);
      throw error;
    }
    const { supabaseAdmin, escala, freelancer } = localizado;

    const { data: pontos } = await supabaseAdmin
      .from("pontos")
      .select("id, tipo, registrado_em, status, fora_horario")
      .eq("escala_id", escala.id)
      .order("registrado_em");

    return {
      escalaId: escala.id,
      statusEscala: escala.status,
      nome: freelancer.nome,
      pontos: pontos ?? [],
    };
  });

/** Confirma a presença na escala a partir do próprio celular do freelancer. */
export const confirmarPresenca = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => identificarSchema.parse(input))
  .handler(async ({ data }) => {
    const tentativa = await limitarTentativas(data.token, data.cpf, "confirmacao");
    const { supabaseAdmin, escala } = await localizarEscala(data.token, data.cpf);
    if (escala.status !== "convidado") {
      await tentativa.registrar(true);
      return { ok: true };
    }
    const { error } = await supabaseAdmin
      .from("escalas")
      .update({ status: "confirmado", confirmado_em: new Date().toISOString() })
      .eq("id", escala.id);
    if (error) throw new Error(error.message);
    await tentativa.registrar(true);
    return { ok: true };
  });

/** Registra entrada, intervalo ou saída. Fica pendente até o supervisor aprovar. */
export const registrarPonto = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => registrarSchema.parse(input))
  .handler(async ({ data }) => {
    const tentativa = await limitarTentativas(data.token, data.cpf, "registro");
    const { supabaseAdmin, evento, escala } = await localizarEscala(data.token, data.cpf);
    if (escala.id !== data.escalaId) throw new Error("Escala inválida.");

    const { data: config } = await supabaseAdmin
      .from("configuracoes")
      .select("checkin_exige_selfie, checkin_exige_gps, selfie_retencao_dias")
      .eq("empresa_id", evento.empresa_id)
      .maybeSingle();

    if (config?.checkin_exige_selfie && !data.fotoBase64)
      throw new Error("Esta agência exige selfie no registro de ponto.");
    if (config?.checkin_exige_selfie && !data.consentiuSelfie)
      throw new Error("Confirme o uso da selfie para revisão do registro.");
    if (config?.checkin_exige_gps && (data.lat == null || data.lng == null))
      throw new Error("Esta agência exige a localização no registro de ponto.");

    let fotoUrl: string | null = null;
    if (data.fotoBase64) {
      const base64 = data.fotoBase64.split(",").pop() ?? "";
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const caminho = `${evento.empresa_id}/${escala.id}/${crypto.randomUUID()}.jpg`;
      const { error: erroUpload } = await supabaseAdmin.storage
        .from("selfies-ponto")
        .upload(caminho, bytes, { contentType: "image/jpeg" });
      if (erroUpload) throw new Error(erroUpload.message);
      fotoUrl = caminho;
    }

    const { data: existentes } = await supabaseAdmin
      .from("pontos")
      .select("tipo")
      .eq("escala_id", escala.id)
      .neq("status", "recusado")
      .order("registrado_em");
    const { data: plano, error: erroPlano } = await supabaseAdmin.rpc("plano_da_empresa", {
      _empresa_id: evento.empresa_id,
    });
    if (erroPlano) throw new Error("Não foi possível verificar o plano.");
    const sequencia = plano?.codigo === "free" ? ["entrada", "saida"] : SEQUENCIA;
    const esperado = sequencia[(existentes ?? []).length];
    if (!esperado) throw new Error("Todos os registros desta escala já foram concluídos.");
    if (data.tipo !== esperado) {
      throw new Error(`O próximo registro deve ser ${esperado.replaceAll("_", " ")}.`);
    }

    const agora = new Date();
    const foraHorario = Boolean(evento.data_fim && agora > new Date(evento.data_fim));
    const retencaoDias = Math.min(
      config?.selfie_retencao_dias ?? 90,
      plano?.retencao_evidencias_dias ?? 365,
    );
    const selfieExpiraEm = data.fotoBase64
      ? new Date(agora.getTime() + retencaoDias * 24 * 60 * 60_000).toISOString()
      : null;
    const { data: ponto, error } = await supabaseAdmin
      .from("pontos")
      .insert({
        escala_id: escala.id,
        tipo: data.tipo,
        metodo: data.fotoBase64 ? "selfie" : "qrcode",
        registrado_em: agora.toISOString(),
        foto_url: fotoUrl,
        gps_lat: data.lat ?? null,
        gps_lng: data.lng ?? null,
        status: "pendente",
        fora_horario: foraHorario,
        selfie_consentimento_aceito_em: data.fotoBase64 ? agora.toISOString() : null,
        selfie_expira_em: selfieExpiraEm,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("auditoria_ponto_publico").insert({
      empresa_id: evento.empresa_id,
      escala_id: escala.id,
      ponto_id: ponto.id,
      acao: "ponto_registrado",
      resultado: "sucesso",
      detalhes: {
        tipo: data.tipo,
        fora_horario: foraHorario,
        com_selfie: Boolean(data.fotoBase64),
      },
    });
    await tentativa.registrar(true);

    return { ok: true, foraHorario };
  });
