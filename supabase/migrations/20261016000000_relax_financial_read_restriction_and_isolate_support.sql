-- 20261016000000: Ajuste do isolamento financeiro, saldo protegido por tenant e eliminação de acessos duplos

DROP POLICY IF EXISTS bloqueio_leitura_pagamentos_free ON public.pagamentos;
CREATE POLICY bloqueio_leitura_pagamentos_free ON public.pagamentos AS RESTRICTIVE FOR SELECT TO authenticated
USING (
  public.tem_papel_plataforma(auth.uid(),'admin_master')
  OR public.empresa_do_fechamento(fechamento_id) = public.empresa_atual()
);

DROP POLICY IF EXISTS bloqueio_leitura_fechamento_free ON public.fechamentos;
CREATE POLICY bloqueio_leitura_fechamento_free ON public.fechamentos AS RESTRICTIVE FOR SELECT TO authenticated
USING (
  public.tem_papel_plataforma(auth.uid(),'admin_master')
  OR public.empresa_da_escala(escala_id) = public.empresa_atual()
);

CREATE OR REPLACE FUNCTION public.saldo_empresa(_empresa_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _empresa_id IS DISTINCT FROM public.empresa_atual() AND NOT public.tem_papel_plataforma(auth.uid(), 'admin_master') THEN
    RETURN 0;
  END IF;

  RETURN coalesce(
    (SELECT sum(CASE WHEN tipo = 'credito' THEN valor ELSE -valor END)
     FROM public.movimentos_saldo
     WHERE empresa_id = _empresa_id),
    0
  );
END;
$$;

DELETE FROM public.user_roles WHERE user_id IN (SELECT user_id FROM public.plataforma_usuarios);
UPDATE public.usuarios SET empresa_id = NULL WHERE id IN (SELECT user_id FROM public.plataforma_usuarios);

CREATE OR REPLACE FUNCTION public.tg_impedir_duplo_acesso_papel()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.plataforma_usuarios WHERE user_id = NEW.user_id) THEN
    RAISE EXCEPTION 'Usuário da plataforma não pode receber papéis organizacionais';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_impedir_duplo_acesso_papel ON public.user_roles;
CREATE TRIGGER tg_impedir_duplo_acesso_papel
BEFORE INSERT OR UPDATE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.tg_impedir_duplo_acesso_papel();
