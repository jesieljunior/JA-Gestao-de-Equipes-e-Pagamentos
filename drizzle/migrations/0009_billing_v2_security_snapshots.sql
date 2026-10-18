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
DO $$ DECLARE f record; BEGIN FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('tg_escalas_limite_plano','tg_eventos_limite_plano','tg_freelancers_limite_clt','tg_user_roles_limite_supervisores','tg_escalas_sincronizar_participacao','tg_eventos_sincronizar_participacoes','tg_fechamentos_recurso','tg_pagamentos_recurso','tg_assinaturas_historico','tg_planos_historico','sincronizar_participacao') LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature); END LOOP; END $$;