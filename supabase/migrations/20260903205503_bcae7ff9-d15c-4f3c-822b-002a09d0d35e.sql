alter table public.clientes
  add column if not exists cpf_cnpj text,
  add column if not exists email text,
  add column if not exists telefone text,
  add column if not exists parceiro_cliente_id text;

alter table public.empresas
  add column if not exists email_cobranca text;