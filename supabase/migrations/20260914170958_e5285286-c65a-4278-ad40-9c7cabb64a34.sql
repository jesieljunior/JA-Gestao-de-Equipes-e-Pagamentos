ALTER TABLE public.taxas_plataforma
  ADD COLUMN IF NOT EXISTS cobranca_id uuid REFERENCES public.cobrancas(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS taxas_plataforma_cobranca_id_unq
  ON public.taxas_plataforma(cobranca_id)
  WHERE cobranca_id IS NOT NULL;