CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid,_role public.papel_usuario) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM public.user_roles r JOIN public.usuarios u ON u.id=r.user_id WHERE r.user_id=_user_id AND r.role=_role AND u.ativo AND u.empresa_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.plataforma_usuarios p WHERE p.user_id=u.id)); $$;
DROP POLICY IF EXISTS cobrancas_capacidade_escrita ON public.cobrancas;
CREATE POLICY cobrancas_capacidade_escrita ON public.cobrancas AS RESTRICTIVE FOR ALL TO authenticated USING (public.tem_papel_plataforma(auth.uid(),'admin_master') OR (empresa_id=public.empresa_atual() AND public.tem_capacidade(auth.uid(),'financeiro.gerenciar'))) WITH CHECK (public.tem_papel_plataforma(auth.uid(),'admin_master') OR (empresa_id=public.empresa_atual() AND public.tem_capacidade(auth.uid(),'financeiro.gerenciar')));
REVOKE SELECT ON public.webhook_eventos FROM anon,authenticated;
CREATE OR REPLACE FUNCTION public.proteger_papel_plataforma() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_target uuid;
BEGIN
 IF TG_OP='DELETE' THEN v_target=OLD.user_id; ELSE v_target=NEW.user_id; END IF;
 IF current_setting('role',true)='authenticated' AND (v_target=auth.uid() OR (TG_OP IN ('UPDATE','DELETE') AND OLD.user_id=auth.uid())) THEN RAISE EXCEPTION 'Não é permitido alterar os próprios privilégios'; END IF;
 IF TG_OP<>'DELETE' AND EXISTS(SELECT 1 FROM public.usuarios WHERE id=v_target AND empresa_id IS NOT NULL) THEN RAISE EXCEPTION 'Conta empresarial não pode receber papel da plataforma'; END IF;
 IF TG_OP<>'DELETE' AND EXISTS(SELECT 1 FROM public.plataforma_usuarios WHERE user_id=v_target AND id<>NEW.id) THEN RAISE EXCEPTION 'Conta já possui papel da plataforma'; END IF;
 INSERT INTO public.logs_auditoria(ator_id,ator_contexto,acao,recurso_tipo,recurso_id,resultado,detalhes) VALUES(COALESCE(auth.uid(),v_target),'admin_master','papel_plataforma_'||lower(TG_OP),'usuario',v_target,'sucesso',jsonb_build_object('operacao',TG_OP));
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS proteger_papel_plataforma ON public.plataforma_usuarios;
CREATE TRIGGER proteger_papel_plataforma BEFORE INSERT OR UPDATE OR DELETE ON public.plataforma_usuarios FOR EACH ROW EXECUTE FUNCTION public.proteger_papel_plataforma();