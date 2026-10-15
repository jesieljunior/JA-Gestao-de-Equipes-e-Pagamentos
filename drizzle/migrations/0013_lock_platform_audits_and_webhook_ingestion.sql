REVOKE INSERT,UPDATE,DELETE ON public.webhook_eventos FROM authenticated,anon;
DROP POLICY IF EXISTS webhook_eventos_insercao ON public.webhook_eventos;
GRANT ALL ON public.webhook_eventos TO service_role;
CREATE OR REPLACE FUNCTION public.tem_capacidade(_user_id uuid,_capacidade text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM public.usuarios u WHERE u.id=_user_id AND u.ativo AND u.empresa_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.plataforma_usuarios p WHERE p.user_id=u.id)) AND CASE _capacidade
 WHEN 'cadastros.gerenciar' THEN public.has_role(_user_id,'admin') OR public.has_role(_user_id,'coordenador')
 WHEN 'configuracoes.gerenciar' THEN public.has_role(_user_id,'admin')
 WHEN 'eventos.gerenciar' THEN public.has_role(_user_id,'admin') OR public.has_role(_user_id,'coordenador')
 WHEN 'operacao.supervisionar' THEN public.has_role(_user_id,'admin') OR public.has_role(_user_id,'coordenador') OR public.has_role(_user_id,'supervisor')
 WHEN 'fechamento.aprovar' THEN public.has_role(_user_id,'admin') OR public.has_role(_user_id,'coordenador')
 WHEN 'financeiro.gerenciar' THEN public.has_role(_user_id,'admin') OR public.has_role(_user_id,'financeiro')
 WHEN 'relatorios.ver' THEN EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_user_id)
 ELSE false END;
$$;
REVOKE ALL ON FUNCTION public.tem_capacidade(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tem_capacidade(uuid,text) TO authenticated,service_role;
REVOKE INSERT ON public.logs_auditoria FROM authenticated,anon;
DROP POLICY IF EXISTS auditoria_insercao_propria ON public.logs_auditoria;
GRANT ALL ON public.logs_auditoria TO service_role;
CREATE OR REPLACE FUNCTION public.proteger_papel_plataforma()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF current_setting('role',true)='authenticated' AND (OLD.user_id=auth.uid() OR (TG_OP='UPDATE' AND NEW.user_id=auth.uid())) THEN
 RAISE EXCEPTION 'Não é permitido alterar os próprios privilégios';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER proteger_papel_plataforma BEFORE UPDATE OR DELETE ON public.plataforma_usuarios FOR EACH ROW EXECUTE FUNCTION public.proteger_papel_plataforma();
GRANT INSERT,UPDATE,DELETE ON public.plataforma_usuarios TO authenticated;
