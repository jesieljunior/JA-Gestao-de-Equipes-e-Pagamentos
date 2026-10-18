-- Enums
create type public.modelo_cobranca as enum ('percentual_evento', 'taxa_fixa_pix', 'assinatura_percentual');
create type public.tipo_cobranca as enum ('aporte_agencia', 'cobranca_cliente');
create type public.status_cobranca as enum ('rascunho', 'aguardando_pagamento', 'pago', 'vencido', 'cancelado');
create type public.forma_cobranca as enum ('pix', 'boleto', 'cartao');
create type public.tipo_movimento as enum ('credito', 'debito');
create type public.status_taxa as enum ('pendente', 'cobrada', 'isenta');

-- Conta da agência no parceiro de pagamento
alter table public.empresas
  add column if not exists parceiro_wallet_id text,
  add column if not exists parceiro_conta_status text not null default 'nao_criada',
  add column if not exists parceiro_aprovada_em timestamptz;

-- Modelo de cobrança da plataforma
alter table public.configuracoes
  add column if not exists modelo_cobranca public.modelo_cobranca not null default 'percentual_evento',
  add column if not exists percentual_plataforma numeric(5,2) not null default 2.00,
  add column if not exists taxa_fixa_pix numeric(10,2) not null default 1.50,
  add column if not exists mensalidade numeric(10,2) not null default 0.00;

-- Cobranças (aporte da agência ou cobrança do cliente)
create table public.cobrancas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  tipo public.tipo_cobranca not null,
  cliente_id uuid references public.clientes(id) on delete set null,
  evento_id uuid references public.eventos(id) on delete set null,
  descricao text not null default '',
  valor numeric(12,2) not null check (valor > 0),
  forma public.forma_cobranca not null default 'pix',
  vencimento date,
  status public.status_cobranca not null default 'rascunho',
  parceiro_cobranca_id text,
  link_pagamento text,
  pix_copia_cola text,
  pago_em timestamptz,
  erro text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
grant select, insert, update, delete on public.cobrancas to authenticated;
grant all on public.cobrancas to service_role;
alter table public.cobrancas enable row level security;
create policy cobrancas_all on public.cobrancas for all to authenticated
  using (empresa_id = public.empresa_atual()) with check (empresa_id = public.empresa_atual());
create trigger tg_cobrancas_atualizado_em before update on public.cobrancas
  for each row execute function public.tg_atualizado_em();
create index idx_cobrancas_empresa on public.cobrancas (empresa_id, status);
create index idx_cobrancas_evento on public.cobrancas (evento_id);

-- Taxas da plataforma
create table public.taxas_plataforma (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  evento_id uuid references public.eventos(id) on delete set null,
  pagamento_id uuid references public.pagamentos(id) on delete set null,
  modelo public.modelo_cobranca not null,
  base_calculo numeric(12,2) not null default 0,
  valor numeric(12,2) not null check (valor >= 0),
  status public.status_taxa not null default 'pendente',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
grant select, insert, update, delete on public.taxas_plataforma to authenticated;
grant all on public.taxas_plataforma to service_role;
alter table public.taxas_plataforma enable row level security;
create policy taxas_all on public.taxas_plataforma for all to authenticated
  using (empresa_id = public.empresa_atual()) with check (empresa_id = public.empresa_atual());
create trigger tg_taxas_atualizado_em before update on public.taxas_plataforma
  for each row execute function public.tg_atualizado_em();
create unique index idx_taxa_unica_evento on public.taxas_plataforma (evento_id) where evento_id is not null;
create unique index idx_taxa_unica_pagamento on public.taxas_plataforma (pagamento_id) where pagamento_id is not null;

-- Movimentos de saldo
create table public.movimentos_saldo (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  tipo public.tipo_movimento not null,
  valor numeric(12,2) not null check (valor > 0),
  descricao text not null default '',
  cobranca_id uuid references public.cobrancas(id) on delete set null,
  pagamento_id uuid references public.pagamentos(id) on delete set null,
  taxa_id uuid references public.taxas_plataforma(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
grant select, insert, update, delete on public.movimentos_saldo to authenticated;
grant all on public.movimentos_saldo to service_role;
alter table public.movimentos_saldo enable row level security;
create policy movimentos_all on public.movimentos_saldo for all to authenticated
  using (empresa_id = public.empresa_atual()) with check (empresa_id = public.empresa_atual());
create trigger tg_movimentos_atualizado_em before update on public.movimentos_saldo
  for each row execute function public.tg_atualizado_em();
create index idx_movimentos_empresa on public.movimentos_saldo (empresa_id, criado_em desc);

-- Pagamentos: dados do parceiro
alter table public.pagamentos
  add column if not exists parceiro_transferencia_id text,
  add column if not exists chave_pix_destino text;

-- Saldo disponível da agência
create or replace function public.saldo_empresa(_empresa_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(case when tipo = 'credito' then valor else -valor end), 0)
  from public.movimentos_saldo
  where empresa_id = _empresa_id;
$$;