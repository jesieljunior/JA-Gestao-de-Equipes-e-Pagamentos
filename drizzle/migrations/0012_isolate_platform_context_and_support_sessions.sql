CREATE OR REPLACE FUNCTION public.tem_papel_plataforma(_user_id uuid, _papel public.papel_plataforma)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM public.plataforma_usuarios p JOIN public.usuarios u ON u.id=p.user_id WHERE p.user_id=_user_id AND p.papel=_papel AND u.ativo);
$$;
CREATE OR REPLACE FUNCTION public.empresa_atual()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT u.empresa_id FROM public.usuarios u WHERE u.id=auth.uid() AND u.ativo AND NOT EXISTS(SELECT 1 FROM public.plataforma_usuarios p WHERE p.user_id=u.id);
$$;
CREATE OR REPLACE FUNCTION public.impedir_troca_empresa_usuario()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
 IF NEW.empresa_id IS DISTINCT FROM OLD.empresa_id AND current_user NOT IN ('postgres','service_role','supabase_admin') THEN
  RAISE EXCEPTION 'O vínculo de empresa só pode ser definido por uma operação autorizada';
 END IF;
 IF NEW.ativo IS DISTINCT FROM OLD.ativo AND auth.uid()=OLD.id AND current_user NOT IN ('postgres','service_role','supabase_admin') THEN
  RAISE EXCEPTION 'Não é permitido alterar a própria ativação';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER proteger_ativacao_usuario BEFORE UPDATE OF ativo ON public.usuarios FOR EACH ROW EXECUTE FUNCTION public.impedir_troca_empresa_usuario();
CREATE OR REPLACE FUNCTION public.criar_empresa(_nome text, _cnpj text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id uuid;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Autenticação necessária'; END IF;
 PERFORM 1 FROM public.usuarios WHERE id=auth.uid() AND ativo FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Usuário indisponível'; END IF;
 IF EXISTS(SELECT 1 FROM public.plataforma_usuarios WHERE user_id=auth.uid()) THEN RAISE EXCEPTION 'Conta da plataforma não pode criar vínculo empresarial'; END IF;
 IF EXISTS(SELECT 1 FROM public.usuarios WHERE id=auth.uid() AND empresa_id IS NOT NULL) THEN RAISE EXCEPTION 'Usuário já pertence a uma empresa'; END IF;
 INSERT INTO public.empresas(nome,cnpj) VALUES(_nome,_cnpj) RETURNING id INTO v_id;
 INSERT INTO public.configuracoes(empresa_id) VALUES(v_id);
 UPDATE public.usuarios SET empresa_id=v_id WHERE id=auth.uid();
 INSERT INTO public.user_roles(user_id,role) VALUES(auth.uid(),'admin') ON CONFLICT DO NOTHING;
 RETURN v_id;
END; $$;
CREATE TABLE public.suporte_atendimentos (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 usuario_id uuid NOT NULL,
 empresa_id uuid NOT NULL REFERENCES public.empresas(id),
 motivo text NOT NULL,
 iniciado_em timestamptz NOT NULL DEFAULT now(),
 encerrado_em timestamptz
);
GRANT SELECT ON public.suporte_atendimentos TO authenticated;
GRANT ALL ON public.suporte_atendimentos TO service_role;
ALTER TABLE public.suporte_atendimentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY atendimento_leitura ON public.suporte_atendimentos FOR SELECT TO authenticated USING (
 public.tem_papel_plataforma(auth.uid(),'admin_master') OR (usuario_id=auth.uid() AND public.tem_papel_plataforma(auth.uid(),'suporte'))
);
CREATE UNIQUE INDEX suporte_atendimento_aberto ON public.suporte_atendimentos(usuario_id) WHERE encerrado_em IS NULL;
CREATE OR REPLACE FUNCTION public.iniciar_atendimento(_empresa_id uuid,_motivo text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id uuid;
BEGIN
 IF NOT (public.tem_papel_plataforma(auth.uid(),'suporte') OR public.tem_papel_plataforma(auth.uid(),'admin_master')) THEN RAISE EXCEPTION 'Acesso restrito à plataforma'; END IF;
 IF length(trim(_motivo))<5 THEN RAISE EXCEPTION 'Informe a finalidade do atendimento'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.empresas WHERE id=_empresa_id) THEN RAISE EXCEPTION 'Empresa não encontrada'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext(auth.uid()::text));
 IF EXISTS(SELECT 1 FROM public.suporte_atendimentos WHERE usuario_id=auth.uid() AND encerrado_em IS NULL) THEN RAISE EXCEPTION 'Encerre o atendimento atual antes de selecionar outra empresa'; END IF;
 INSERT INTO public.suporte_atendimentos(usuario_id,empresa_id,motivo) VALUES(auth.uid(),_empresa_id,trim(_motivo)) RETURNING id INTO v_id;
 INSERT INTO public.logs_auditoria(empresa_id,ator_id,ator_contexto,acao,recurso_tipo,recurso_id,resultado,detalhes)
 VALUES(_empresa_id,auth.uid(),'plataforma','atendimento_iniciado','atendimento',v_id,'sucesso',jsonb_build_object('motivo',trim(_motivo)));
 RETURN v_id;
END; $$;
CREATE OR REPLACE FUNCTION public.encerrar_atendimento(_atendimento_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_empresa uuid;
BEGIN
 IF NOT (public.tem_papel_plataforma(auth.uid(),'suporte') OR public.tem_papel_plataforma(auth.uid(),'admin_master')) THEN RAISE EXCEPTION 'Acesso restrito à plataforma'; END IF;
 UPDATE public.suporte_atendimentos SET encerrado_em=now() WHERE id=_atendimento_id AND usuario_id=auth.uid() AND encerrado_em IS NULL RETURNING empresa_id INTO v_empresa;
 IF v_empresa IS NULL THEN RAISE EXCEPTION 'Atendimento não encontrado'; END IF;
 INSERT INTO public.logs_auditoria(empresa_id,ator_id,ator_contexto,acao,recurso_tipo,recurso_id,resultado,detalhes)
 VALUES(v_empresa,auth.uid(),'plataforma','atendimento_encerrado','atendimento',_atendimento_id,'sucesso','{}');
END; $$;
REVOKE ALL ON FUNCTION public.iniciar_atendimento(uuid,text),public.encerrar_atendimento(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.iniciar_atendimento(uuid,text),public.encerrar_atendimento(uuid) TO authenticated;
DROP POLICY IF EXISTS auditoria_insercao_propria ON public.logs_auditoria;
CREATE POLICY auditoria_insercao_propria ON public.logs_auditoria FOR INSERT TO authenticated WITH CHECK (
 ator_id=auth.uid() AND ator_contexto='agencia' AND empresa_id=public.empresa_atual()
);
CREATE POLICY master_altera_empresa ON public.empresas FOR UPDATE TO authenticated USING(public.tem_papel_plataforma(auth.uid(),'admin_master')) WITH CHECK(public.tem_papel_plataforma(auth.uid(),'admin_master'));
CREATE POLICY master_auditoria_ponto ON public.auditoria_ponto_publico FOR SELECT TO authenticated USING(public.tem_papel_plataforma(auth.uid(),'admin_master'));
CREATE POLICY cobrancas_capacidade_escrita ON public.cobrancas AS RESTRICTIVE FOR ALL TO authenticated USING (
 public.tem_papel_plataforma(auth.uid(),'admin_master') OR (empresa_id=public.empresa_atual() AND public.tem_capacidade(auth.uid(),'financeiro.gerenciar'))
) WITH CHECK (empresa_id=public.empresa_atual() AND public.tem_capacidade(auth.uid(),'financeiro.gerenciar'));
