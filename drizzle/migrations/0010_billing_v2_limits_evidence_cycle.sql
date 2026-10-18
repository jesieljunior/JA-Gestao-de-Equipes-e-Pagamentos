CREATE OR REPLACE FUNCTION public.ciclo_da_empresa(_empresa_id uuid,_ref timestamptz DEFAULT now()) RETURNS TABLE(inicio timestamptz,fim timestamptz) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$ DECLARE a timestamptz; n int; i timestamptz; f timestamptz; BEGIN
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
