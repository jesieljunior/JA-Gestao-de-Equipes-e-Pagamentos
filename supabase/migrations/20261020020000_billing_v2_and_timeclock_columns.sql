ALTER TABLE public.eventos
  ADD COLUMN IF NOT EXISTS qr_code_gerado_em timestamp with time zone NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS qr_code_expira_em timestamp with time zone;

UPDATE public.eventos
SET qr_code_expira_em = data_fim + interval '12 hours'
WHERE qr_code_expira_em IS NULL AND data_fim IS NOT NULL;

ALTER TABLE public.configuracoes
  ADD COLUMN IF NOT EXISTS selfie_retencao_dias integer NOT NULL DEFAULT 90;

ALTER TABLE public.pontos
  ADD COLUMN IF NOT EXISTS fora_horario boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS motivo_recusa text,
  ADD COLUMN IF NOT EXISTS selfie_consentimento_aceito_em timestamp with time zone,
  ADD COLUMN IF NOT EXISTS selfie_expira_em timestamp with time zone;

CREATE TABLE public.tentativas_ponto_publico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL,
  cpf_hash text,
  ip_hash text NOT NULL,
  acao text NOT NULL,
  sucesso boolean NOT NULL DEFAULT false,
  criado_em timestamp with time zone NOT NULL DEFAULT now()
);
GRANT ALL ON public.tentativas_ponto_publico TO service_role;
ALTER TABLE public.tentativas_ponto_publico ENABLE ROW LEVEL SECURITY;
CREATE INDEX tentativas_ponto_token_ip_idx ON public.tentativas_ponto_publico (token_hash, ip_hash, criado_em DESC);
CREATE INDEX tentativas_ponto_cpf_idx ON public.tentativas_ponto_publico (cpf_hash, criado_em DESC) WHERE cpf_hash IS NOT NULL;

CREATE TABLE public.auditoria_ponto_publico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  escala_id uuid REFERENCES public.escalas(id) ON DELETE SET NULL,
  ponto_id uuid REFERENCES public.pontos(id) ON DELETE SET NULL,
  acao text NOT NULL,
  resultado text NOT NULL,
  detalhes jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_em timestamp with time zone NOT NULL DEFAULT now()
);
GRANT SELECT ON public.auditoria_ponto_publico TO authenticated;
GRANT ALL ON public.auditoria_ponto_publico TO service_role;
ALTER TABLE public.auditoria_ponto_publico ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auditoria ponto leitura supervisao"
ON public.auditoria_ponto_publico FOR SELECT TO authenticated
USING (
  empresa_id = public.empresa_atual()
  AND public.tem_capacidade(auth.uid(), 'operacao.supervisionar')
);
CREATE INDEX auditoria_ponto_empresa_idx ON public.auditoria_ponto_publico (empresa_id, criado_em DESC);

CREATE OR REPLACE FUNCTION public.validar_ponto_decidido()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'recusado' AND nullif(trim(NEW.motivo_recusa), '') IS NULL THEN
    RAISE EXCEPTION 'Informe o motivo da recusa.';
  END IF;
  IF NEW.status = 'aprovado' THEN
    NEW.motivo_recusa := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tg_pontos_validar_decisao
BEFORE INSERT OR UPDATE OF status, motivo_recusa ON public.pontos
FOR EACH ROW EXECUTE FUNCTION public.validar_ponto_decidido();

CREATE OR REPLACE FUNCTION public.atualizar_expiracao_qr_evento()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.data_fim IS DISTINCT FROM OLD.data_fim AND NEW.data_fim IS NOT NULL THEN
    NEW.qr_code_expira_em := NEW.data_fim + interval '12 hours';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tg_eventos_expiracao_qr
BEFORE UPDATE OF data_fim ON public.eventos
FOR EACH ROW EXECUTE FUNCTION public.atualizar_expiracao_qr_evento();

DROP POLICY IF EXISTS "selfies_select_empresa" ON storage.objects;
CREATE POLICY "selfies_select_supervisao"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'selfies-ponto'
  AND (storage.foldername(name))[1] = public.empresa_atual()::text
  AND public.tem_capacidade(auth.uid(), 'operacao.supervisionar')
);CREATE OR REPLACE FUNCTION public.validar_sequencia_novo_ponto()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tipos tipo_ponto[];
  v_esperado tipo_ponto;
BEGIN
  IF NEW.status = 'recusado' THEN
    RETURN NEW;
  END IF;

  SELECT coalesce(array_agg(p.tipo ORDER BY p.registrado_em, p.criado_em), ARRAY[]::tipo_ponto[])
  INTO v_tipos
  FROM public.pontos p
  WHERE p.escala_id = NEW.escala_id
    AND p.status <> 'recusado';

  IF array_length(v_tipos, 1) IS NULL THEN
    v_esperado := 'entrada';
  ELSIF array_length(v_tipos, 1) = 1 AND v_tipos[1] = 'entrada' THEN
    v_esperado := 'inicio_intervalo';
  ELSIF array_length(v_tipos, 1) = 2 AND v_tipos[1] = 'entrada' AND v_tipos[2] = 'inicio_intervalo' THEN
    v_esperado := 'fim_intervalo';
  ELSIF array_length(v_tipos, 1) = 3 AND v_tipos[1] = 'entrada' AND v_tipos[2] = 'inicio_intervalo' AND v_tipos[3] = 'fim_intervalo' THEN
    v_esperado := 'saida';
  ELSE
    RAISE EXCEPTION 'A sequência de ponto desta escala precisa ser corrigida pelo supervisor.';
  END IF;

  IF NEW.tipo <> v_esperado THEN
    RAISE EXCEPTION 'Registro fora da sequência esperada. Próximo registro: %.', v_esperado;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER tg_pontos_validar_sequencia
BEFORE INSERT ON public.pontos
FOR EACH ROW EXECUTE FUNCTION public.validar_sequencia_novo_ponto();
-- Planos V2: tudo configurável
ALTER TABLE public.planos
  ADD COLUMN IF NOT EXISTS codigo text UNIQUE,
  ADD COLUMN IF NOT EXISTS participacoes_incluidas integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_excedente numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS limite_eventos_ciclo integer,
  ADD COLUMN IF NOT EXISTS limite_pessoas_evento integer,
  ADD COLUMN IF NOT EXISTS limite_clt integer,
  ADD COLUMN IF NOT EXISTS limite_supervisores integer,
  ADD COLUMN IF NOT EXISTS retencao_evidencias_dias integer,
  ADD COLUMN IF NOT EXISTS aviso_vendas_acima integer,
  ADD COLUMN IF NOT EXISTS recursos jsonb NOT NULL DEFAULT '{}'::jsonb;
COMMENT ON COLUMN public.planos.percentual IS 'DEPRECATED: cobrança percentual sobre evento descartada na V2';
COMMENT ON COLUMN public.planos.taxa_fixa_pix IS 'DEPRECATED: substituída pelo excedente de participações';
COMMENT ON COLUMN public.planos.modelo IS 'DEPRECATED: V2 usa mensalidade + excedente de participações';

ALTER TABLE public.assinaturas ADD COLUMN IF NOT EXISTS inicio_ciclo timestamptz NOT NULL DEFAULT now();
UPDATE public.assinaturas SET inicio_ciclo = criado_em;
COMMENT ON COLUMN public.assinaturas.percentual_override IS 'DEPRECATED: cobrança percentual descartada na V2';
COMMENT ON COLUMN public.assinaturas.taxa_fixa_override IS 'DEPRECATED: cobrança por Pix descartada na V2';
COMMENT ON TABLE public.taxas_plataforma IS 'DEPRECATED para novos lançamentos: histórico do modelo percentual/Asaas';

-- Participações operacionais deduplicadas (pessoa x evento)
CREATE TABLE public.participacoes_operacionais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  evento_id uuid NOT NULL REFERENCES public.eventos(id) ON DELETE CASCADE,
  freelancer_id uuid NOT NULL REFERENCES public.freelancers(id) ON DELETE CASCADE,
  data_evento timestamptz NOT NULL,
  ativa boolean NOT NULL DEFAULT true,
  primeira_confirmacao_em timestamptz NOT NULL DEFAULT now(),
  desativada_em timestamptz,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (evento_id, freelancer_id)
);
CREATE INDEX idx_participacoes_empresa_data ON public.participacoes_operacionais(empresa_id, data_evento) WHERE ativa;
GRANT SELECT ON public.participacoes_operacionais TO authenticated;
GRANT ALL ON public.participacoes_operacionais TO service_role;
ALTER TABLE public.participacoes_operacionais ENABLE ROW LEVEL SECURITY;
CREATE POLICY participacoes_leitura ON public.participacoes_operacionais FOR SELECT TO authenticated
  USING (empresa_id = public.empresa_atual() OR public.eh_equipe_plataforma());

-- Faturas SaaS
CREATE TABLE public.faturas_plataforma (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  assinatura_id uuid REFERENCES public.assinaturas(id),
  plano_id uuid REFERENCES public.planos(id),
  plano_nome text NOT NULL,
  ciclo_inicio timestamptz NOT NULL,
  ciclo_fim timestamptz NOT NULL,
  mensalidade numeric(12,2) NOT NULL,
  participacoes_incluidas integer NOT NULL,
  participacoes_usadas integer NOT NULL,
  participacoes_excedentes integer NOT NULL,
  valor_excedente_unit numeric(12,2) NOT NULL,
  valor_excedente_total numeric(12,2) NOT NULL,
  desconto numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL,
  clt_ativos integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','paga','atrasada','cancelada','falha')),
  vencimento date NOT NULL,
  pago_em timestamptz,
  provedor text,
  referencia_provedor text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, ciclo_inicio)
);
GRANT SELECT ON public.faturas_plataforma TO authenticated;
GRANT ALL ON public.faturas_plataforma TO service_role;
ALTER TABLE public.faturas_plataforma ENABLE ROW LEVEL SECURITY;
CREATE POLICY faturas_leitura ON public.faturas_plataforma FOR SELECT TO authenticated
  USING (empresa_id = public.empresa_atual() OR public.eh_equipe_plataforma());
CREATE TRIGGER tg_faturas_atualizado_em BEFORE UPDATE ON public.faturas_plataforma FOR EACH ROW EXECUTE FUNCTION public.tg_atualizado_em();

-- Histórico de assinatura (conversão Free -> pago) e de planos
CREATE TABLE public.assinaturas_historico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  plano_anterior_id uuid REFERENCES public.planos(id),
  plano_novo_id uuid REFERENCES public.planos(id),
  alterado_por uuid,
  criado_em timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.assinaturas_historico TO authenticated;
GRANT ALL ON public.assinaturas_historico TO service_role;
ALTER TABLE public.assinaturas_historico ENABLE ROW LEVEL SECURITY;
CREATE POLICY assinaturas_historico_leitura ON public.assinaturas_historico FOR SELECT TO authenticated
  USING (public.eh_equipe_plataforma());

CREATE TABLE public.planos_historico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plano_id uuid NOT NULL REFERENCES public.planos(id) ON DELETE CASCADE,
  alterado_por uuid,
  antes jsonb NOT NULL,
  depois jsonb NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.planos_historico TO authenticated;
GRANT ALL ON public.planos_historico TO service_role;
ALTER TABLE public.planos_historico ENABLE ROW LEVEL SECURITY;
CREATE POLICY planos_historico_leitura ON public.planos_historico FOR SELECT TO authenticated
  USING (public.eh_equipe_plataforma());

-- Taxas do meio de pagamento (custo repassável, nunca receita)
CREATE TABLE public.taxas_meio_pagamento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metodo text NOT NULL UNIQUE,
  rotulo text NOT NULL,
  taxa numeric(7,5) NOT NULL CHECK (taxa >= 0 AND taxa < 1),
  ativo boolean NOT NULL DEFAULT true,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.taxas_meio_pagamento TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.taxas_meio_pagamento TO authenticated;
GRANT ALL ON public.taxas_meio_pagamento TO service_role;
ALTER TABLE public.taxas_meio_pagamento ENABLE ROW LEVEL SECURITY;
CREATE POLICY taxas_meio_leitura ON public.taxas_meio_pagamento FOR SELECT TO authenticated USING (true);
CREATE POLICY taxas_meio_escrita ON public.taxas_meio_pagamento FOR ALL TO authenticated
  USING (public.tem_papel_plataforma(auth.uid(),'admin_master'))
  WITH CHECK (public.tem_papel_plataforma(auth.uid(),'admin_master'));
CREATE TRIGGER tg_taxas_meio_atualizado_em BEFORE UPDATE ON public.taxas_meio_pagamento FOR EACH ROW EXECUTE FUNCTION public.tg_atualizado_em();

CREATE TABLE public.custos_meio_pagamento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  fatura_id uuid REFERENCES public.faturas_plataforma(id),
  cobranca_id uuid REFERENCES public.cobrancas(id),
  metodo text NOT NULL,
  taxa_aplicada numeric(7,5) NOT NULL,
  valor_liquido numeric(12,2) NOT NULL,
  valor_cobrado numeric(12,2) NOT NULL,
  custo numeric(12,2) NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.custos_meio_pagamento TO authenticated;
GRANT ALL ON public.custos_meio_pagamento TO service_role;
ALTER TABLE public.custos_meio_pagamento ENABLE ROW LEVEL SECURITY;
CREATE POLICY custos_meio_leitura ON public.custos_meio_pagamento FOR SELECT TO authenticated
  USING (empresa_id = public.empresa_atual() OR public.eh_equipe_plataforma());

-- Ciclo ancorado na data da assinatura
CREATE OR REPLACE FUNCTION public.ciclo_da_empresa(_empresa_id uuid, _ref timestamptz DEFAULT now())
RETURNS TABLE(inicio timestamptz, fim timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_anchor timestamptz; v_n integer; v_age interval;
BEGIN
  SELECT coalesce(a.inicio_ciclo, e.criado_em) INTO v_anchor
  FROM public.empresas e LEFT JOIN public.assinaturas a ON a.empresa_id = e.id
  WHERE e.id = _empresa_id;
  IF v_anchor IS NULL THEN v_anchor := date_trunc('month', _ref); END IF;
  IF _ref < v_anchor THEN
    RETURN QUERY SELECT v_anchor, v_anchor + interval '1 month'; RETURN;
  END IF;
  v_age := age(_ref, v_anchor);
  v_n := (extract(year FROM v_age) * 12 + extract(month FROM v_age))::int;
  IF v_anchor + make_interval(months => v_n) > _ref THEN v_n := v_n - 1; END IF;
  RETURN QUERY SELECT v_anchor + make_interval(months => v_n), v_anchor + make_interval(months => v_n + 1);
END; $$;

CREATE OR REPLACE FUNCTION public.plano_da_empresa(_empresa_id uuid)
RETURNS public.planos
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(
    (SELECT p FROM public.assinaturas a JOIN public.planos p ON p.id = a.plano_id WHERE a.empresa_id = _empresa_id),
    (SELECT p FROM public.planos p WHERE p.codigo = 'free')
  );
$$;

CREATE OR REPLACE FUNCTION public.recurso_habilitado(_empresa_id uuid, _recurso text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(((public.plano_da_empresa(_empresa_id)).recursos ->> _recurso)::boolean, false);
$$;

CREATE OR REPLACE FUNCTION public.contar_participacoes_ciclo(_empresa_id uuid, _ref timestamptz DEFAULT now())
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::int FROM public.participacoes_operacionais p, public.ciclo_da_empresa(_empresa_id, _ref) c
  WHERE p.empresa_id = _empresa_id AND p.ativa AND p.data_evento >= c.inicio AND p.data_evento < c.fim;
$$;

CREATE OR REPLACE FUNCTION public.contar_clt_ativos(_empresa_id uuid)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::int FROM public.freelancers WHERE empresa_id = _empresa_id AND tipo_vinculo = 'clt' AND ativo;
$$;

CREATE OR REPLACE FUNCTION public.contar_eventos_ciclo(_empresa_id uuid, _ref timestamptz DEFAULT now())
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::int FROM public.eventos e, public.ciclo_da_empresa(_empresa_id, _ref) c
  WHERE e.empresa_id = _empresa_id AND e.status <> 'cancelado' AND e.data_inicio >= c.inicio AND e.data_inicio < c.fim;
$$;

-- Resumo de uso para cliente/admin
CREATE OR REPLACE FUNCTION public.resumo_uso_empresa(_empresa_id uuid)
RETURNS TABLE(
  plano_id uuid, plano_codigo text, plano_nome text, ciclo_inicio timestamptz, ciclo_fim timestamptz,
  mensalidade numeric, participacoes_incluidas integer, participacoes_usadas integer,
  participacoes_excedentes integer, valor_excedente numeric, estimativa numeric,
  eventos_usados integer, limite_eventos integer, limite_pessoas_evento integer,
  clt_ativos integer, limite_clt integer, limite_supervisores integer, aviso_vendas boolean, recursos jsonb
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.planos; c record; v_usadas int; v_exc int;
BEGIN
  IF auth.uid() IS NOT NULL AND _empresa_id IS DISTINCT FROM public.empresa_atual()
     AND NOT public.eh_equipe_plataforma() THEN
    RAISE EXCEPTION 'sem acesso a esta organização';
  END IF;
  p := public.plano_da_empresa(_empresa_id);
  SELECT * INTO c FROM public.ciclo_da_empresa(_empresa_id);
  v_usadas := public.contar_participacoes_ciclo(_empresa_id);
  v_exc := greatest(v_usadas - coalesce(p.participacoes_incluidas, 0), 0);
  RETURN QUERY SELECT p.id, p.codigo, p.nome, c.inicio, c.fim, p.mensalidade,
    p.participacoes_incluidas, v_usadas, v_exc, p.valor_excedente,
    round(p.mensalidade + v_exc * p.valor_excedente, 2),
    public.contar_eventos_ciclo(_empresa_id), p.limite_eventos_ciclo, p.limite_pessoas_evento,
    public.contar_clt_ativos(_empresa_id), p.limite_clt, p.limite_supervisores,
    (p.aviso_vendas_acima IS NOT NULL AND v_usadas > p.aviso_vendas_acima), p.recursos;
END; $$;

-- Sincronizador: participação ativa se houver escala final confirmada
CREATE OR REPLACE FUNCTION public.sincronizar_participacao(_evento_id uuid, _freelancer_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ev record; v_ativa boolean;
BEGIN
  SELECT id, empresa_id, data_inicio, status INTO v_ev FROM public.eventos WHERE id = _evento_id;
  IF v_ev.id IS NULL THEN RETURN; END IF;
  v_ativa := v_ev.status <> 'cancelado' AND EXISTS (
    SELECT 1 FROM public.escalas s JOIN public.equipes q ON q.id = s.equipe_id
    WHERE q.evento_id = _evento_id AND s.freelancer_id = _freelancer_id AND s.status = 'confirmado'
  );
  IF v_ativa THEN
    INSERT INTO public.participacoes_operacionais (empresa_id, evento_id, freelancer_id, data_evento, ativa)
    VALUES (v_ev.empresa_id, _evento_id, _freelancer_id, v_ev.data_inicio, true)
    ON CONFLICT (evento_id, freelancer_id) DO UPDATE
      SET ativa = true, desativada_em = NULL, data_evento = excluded.data_evento, atualizado_em = now();
  ELSE
    UPDATE public.participacoes_operacionais SET ativa = false, desativada_em = now(), atualizado_em = now()
    WHERE evento_id = _evento_id AND freelancer_id = _freelancer_id AND ativa;
  END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.tg_escalas_sincronizar_participacao()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_evento uuid;
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN
    SELECT evento_id INTO v_evento FROM public.equipes WHERE id = OLD.equipe_id;
    PERFORM public.sincronizar_participacao(v_evento, OLD.freelancer_id);
  END IF;
  IF TG_OP IN ('INSERT','UPDATE') THEN
    SELECT evento_id INTO v_evento FROM public.equipes WHERE id = NEW.equipe_id;
    PERFORM public.sincronizar_participacao(v_evento, NEW.freelancer_id);
  END IF;
  RETURN NULL;
END; $$;
CREATE TRIGGER tg_escalas_participacao AFTER INSERT OR UPDATE OR DELETE ON public.escalas
  FOR EACH ROW EXECUTE FUNCTION public.tg_escalas_sincronizar_participacao();

CREATE OR REPLACE FUNCTION public.tg_eventos_sincronizar_participacoes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  IF NEW.data_inicio IS DISTINCT FROM OLD.data_inicio OR NEW.status IS DISTINCT FROM OLD.status THEN
    FOR r IN SELECT DISTINCT s.freelancer_id FROM public.escalas s JOIN public.equipes q ON q.id = s.equipe_id
             WHERE q.evento_id = NEW.id
             UNION SELECT freelancer_id FROM public.participacoes_operacionais WHERE evento_id = NEW.id LOOP
      PERFORM public.sincronizar_participacao(NEW.id, r.freelancer_id);
    END LOOP;
  END IF;
  RETURN NULL;
END; $$;
CREATE TRIGGER tg_eventos_participacoes AFTER UPDATE ON public.eventos
  FOR EACH ROW EXECUTE FUNCTION public.tg_eventos_sincronizar_participacoes();

-- Limites do plano
CREATE OR REPLACE FUNCTION public.tg_eventos_limite_plano()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.planos; v_qtd int;
BEGIN
  p := public.plano_da_empresa(NEW.empresa_id);
  IF p.limite_eventos_ciclo IS NULL THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('eventos:' || NEW.empresa_id::text));
  v_qtd := public.contar_eventos_ciclo(NEW.empresa_id, NEW.data_inicio);
  IF v_qtd >= p.limite_eventos_ciclo THEN
    RAISE EXCEPTION 'LIMITE_PLANO: seu plano % permite % eventos por ciclo. Faça upgrade para criar mais eventos.', p.nome, p.limite_eventos_ciclo;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER tg_eventos_limite BEFORE INSERT ON public.eventos
  FOR EACH ROW EXECUTE FUNCTION public.tg_eventos_limite_plano();

CREATE OR REPLACE FUNCTION public.tg_escalas_limite_plano()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.planos; v_evento uuid; v_empresa uuid; v_qtd int;
BEGIN
  IF NEW.status NOT IN ('convidado','confirmado') THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status IN ('convidado','confirmado') AND OLD.freelancer_id = NEW.freelancer_id
     AND OLD.equipe_id = NEW.equipe_id THEN RETURN NEW; END IF;
  SELECT q.evento_id, e.empresa_id INTO v_evento, v_empresa
  FROM public.equipes q JOIN public.eventos e ON e.id = q.evento_id WHERE q.id = NEW.equipe_id;
  p := public.plano_da_empresa(v_empresa);
  IF p.limite_pessoas_evento IS NULL THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('escalas:' || v_evento::text));
  IF EXISTS (SELECT 1 FROM public.escalas s JOIN public.equipes q ON q.id = s.equipe_id
             WHERE q.evento_id = v_evento AND s.freelancer_id = NEW.freelancer_id
               AND s.status IN ('convidado','confirmado') AND s.id <> NEW.id) THEN
    RETURN NEW;
  END IF;
  SELECT count(DISTINCT s.freelancer_id) INTO v_qtd FROM public.escalas s JOIN public.equipes q ON q.id = s.equipe_id
  WHERE q.evento_id = v_evento AND s.status IN ('convidado','confirmado') AND s.id <> NEW.id;
  IF v_qtd >= p.limite_pessoas_evento THEN
    RAISE EXCEPTION 'LIMITE_PLANO: seu plano % permite até % pessoas por evento. Faça upgrade para escalar mais pessoas.', p.nome, p.limite_pessoas_evento;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER tg_escalas_limite BEFORE INSERT OR UPDATE ON public.escalas
  FOR EACH ROW EXECUTE FUNCTION public.tg_escalas_limite_plano();

CREATE OR REPLACE FUNCTION public.tg_freelancers_limite_clt()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.planos; v_qtd int;
BEGIN
  IF NEW.tipo_vinculo <> 'clt' OR NOT NEW.ativo THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.tipo_vinculo = 'clt' AND OLD.ativo THEN RETURN NEW; END IF;
  p := public.plano_da_empresa(NEW.empresa_id);
  IF p.limite_clt IS NULL THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('clt:' || NEW.empresa_id::text));
  SELECT count(*) INTO v_qtd FROM public.freelancers
  WHERE empresa_id = NEW.empresa_id AND tipo_vinculo = 'clt' AND ativo AND id <> NEW.id;
  IF v_qtd >= p.limite_clt THEN
    RAISE EXCEPTION 'LIMITE_PLANO: seu plano % comporta % colaboradores CLT ativos. Fale com a PayCrew para uma contratação personalizada.', p.nome, p.limite_clt;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER tg_freelancers_limite_clt BEFORE INSERT OR UPDATE ON public.freelancers
  FOR EACH ROW EXECUTE FUNCTION public.tg_freelancers_limite_clt();

CREATE OR REPLACE FUNCTION public.tg_user_roles_limite_supervisores()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_empresa uuid; p public.planos; v_qtd int;
BEGIN
  IF NEW.role <> 'supervisor' THEN RETURN NEW; END IF;
  SELECT empresa_id INTO v_empresa FROM public.usuarios WHERE id = NEW.user_id;
  IF v_empresa IS NULL THEN RETURN NEW; END IF;
  p := public.plano_da_empresa(v_empresa);
  IF p.limite_supervisores IS NULL THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('supervisores:' || v_empresa::text));
  SELECT count(*) INTO v_qtd FROM public.user_roles r JOIN public.usuarios u ON u.id = r.user_id
  WHERE u.empresa_id = v_empresa AND r.role = 'supervisor' AND r.user_id <> NEW.user_id;
  IF v_qtd >= p.limite_supervisores THEN
    RAISE EXCEPTION 'LIMITE_PLANO: seu plano % permite % supervisor(es). Faça upgrade para adicionar mais.', p.nome, p.limite_supervisores;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER tg_user_roles_limite_supervisores BEFORE INSERT ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.tg_user_roles_limite_supervisores();

-- Recursos financeiros bloqueados no banco conforme plano
CREATE OR REPLACE FUNCTION public.tg_fechamentos_recurso()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.recurso_habilitado(public.empresa_da_escala(NEW.escala_id), 'fechamento') THEN
    RAISE EXCEPTION 'RECURSO_PLANO: fechamento financeiro não está disponível no seu plano. Faça upgrade para liberar.';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER tg_fechamentos_recurso BEFORE INSERT ON public.fechamentos
  FOR EACH ROW EXECUTE FUNCTION public.tg_fechamentos_recurso();

CREATE OR REPLACE FUNCTION public.tg_pagamentos_recurso()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_empresa uuid;
BEGIN
  v_empresa := public.empresa_do_fechamento(NEW.fechamento_id);
  IF TG_OP = 'INSERT' AND NOT public.recurso_habilitado(v_empresa, 'financeiro') THEN
    RAISE EXCEPTION 'RECURSO_PLANO: pagamentos não estão disponíveis no seu plano. Faça upgrade para liberar.';
  END IF;
  IF NEW.status = 'agendado' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'agendado')
     AND NOT public.recurso_habilitado(v_empresa, 'agendamento_pix') THEN
    RAISE EXCEPTION 'RECURSO_PLANO: agendamento de Pix não está disponível no seu plano. Faça upgrade para liberar.';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER tg_pagamentos_recurso BEFORE INSERT OR UPDATE ON public.pagamentos
  FOR EACH ROW EXECUTE FUNCTION public.tg_pagamentos_recurso();

-- Histórico de mudanças de plano
CREATE OR REPLACE FUNCTION public.tg_assinaturas_historico()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.plano_id IS DISTINCT FROM OLD.plano_id THEN
    INSERT INTO public.assinaturas_historico (empresa_id, plano_anterior_id, plano_novo_id, alterado_por)
    VALUES (NEW.empresa_id, CASE WHEN TG_OP = 'UPDATE' THEN OLD.plano_id END, NEW.plano_id, auth.uid());
  END IF;
  RETURN NULL;
END; $$;
CREATE TRIGGER tg_assinaturas_historico AFTER INSERT OR UPDATE ON public.assinaturas
  FOR EACH ROW EXECUTE FUNCTION public.tg_assinaturas_historico();

CREATE OR REPLACE FUNCTION public.tg_planos_historico()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.planos_historico (plano_id, alterado_por, antes, depois)
  VALUES (NEW.id, auth.uid(), to_jsonb(OLD), to_jsonb(NEW));
  RETURN NULL;
END; $$;
CREATE TRIGGER tg_planos_historico AFTER UPDATE ON public.planos
  FOR EACH ROW EXECUTE FUNCTION public.tg_planos_historico();

-- Fechamento idempotente da fatura de um ciclo
CREATE OR REPLACE FUNCTION public.fechar_fatura_ciclo(_empresa_id uuid, _ref timestamptz)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.planos; a public.assinaturas; cp public.cupons; c record;
  v_usadas int; v_exc int; v_bruto numeric; v_desc numeric := 0; v_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('fatura:' || _empresa_id::text));
  SELECT * INTO c FROM public.ciclo_da_empresa(_empresa_id, _ref);
  SELECT id INTO v_id FROM public.faturas_plataforma WHERE empresa_id = _empresa_id AND ciclo_inicio = c.inicio;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  SELECT * INTO a FROM public.assinaturas WHERE empresa_id = _empresa_id;
  p := public.plano_da_empresa(_empresa_id);
  v_usadas := public.contar_participacoes_ciclo(_empresa_id, c.inicio);
  v_exc := greatest(v_usadas - p.participacoes_incluidas, 0);
  v_bruto := round(coalesce(a.mensalidade_override, p.mensalidade) + v_exc * p.valor_excedente, 2);
  IF a.cupom_id IS NOT NULL THEN
    SELECT * INTO cp FROM public.cupons WHERE id = a.cupom_id AND ativo AND (validade IS NULL OR validade >= c.inicio::date);
    IF cp.id IS NOT NULL THEN
      v_desc := CASE cp.tipo WHEN 'percentual' THEN round(v_bruto * cp.valor / 100, 2)
                             WHEN 'isencao' THEN v_bruto ELSE least(cp.valor, v_bruto) END;
    END IF;
  END IF;
  IF a.trial_ate IS NOT NULL AND a.trial_ate >= c.fim THEN v_desc := v_bruto; END IF;
  INSERT INTO public.faturas_plataforma (empresa_id, assinatura_id, plano_id, plano_nome, ciclo_inicio, ciclo_fim,
    mensalidade, participacoes_incluidas, participacoes_usadas, participacoes_excedentes, valor_excedente_unit,
    valor_excedente_total, desconto, total, clt_ativos, status, vencimento)
  VALUES (_empresa_id, a.id, p.id, p.nome, c.inicio, c.fim, coalesce(a.mensalidade_override, p.mensalidade),
    p.participacoes_incluidas, v_usadas, v_exc, p.valor_excedente, round(v_exc * p.valor_excedente, 2),
    v_desc, greatest(v_bruto - v_desc, 0), public.contar_clt_ativos(_empresa_id),
    CASE WHEN v_bruto - v_desc <= 0 THEN 'paga' ELSE 'pendente' END, (c.fim + interval '5 days')::date)
  ON CONFLICT (empresa_id, ciclo_inicio) DO NOTHING
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;
REVOKE EXECUTE ON FUNCTION public.fechar_fatura_ciclo(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fechar_fatura_ciclo(uuid, timestamptz) TO service_role;
REVOKE EXECUTE ON FUNCTION public.sincronizar_participacao(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Backfill das participações existentes
INSERT INTO public.participacoes_operacionais (empresa_id, evento_id, freelancer_id, data_evento, ativa)
SELECT DISTINCT e.empresa_id, e.id, s.freelancer_id, e.data_inicio, true
FROM public.escalas s JOIN public.equipes q ON q.id = s.equipe_id JOIN public.eventos e ON e.id = q.evento_id
WHERE s.status = 'confirmado' AND e.status <> 'cancelado'
ON CONFLICT (evento_id, freelancer_id) DO NOTHING;
CREATE OR REPLACE FUNCTION public.validar_acesso_cobranca(_empresa_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.role() = 'service_role' OR current_setting('role', true) IN ('postgres','service_role') THEN RETURN; END IF;
 IF auth.uid() IS NULL OR (_empresa_id IS DISTINCT FROM public.empresa_atual() AND NOT public.tem_papel_plataforma(auth.uid(),'admin_master')) THEN RAISE EXCEPTION 'Acesso negado à cobrança da organização'; END IF;
END; $$;
REVOKE ALL ON FUNCTION public.validar_acesso_cobranca(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.validar_acesso_cobranca(uuid) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.plano_da_empresa(_empresa_id uuid)
RETURNS public.planos LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.planos;
BEGIN
 PERFORM public.validar_acesso_cobranca(_empresa_id);
 SELECT pl.* INTO p FROM public.assinaturas a JOIN public.planos pl ON pl.id=a.plano_id WHERE a.empresa_id=_empresa_id;
 IF p.id IS NULL THEN SELECT * INTO p FROM public.planos WHERE codigo='free'; END IF;
 RETURN p;
END; $$;
CREATE OR REPLACE FUNCTION public.recurso_habilitado(_empresa_id uuid,_recurso text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.planos;
BEGIN
 PERFORM public.validar_acesso_cobranca(_empresa_id);
 IF NOT EXISTS (SELECT 1 FROM public.empresas WHERE id=_empresa_id AND ativa) THEN RETURN false; END IF;
 IF EXISTS (SELECT 1 FROM public.assinaturas WHERE empresa_id=_empresa_id AND status NOT IN ('ativa','trial','em_trial')) THEN RETURN false; END IF;
 p := public.plano_da_empresa(_empresa_id);
 RETURN coalesce(p.recursos->>_recurso,'false')='true';
END; $$;
REVOKE EXECUTE ON FUNCTION public.ciclo_da_empresa(uuid,timestamptz),public.contar_participacoes_ciclo(uuid,timestamptz),public.contar_eventos_ciclo(uuid,timestamptz),public.contar_clt_ativos(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ciclo_da_empresa(uuid,timestamptz),public.contar_participacoes_ciclo(uuid,timestamptz),public.contar_eventos_ciclo(uuid,timestamptz),public.contar_clt_ativos(uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.plano_da_empresa(uuid),public.recurso_habilitado(uuid,text),public.resumo_uso_empresa(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.plano_da_empresa(uuid),public.recurso_habilitado(uuid,text),public.resumo_uso_empresa(uuid) TO authenticated,service_role;
ALTER POLICY participacoes_leitura ON public.participacoes_operacionais USING(empresa_id=public.empresa_atual() OR public.tem_papel_plataforma(auth.uid(),'admin_master'));
ALTER POLICY faturas_leitura ON public.faturas_plataforma USING(empresa_id=public.empresa_atual() OR public.tem_papel_plataforma(auth.uid(),'admin_master'));
ALTER POLICY custos_meio_leitura ON public.custos_meio_pagamento USING(empresa_id=public.empresa_atual() OR public.tem_papel_plataforma(auth.uid(),'admin_master'));
ALTER POLICY assinaturas_historico_leitura ON public.assinaturas_historico USING(public.tem_papel_plataforma(auth.uid(),'admin_master'));
ALTER POLICY planos_historico_leitura ON public.planos_historico USING(public.tem_papel_plataforma(auth.uid(),'admin_master'));
CREATE TABLE public.ciclos_cobranca (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL REFERENCES public.empresas(id), assinatura_id uuid REFERENCES public.assinaturas(id), plano_id uuid REFERENCES public.planos(id), plano_nome text NOT NULL, inicio timestamptz NOT NULL, fim timestamptz NOT NULL, mensalidade numeric NOT NULL, participacoes_incluidas integer NOT NULL, valor_excedente numeric NOT NULL, desconto_tipo text, desconto_valor numeric NOT NULL DEFAULT 0, trial_ate timestamptz, criado_em timestamptz NOT NULL DEFAULT now(), UNIQUE(empresa_id,inicio)
);
GRANT SELECT ON public.ciclos_cobranca TO authenticated;
GRANT ALL ON public.ciclos_cobranca TO service_role;
ALTER TABLE public.ciclos_cobranca ENABLE ROW LEVEL SECURITY;
CREATE POLICY ciclos_leitura ON public.ciclos_cobranca FOR SELECT TO authenticated USING(empresa_id=public.empresa_atual() OR public.tem_papel_plataforma(auth.uid(),'admin_master'));
CREATE OR REPLACE FUNCTION public.abrir_ciclo_cobranca(_empresa_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c record; p public.planos; a public.assinaturas; cp public.cupons; v_id uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('fatura:'||_empresa_id::text));
 SELECT * INTO c FROM public.ciclo_da_empresa(_empresa_id,now());
 SELECT id INTO v_id FROM public.ciclos_cobranca WHERE empresa_id=_empresa_id AND inicio=c.inicio;
 IF v_id IS NOT NULL THEN RETURN v_id; END IF;
 p:=public.plano_da_empresa(_empresa_id);
 SELECT * INTO a FROM public.assinaturas WHERE empresa_id=_empresa_id;
 SELECT * INTO cp FROM public.cupons WHERE id=a.cupom_id AND ativo AND (validade IS NULL OR validade>=c.inicio::date) AND (empresa_id IS NULL OR empresa_id=_empresa_id) AND (limite_usos IS NULL OR usos<limite_usos);
 INSERT INTO public.ciclos_cobranca(empresa_id,assinatura_id,plano_id,plano_nome,inicio,fim,mensalidade,participacoes_incluidas,valor_excedente,desconto_tipo,desconto_valor,trial_ate)
 VALUES(_empresa_id,a.id,p.id,p.nome,c.inicio,c.fim,coalesce(a.mensalidade_override,p.mensalidade),p.participacoes_incluidas,p.valor_excedente,cp.tipo,coalesce(cp.valor,0),a.trial_ate) RETURNING id INTO v_id;
 IF cp.id IS NOT NULL THEN UPDATE public.cupons SET usos=usos+1 WHERE id=cp.id; END IF;
 RETURN v_id;
END; $$;
REVOKE ALL ON FUNCTION public.abrir_ciclo_cobranca(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.abrir_ciclo_cobranca(uuid) TO service_role;
INSERT INTO public.ciclos_cobranca(empresa_id,assinatura_id,plano_id,plano_nome,inicio,fim,mensalidade,participacoes_incluidas,valor_excedente,trial_ate)
SELECT a.empresa_id,a.id,p.id,p.nome,c.inicio,c.fim,coalesce(a.mensalidade_override,p.mensalidade),p.participacoes_incluidas,p.valor_excedente,a.trial_ate FROM public.assinaturas a JOIN public.planos p ON p.id=a.plano_id CROSS JOIN LATERAL public.ciclo_da_empresa(a.empresa_id,now()) c;
CREATE OR REPLACE FUNCTION public.fechar_fatura_ciclo(_empresa_id uuid,_ref timestamptz)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.ciclos_cobranca; v_id uuid; v_usadas int; v_exc int; v_bruto numeric; v_desc numeric:=0;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('fatura:'||_empresa_id::text));
 SELECT * INTO c FROM public.ciclos_cobranca WHERE empresa_id=_empresa_id AND inicio<=_ref AND fim>_ref;
 IF c.id IS NULL THEN RAISE EXCEPTION 'Ciclo sem preço registrado: revisão administrativa necessária'; END IF;
 IF c.fim>now() THEN RAISE EXCEPTION 'Aguarde o encerramento do ciclo para faturar'; END IF;
 SELECT id INTO v_id FROM public.faturas_plataforma WHERE empresa_id=_empresa_id AND ciclo_inicio=c.inicio;
 IF v_id IS NOT NULL THEN RETURN v_id; END IF;
 SELECT count(*) INTO v_usadas FROM public.participacoes_operacionais WHERE empresa_id=_empresa_id AND ativa AND data_evento>=c.inicio AND data_evento<c.fim;
 v_exc:=greatest(v_usadas-c.participacoes_incluidas,0); v_bruto:=round(c.mensalidade+v_exc*c.valor_excedente,2);
 v_desc:=CASE c.desconto_tipo WHEN 'percentual' THEN round(v_bruto*c.desconto_valor/100,2) WHEN 'isencao' THEN v_bruto WHEN 'valor' THEN least(c.desconto_valor,v_bruto) ELSE 0 END;
 IF c.trial_ate>=c.fim THEN v_desc:=v_bruto; END IF;
 INSERT INTO public.faturas_plataforma(empresa_id,assinatura_id,plano_id,plano_nome,ciclo_inicio,ciclo_fim,mensalidade,participacoes_incluidas,participacoes_usadas,participacoes_excedentes,valor_excedente_unit,valor_excedente_total,desconto,total,clt_ativos,status,vencimento,pago_em)
 VALUES(_empresa_id,c.assinatura_id,c.plano_id,c.plano_nome,c.inicio,c.fim,c.mensalidade,c.participacoes_incluidas,v_usadas,v_exc,c.valor_excedente,round(v_exc*c.valor_excedente,2),least(v_desc,v_bruto),greatest(v_bruto-v_desc,0),public.contar_clt_ativos(_empresa_id),CASE WHEN v_bruto-v_desc<=0 THEN 'paga' ELSE 'pendente' END,(c.fim+interval '5 days')::date,CASE WHEN v_bruto-v_desc<=0 THEN now() END) RETURNING id INTO v_id;
 RETURN v_id;
END; $$;
CREATE OR REPLACE FUNCTION public.tg_fechamentos_recurso()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF NOT public.recurso_habilitado(public.empresa_da_escala(NEW.escala_id),'fechamento') THEN RAISE EXCEPTION 'RECURSO_PLANO: faça upgrade para liberar fechamento financeiro'; END IF; RETURN NEW; END; $$;
CREATE TRIGGER tg_fechamentos_recurso_update BEFORE UPDATE ON public.fechamentos FOR EACH ROW EXECUTE FUNCTION public.tg_fechamentos_recurso();
CREATE OR REPLACE FUNCTION public.tg_pagamentos_recurso()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE v_empresa uuid; BEGIN
 v_empresa:=public.empresa_do_fechamento(NEW.fechamento_id);
 IF NOT public.recurso_habilitado(v_empresa,'financeiro') THEN RAISE EXCEPTION 'RECURSO_PLANO: faça upgrade para liberar pagamentos'; END IF;
 IF NEW.status='agendado' AND NOT public.recurso_habilitado(v_empresa,'agendamento_pix') THEN RAISE EXCEPTION 'RECURSO_PLANO: agendamento de Pix indisponível'; END IF; RETURN NEW; END; $$;
CREATE OR REPLACE FUNCTION public.tg_eventos_limite_plano()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE p public.planos; c record; v_qtd int; BEGIN
 IF NEW.status='cancelado' THEN RETURN NEW; END IF;
 p:=public.plano_da_empresa(NEW.empresa_id); IF p.limite_eventos_ciclo IS NULL THEN RETURN NEW; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('eventos:'||NEW.empresa_id::text));
 SELECT * INTO c FROM public.ciclo_da_empresa(NEW.empresa_id,NEW.data_inicio);
 SELECT count(*) INTO v_qtd FROM public.eventos WHERE empresa_id=NEW.empresa_id AND status<>'cancelado' AND data_inicio>=c.inicio AND data_inicio<c.fim AND id<>NEW.id;
 IF v_qtd>=p.limite_eventos_ciclo THEN RAISE EXCEPTION 'LIMITE_PLANO: limite de eventos por ciclo atingido; faça upgrade'; END IF; RETURN NEW; END; $$;
CREATE TRIGGER tg_eventos_limite_update BEFORE UPDATE OF data_inicio,status ON public.eventos FOR EACH ROW EXECUTE FUNCTION public.tg_eventos_limite_plano();
CREATE OR REPLACE FUNCTION public.tg_planos_validar_v2()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN
 IF NEW.mensalidade<0 OR NEW.valor_excedente<0 OR NEW.participacoes_incluidas<0 OR NEW.limite_clt<0 OR NEW.limite_eventos_ciclo<0 OR NEW.limite_pessoas_evento<0 OR NEW.limite_supervisores<0 OR NEW.retencao_evidencias_dias<1 THEN RAISE EXCEPTION 'Valores e limites de plano inválidos'; END IF;
 NEW.percentual:=0; NEW.taxa_fixa_pix:=0; RETURN NEW; END; $$;
CREATE TRIGGER tg_planos_validar_v2 BEFORE INSERT OR UPDATE ON public.planos FOR EACH ROW EXECUTE FUNCTION public.tg_planos_validar_v2();
DO $$ DECLARE f record; BEGIN FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('tg_escalas_limite_plano','tg_eventos_limite_plano','tg_freelancers_limite_clt','tg_user_roles_limite_supervisores','tg_escalas_sincronizar_participacao','tg_eventos_sincronizar_participacoes','tg_fechamentos_recurso','tg_pagamentos_recurso','tg_assinaturas_historico','tg_planos_historico','sincronizar_participacao') LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature); END LOOP; END $$;CREATE OR REPLACE FUNCTION public.ciclo_da_empresa(_empresa_id uuid,_ref timestamptz DEFAULT now()) RETURNS TABLE(inicio timestamptz,fim timestamptz) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$ DECLARE a timestamptz; n int; i timestamptz; f timestamptz; BEGIN
 SELECT coalesce(s.inicio_ciclo,e.criado_em) INTO a FROM public.empresas e LEFT JOIN public.assinaturas s ON s.empresa_id=e.id WHERE e.id=_empresa_id;
 IF a IS NULL THEN RAISE EXCEPTION 'Organização inexistente'; END IF;
 n:=(extract(year from _ref AT TIME ZONE 'UTC')::int-extract(year from a AT TIME ZONE 'UTC')::int)*12+extract(month from _ref AT TIME ZONE 'UTC')::int-extract(month from a AT TIME ZONE 'UTC')::int;
 i:=a+make_interval(months=>n); IF i>_ref THEN n:=n-1; END IF;
 i:=a+make_interval(months=>n); f:=a+make_interval(months=>n+1); RETURN QUERY SELECT i,f;
END; $$;
CREATE OR REPLACE FUNCTION public.tg_freelancers_limite_clt() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE p public.planos; BEGIN
 IF NEW.tipo_vinculo<>'clt' OR NOT NEW.ativo THEN RETURN NEW; END IF;
 p:=public.plano_da_empresa(NEW.empresa_id);
 IF p.codigo='free' THEN RAISE EXCEPTION 'LIMITE_PLANO: faça upgrade para cadastrar CLT ativos'; END IF;
 RETURN NEW;
END; $$;
ALTER TABLE public.pontos ADD COLUMN IF NOT EXISTS evidencia_expira_em timestamptz;
UPDATE public.pontos SET evidencia_expira_em=coalesce(selfie_expira_em,registrado_em+interval '90 days') WHERE foto_url IS NOT NULL OR gps_lat IS NOT NULL OR gps_lng IS NOT NULL;
CREATE OR REPLACE FUNCTION public.tg_ponto_evidencias_plano() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE p public.planos; dias int; v_empresa uuid; BEGIN
 v_empresa:=public.empresa_da_escala(NEW.escala_id); p:=public.plano_da_empresa(v_empresa);
 SELECT least(coalesce(p.retencao_evidencias_dias,365),coalesce(c.selfie_retencao_dias,90)) INTO dias FROM public.configuracoes c WHERE c.empresa_id=v_empresa;
 dias:=coalesce(dias,p.retencao_evidencias_dias,90);
 IF NEW.foto_url IS NOT NULL OR NEW.gps_lat IS NOT NULL OR NEW.gps_lng IS NOT NULL THEN NEW.evidencia_expira_em:=NEW.registrado_em+make_interval(days=>dias); END IF;
 IF NEW.foto_url IS NOT NULL THEN NEW.selfie_expira_em:=NEW.evidencia_expira_em; END IF; RETURN NEW;
END; $$;
CREATE TRIGGER tg_ponto_evidencias_plano BEFORE INSERT ON public.pontos FOR EACH ROW EXECUTE FUNCTION public.tg_ponto_evidencias_plano();
CREATE OR REPLACE FUNCTION public.validar_sequencia_novo_ponto() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE tipos tipo_ponto[]; esperado tipo_ponto; p public.planos; BEGIN
 IF NEW.status='recusado' THEN RETURN NEW; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('ponto:'||NEW.escala_id::text));
 p:=public.plano_da_empresa(public.empresa_da_escala(NEW.escala_id));
 SELECT coalesce(array_agg(tipo ORDER BY registrado_em,criado_em),ARRAY[]::tipo_ponto[]) INTO tipos FROM public.pontos WHERE escala_id=NEW.escala_id AND status<>'recusado';
 IF cardinality(tipos)=0 THEN esperado:='entrada';
 ELSIF p.codigo='free' AND cardinality(tipos)=1 AND tipos[1]='entrada' THEN esperado:='saida';
 ELSIF p.codigo<>'free' AND cardinality(tipos)=1 AND tipos[1]='entrada' THEN esperado:='inicio_intervalo';
 ELSIF p.codigo<>'free' AND cardinality(tipos)=2 AND tipos[2]='inicio_intervalo' THEN esperado:='fim_intervalo';
 ELSIF p.codigo<>'free' AND cardinality(tipos)=3 AND tipos[3]='fim_intervalo' THEN esperado:='saida';
 ELSE RAISE EXCEPTION 'Sequência de ponto concluída ou inválida'; END IF;
 IF NEW.tipo<>esperado THEN RAISE EXCEPTION 'Próximo registro esperado: %',esperado; END IF; RETURN NEW;
END; $$;
CREATE OR REPLACE FUNCTION public.tg_bloquear_taxa_legada() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN RAISE EXCEPTION 'Cobrança legada desativada: use faturas SaaS V2'; END; $$;
CREATE TRIGGER tg_bloquear_taxa_legada BEFORE INSERT ON public.taxas_plataforma FOR EACH ROW EXECUTE FUNCTION public.tg_bloquear_taxa_legada();
CREATE OR REPLACE FUNCTION public.tg_financeiro_recurso() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF NOT public.recurso_habilitado(NEW.empresa_id,'financeiro') THEN RAISE EXCEPTION 'RECURSO_PLANO: faça upgrade para liberar financeiro'; END IF; RETURN NEW;
END; $$;
CREATE TRIGGER tg_cobrancas_plano BEFORE INSERT ON public.cobrancas FOR EACH ROW EXECUTE FUNCTION public.tg_financeiro_recurso();
CREATE TRIGGER tg_fundings_plano BEFORE INSERT ON public.fundings FOR EACH ROW EXECUTE FUNCTION public.tg_financeiro_recurso();
CREATE TRIGGER tg_lotes_plano BEFORE INSERT ON public.lotes_pagamento FOR EACH ROW EXECUTE FUNCTION public.tg_financeiro_recurso();
CREATE POLICY bloqueio_leitura_fechamento_free ON public.fechamentos AS RESTRICTIVE FOR SELECT TO authenticated USING(public.tem_papel_plataforma(auth.uid(),'admin_master') OR public.recurso_habilitado(public.empresa_da_escala(escala_id),'fechamento'));
CREATE POLICY bloqueio_leitura_pagamentos_free ON public.pagamentos AS RESTRICTIVE FOR SELECT TO authenticated USING(public.tem_papel_plataforma(auth.uid(),'admin_master') OR public.recurso_habilitado(public.empresa_do_fechamento(fechamento_id),'financeiro'));
CREATE OR REPLACE FUNCTION public.processar_cobranca_v2() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE c record; BEGIN
 FOR c IN SELECT empresa_id,inicio FROM public.ciclos_cobranca WHERE fim<=now() AND NOT EXISTS (SELECT 1 FROM public.faturas_plataforma f WHERE f.empresa_id=ciclos_cobranca.empresa_id AND f.ciclo_inicio=ciclos_cobranca.inicio) LOOP
 PERFORM public.fechar_fatura_ciclo(c.empresa_id,c.inicio); END LOOP;
 FOR c IN SELECT empresa_id FROM public.assinaturas WHERE status IN ('ativa','trial','em_trial') LOOP PERFORM public.abrir_ciclo_cobranca(c.empresa_id); END LOOP;
 UPDATE public.faturas_plataforma SET status='atrasada' WHERE status='pendente' AND vencimento<current_date;
END; $$;
REVOKE ALL ON FUNCTION public.processar_cobranca_v2(),public.tg_ponto_evidencias_plano(),public.tg_financeiro_recurso() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.processar_cobranca_v2() TO service_role;
