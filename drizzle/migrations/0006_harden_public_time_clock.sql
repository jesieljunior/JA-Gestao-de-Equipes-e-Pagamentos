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
);