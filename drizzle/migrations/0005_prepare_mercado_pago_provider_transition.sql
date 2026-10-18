ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS gateway_ativo text NOT NULL DEFAULT 'asaas'
  CHECK (gateway_ativo IN ('asaas', 'mercado_pago'));

ALTER TABLE public.cobrancas
  ADD COLUMN IF NOT EXISTS provedor_pagamento text NOT NULL DEFAULT 'asaas',
  ADD COLUMN IF NOT EXISTS chave_idempotencia text,
  ADD COLUMN IF NOT EXISTS provedor_status text;

ALTER TABLE public.pagamentos
  ADD COLUMN IF NOT EXISTS provedor_pagamento text NOT NULL DEFAULT 'asaas';

ALTER TABLE public.fundings
  ADD COLUMN IF NOT EXISTS provedor_pagamento text NOT NULL DEFAULT 'asaas';

CREATE UNIQUE INDEX IF NOT EXISTS cobrancas_chave_idempotencia_uidx
  ON public.cobrancas(chave_idempotencia)
  WHERE chave_idempotencia IS NOT NULL;

CREATE INDEX IF NOT EXISTS cobrancas_provedor_parceiro_idx
  ON public.cobrancas(provedor_pagamento, parceiro_cobranca_id);

CREATE INDEX IF NOT EXISTS pagamentos_provedor_parceiro_idx
  ON public.pagamentos(provedor_pagamento, parceiro_transferencia_id);

CREATE TABLE IF NOT EXISTS public.webhook_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provedor text NOT NULL DEFAULT 'asaas',
  chave_idempotencia text NOT NULL UNIQUE,
  evento text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'processado' CHECK (status IN ('processado','falha')),
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.webhook_eventos TO service_role;
ALTER TABLE public.webhook_eventos ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_webhook_eventos_status ON public.webhook_eventos(status, criado_em DESC);

CREATE TABLE public.mercado_pago_contas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL UNIQUE REFERENCES public.empresas(id) ON DELETE CASCADE,
  mercado_pago_user_id text NOT NULL,
  access_token_cifrado text NOT NULL,
  refresh_token_cifrado text,
  token_expira_em timestamptz,
  escopos text,
  status text NOT NULL DEFAULT 'conectada' CHECK (status IN ('conectada', 'expirada', 'revogada', 'erro')),
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.mercado_pago_contas TO service_role;
ALTER TABLE public.mercado_pago_contas ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER tg_mercado_pago_contas_atualizado_em
BEFORE UPDATE ON public.mercado_pago_contas
FOR EACH ROW EXECUTE FUNCTION public.tg_atualizado_em();

CREATE TABLE public.mercado_pago_oauth_estados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  estado_hash text NOT NULL UNIQUE,
  redirect_uri text NOT NULL,
  expira_em timestamptz NOT NULL,
  usado_em timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.mercado_pago_oauth_estados TO service_role;
ALTER TABLE public.mercado_pago_oauth_estados ENABLE ROW LEVEL SECURITY;
CREATE INDEX mercado_pago_oauth_estados_expira_idx
  ON public.mercado_pago_oauth_estados(expira_em)
  WHERE usado_em IS NULL;

COMMENT ON TABLE public.mercado_pago_contas IS 'Tokens OAuth do Mercado Pago cifrados e acessíveis somente pelo servidor.';
COMMENT ON TABLE public.mercado_pago_oauth_estados IS 'Estados OAuth de uso único para conexão segura de contas Mercado Pago.';