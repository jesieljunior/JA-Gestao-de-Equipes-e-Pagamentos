-- Reset completo do schema public para execucao limpa sem conflitos
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO anon;
GRANT ALL ON SCHEMA public TO authenticated;
GRANT ALL ON SCHEMA public TO service_role;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============ ENUMS ============
create type public.papel_usuario as enum ('admin','coordenador','financeiro','supervisor');
create type public.status_evento as enum ('planejamento','escala','confirmacoes','pronto','em_execucao','encerrando','fechamento','pagamento','concluido','arquivado','cancelado');
create type public.tipo_valor as enum ('diaria','hora');
create type public.status_escala as enum ('convidado','confirmado','recusado','substituido');
create type public.tipo_ponto as enum ('entrada','saida','inicio_intervalo','fim_intervalo');
create type public.metodo_check as enum ('qrcode','selfie','manual');
create type public.status_ponto as enum ('pendente','aprovado','recusado');
create type public.status_fechamento as enum ('pendente_aprovacao','aprovado','contestado');
create type public.status_pagamento as enum ('pendente','agendado','executado','falhou');

-- ============ TIMESTAMP HELPER ============
create or replace function public.tg_atualizado_em()
returns trigger language plpgsql set search_path = public as $$
begin new.atualizado_em = now(); return new; end; $$;

-- ============ EMPRESAS ============
create table public.empresas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cnpj text not null unique,
  subconta_parceiro_id text,
  ativa boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
grant select, insert, update, delete on public.empresas to authenticated;
grant all on public.empresas to service_role;
alter table public.empresas enable row level security;

-- ============ USUARIOS (perfil ligado ao auth) ============
create table public.usuarios (
  id uuid primary key references auth.users(id) on delete cascade,
  empresa_id uuid references public.empresas(id) on delete cascade,
  nome text not null default '',
  email text not null default '',
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
grant select, insert, update, delete on public.usuarios to authenticated;
grant all on public.usuarios to service_role;
alter table public.usuarios enable row level security;

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.papel_usuario not null,
  criado_em timestamptz not null default now(),
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

-- ============ FUNCOES DE SEGURANCA ============
create or replace function public.has_role(_user_id uuid, _role public.papel_usuario)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role);
$$;

create or replace function public.empresa_atual()
returns uuid language sql stable security definer set search_path = public as $$
  select empresa_id from public.usuarios where id = auth.uid();
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.usuarios (id, nome, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'nome', split_part(new.email,'@',1)), new.email)
  on conflict (id) do nothing;
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============ CONFIGURACOES ============
create table public.configuracoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null unique references public.empresas(id) on delete cascade,
  checkin_exige_selfie boolean not null default false,
  checkin_exige_gps boolean not null default false,
  escala_exige_confirmacao_presenca boolean not null default false,
  substituicao_habilitada boolean not null default false,
  ocorrencias_habilitadas boolean not null default false,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
grant select, insert, update, delete on public.configuracoes to authenticated;
grant all on public.configuracoes to service_role;
alter table public.configuracoes enable row level security;

-- ============ CLIENTES ============
create table public.clientes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nome text not null,
  observacoes text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
grant select, insert, update, delete on public.clientes to authenticated;
grant all on public.clientes to service_role;
alter table public.clientes enable row level security;

-- ============ FREELANCERS ============
create table public.freelancers (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nome text not null,
  cpf text not null,
  telefone text,
  chave_pix text not null,
  funcao text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint uq_freelancer_empresa_cpf unique (empresa_id, cpf)
);
grant select, insert, update, delete on public.freelancers to authenticated;
grant all on public.freelancers to service_role;
alter table public.freelancers enable row level security;

-- ============ EVENTOS / EQUIPES ============
create table public.eventos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  cliente_id uuid references public.clientes(id) on delete set null,
  nome text not null,
  local text,
  data_inicio timestamptz not null,
  data_fim timestamptz,
  status public.status_evento not null default 'planejamento',
  qr_code_token text not null unique default encode(gen_random_bytes(16),'hex'),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
grant select, insert, update, delete on public.eventos to authenticated;
grant all on public.eventos to service_role;
alter table public.eventos enable row level security;

create table public.equipes (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references public.eventos(id) on delete cascade,
  supervisor_id uuid references public.usuarios(id) on delete set null,
  nome text not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
grant select, insert, update, delete on public.equipes to authenticated;
grant all on public.equipes to service_role;
alter table public.equipes enable row level security;

-- ============ ESCALAS ============
create table public.escalas (
  id uuid primary key default gen_random_uuid(),
  equipe_id uuid not null references public.equipes(id) on delete cascade,
  freelancer_id uuid not null references public.freelancers(id) on delete restrict,
  valor_combinado numeric(10,2) not null,
  tipo_valor public.tipo_valor not null,
  status public.status_escala not null default 'convidado',
  convite_enviado_em timestamptz,
  confirmado_em timestamptz,
  substituido_por_id uuid references public.escalas(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
grant select, insert, update, delete on public.escalas to authenticated;
grant all on public.escalas to service_role;
alter table public.escalas enable row level security;

-- ============ OPERACAO ============
create table public.pontos (
  id uuid primary key default gen_random_uuid(),
  escala_id uuid not null references public.escalas(id) on delete cascade,
  tipo public.tipo_ponto not null,
  metodo public.metodo_check not null,
  registrado_em timestamptz not null default now(),
  foto_url text,
  gps_lat numeric(9,6),
  gps_lng numeric(9,6),
  device_hash text,
  status public.status_ponto not null default 'pendente',
  aprovado_por_id uuid references public.usuarios(id) on delete set null,
  aprovado_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
grant select, insert, update, delete on public.pontos to authenticated;
grant all on public.pontos to service_role;
alter table public.pontos enable row level security;

create table public.ocorrencias (
  id uuid primary key default gen_random_uuid(),
  escala_id uuid not null references public.escalas(id) on delete cascade,
  registrado_por_id uuid references public.usuarios(id) on delete set null,
  descricao text not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
grant select, insert, update, delete on public.ocorrencias to authenticated;
grant all on public.ocorrencias to service_role;
alter table public.ocorrencias enable row level security;

-- ============ FECHAMENTOS / PAGAMENTOS ============
create table public.fechamentos (
  id uuid primary key default gen_random_uuid(),
  escala_id uuid not null unique references public.escalas(id) on delete cascade,
  horas_trabalhadas numeric(6,2) not null,
  valor_calculado numeric(10,2) not null,
  status public.status_fechamento not null default 'pendente_aprovacao',
  aprovado_por_id uuid references public.usuarios(id) on delete set null,
  aprovado_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
grant select, insert, update, delete on public.fechamentos to authenticated;
grant all on public.fechamentos to service_role;
alter table public.fechamentos enable row level security;

create table public.pagamentos (
  id uuid primary key default gen_random_uuid(),
  fechamento_id uuid not null unique references public.fechamentos(id) on delete cascade,
  valor numeric(10,2) not null,
  status public.status_pagamento not null default 'pendente',
  data_agendada timestamptz,
  executado_em timestamptz,
  chave_idempotencia text not null unique,
  txid_parceiro text,
  comprovante_url text,
  erro text,
  tentativas integer not null default 0,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
grant select, insert, update, delete on public.pagamentos to authenticated;
grant all on public.pagamentos to service_role;
alter table public.pagamentos enable row level security;

-- ============ TRIGGERS atualizado_em ============
do $$ declare t text;
begin
  foreach t in array array['empresas','usuarios','configuracoes','clientes','freelancers','eventos','equipes','escalas','pontos','ocorrencias','fechamentos','pagamentos'] loop
    execute format('create trigger tg_%1$s_atualizado_em before update on public.%1$s for each row execute function public.tg_atualizado_em()', t);
  end loop;
end $$;

-- ============ ESCOPO POR EMPRESA (helpers) ============
create or replace function public.empresa_da_equipe(_equipe_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select e.empresa_id from public.equipes q join public.eventos e on e.id = q.evento_id where q.id = _equipe_id;
$$;
create or replace function public.empresa_da_escala(_escala_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select e.empresa_id from public.escalas s
  join public.equipes q on q.id = s.equipe_id
  join public.eventos e on e.id = q.evento_id where s.id = _escala_id;
$$;
create or replace function public.empresa_do_fechamento(_fechamento_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select public.empresa_da_escala(f.escala_id) from public.fechamentos f where f.id = _fechamento_id;
$$;

-- ============ POLICIES ============
create policy "empresas_select" on public.empresas for select to authenticated using (id = public.empresa_atual());
create policy "empresas_insert" on public.empresas for insert to authenticated with check (true);
create policy "empresas_update" on public.empresas for update to authenticated
  using (id = public.empresa_atual() and public.has_role(auth.uid(),'admin'))
  with check (id = public.empresa_atual());

create policy "usuarios_select_self" on public.usuarios for select to authenticated
  using (id = auth.uid() or empresa_id = public.empresa_atual());
create policy "usuarios_update_self" on public.usuarios for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy "usuarios_admin_update" on public.usuarios for update to authenticated
  using (empresa_id = public.empresa_atual() and public.has_role(auth.uid(),'admin'))
  with check (empresa_id = public.empresa_atual());

create policy "user_roles_select" on public.user_roles for select to authenticated
  using (user_id = auth.uid() or exists (
    select 1 from public.usuarios u where u.id = user_roles.user_id and u.empresa_id = public.empresa_atual()));

create policy "configuracoes_all" on public.configuracoes for all to authenticated
  using (empresa_id = public.empresa_atual()) with check (empresa_id = public.empresa_atual());
create policy "clientes_all" on public.clientes for all to authenticated
  using (empresa_id = public.empresa_atual()) with check (empresa_id = public.empresa_atual());
create policy "freelancers_all" on public.freelancers for all to authenticated
  using (empresa_id = public.empresa_atual()) with check (empresa_id = public.empresa_atual());
create policy "eventos_all" on public.eventos for all to authenticated
  using (empresa_id = public.empresa_atual()) with check (empresa_id = public.empresa_atual());
create policy "equipes_all" on public.equipes for all to authenticated
  using (exists (select 1 from public.eventos e where e.id = equipes.evento_id and e.empresa_id = public.empresa_atual()))
  with check (exists (select 1 from public.eventos e where e.id = equipes.evento_id and e.empresa_id = public.empresa_atual()));
create policy "escalas_all" on public.escalas for all to authenticated
  using (public.empresa_da_equipe(escalas.equipe_id) = public.empresa_atual())
  with check (public.empresa_da_equipe(escalas.equipe_id) = public.empresa_atual());
create policy "pontos_all" on public.pontos for all to authenticated
  using (public.empresa_da_escala(pontos.escala_id) = public.empresa_atual())
  with check (public.empresa_da_escala(pontos.escala_id) = public.empresa_atual());
create policy "ocorrencias_all" on public.ocorrencias for all to authenticated
  using (public.empresa_da_escala(ocorrencias.escala_id) = public.empresa_atual())
  with check (public.empresa_da_escala(ocorrencias.escala_id) = public.empresa_atual());
create policy "fechamentos_all" on public.fechamentos for all to authenticated
  using (public.empresa_da_escala(fechamentos.escala_id) = public.empresa_atual())
  with check (public.empresa_da_escala(fechamentos.escala_id) = public.empresa_atual());
create policy "pagamentos_all" on public.pagamentos for all to authenticated
  using (public.empresa_do_fechamento(pagamentos.fechamento_id) = public.empresa_atual())
  with check (public.empresa_do_fechamento(pagamentos.fechamento_id) = public.empresa_atual());

-- ============ ONBOARDING ============
create or replace function public.criar_empresa(_nome text, _cnpj text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'nao autenticado'; end if;
  if (select empresa_id from public.usuarios where id = auth.uid()) is not null then
    raise exception 'usuario ja pertence a uma agencia';
  end if;
  insert into public.empresas (nome, cnpj) values (_nome, _cnpj) returning id into v_id;
  insert into public.configuracoes (empresa_id) values (v_id);
  update public.usuarios set empresa_id = v_id where id = auth.uid();
  insert into public.user_roles (user_id, role) values (auth.uid(), 'admin') on conflict do nothing;
  return v_id;
end; $$;
revoke all on function public.criar_empresa(text,text) from public;
grant execute on function public.criar_empresa(text,text) to authenticated;

-- ============ INDICES ============
create index idx_clientes_empresa on public.clientes(empresa_id);
create index idx_freelancers_empresa on public.freelancers(empresa_id);
create index idx_eventos_empresa on public.eventos(empresa_id);
create index idx_equipes_evento on public.equipes(evento_id);
create index idx_escalas_equipe on public.escalas(equipe_id);
create index idx_escalas_freelancer on public.escalas(freelancer_id);
create index idx_pontos_escala on public.pontos(escala_id);
create index idx_ocorrencias_escala on public.ocorrencias(escala_id);revoke all on function public.has_role(uuid, public.papel_usuario) from public, anon;
grant execute on function public.has_role(uuid, public.papel_usuario) to authenticated;

revoke all on function public.empresa_atual() from public, anon;
grant execute on function public.empresa_atual() to authenticated;

revoke all on function public.empresa_da_equipe(uuid) from public, anon;
grant execute on function public.empresa_da_equipe(uuid) to authenticated;

revoke all on function public.empresa_da_escala(uuid) from public, anon;
grant execute on function public.empresa_da_escala(uuid) to authenticated;

revoke all on function public.empresa_do_fechamento(uuid) from public, anon;
grant execute on function public.empresa_do_fechamento(uuid) to authenticated;

revoke all on function public.criar_empresa(text, text) from public, anon;
grant execute on function public.criar_empresa(text, text) to authenticated;

revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.tg_atualizado_em() from public, anon, authenticated;CREATE POLICY "selfies_select_empresa" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'selfies-ponto' AND (storage.foldername(name))[1] = public.empresa_atual()::text);-- Enums
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
$$;revoke all on function public.saldo_empresa(uuid) from public, anon;
grant execute on function public.saldo_empresa(uuid) to authenticated, service_role;alter table public.clientes
  add column if not exists cpf_cnpj text,
  add column if not exists email text,
  add column if not exists telefone text,
  add column if not exists parceiro_cliente_id text;

alter table public.empresas
  add column if not exists email_cobranca text;-- ============ papéis da plataforma ============
create type public.papel_plataforma as enum ('admin_master','suporte');

create table public.plataforma_usuarios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  papel papel_plataforma not null,
  criado_em timestamptz not null default now(),
  unique (user_id, papel)
);
grant select on public.plataforma_usuarios to authenticated;
grant all on public.plataforma_usuarios to service_role;
alter table public.plataforma_usuarios enable row level security;

create or replace function public.tem_papel_plataforma(_user_id uuid, _papel papel_plataforma)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.plataforma_usuarios where user_id = _user_id and papel = _papel);
$$;

create or replace function public.eh_equipe_plataforma()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.plataforma_usuarios where user_id = auth.uid());
$$;

create policy "plataforma_usuarios leitura" on public.plataforma_usuarios
  for select to authenticated
  using (user_id = auth.uid() or public.tem_papel_plataforma(auth.uid(),'admin_master'));
create policy "plataforma_usuarios escrita master" on public.plataforma_usuarios
  for all to authenticated
  using (public.tem_papel_plataforma(auth.uid(),'admin_master'))
  with check (public.tem_papel_plataforma(auth.uid(),'admin_master'));

-- ============ planos ============
create table public.planos (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  descricao text,
  modelo modelo_cobranca not null default 'percentual_evento',
  percentual numeric(6,3) not null default 0,
  taxa_fixa_pix numeric(12,2) not null default 0,
  mensalidade numeric(12,2) not null default 0,
  dias_trial integer not null default 0,
  ordem integer not null default 0,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
grant select on public.planos to authenticated;
grant insert, update, delete on public.planos to authenticated;
grant all on public.planos to service_role;
alter table public.planos enable row level security;
create policy "planos leitura" on public.planos for select to authenticated using (true);
create policy "planos escrita master" on public.planos for all to authenticated
  using (public.tem_papel_plataforma(auth.uid(),'admin_master'))
  with check (public.tem_papel_plataforma(auth.uid(),'admin_master'));
create trigger tg_planos_atualizado_em before update on public.planos
  for each row execute function public.tg_atualizado_em();

-- ============ cupons ============
create table public.cupons (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  tipo text not null default 'percentual' check (tipo in ('percentual','valor')),
  valor numeric(12,2) not null default 0,
  validade date,
  limite_usos integer,
  usos integer not null default 0,
  empresa_id uuid references public.empresas(id) on delete cascade,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
grant select, insert, update, delete on public.cupons to authenticated;
grant all on public.cupons to service_role;
alter table public.cupons enable row level security;
create policy "cupons leitura plataforma" on public.cupons for select to authenticated
  using (public.eh_equipe_plataforma() or empresa_id = public.empresa_atual());
create policy "cupons escrita master" on public.cupons for all to authenticated
  using (public.tem_papel_plataforma(auth.uid(),'admin_master'))
  with check (public.tem_papel_plataforma(auth.uid(),'admin_master'));
create trigger tg_cupons_atualizado_em before update on public.cupons
  for each row execute function public.tg_atualizado_em();

-- ============ assinaturas ============
create table public.assinaturas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null unique references public.empresas(id) on delete cascade,
  plano_id uuid references public.planos(id) on delete set null,
  status text not null default 'ativa' check (status in ('trial','ativa','bloqueada','cancelada')),
  trial_ate timestamptz,
  cupom_id uuid references public.cupons(id) on delete set null,
  percentual_override numeric(6,3),
  taxa_fixa_override numeric(12,2),
  mensalidade_override numeric(12,2),
  observacoes text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
grant select, insert, update, delete on public.assinaturas to authenticated;
grant all on public.assinaturas to service_role;
alter table public.assinaturas enable row level security;
create policy "assinaturas leitura" on public.assinaturas for select to authenticated
  using (empresa_id = public.empresa_atual() or public.eh_equipe_plataforma());
create policy "assinaturas escrita master" on public.assinaturas for all to authenticated
  using (public.tem_papel_plataforma(auth.uid(),'admin_master'))
  with check (public.tem_papel_plataforma(auth.uid(),'admin_master'));
create trigger tg_assinaturas_atualizado_em before update on public.assinaturas
  for each row execute function public.tg_atualizado_em();

-- ============ preço efetivo ============
create or replace function public.preco_efetivo(_empresa_id uuid)
returns table (
  modelo modelo_cobranca,
  percentual numeric,
  taxa_fixa_pix numeric,
  mensalidade numeric,
  status text,
  trial_ate timestamptz,
  em_trial boolean,
  plano_nome text,
  cupom_codigo text
)
language plpgsql stable security definer set search_path = public as $$
declare
  a public.assinaturas%rowtype;
  p public.planos%rowtype;
  c public.cupons%rowtype;
  v_modelo modelo_cobranca;
  v_perc numeric := 0;
  v_pix numeric := 0;
  v_mens numeric := 0;
  v_trial boolean := false;
begin
  select * into a from public.assinaturas where empresa_id = _empresa_id;
  if a.plano_id is not null then
    select * into p from public.planos where id = a.plano_id;
  end if;
  if a.cupom_id is not null then
    select * into c from public.cupons where id = a.cupom_id and ativo
      and (validade is null or validade >= current_date);
  end if;

  v_modelo := coalesce(p.modelo, 'percentual_evento');
  v_perc := coalesce(a.percentual_override, p.percentual, 0);
  v_pix := coalesce(a.taxa_fixa_override, p.taxa_fixa_pix, 0);
  v_mens := coalesce(a.mensalidade_override, p.mensalidade, 0);

  if c.id is not null then
    if c.tipo = 'percentual' then
      v_perc := round(v_perc * (1 - c.valor / 100.0), 3);
      v_mens := round(v_mens * (1 - c.valor / 100.0), 2);
      v_pix  := round(v_pix  * (1 - c.valor / 100.0), 2);
    else
      v_mens := greatest(v_mens - c.valor, 0);
    end if;
  end if;

  v_trial := a.trial_ate is not null and a.trial_ate > now();
  if v_trial or coalesce(a.status,'ativa') = 'trial' then
    v_perc := 0; v_pix := 0; v_mens := 0; v_trial := true;
  end if;

  return query select
    v_modelo, v_perc, v_pix, v_mens,
    coalesce(a.status,'ativa'), a.trial_ate, v_trial,
    p.nome, c.codigo;
end; $$;

-- ============ leitura cruzada para equipe da plataforma ============
create policy "plataforma le empresas" on public.empresas for select to authenticated using (public.eh_equipe_plataforma());
create policy "plataforma le usuarios" on public.usuarios for select to authenticated using (public.eh_equipe_plataforma());
create policy "plataforma le configuracoes" on public.configuracoes for select to authenticated using (public.eh_equipe_plataforma());
create policy "plataforma le clientes" on public.clientes for select to authenticated using (public.eh_equipe_plataforma());
create policy "plataforma le freelancers" on public.freelancers for select to authenticated using (public.eh_equipe_plataforma());
create policy "plataforma le eventos" on public.eventos for select to authenticated using (public.eh_equipe_plataforma());
create policy "plataforma le equipes" on public.equipes for select to authenticated using (public.eh_equipe_plataforma());
create policy "plataforma le escalas" on public.escalas for select to authenticated using (public.eh_equipe_plataforma());
create policy "plataforma le pontos" on public.pontos for select to authenticated using (public.eh_equipe_plataforma());
create policy "plataforma le ocorrencias" on public.ocorrencias for select to authenticated using (public.eh_equipe_plataforma());
create policy "plataforma le fechamentos" on public.fechamentos for select to authenticated using (public.eh_equipe_plataforma());
create policy "plataforma le pagamentos" on public.pagamentos for select to authenticated using (public.eh_equipe_plataforma());
create policy "plataforma le cobrancas" on public.cobrancas for select to authenticated using (public.eh_equipe_plataforma());
create policy "plataforma le taxas" on public.taxas_plataforma for select to authenticated using (public.eh_equipe_plataforma());
create policy "plataforma le movimentos" on public.movimentos_saldo for select to authenticated using (public.eh_equipe_plataforma());revoke execute on function public.tem_papel_plataforma(uuid, papel_plataforma) from public, anon;
revoke execute on function public.eh_equipe_plataforma() from public, anon;
revoke execute on function public.preco_efetivo(uuid) from public, anon;
grant execute on function public.tem_papel_plataforma(uuid, papel_plataforma) to authenticated, service_role;
grant execute on function public.eh_equipe_plataforma() to authenticated, service_role;
grant execute on function public.preco_efetivo(uuid) to authenticated, service_role;

create or replace function public.preco_efetivo(_empresa_id uuid)
returns table (
  modelo modelo_cobranca,
  percentual numeric,
  taxa_fixa_pix numeric,
  mensalidade numeric,
  status text,
  trial_ate timestamptz,
  em_trial boolean,
  plano_nome text,
  cupom_codigo text
)
language plpgsql stable security definer set search_path = public as $$
declare
  a public.assinaturas%rowtype;
  p public.planos%rowtype;
  c public.cupons%rowtype;
  v_modelo modelo_cobranca;
  v_perc numeric := 0;
  v_pix numeric := 0;
  v_mens numeric := 0;
  v_trial boolean := false;
begin
  if auth.uid() is not null
     and _empresa_id is distinct from public.empresa_atual()
     and not public.eh_equipe_plataforma() then
    raise exception 'sem acesso a esta agencia';
  end if;

  select * into a from public.assinaturas where empresa_id = _empresa_id;
  if a.plano_id is not null then
    select * into p from public.planos where id = a.plano_id;
  end if;
  if a.cupom_id is not null then
    select * into c from public.cupons where id = a.cupom_id and ativo
      and (validade is null or validade >= current_date);
  end if;

  v_modelo := coalesce(p.modelo, 'percentual_evento');
  v_perc := coalesce(a.percentual_override, p.percentual, 0);
  v_pix := coalesce(a.taxa_fixa_override, p.taxa_fixa_pix, 0);
  v_mens := coalesce(a.mensalidade_override, p.mensalidade, 0);

  if c.id is not null then
    if c.tipo = 'percentual' then
      v_perc := round(v_perc * (1 - c.valor / 100.0), 3);
      v_mens := round(v_mens * (1 - c.valor / 100.0), 2);
      v_pix  := round(v_pix  * (1 - c.valor / 100.0), 2);
    else
      v_mens := greatest(v_mens - c.valor, 0);
    end if;
  end if;

  v_trial := a.trial_ate is not null and a.trial_ate > now();
  if v_trial or coalesce(a.status,'ativa') = 'trial' then
    v_perc := 0; v_pix := 0; v_mens := 0; v_trial := true;
  end if;

  return query select
    v_modelo, v_perc, v_pix, v_mens,
    coalesce(a.status,'ativa'), a.trial_ate, v_trial,
    p.nome, c.codigo;
end; $$;ALTER TABLE public.taxas_plataforma
  ADD COLUMN IF NOT EXISTS cobranca_id uuid REFERENCES public.cobrancas(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS taxas_plataforma_cobranca_id_unq
  ON public.taxas_plataforma(cobranca_id)
  WHERE cobranca_id IS NOT NULL;create type public.tipo_pessoa as enum ('pf','pj');
create type public.status_funding as enum ('draft','pending','available','partially_reserved','reserved','consumed','refund_pending','refunded','failed','cancelled');
create type public.status_lote_pagamento as enum ('draft','awaiting_approval','approved','funding_pending','funded','processing','partially_paid','paid','failed','cancelled');
create type public.tipo_documento_fiscal as enum ('nfse','nfe','rpa','receipt','other');
create type public.status_documento_fiscal as enum ('pending','received','validated_manually','rejected','cancelled');

alter table public.clientes
  add column if not exists tipo_pessoa public.tipo_pessoa not null default 'pj',
  add column if not exists razao_social text,
  add column if not exists nome_fantasia text,
  add column if not exists ativo boolean not null default true,
  add column if not exists responsavel_nome text,
  add column if not exists responsavel_cargo text,
  add column if not exists canal_preferencial text,
  add column if not exists cep text,
  add column if not exists logradouro text,
  add column if not exists numero text,
  add column if not exists complemento text,
  add column if not exists bairro text,
  add column if not exists cidade text,
  add column if not exists uf text,
  add column if not exists codigo_municipio text,
  add column if not exists inscricao_municipal text,
  add column if not exists inscricao_estadual text,
  add column if not exists inscricao_estadual_isento boolean not null default false,
  add column if not exists regime_fiscal text,
  add column if not exists codigo_servico text,
  add column if not exists email_financeiro text,
  add column if not exists vencimento_preferencial integer;

update public.clientes
set razao_social = coalesce(razao_social, nome),
    nome_fantasia = coalesce(nome_fantasia, nome),
    email_financeiro = coalesce(email_financeiro, email)
where razao_social is null or nome_fantasia is null or email_financeiro is null;

alter table public.clientes
  add constraint clientes_documento_formato check (cpf_cnpj is null or cpf_cnpj ~ '^[0-9]{11}$|^[0-9]{14}$'),
  add constraint clientes_uf_formato check (uf is null or uf ~ '^[A-Z]{2}$'),
  add constraint clientes_cep_formato check (cep is null or cep ~ '^[0-9]{8}$'),
  add constraint clientes_vencimento_preferencial check (vencimento_preferencial is null or vencimento_preferencial between 1 and 31),
  add constraint clientes_canal_preferencial check (canal_preferencial is null or canal_preferencial in ('email','telefone','whatsapp'));
create unique index if not exists uq_clientes_empresa_documento on public.clientes(empresa_id, cpf_cnpj) where cpf_cnpj is not null;

create or replace function public.validar_cliente_evento_mesma_empresa()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.cliente_id is not null and not exists (
    select 1 from public.clientes c where c.id = new.cliente_id and c.empresa_id = new.empresa_id
  ) then raise exception 'cliente e evento devem pertencer a mesma organizacao'; end if;
  return new;
end; $$;
create trigger tg_eventos_cliente_mesma_empresa before insert or update of cliente_id, empresa_id on public.eventos for each row execute function public.validar_cliente_evento_mesma_empresa();
create trigger tg_cobrancas_cliente_mesma_empresa before insert or update of cliente_id, empresa_id on public.cobrancas for each row execute function public.validar_cliente_evento_mesma_empresa();

create or replace function public.tem_capacidade(_user_id uuid, _capacidade text)
returns boolean language sql stable security definer set search_path = public as $$
  select case _capacidade
    when 'cadastros.gerenciar' then public.has_role(_user_id,'admin') or public.has_role(_user_id,'coordenador')
    when 'configuracoes.gerenciar' then public.has_role(_user_id,'admin')
    when 'eventos.gerenciar' then public.has_role(_user_id,'admin') or public.has_role(_user_id,'coordenador')
    when 'operacao.supervisionar' then public.has_role(_user_id,'admin') or public.has_role(_user_id,'coordenador') or public.has_role(_user_id,'supervisor')
    when 'fechamento.aprovar' then public.has_role(_user_id,'admin') or public.has_role(_user_id,'coordenador')
    when 'financeiro.gerenciar' then public.has_role(_user_id,'admin') or public.has_role(_user_id,'financeiro')
    when 'relatorios.ver' then exists(select 1 from public.user_roles ur where ur.user_id = _user_id)
    else false end;
$$;
revoke all on function public.tem_capacidade(uuid,text) from public, anon;
grant execute on function public.tem_capacidade(uuid,text) to authenticated, service_role;

create table public.convites_equipe (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  email text not null,
  papel public.papel_usuario not null,
  token_hash text not null unique,
  convidado_por uuid not null,
  expira_em timestamptz not null,
  aceito_em timestamptz,
  revogado_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
grant select, insert, update, delete on public.convites_equipe to authenticated;
grant all on public.convites_equipe to service_role;
alter table public.convites_equipe enable row level security;
create policy "convites_admin" on public.convites_equipe for all to authenticated
 using (empresa_id = public.empresa_atual() and public.has_role(auth.uid(),'admin'))
 with check (empresa_id = public.empresa_atual() and public.has_role(auth.uid(),'admin'));
create trigger tg_convites_equipe_atualizado_em before update on public.convites_equipe for each row execute function public.tg_atualizado_em();

create table public.lotes_pagamento (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  evento_id uuid references public.eventos(id) on delete set null,
  descricao text not null,
  status public.status_lote_pagamento not null default 'draft',
  valor_total numeric(12,2) not null default 0 check (valor_total >= 0),
  aprovado_por uuid,
  aprovado_em timestamptz,
  chave_idempotencia text unique,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
grant select, insert, update, delete on public.lotes_pagamento to authenticated;
grant all on public.lotes_pagamento to service_role;
alter table public.lotes_pagamento enable row level security;
create policy "lotes_leitura" on public.lotes_pagamento for select to authenticated using (empresa_id = public.empresa_atual() or public.eh_equipe_plataforma());
create policy "lotes_financeiro_escrita" on public.lotes_pagamento for all to authenticated using (empresa_id = public.empresa_atual() and public.tem_capacidade(auth.uid(),'financeiro.gerenciar')) with check (empresa_id = public.empresa_atual() and public.tem_capacidade(auth.uid(),'financeiro.gerenciar'));
create trigger tg_lotes_pagamento_atualizado_em before update on public.lotes_pagamento for each row execute function public.tg_atualizado_em();

create table public.fundings (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  finalidade text not null,
  valor_total numeric(12,2) not null check (valor_total > 0),
  valor_disponivel numeric(12,2) not null default 0 check (valor_disponivel >= 0),
  valor_reservado numeric(12,2) not null default 0 check (valor_reservado >= 0),
  valor_utilizado numeric(12,2) not null default 0 check (valor_utilizado >= 0),
  valor_devolvido numeric(12,2) not null default 0 check (valor_devolvido >= 0),
  status public.status_funding not null default 'draft',
  cobranca_id uuid references public.cobrancas(id) on delete set null,
  referencia_parceiro text,
  chave_idempotencia text not null unique,
  criado_por uuid not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint fundings_soma_valida check (valor_disponivel + valor_reservado + valor_utilizado + valor_devolvido <= valor_total)
);
grant select, insert, update, delete on public.fundings to authenticated;
grant all on public.fundings to service_role;
alter table public.fundings enable row level security;
create policy "fundings_leitura" on public.fundings for select to authenticated using (empresa_id = public.empresa_atual() or public.eh_equipe_plataforma());
create policy "fundings_financeiro_escrita" on public.fundings for all to authenticated using (empresa_id = public.empresa_atual() and public.tem_capacidade(auth.uid(),'financeiro.gerenciar')) with check (empresa_id = public.empresa_atual() and public.tem_capacidade(auth.uid(),'financeiro.gerenciar'));
create trigger tg_fundings_atualizado_em before update on public.fundings for each row execute function public.tg_atualizado_em();

create table public.alocacoes_funding (
  id uuid primary key default gen_random_uuid(),
  funding_id uuid not null references public.fundings(id) on delete restrict,
  lote_id uuid not null references public.lotes_pagamento(id) on delete restrict,
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  valor_reservado numeric(12,2) not null check (valor_reservado > 0),
  valor_utilizado numeric(12,2) not null default 0 check (valor_utilizado >= 0 and valor_utilizado <= valor_reservado),
  valor_devolvido numeric(12,2) not null default 0 check (valor_devolvido >= 0 and valor_devolvido <= valor_reservado),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique(funding_id,lote_id)
);
grant select, insert, update, delete on public.alocacoes_funding to authenticated;
grant all on public.alocacoes_funding to service_role;
alter table public.alocacoes_funding enable row level security;
create policy "alocacoes_leitura" on public.alocacoes_funding for select to authenticated using (empresa_id = public.empresa_atual() or public.eh_equipe_plataforma());
create policy "alocacoes_financeiro_escrita" on public.alocacoes_funding for all to authenticated using (empresa_id = public.empresa_atual() and public.tem_capacidade(auth.uid(),'financeiro.gerenciar')) with check (empresa_id = public.empresa_atual() and public.tem_capacidade(auth.uid(),'financeiro.gerenciar'));
create trigger tg_alocacoes_funding_atualizado_em before update on public.alocacoes_funding for each row execute function public.tg_atualizado_em();

create table public.cobrancas_plataforma (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  assinatura_id uuid references public.assinaturas(id) on delete set null,
  tipo text not null check (tipo in ('assinatura','taxa_evento','taxa_pix','ajuste')),
  descricao text not null,
  competencia date,
  valor numeric(12,2) not null check (valor >= 0),
  status public.status_cobranca not null default 'rascunho',
  referencia_parceiro text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
grant select on public.cobrancas_plataforma to authenticated;
grant all on public.cobrancas_plataforma to service_role;
alter table public.cobrancas_plataforma enable row level security;
create policy "cobrancas_plataforma_leitura" on public.cobrancas_plataforma for select to authenticated using (empresa_id = public.empresa_atual() or public.eh_equipe_plataforma());
create trigger tg_cobrancas_plataforma_atualizado_em before update on public.cobrancas_plataforma for each row execute function public.tg_atualizado_em();

create table public.documentos_fiscais (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  cliente_id uuid references public.clientes(id) on delete set null,
  freelancer_id uuid references public.freelancers(id) on delete set null,
  evento_id uuid references public.eventos(id) on delete set null,
  pagamento_id uuid references public.pagamentos(id) on delete set null,
  cobranca_plataforma_id uuid references public.cobrancas_plataforma(id) on delete set null,
  tipo public.tipo_documento_fiscal not null,
  status public.status_documento_fiscal not null default 'pending',
  numero text,
  serie text,
  chave_acesso text,
  emissor_documento text,
  emissor_nome text,
  destinatario_documento text,
  destinatario_nome text,
  competencia date,
  valor numeric(12,2) check (valor is null or valor >= 0),
  arquivo_caminho text,
  arquivo_nome text,
  arquivo_tipo text,
  observacoes text,
  criado_por uuid not null,
  validado_por uuid,
  validado_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
grant select, insert, update, delete on public.documentos_fiscais to authenticated;
grant all on public.documentos_fiscais to service_role;
alter table public.documentos_fiscais enable row level security;
create policy "documentos_leitura" on public.documentos_fiscais for select to authenticated using (empresa_id = public.empresa_atual() or public.eh_equipe_plataforma());
create policy "documentos_organizacao_escrita" on public.documentos_fiscais for all to authenticated using (empresa_id = public.empresa_atual() and (public.tem_capacidade(auth.uid(),'financeiro.gerenciar') or public.tem_capacidade(auth.uid(),'cadastros.gerenciar'))) with check (empresa_id = public.empresa_atual() and (public.tem_capacidade(auth.uid(),'financeiro.gerenciar') or public.tem_capacidade(auth.uid(),'cadastros.gerenciar')));
create trigger tg_documentos_fiscais_atualizado_em before update on public.documentos_fiscais for each row execute function public.tg_atualizado_em();

create table public.logs_auditoria (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references public.empresas(id) on delete set null,
  ator_id uuid not null,
  ator_contexto text not null check (ator_contexto in ('organizacao','suporte','admin_master','sistema')),
  acao text not null,
  recurso_tipo text not null,
  recurso_id uuid,
  resultado text not null check (resultado in ('sucesso','falha')),
  detalhes jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now()
);
grant select on public.logs_auditoria to authenticated;
grant insert on public.logs_auditoria to authenticated;
grant all on public.logs_auditoria to service_role;
alter table public.logs_auditoria enable row level security;
create policy "auditoria_leitura" on public.logs_auditoria for select to authenticated using ((empresa_id = public.empresa_atual() and public.has_role(auth.uid(),'admin')) or public.eh_equipe_plataforma());
create policy "auditoria_insercao_propria" on public.logs_auditoria for insert to authenticated with check (ator_id = auth.uid() and (empresa_id is null or empresa_id = public.empresa_atual() or public.eh_equipe_plataforma()));

create index idx_convites_empresa on public.convites_equipe(empresa_id);
create index idx_fundings_empresa_status on public.fundings(empresa_id,status);
create index idx_lotes_empresa_status on public.lotes_pagamento(empresa_id,status);
create index idx_alocacoes_empresa on public.alocacoes_funding(empresa_id);
create index idx_cobrancas_plataforma_empresa on public.cobrancas_plataforma(empresa_id);
create index idx_documentos_empresa on public.documentos_fiscais(empresa_id);
create index idx_documentos_cliente on public.documentos_fiscais(cliente_id);
create index idx_logs_empresa_data on public.logs_auditoria(empresa_id,criado_em desc);

-- Escrita por capacidade nas tabelas operacionais existentes.
drop policy if exists "configuracoes_all" on public.configuracoes;
create policy "configuracoes_leitura" on public.configuracoes for select to authenticated using (empresa_id = public.empresa_atual() or public.eh_equipe_plataforma());
create policy "configuracoes_admin_escrita" on public.configuracoes for all to authenticated using (empresa_id = public.empresa_atual() and public.tem_capacidade(auth.uid(),'configuracoes.gerenciar')) with check (empresa_id = public.empresa_atual() and public.tem_capacidade(auth.uid(),'configuracoes.gerenciar'));

drop policy if exists "clientes_all" on public.clientes;
create policy "clientes_leitura" on public.clientes for select to authenticated using (empresa_id = public.empresa_atual() or public.eh_equipe_plataforma());
create policy "clientes_cadastro_escrita" on public.clientes for all to authenticated using (empresa_id = public.empresa_atual() and public.tem_capacidade(auth.uid(),'cadastros.gerenciar')) with check (empresa_id = public.empresa_atual() and public.tem_capacidade(auth.uid(),'cadastros.gerenciar'));

drop policy if exists "freelancers_all" on public.freelancers;
create policy "freelancers_leitura" on public.freelancers for select to authenticated using (empresa_id = public.empresa_atual() or public.eh_equipe_plataforma());
create policy "freelancers_cadastro_escrita" on public.freelancers for all to authenticated using (empresa_id = public.empresa_atual() and public.tem_capacidade(auth.uid(),'cadastros.gerenciar')) with check (empresa_id = public.empresa_atual() and public.tem_capacidade(auth.uid(),'cadastros.gerenciar'));

drop policy if exists "eventos_all" on public.eventos;
create policy "eventos_leitura" on public.eventos for select to authenticated using (empresa_id = public.empresa_atual() or public.eh_equipe_plataforma());
create policy "eventos_gestao_escrita" on public.eventos for all to authenticated using (empresa_id = public.empresa_atual() and public.tem_capacidade(auth.uid(),'eventos.gerenciar')) with check (empresa_id = public.empresa_atual() and public.tem_capacidade(auth.uid(),'eventos.gerenciar'));

drop policy if exists "equipes_all" on public.equipes;
create policy "equipes_leitura" on public.equipes for select to authenticated using (public.empresa_da_equipe(id) = public.empresa_atual() or public.eh_equipe_plataforma());
create policy "equipes_gestao_escrita" on public.equipes for all to authenticated using (public.empresa_da_equipe(id) = public.empresa_atual() and public.tem_capacidade(auth.uid(),'eventos.gerenciar')) with check (exists(select 1 from public.eventos e where e.id = equipes.evento_id and e.empresa_id = public.empresa_atual()) and public.tem_capacidade(auth.uid(),'eventos.gerenciar'));

drop policy if exists "escalas_all" on public.escalas;
create policy "escalas_leitura" on public.escalas for select to authenticated using (public.empresa_da_equipe(equipe_id) = public.empresa_atual() or public.eh_equipe_plataforma());
create policy "escalas_gestao_escrita" on public.escalas for all to authenticated using (public.empresa_da_equipe(equipe_id) = public.empresa_atual() and public.tem_capacidade(auth.uid(),'eventos.gerenciar')) with check (public.empresa_da_equipe(equipe_id) = public.empresa_atual() and public.tem_capacidade(auth.uid(),'eventos.gerenciar'));

drop policy if exists "pontos_all" on public.pontos;
create policy "pontos_leitura" on public.pontos for select to authenticated using (public.empresa_da_escala(escala_id) = public.empresa_atual() or public.eh_equipe_plataforma());
create policy "pontos_operacao_escrita" on public.pontos for all to authenticated using (public.empresa_da_escala(escala_id) = public.empresa_atual() and public.tem_capacidade(auth.uid(),'operacao.supervisionar')) with check (public.empresa_da_escala(escala_id) = public.empresa_atual() and public.tem_capacidade(auth.uid(),'operacao.supervisionar'));

drop policy if exists "ocorrencias_all" on public.ocorrencias;
create policy "ocorrencias_leitura" on public.ocorrencias for select to authenticated using (public.empresa_da_escala(escala_id) = public.empresa_atual() or public.eh_equipe_plataforma());
create policy "ocorrencias_operacao_escrita" on public.ocorrencias for all to authenticated using (public.empresa_da_escala(escala_id) = public.empresa_atual() and public.tem_capacidade(auth.uid(),'operacao.supervisionar')) with check (public.empresa_da_escala(escala_id) = public.empresa_atual() and public.tem_capacidade(auth.uid(),'operacao.supervisionar'));

drop policy if exists "fechamentos_all" on public.fechamentos;
create policy "fechamentos_leitura" on public.fechamentos for select to authenticated using (public.empresa_da_escala(escala_id) = public.empresa_atual() or public.eh_equipe_plataforma());
create policy "fechamentos_aprovacao_escrita" on public.fechamentos for all to authenticated using (public.empresa_da_escala(escala_id) = public.empresa_atual() and public.tem_capacidade(auth.uid(),'fechamento.aprovar')) with check (public.empresa_da_escala(escala_id) = public.empresa_atual() and public.tem_capacidade(auth.uid(),'fechamento.aprovar'));

drop policy if exists "pagamentos_all" on public.pagamentos;
create policy "pagamentos_leitura" on public.pagamentos for select to authenticated using (public.empresa_do_fechamento(fechamento_id) = public.empresa_atual() or public.eh_equipe_plataforma());
create policy "pagamentos_financeiro_escrita" on public.pagamentos for all to authenticated using (public.empresa_do_fechamento(fechamento_id) = public.empresa_atual() and public.tem_capacidade(auth.uid(),'financeiro.gerenciar')) with check (public.empresa_do_fechamento(fechamento_id) = public.empresa_atual() and public.tem_capacidade(auth.uid(),'financeiro.gerenciar'));

revoke all on function public.validar_cliente_evento_mesma_empresa() from public, anon, authenticated;
grant execute on function public.validar_cliente_evento_mesma_empresa() to service_role;create or replace function public.tem_capacidade(_user_id uuid, _capacidade text)
returns boolean language sql stable security invoker set search_path = public as $$
  select case _capacidade
    when 'cadastros.gerenciar' then public.has_role(_user_id,'admin') or public.has_role(_user_id,'coordenador')
    when 'configuracoes.gerenciar' then public.has_role(_user_id,'admin')
    when 'eventos.gerenciar' then public.has_role(_user_id,'admin') or public.has_role(_user_id,'coordenador')
    when 'operacao.supervisionar' then public.has_role(_user_id,'admin') or public.has_role(_user_id,'coordenador') or public.has_role(_user_id,'supervisor')
    when 'fechamento.aprovar' then public.has_role(_user_id,'admin') or public.has_role(_user_id,'coordenador')
    when 'financeiro.gerenciar' then public.has_role(_user_id,'admin') or public.has_role(_user_id,'financeiro')
    when 'relatorios.ver' then exists(select 1 from public.user_roles ur where ur.user_id = _user_id)
    else false end;
$$;
revoke all on function public.tem_capacidade(uuid,text) from public, anon;
grant execute on function public.tem_capacidade(uuid,text) to authenticated, service_role;create policy "documentos_fiscais_storage_leitura"
on storage.objects for select to authenticated
using (
  bucket_id = 'documentos-fiscais'
  and (
    (storage.foldername(name))[1] = public.empresa_atual()::text
    or public.eh_equipe_plataforma()
  )
);

create policy "documentos_fiscais_storage_insercao"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'documentos-fiscais'
  and (storage.foldername(name))[1] = public.empresa_atual()::text
  and (
    public.tem_capacidade(auth.uid(),'financeiro.gerenciar')
    or public.tem_capacidade(auth.uid(),'cadastros.gerenciar')
  )
);

create policy "documentos_fiscais_storage_atualizacao"
on storage.objects for update to authenticated
using (
  bucket_id = 'documentos-fiscais'
  and (storage.foldername(name))[1] = public.empresa_atual()::text
  and (
    public.tem_capacidade(auth.uid(),'financeiro.gerenciar')
    or public.tem_capacidade(auth.uid(),'cadastros.gerenciar')
  )
)
with check (
  bucket_id = 'documentos-fiscais'
  and (storage.foldername(name))[1] = public.empresa_atual()::text
  and (
    public.tem_capacidade(auth.uid(),'financeiro.gerenciar')
    or public.tem_capacidade(auth.uid(),'cadastros.gerenciar')
  )
);

create policy "documentos_fiscais_storage_exclusao"
on storage.objects for delete to authenticated
using (
  bucket_id = 'documentos-fiscais'
  and (storage.foldername(name))[1] = public.empresa_atual()::text
  and public.has_role(auth.uid(),'admin')
);drop policy if exists "empresas_insert" on public.empresas;
revoke insert on public.empresas from authenticated;-- Cadastro fiscal mínimo da empresa antes de liberar pagamentos Pix.
alter table public.empresas
  add column if not exists razao_social text,
  add column if not exists regime_fiscal text,
  add column if not exists municipio text,
  add column if not exists uf text,
  add column if not exists codigo_servico text,
  add column if not exists fiscal_status text not null default 'incompleto',
  add column if not exists fiscal_validado_em timestamptz,
  add column if not exists fiscal_validado_por uuid references auth.users(id) on delete set null;

alter table public.empresas
  drop constraint if exists empresas_fiscal_status_check;

alter table public.empresas
  add constraint empresas_fiscal_status_check
  check (fiscal_status in ('incompleto', 'pendente', 'validado', 'rejeitado'));

create or replace function public.empresa_fiscal_validada(_empresa_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.empresas e
    where e.id = _empresa_id
      and e.fiscal_status = 'validado'
      and e.cnpj is not null
      and nullif(trim(e.razao_social), '') is not null
      and nullif(trim(e.regime_fiscal), '') is not null
      and nullif(trim(e.municipio), '') is not null
      and nullif(trim(e.uf), '') is not null
      and nullif(trim(e.codigo_servico), '') is not null
  );
$$;

revoke all on function public.empresa_fiscal_validada(uuid) from public, anon;
grant execute on function public.empresa_fiscal_validada(uuid) to authenticated, service_role;-- Evolui o cadastro legado de freelancers para suportar Frela e CLT.
alter table public.freelancers
  add column if not exists tipo_vinculo text not null default 'frela',
  add column if not exists salario_mensal numeric(12,2);

alter table public.freelancers
  drop constraint if exists freelancers_tipo_vinculo_check;

alter table public.freelancers
  add constraint freelancers_tipo_vinculo_check
  check (tipo_vinculo in ('frela', 'clt'));

alter table public.freelancers
  drop constraint if exists freelancers_salario_mensal_check;

alter table public.freelancers
  add constraint freelancers_salario_mensal_check
  check (salario_mensal is null or salario_mensal > 0);-- Folha mensal CLT separada do fechamento por evento dos Frelas.
create table public.folhas_clt (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  freelancer_id uuid not null references public.freelancers(id) on delete restrict,
  competencia date not null,
  salario_base numeric(12,2) not null check (salario_base > 0),
  dias_base integer not null default 30 check (dias_base > 0),
  faltas_nao_justificadas integer not null default 0 check (faltas_nao_justificadas >= 0),
  desconto_calculado numeric(12,2) not null default 0 check (desconto_calculado >= 0),
  desconto_abonado boolean not null default false,
  valor_final numeric(12,2) not null check (valor_final >= 0),
  status text not null default 'rascunho' check (status in ('rascunho','pendente_aprovacao','aprovada','paga')),
  decidido_por uuid references public.usuarios(id) on delete set null,
  decidido_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (freelancer_id, competencia)
);

create table public.faltas_clt (
  id uuid primary key default gen_random_uuid(),
  folha_id uuid not null references public.folhas_clt(id) on delete cascade,
  data_falta date not null,
  justificada boolean not null default false,
  justificativa text,
  criado_em timestamptz not null default now(),
  unique (folha_id, data_falta)
);

grant select, insert, update, delete on public.folhas_clt, public.faltas_clt to authenticated;
grant all on public.folhas_clt, public.faltas_clt to service_role;
alter table public.folhas_clt enable row level security;
alter table public.faltas_clt enable row level security;

create policy "folhas_clt_leitura" on public.folhas_clt for select to authenticated
  using (empresa_id = public.empresa_atual() or public.eh_equipe_plataforma());
create policy "folhas_clt_escrita" on public.folhas_clt for all to authenticated
  using (empresa_id = public.empresa_atual() and public.tem_capacidade(auth.uid(),'financeiro.gerenciar'))
  with check (empresa_id = public.empresa_atual() and public.tem_capacidade(auth.uid(),'financeiro.gerenciar'));
create policy "faltas_clt_leitura" on public.faltas_clt for select to authenticated
  using (exists (select 1 from public.folhas_clt f where f.id = folha_id and (f.empresa_id = public.empresa_atual() or public.eh_equipe_plataforma())));
create policy "faltas_clt_escrita" on public.faltas_clt for all to authenticated
  using (exists (select 1 from public.folhas_clt f where f.id = folha_id and f.empresa_id = public.empresa_atual() and public.tem_capacidade(auth.uid(),'financeiro.gerenciar')))
  with check (exists (select 1 from public.folhas_clt f where f.id = folha_id and f.empresa_id = public.empresa_atual() and public.tem_capacidade(auth.uid(),'financeiro.gerenciar')));

create trigger tg_folhas_clt_atualizado_em before update on public.folhas_clt
  for each row execute function public.tg_atualizado_em();

create index idx_folhas_clt_empresa_competencia on public.folhas_clt(empresa_id, competencia desc);-- FASE 2B-2: hardening de propriedade financeira e isolamento multi-tenant em banco
-- Objetivo: garantir que registros financeiros só possam ser ligados a recursos da mesma empresa,
-- e que apenas perfis com capacidade financeira alterem esses registros.
--
-- SUPABASE-SPECIFIC: SIM
-- MIGRATION GCP: NECESSARIA
-- MOTIVO: esta migração mantém e reforça políticas RLS, helpers do Supabase (auth.uid(), empresa_atual(),
-- public.tem_capacidade(), public.eh_equipe_plataforma()), além do uso do modelo atual de autenticação e
-- autorização do Supabase. Isso é necessário para o sistema atual, mas deve ser tratado como dependência
-- explícita de migração futura para uma arquitetura GCP/FastAPI/PostgreSQL.
--
-- PORTABILITY: a regra de negócio que define ownership e isolamento é implementada em PostgreSQL padrão
-- (triggers + policies + checks). Porém a autenticação e o contexto atual continuam sendo específicos do
-- Supabase e serão reavaliados em fase futura de migração.

create or replace function public.empresa_do_pagamento(_pagamento_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select public.empresa_do_fechamento(p.fechamento_id)
  from public.pagamentos p
  where p.id = _pagamento_id;
$$;

create or replace function public.empresa_da_cobranca(_cobranca_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select empresa_id from public.cobrancas where id = _cobranca_id;
$$;

create or replace function public.empresa_da_taxa(_taxa_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select empresa_id from public.taxas_plataforma where id = _taxa_id;
$$;

create or replace function public.empresa_do_movimento(_movimento_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select empresa_id from public.movimentos_saldo where id = _movimento_id;
$$;

revoke all on function public.empresa_do_pagamento(uuid) from public, anon;
revoke all on function public.empresa_da_cobranca(uuid) from public, anon;
revoke all on function public.empresa_da_taxa(uuid) from public, anon;
revoke all on function public.empresa_do_movimento(uuid) from public, anon;

grant execute on function public.empresa_do_pagamento(uuid) to authenticated, service_role;
grant execute on function public.empresa_da_cobranca(uuid) to authenticated, service_role;
grant execute on function public.empresa_da_taxa(uuid) to authenticated, service_role;
grant execute on function public.empresa_do_movimento(uuid) to authenticated, service_role;

create or replace function public.validar_taxa_mesma_empresa()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.empresa_id is null then
    raise exception 'taxa_plataforma precisa de empresa_id';
  end if;

  if new.evento_id is not null and exists (
    select 1 from public.eventos e where e.id = new.evento_id and e.empresa_id <> new.empresa_id
  ) then
    raise exception 'evento da taxa deve pertencer à mesma empresa';
  end if;

  if new.cobranca_id is not null and exists (
    select 1 from public.cobrancas c where c.id = new.cobranca_id and c.empresa_id <> new.empresa_id
  ) then
    raise exception 'cobranca da taxa deve pertencer à mesma empresa';
  end if;

  if new.pagamento_id is not null and exists (
    select 1 from public.pagamentos p
    where p.id = new.pagamento_id
      and public.empresa_do_pagamento(p.id) is distinct from new.empresa_id
  ) then
    raise exception 'pagamento da taxa deve pertencer à mesma empresa';
  end if;

  return new;
end;
$$;

create or replace function public.validar_movimento_mesma_empresa()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.empresa_id is null then
    raise exception 'movimento_saldo precisa de empresa_id';
  end if;

  if new.cobranca_id is not null and exists (
    select 1 from public.cobrancas c where c.id = new.cobranca_id and c.empresa_id <> new.empresa_id
  ) then
    raise exception 'movimento e cobranca devem pertencer à mesma empresa';
  end if;

  if new.pagamento_id is not null and exists (
    select 1 from public.pagamentos p
    where p.id = new.pagamento_id
      and public.empresa_do_pagamento(p.id) is distinct from new.empresa_id
  ) then
    raise exception 'movimento e pagamento devem pertencer à mesma empresa';
  end if;

  if new.taxa_id is not null and exists (
    select 1 from public.taxas_plataforma t where t.id = new.taxa_id and t.empresa_id <> new.empresa_id
  ) then
    raise exception 'movimento e taxa devem pertencer à mesma empresa';
  end if;

  return new;
end;
$$;

create or replace function public.validar_funding_mesma_empresa()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.empresa_id is null then
    raise exception 'funding precisa de empresa_id';
  end if;

  if new.cobranca_id is not null and exists (
    select 1 from public.cobrancas c where c.id = new.cobranca_id and c.empresa_id <> new.empresa_id
  ) then
    raise exception 'funding e cobranca devem pertencer à mesma empresa';
  end if;

  return new;
end;
$$;

drop trigger if exists tg_taxas_plataforma_mesma_empresa on public.taxas_plataforma;
create trigger tg_taxas_plataforma_mesma_empresa
before insert or update of empresa_id, evento_id, cobranca_id, pagamento_id
on public.taxas_plataforma
for each row execute function public.validar_taxa_mesma_empresa();

drop trigger if exists tg_movimentos_saldo_mesma_empresa on public.movimentos_saldo;
create trigger tg_movimentos_saldo_mesma_empresa
before insert or update of empresa_id, cobranca_id, pagamento_id, taxa_id
on public.movimentos_saldo
for each row execute function public.validar_movimento_mesma_empresa();

drop trigger if exists tg_fundings_mesma_empresa on public.fundings;
create trigger tg_fundings_mesma_empresa
before insert or update of empresa_id, cobranca_id
on public.fundings
for each row execute function public.validar_funding_mesma_empresa();

drop policy if exists "cobrancas_all" on public.cobrancas;
create policy "cobrancas_leitura" on public.cobrancas for select to authenticated
  using (empresa_id = public.empresa_atual() or public.eh_equipe_plataforma());
create policy "cobrancas_financeiro_escrita" on public.cobrancas for all to authenticated
  using (empresa_id = public.empresa_atual() and public.tem_capacidade(auth.uid(),'financeiro.gerenciar'))
  with check (empresa_id = public.empresa_atual() and public.tem_capacidade(auth.uid(),'financeiro.gerenciar'));

drop policy if exists "taxas_all" on public.taxas_plataforma;
create policy "taxas_leitura" on public.taxas_plataforma for select to authenticated
  using (empresa_id = public.empresa_atual() or public.eh_equipe_plataforma());
create policy "taxas_financeiro_escrita" on public.taxas_plataforma for all to authenticated
  using (empresa_id = public.empresa_atual() and public.tem_capacidade(auth.uid(),'financeiro.gerenciar'))
  with check (empresa_id = public.empresa_atual() and public.tem_capacidade(auth.uid(),'financeiro.gerenciar'));

drop policy if exists "movimentos_all" on public.movimentos_saldo;
create policy "movimentos_leitura" on public.movimentos_saldo for select to authenticated
  using (empresa_id = public.empresa_atual() or public.eh_equipe_plataforma());
create policy "movimentos_financeiro_escrita" on public.movimentos_saldo for all to authenticated
  using (empresa_id = public.empresa_atual() and public.tem_capacidade(auth.uid(),'financeiro.gerenciar'))
  with check (empresa_id = public.empresa_atual() and public.tem_capacidade(auth.uid(),'financeiro.gerenciar'));

-- Reforço de fechamento/pagamento: leitura e escrita permanecem restritas à empresa e à capacidade.
create policy "fechamentos_financeiro_escrita" on public.fechamentos
  for update to authenticated
  using (public.empresa_da_escala(escala_id) = public.empresa_atual() and public.tem_capacidade(auth.uid(),'financeiro.gerenciar'))
  with check (public.empresa_da_escala(escala_id) = public.empresa_atual() and public.tem_capacidade(auth.uid(),'financeiro.gerenciar'));

create policy "pagamentos_financeiro_escrita_forte" on public.pagamentos
  for update to authenticated
  using (public.empresa_do_fechamento(fechamento_id) = public.empresa_atual() and public.tem_capacidade(auth.uid(),'financeiro.gerenciar'))
  with check (public.empresa_do_fechamento(fechamento_id) = public.empresa_atual() and public.tem_capacidade(auth.uid(),'financeiro.gerenciar'));

create policy "fundings_financeiro_escrita_forte" on public.fundings
  for update to authenticated
  using (empresa_id = public.empresa_atual() and public.tem_capacidade(auth.uid(),'financeiro.gerenciar'))
  with check (empresa_id = public.empresa_atual() and public.tem_capacidade(auth.uid(),'financeiro.gerenciar'));
create table if not exists public.webhook_eventos (
  id uuid primary key default gen_random_uuid(),
  chave_idempotencia text not null unique,
  evento text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'processado' check (status in ('processado','falha')),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

grant select, insert on public.webhook_eventos to authenticated;
grant all on public.webhook_eventos to service_role;

alter table public.webhook_eventos enable row level security;

create policy "webhook_eventos_leitura" on public.webhook_eventos
for select to authenticated
using (public.eh_equipe_plataforma());

create policy "webhook_eventos_insercao" on public.webhook_eventos
for insert to authenticated
with check (public.eh_equipe_plataforma() or auth.uid() is not null);

create trigger tg_webhook_eventos_atualizado_em
before update on public.webhook_eventos
for each row execute function public.tg_atualizado_em();

create index if not exists idx_webhook_eventos_status on public.webhook_eventos(status, criado_em desc);
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
);CREATE OR REPLACE FUNCTION public.validar_sequencia_novo_ponto()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tipos tipo_ponto[];
  v_esperado tipo_ponto;
BEGIN
  IF NEW.status = 'recusado' THEN
    RETURN NEW;
  END IF;

  SELECT coalesce(array_agg(p.tipo ORDER BY p.registrado_em, p.criado_em), ARRAY[]::tipo_ponto[])
  INTO v_tipos
  FROM public.pontos p
  WHERE p.escala_id = NEW.escala_id
    AND p.status <> 'recusado';

  IF array_length(v_tipos, 1) IS NULL THEN
    v_esperado := 'entrada';
  ELSIF array_length(v_tipos, 1) = 1 AND v_tipos[1] = 'entrada' THEN
    v_esperado := 'inicio_intervalo';
  ELSIF array_length(v_tipos, 1) = 2 AND v_tipos[1] = 'entrada' AND v_tipos[2] = 'inicio_intervalo' THEN
    v_esperado := 'fim_intervalo';
  ELSIF array_length(v_tipos, 1) = 3 AND v_tipos[1] = 'entrada' AND v_tipos[2] = 'inicio_intervalo' AND v_tipos[3] = 'fim_intervalo' THEN
    v_esperado := 'saida';
  ELSE
    RAISE EXCEPTION 'A sequência de ponto desta escala precisa ser corrigida pelo supervisor.';
  END IF;

  IF NEW.tipo <> v_esperado THEN
    RAISE EXCEPTION 'Registro fora da sequência esperada. Próximo registro: %.', v_esperado;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER tg_pontos_validar_sequencia
BEFORE INSERT ON public.pontos
FOR EACH ROW EXECUTE FUNCTION public.validar_sequencia_novo_ponto();
-- Planos V2: tudo configurável
ALTER TABLE public.planos
  ADD COLUMN IF NOT EXISTS codigo text UNIQUE,
  ADD COLUMN IF NOT EXISTS participacoes_incluidas integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_excedente numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS limite_eventos_ciclo integer,
  ADD COLUMN IF NOT EXISTS limite_pessoas_evento integer,
  ADD COLUMN IF NOT EXISTS limite_clt integer,
  ADD COLUMN IF NOT EXISTS limite_supervisores integer,
  ADD COLUMN IF NOT EXISTS retencao_evidencias_dias integer,
  ADD COLUMN IF NOT EXISTS aviso_vendas_acima integer,
  ADD COLUMN IF NOT EXISTS recursos jsonb NOT NULL DEFAULT '{}'::jsonb;
COMMENT ON COLUMN public.planos.percentual IS 'DEPRECATED: cobrança percentual sobre evento descartada na V2';
COMMENT ON COLUMN public.planos.taxa_fixa_pix IS 'DEPRECATED: substituída pelo excedente de participações';
COMMENT ON COLUMN public.planos.modelo IS 'DEPRECATED: V2 usa mensalidade + excedente de participações';

ALTER TABLE public.assinaturas ADD COLUMN IF NOT EXISTS inicio_ciclo timestamptz NOT NULL DEFAULT now();
UPDATE public.assinaturas SET inicio_ciclo = criado_em;
COMMENT ON COLUMN public.assinaturas.percentual_override IS 'DEPRECATED: cobrança percentual descartada na V2';
COMMENT ON COLUMN public.assinaturas.taxa_fixa_override IS 'DEPRECATED: cobrança por Pix descartada na V2';
COMMENT ON TABLE public.taxas_plataforma IS 'DEPRECATED para novos lançamentos: histórico do modelo percentual/Asaas';

-- Participações operacionais deduplicadas (pessoa x evento)
CREATE TABLE public.participacoes_operacionais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  evento_id uuid NOT NULL REFERENCES public.eventos(id) ON DELETE CASCADE,
  freelancer_id uuid NOT NULL REFERENCES public.freelancers(id) ON DELETE CASCADE,
  data_evento timestamptz NOT NULL,
  ativa boolean NOT NULL DEFAULT true,
  primeira_confirmacao_em timestamptz NOT NULL DEFAULT now(),
  desativada_em timestamptz,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (evento_id, freelancer_id)
);
CREATE INDEX idx_participacoes_empresa_data ON public.participacoes_operacionais(empresa_id, data_evento) WHERE ativa;
GRANT SELECT ON public.participacoes_operacionais TO authenticated;
GRANT ALL ON public.participacoes_operacionais TO service_role;
ALTER TABLE public.participacoes_operacionais ENABLE ROW LEVEL SECURITY;
CREATE POLICY participacoes_leitura ON public.participacoes_operacionais FOR SELECT TO authenticated
  USING (empresa_id = public.empresa_atual() OR public.eh_equipe_plataforma());

-- Faturas SaaS
CREATE TABLE public.faturas_plataforma (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  assinatura_id uuid REFERENCES public.assinaturas(id),
  plano_id uuid REFERENCES public.planos(id),
  plano_nome text NOT NULL,
  ciclo_inicio timestamptz NOT NULL,
  ciclo_fim timestamptz NOT NULL,
  mensalidade numeric(12,2) NOT NULL,
  participacoes_incluidas integer NOT NULL,
  participacoes_usadas integer NOT NULL,
  participacoes_excedentes integer NOT NULL,
  valor_excedente_unit numeric(12,2) NOT NULL,
  valor_excedente_total numeric(12,2) NOT NULL,
  desconto numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL,
  clt_ativos integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','paga','atrasada','cancelada','falha')),
  vencimento date NOT NULL,
  pago_em timestamptz,
  provedor text,
  referencia_provedor text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, ciclo_inicio)
);
GRANT SELECT ON public.faturas_plataforma TO authenticated;
GRANT ALL ON public.faturas_plataforma TO service_role;
ALTER TABLE public.faturas_plataforma ENABLE ROW LEVEL SECURITY;
CREATE POLICY faturas_leitura ON public.faturas_plataforma FOR SELECT TO authenticated
  USING (empresa_id = public.empresa_atual() OR public.eh_equipe_plataforma());
CREATE TRIGGER tg_faturas_atualizado_em BEFORE UPDATE ON public.faturas_plataforma FOR EACH ROW EXECUTE FUNCTION public.tg_atualizado_em();

-- Histórico de assinatura (conversão Free -> pago) e de planos
CREATE TABLE public.assinaturas_historico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  plano_anterior_id uuid REFERENCES public.planos(id),
  plano_novo_id uuid REFERENCES public.planos(id),
  alterado_por uuid,
  criado_em timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.assinaturas_historico TO authenticated;
GRANT ALL ON public.assinaturas_historico TO service_role;
ALTER TABLE public.assinaturas_historico ENABLE ROW LEVEL SECURITY;
CREATE POLICY assinaturas_historico_leitura ON public.assinaturas_historico FOR SELECT TO authenticated
  USING (public.eh_equipe_plataforma());

CREATE TABLE public.planos_historico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plano_id uuid NOT NULL REFERENCES public.planos(id) ON DELETE CASCADE,
  alterado_por uuid,
  antes jsonb NOT NULL,
  depois jsonb NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.planos_historico TO authenticated;
GRANT ALL ON public.planos_historico TO service_role;
ALTER TABLE public.planos_historico ENABLE ROW LEVEL SECURITY;
CREATE POLICY planos_historico_leitura ON public.planos_historico FOR SELECT TO authenticated
  USING (public.eh_equipe_plataforma());

-- Taxas do meio de pagamento (custo repassável, nunca receita)
CREATE TABLE public.taxas_meio_pagamento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metodo text NOT NULL UNIQUE,
  rotulo text NOT NULL,
  taxa numeric(7,5) NOT NULL CHECK (taxa >= 0 AND taxa < 1),
  ativo boolean NOT NULL DEFAULT true,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.taxas_meio_pagamento TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.taxas_meio_pagamento TO authenticated;
GRANT ALL ON public.taxas_meio_pagamento TO service_role;
ALTER TABLE public.taxas_meio_pagamento ENABLE ROW LEVEL SECURITY;
CREATE POLICY taxas_meio_leitura ON public.taxas_meio_pagamento FOR SELECT TO authenticated USING (true);
CREATE POLICY taxas_meio_escrita ON public.taxas_meio_pagamento FOR ALL TO authenticated
  USING (public.tem_papel_plataforma(auth.uid(),'admin_master'))
  WITH CHECK (public.tem_papel_plataforma(auth.uid(),'admin_master'));
CREATE TRIGGER tg_taxas_meio_atualizado_em BEFORE UPDATE ON public.taxas_meio_pagamento FOR EACH ROW EXECUTE FUNCTION public.tg_atualizado_em();

CREATE TABLE public.custos_meio_pagamento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  fatura_id uuid REFERENCES public.faturas_plataforma(id),
  cobranca_id uuid REFERENCES public.cobrancas(id),
  metodo text NOT NULL,
  taxa_aplicada numeric(7,5) NOT NULL,
  valor_liquido numeric(12,2) NOT NULL,
  valor_cobrado numeric(12,2) NOT NULL,
  custo numeric(12,2) NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.custos_meio_pagamento TO authenticated;
GRANT ALL ON public.custos_meio_pagamento TO service_role;
ALTER TABLE public.custos_meio_pagamento ENABLE ROW LEVEL SECURITY;
CREATE POLICY custos_meio_leitura ON public.custos_meio_pagamento FOR SELECT TO authenticated
  USING (empresa_id = public.empresa_atual() OR public.eh_equipe_plataforma());

-- Ciclo ancorado na data da assinatura
CREATE OR REPLACE FUNCTION public.ciclo_da_empresa(_empresa_id uuid, _ref timestamptz DEFAULT now())
RETURNS TABLE(inicio timestamptz, fim timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_anchor timestamptz; v_n integer; v_age interval;
BEGIN
  SELECT coalesce(a.inicio_ciclo, e.criado_em) INTO v_anchor
  FROM public.empresas e LEFT JOIN public.assinaturas a ON a.empresa_id = e.id
  WHERE e.id = _empresa_id;
  IF v_anchor IS NULL THEN v_anchor := date_trunc('month', _ref); END IF;
  IF _ref < v_anchor THEN
    RETURN QUERY SELECT v_anchor, v_anchor + interval '1 month'; RETURN;
  END IF;
  v_age := age(_ref, v_anchor);
  v_n := (extract(year FROM v_age) * 12 + extract(month FROM v_age))::int;
  IF v_anchor + make_interval(months => v_n) > _ref THEN v_n := v_n - 1; END IF;
  RETURN QUERY SELECT v_anchor + make_interval(months => v_n), v_anchor + make_interval(months => v_n + 1);
END; $$;

CREATE OR REPLACE FUNCTION public.plano_da_empresa(_empresa_id uuid)
RETURNS public.planos
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(
    (SELECT p FROM public.assinaturas a JOIN public.planos p ON p.id = a.plano_id WHERE a.empresa_id = _empresa_id),
    (SELECT p FROM public.planos p WHERE p.codigo = 'free')
  );
$$;

CREATE OR REPLACE FUNCTION public.recurso_habilitado(_empresa_id uuid, _recurso text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(((public.plano_da_empresa(_empresa_id)).recursos ->> _recurso)::boolean, false);
$$;

CREATE OR REPLACE FUNCTION public.contar_participacoes_ciclo(_empresa_id uuid, _ref timestamptz DEFAULT now())
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::int FROM public.participacoes_operacionais p, public.ciclo_da_empresa(_empresa_id, _ref) c
  WHERE p.empresa_id = _empresa_id AND p.ativa AND p.data_evento >= c.inicio AND p.data_evento < c.fim;
$$;

CREATE OR REPLACE FUNCTION public.contar_clt_ativos(_empresa_id uuid)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::int FROM public.freelancers WHERE empresa_id = _empresa_id AND tipo_vinculo = 'clt' AND ativo;
$$;

CREATE OR REPLACE FUNCTION public.contar_eventos_ciclo(_empresa_id uuid, _ref timestamptz DEFAULT now())
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::int FROM public.eventos e, public.ciclo_da_empresa(_empresa_id, _ref) c
  WHERE e.empresa_id = _empresa_id AND e.status <> 'cancelado' AND e.data_inicio >= c.inicio AND e.data_inicio < c.fim;
$$;

-- Resumo de uso para cliente/admin
CREATE OR REPLACE FUNCTION public.resumo_uso_empresa(_empresa_id uuid)
RETURNS TABLE(
  plano_id uuid, plano_codigo text, plano_nome text, ciclo_inicio timestamptz, ciclo_fim timestamptz,
  mensalidade numeric, participacoes_incluidas integer, participacoes_usadas integer,
  participacoes_excedentes integer, valor_excedente numeric, estimativa numeric,
  eventos_usados integer, limite_eventos integer, limite_pessoas_evento integer,
  clt_ativos integer, limite_clt integer, limite_supervisores integer, aviso_vendas boolean, recursos jsonb
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.planos; c record; v_usadas int; v_exc int;
BEGIN
  IF auth.uid() IS NOT NULL AND _empresa_id IS DISTINCT FROM public.empresa_atual()
     AND NOT public.eh_equipe_plataforma() THEN
    RAISE EXCEPTION 'sem acesso a esta organização';
  END IF;
  p := public.plano_da_empresa(_empresa_id);
  SELECT * INTO c FROM public.ciclo_da_empresa(_empresa_id);
  v_usadas := public.contar_participacoes_ciclo(_empresa_id);
  v_exc := greatest(v_usadas - coalesce(p.participacoes_incluidas, 0), 0);
  RETURN QUERY SELECT p.id, p.codigo, p.nome, c.inicio, c.fim, p.mensalidade,
    p.participacoes_incluidas, v_usadas, v_exc, p.valor_excedente,
    round(p.mensalidade + v_exc * p.valor_excedente, 2),
    public.contar_eventos_ciclo(_empresa_id), p.limite_eventos_ciclo, p.limite_pessoas_evento,
    public.contar_clt_ativos(_empresa_id), p.limite_clt, p.limite_supervisores,
    (p.aviso_vendas_acima IS NOT NULL AND v_usadas > p.aviso_vendas_acima), p.recursos;
END; $$;

-- Sincronizador: participação ativa se houver escala final confirmada
CREATE OR REPLACE FUNCTION public.sincronizar_participacao(_evento_id uuid, _freelancer_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ev record; v_ativa boolean;
BEGIN
  SELECT id, empresa_id, data_inicio, status INTO v_ev FROM public.eventos WHERE id = _evento_id;
  IF v_ev.id IS NULL THEN RETURN; END IF;
  v_ativa := v_ev.status <> 'cancelado' AND EXISTS (
    SELECT 1 FROM public.escalas s JOIN public.equipes q ON q.id = s.equipe_id
    WHERE q.evento_id = _evento_id AND s.freelancer_id = _freelancer_id AND s.status = 'confirmado'
  );
  IF v_ativa THEN
    INSERT INTO public.participacoes_operacionais (empresa_id, evento_id, freelancer_id, data_evento, ativa)
    VALUES (v_ev.empresa_id, _evento_id, _freelancer_id, v_ev.data_inicio, true)
    ON CONFLICT (evento_id, freelancer_id) DO UPDATE
      SET ativa = true, desativada_em = NULL, data_evento = excluded.data_evento, atualizado_em = now();
  ELSE
    UPDATE public.participacoes_operacionais SET ativa = false, desativada_em = now(), atualizado_em = now()
    WHERE evento_id = _evento_id AND freelancer_id = _freelancer_id AND ativa;
  END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.tg_escalas_sincronizar_participacao()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_evento uuid;
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN
    SELECT evento_id INTO v_evento FROM public.equipes WHERE id = OLD.equipe_id;
    PERFORM public.sincronizar_participacao(v_evento, OLD.freelancer_id);
  END IF;
  IF TG_OP IN ('INSERT','UPDATE') THEN
    SELECT evento_id INTO v_evento FROM public.equipes WHERE id = NEW.equipe_id;
    PERFORM public.sincronizar_participacao(v_evento, NEW.freelancer_id);
  END IF;
  RETURN NULL;
END; $$;
CREATE TRIGGER tg_escalas_participacao AFTER INSERT OR UPDATE OR DELETE ON public.escalas
  FOR EACH ROW EXECUTE FUNCTION public.tg_escalas_sincronizar_participacao();

CREATE OR REPLACE FUNCTION public.tg_eventos_sincronizar_participacoes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  IF NEW.data_inicio IS DISTINCT FROM OLD.data_inicio OR NEW.status IS DISTINCT FROM OLD.status THEN
    FOR r IN SELECT DISTINCT s.freelancer_id FROM public.escalas s JOIN public.equipes q ON q.id = s.equipe_id
             WHERE q.evento_id = NEW.id
             UNION SELECT freelancer_id FROM public.participacoes_operacionais WHERE evento_id = NEW.id LOOP
      PERFORM public.sincronizar_participacao(NEW.id, r.freelancer_id);
    END LOOP;
  END IF;
  RETURN NULL;
END; $$;
CREATE TRIGGER tg_eventos_participacoes AFTER UPDATE ON public.eventos
  FOR EACH ROW EXECUTE FUNCTION public.tg_eventos_sincronizar_participacoes();

-- Limites do plano
CREATE OR REPLACE FUNCTION public.tg_eventos_limite_plano()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.planos; v_qtd int;
BEGIN
  p := public.plano_da_empresa(NEW.empresa_id);
  IF p.limite_eventos_ciclo IS NULL THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('eventos:' || NEW.empresa_id::text));
  v_qtd := public.contar_eventos_ciclo(NEW.empresa_id, NEW.data_inicio);
  IF v_qtd >= p.limite_eventos_ciclo THEN
    RAISE EXCEPTION 'LIMITE_PLANO: seu plano % permite % eventos por ciclo. Faça upgrade para criar mais eventos.', p.nome, p.limite_eventos_ciclo;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER tg_eventos_limite BEFORE INSERT ON public.eventos
  FOR EACH ROW EXECUTE FUNCTION public.tg_eventos_limite_plano();

CREATE OR REPLACE FUNCTION public.tg_escalas_limite_plano()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.planos; v_evento uuid; v_empresa uuid; v_qtd int;
BEGIN
  IF NEW.status NOT IN ('convidado','confirmado') THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status IN ('convidado','confirmado') AND OLD.freelancer_id = NEW.freelancer_id
     AND OLD.equipe_id = NEW.equipe_id THEN RETURN NEW; END IF;
  SELECT q.evento_id, e.empresa_id INTO v_evento, v_empresa
  FROM public.equipes q JOIN public.eventos e ON e.id = q.evento_id WHERE q.id = NEW.equipe_id;
  p := public.plano_da_empresa(v_empresa);
  IF p.limite_pessoas_evento IS NULL THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('escalas:' || v_evento::text));
  IF EXISTS (SELECT 1 FROM public.escalas s JOIN public.equipes q ON q.id = s.equipe_id
             WHERE q.evento_id = v_evento AND s.freelancer_id = NEW.freelancer_id
               AND s.status IN ('convidado','confirmado') AND s.id <> NEW.id) THEN
    RETURN NEW;
  END IF;
  SELECT count(DISTINCT s.freelancer_id) INTO v_qtd FROM public.escalas s JOIN public.equipes q ON q.id = s.equipe_id
  WHERE q.evento_id = v_evento AND s.status IN ('convidado','confirmado') AND s.id <> NEW.id;
  IF v_qtd >= p.limite_pessoas_evento THEN
    RAISE EXCEPTION 'LIMITE_PLANO: seu plano % permite até % pessoas por evento. Faça upgrade para escalar mais pessoas.', p.nome, p.limite_pessoas_evento;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER tg_escalas_limite BEFORE INSERT OR UPDATE ON public.escalas
  FOR EACH ROW EXECUTE FUNCTION public.tg_escalas_limite_plano();

CREATE OR REPLACE FUNCTION public.tg_freelancers_limite_clt()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.planos; v_qtd int;
BEGIN
  IF NEW.tipo_vinculo <> 'clt' OR NOT NEW.ativo THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.tipo_vinculo = 'clt' AND OLD.ativo THEN RETURN NEW; END IF;
  p := public.plano_da_empresa(NEW.empresa_id);
  IF p.limite_clt IS NULL THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('clt:' || NEW.empresa_id::text));
  SELECT count(*) INTO v_qtd FROM public.freelancers
  WHERE empresa_id = NEW.empresa_id AND tipo_vinculo = 'clt' AND ativo AND id <> NEW.id;
  IF v_qtd >= p.limite_clt THEN
    RAISE EXCEPTION 'LIMITE_PLANO: seu plano % comporta % colaboradores CLT ativos. Fale com a PayCrew para uma contratação personalizada.', p.nome, p.limite_clt;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER tg_freelancers_limite_clt BEFORE INSERT OR UPDATE ON public.freelancers
  FOR EACH ROW EXECUTE FUNCTION public.tg_freelancers_limite_clt();

CREATE OR REPLACE FUNCTION public.tg_user_roles_limite_supervisores()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_empresa uuid; p public.planos; v_qtd int;
BEGIN
  IF NEW.role <> 'supervisor' THEN RETURN NEW; END IF;
  SELECT empresa_id INTO v_empresa FROM public.usuarios WHERE id = NEW.user_id;
  IF v_empresa IS NULL THEN RETURN NEW; END IF;
  p := public.plano_da_empresa(v_empresa);
  IF p.limite_supervisores IS NULL THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('supervisores:' || v_empresa::text));
  SELECT count(*) INTO v_qtd FROM public.user_roles r JOIN public.usuarios u ON u.id = r.user_id
  WHERE u.empresa_id = v_empresa AND r.role = 'supervisor' AND r.user_id <> NEW.user_id;
  IF v_qtd >= p.limite_supervisores THEN
    RAISE EXCEPTION 'LIMITE_PLANO: seu plano % permite % supervisor(es). Faça upgrade para adicionar mais.', p.nome, p.limite_supervisores;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER tg_user_roles_limite_supervisores BEFORE INSERT ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.tg_user_roles_limite_supervisores();

-- Recursos financeiros bloqueados no banco conforme plano
CREATE OR REPLACE FUNCTION public.tg_fechamentos_recurso()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.recurso_habilitado(public.empresa_da_escala(NEW.escala_id), 'fechamento') THEN
    RAISE EXCEPTION 'RECURSO_PLANO: fechamento financeiro não está disponível no seu plano. Faça upgrade para liberar.';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER tg_fechamentos_recurso BEFORE INSERT ON public.fechamentos
  FOR EACH ROW EXECUTE FUNCTION public.tg_fechamentos_recurso();

CREATE OR REPLACE FUNCTION public.tg_pagamentos_recurso()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_empresa uuid;
BEGIN
  v_empresa := public.empresa_do_fechamento(NEW.fechamento_id);
  IF TG_OP = 'INSERT' AND NOT public.recurso_habilitado(v_empresa, 'financeiro') THEN
    RAISE EXCEPTION 'RECURSO_PLANO: pagamentos não estão disponíveis no seu plano. Faça upgrade para liberar.';
  END IF;
  IF NEW.status = 'agendado' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'agendado')
     AND NOT public.recurso_habilitado(v_empresa, 'agendamento_pix') THEN
    RAISE EXCEPTION 'RECURSO_PLANO: agendamento de Pix não está disponível no seu plano. Faça upgrade para liberar.';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER tg_pagamentos_recurso BEFORE INSERT OR UPDATE ON public.pagamentos
  FOR EACH ROW EXECUTE FUNCTION public.tg_pagamentos_recurso();

-- Histórico de mudanças de plano
CREATE OR REPLACE FUNCTION public.tg_assinaturas_historico()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.plano_id IS DISTINCT FROM OLD.plano_id THEN
    INSERT INTO public.assinaturas_historico (empresa_id, plano_anterior_id, plano_novo_id, alterado_por)
    VALUES (NEW.empresa_id, CASE WHEN TG_OP = 'UPDATE' THEN OLD.plano_id END, NEW.plano_id, auth.uid());
  END IF;
  RETURN NULL;
END; $$;
CREATE TRIGGER tg_assinaturas_historico AFTER INSERT OR UPDATE ON public.assinaturas
  FOR EACH ROW EXECUTE FUNCTION public.tg_assinaturas_historico();

CREATE OR REPLACE FUNCTION public.tg_planos_historico()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.planos_historico (plano_id, alterado_por, antes, depois)
  VALUES (NEW.id, auth.uid(), to_jsonb(OLD), to_jsonb(NEW));
  RETURN NULL;
END; $$;
CREATE TRIGGER tg_planos_historico AFTER UPDATE ON public.planos
  FOR EACH ROW EXECUTE FUNCTION public.tg_planos_historico();

-- Fechamento idempotente da fatura de um ciclo
CREATE OR REPLACE FUNCTION public.fechar_fatura_ciclo(_empresa_id uuid, _ref timestamptz)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.planos; a public.assinaturas; cp public.cupons; c record;
  v_usadas int; v_exc int; v_bruto numeric; v_desc numeric := 0; v_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('fatura:' || _empresa_id::text));
  SELECT * INTO c FROM public.ciclo_da_empresa(_empresa_id, _ref);
  SELECT id INTO v_id FROM public.faturas_plataforma WHERE empresa_id = _empresa_id AND ciclo_inicio = c.inicio;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  SELECT * INTO a FROM public.assinaturas WHERE empresa_id = _empresa_id;
  p := public.plano_da_empresa(_empresa_id);
  v_usadas := public.contar_participacoes_ciclo(_empresa_id, c.inicio);
  v_exc := greatest(v_usadas - p.participacoes_incluidas, 0);
  v_bruto := round(coalesce(a.mensalidade_override, p.mensalidade) + v_exc * p.valor_excedente, 2);
  IF a.cupom_id IS NOT NULL THEN
    SELECT * INTO cp FROM public.cupons WHERE id = a.cupom_id AND ativo AND (validade IS NULL OR validade >= c.inicio::date);
    IF cp.id IS NOT NULL THEN
      v_desc := CASE cp.tipo WHEN 'percentual' THEN round(v_bruto * cp.valor / 100, 2)
                             WHEN 'isencao' THEN v_bruto ELSE least(cp.valor, v_bruto) END;
    END IF;
  END IF;
  IF a.trial_ate IS NOT NULL AND a.trial_ate >= c.fim THEN v_desc := v_bruto; END IF;
  INSERT INTO public.faturas_plataforma (empresa_id, assinatura_id, plano_id, plano_nome, ciclo_inicio, ciclo_fim,
    mensalidade, participacoes_incluidas, participacoes_usadas, participacoes_excedentes, valor_excedente_unit,
    valor_excedente_total, desconto, total, clt_ativos, status, vencimento)
  VALUES (_empresa_id, a.id, p.id, p.nome, c.inicio, c.fim, coalesce(a.mensalidade_override, p.mensalidade),
    p.participacoes_incluidas, v_usadas, v_exc, p.valor_excedente, round(v_exc * p.valor_excedente, 2),
    v_desc, greatest(v_bruto - v_desc, 0), public.contar_clt_ativos(_empresa_id),
    CASE WHEN v_bruto - v_desc <= 0 THEN 'paga' ELSE 'pendente' END, (c.fim + interval '5 days')::date)
  ON CONFLICT (empresa_id, ciclo_inicio) DO NOTHING
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;
REVOKE EXECUTE ON FUNCTION public.fechar_fatura_ciclo(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fechar_fatura_ciclo(uuid, timestamptz) TO service_role;
REVOKE EXECUTE ON FUNCTION public.sincronizar_participacao(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Backfill das participações existentes
INSERT INTO public.participacoes_operacionais (empresa_id, evento_id, freelancer_id, data_evento, ativa)
SELECT DISTINCT e.empresa_id, e.id, s.freelancer_id, e.data_inicio, true
FROM public.escalas s JOIN public.equipes q ON q.id = s.equipe_id JOIN public.eventos e ON e.id = q.evento_id
WHERE s.status = 'confirmado' AND e.status <> 'cancelado'
ON CONFLICT (evento_id, freelancer_id) DO NOTHING;
CREATE OR REPLACE FUNCTION public.validar_acesso_cobranca(_empresa_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.role() = 'service_role' OR current_setting('role', true) IN ('postgres','service_role') THEN RETURN; END IF;
 IF auth.uid() IS NULL OR (_empresa_id IS DISTINCT FROM public.empresa_atual() AND NOT public.tem_papel_plataforma(auth.uid(),'admin_master')) THEN RAISE EXCEPTION 'Acesso negado à cobrança da organização'; END IF;
END; $$;
REVOKE ALL ON FUNCTION public.validar_acesso_cobranca(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.validar_acesso_cobranca(uuid) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.plano_da_empresa(_empresa_id uuid)
RETURNS public.planos LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.planos;
BEGIN
 PERFORM public.validar_acesso_cobranca(_empresa_id);
 SELECT pl.* INTO p FROM public.assinaturas a JOIN public.planos pl ON pl.id=a.plano_id WHERE a.empresa_id=_empresa_id;
 IF p.id IS NULL THEN SELECT * INTO p FROM public.planos WHERE codigo='free'; END IF;
 RETURN p;
END; $$;
CREATE OR REPLACE FUNCTION public.recurso_habilitado(_empresa_id uuid,_recurso text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.planos;
BEGIN
 PERFORM public.validar_acesso_cobranca(_empresa_id);
 IF NOT EXISTS (SELECT 1 FROM public.empresas WHERE id=_empresa_id AND ativa) THEN RETURN false; END IF;
 IF EXISTS (SELECT 1 FROM public.assinaturas WHERE empresa_id=_empresa_id AND status NOT IN ('ativa','trial','em_trial')) THEN RETURN false; END IF;
 p := public.plano_da_empresa(_empresa_id);
 RETURN coalesce(p.recursos->>_recurso,'false')='true';
END; $$;
REVOKE EXECUTE ON FUNCTION public.ciclo_da_empresa(uuid,timestamptz),public.contar_participacoes_ciclo(uuid,timestamptz),public.contar_eventos_ciclo(uuid,timestamptz),public.contar_clt_ativos(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ciclo_da_empresa(uuid,timestamptz),public.contar_participacoes_ciclo(uuid,timestamptz),public.contar_eventos_ciclo(uuid,timestamptz),public.contar_clt_ativos(uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.plano_da_empresa(uuid),public.recurso_habilitado(uuid,text),public.resumo_uso_empresa(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.plano_da_empresa(uuid),public.recurso_habilitado(uuid,text),public.resumo_uso_empresa(uuid) TO authenticated,service_role;
ALTER POLICY participacoes_leitura ON public.participacoes_operacionais USING(empresa_id=public.empresa_atual() OR public.tem_papel_plataforma(auth.uid(),'admin_master'));
ALTER POLICY faturas_leitura ON public.faturas_plataforma USING(empresa_id=public.empresa_atual() OR public.tem_papel_plataforma(auth.uid(),'admin_master'));
ALTER POLICY custos_meio_leitura ON public.custos_meio_pagamento USING(empresa_id=public.empresa_atual() OR public.tem_papel_plataforma(auth.uid(),'admin_master'));
ALTER POLICY assinaturas_historico_leitura ON public.assinaturas_historico USING(public.tem_papel_plataforma(auth.uid(),'admin_master'));
ALTER POLICY planos_historico_leitura ON public.planos_historico USING(public.tem_papel_plataforma(auth.uid(),'admin_master'));
CREATE TABLE public.ciclos_cobranca (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL REFERENCES public.empresas(id), assinatura_id uuid REFERENCES public.assinaturas(id), plano_id uuid REFERENCES public.planos(id), plano_nome text NOT NULL, inicio timestamptz NOT NULL, fim timestamptz NOT NULL, mensalidade numeric NOT NULL, participacoes_incluidas integer NOT NULL, valor_excedente numeric NOT NULL, desconto_tipo text, desconto_valor numeric NOT NULL DEFAULT 0, trial_ate timestamptz, criado_em timestamptz NOT NULL DEFAULT now(), UNIQUE(empresa_id,inicio)
);
GRANT SELECT ON public.ciclos_cobranca TO authenticated;
GRANT ALL ON public.ciclos_cobranca TO service_role;
ALTER TABLE public.ciclos_cobranca ENABLE ROW LEVEL SECURITY;
CREATE POLICY ciclos_leitura ON public.ciclos_cobranca FOR SELECT TO authenticated USING(empresa_id=public.empresa_atual() OR public.tem_papel_plataforma(auth.uid(),'admin_master'));
CREATE OR REPLACE FUNCTION public.abrir_ciclo_cobranca(_empresa_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c record; p public.planos; a public.assinaturas; cp public.cupons; v_id uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('fatura:'||_empresa_id::text));
 SELECT * INTO c FROM public.ciclo_da_empresa(_empresa_id,now());
 SELECT id INTO v_id FROM public.ciclos_cobranca WHERE empresa_id=_empresa_id AND inicio=c.inicio;
 IF v_id IS NOT NULL THEN RETURN v_id; END IF;
 p:=public.plano_da_empresa(_empresa_id);
 SELECT * INTO a FROM public.assinaturas WHERE empresa_id=_empresa_id;
 SELECT * INTO cp FROM public.cupons WHERE id=a.cupom_id AND ativo AND (validade IS NULL OR validade>=c.inicio::date) AND (empresa_id IS NULL OR empresa_id=_empresa_id) AND (limite_usos IS NULL OR usos<limite_usos);
 INSERT INTO public.ciclos_cobranca(empresa_id,assinatura_id,plano_id,plano_nome,inicio,fim,mensalidade,participacoes_incluidas,valor_excedente,desconto_tipo,desconto_valor,trial_ate)
 VALUES(_empresa_id,a.id,p.id,p.nome,c.inicio,c.fim,coalesce(a.mensalidade_override,p.mensalidade),p.participacoes_incluidas,p.valor_excedente,cp.tipo,coalesce(cp.valor,0),a.trial_ate) RETURNING id INTO v_id;
 IF cp.id IS NOT NULL THEN UPDATE public.cupons SET usos=usos+1 WHERE id=cp.id; END IF;
 RETURN v_id;
END; $$;
REVOKE ALL ON FUNCTION public.abrir_ciclo_cobranca(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.abrir_ciclo_cobranca(uuid) TO service_role;
INSERT INTO public.ciclos_cobranca(empresa_id,assinatura_id,plano_id,plano_nome,inicio,fim,mensalidade,participacoes_incluidas,valor_excedente,trial_ate)
SELECT a.empresa_id,a.id,p.id,p.nome,c.inicio,c.fim,coalesce(a.mensalidade_override,p.mensalidade),p.participacoes_incluidas,p.valor_excedente,a.trial_ate FROM public.assinaturas a JOIN public.planos p ON p.id=a.plano_id CROSS JOIN LATERAL public.ciclo_da_empresa(a.empresa_id,now()) c;
CREATE OR REPLACE FUNCTION public.fechar_fatura_ciclo(_empresa_id uuid,_ref timestamptz)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.ciclos_cobranca; v_id uuid; v_usadas int; v_exc int; v_bruto numeric; v_desc numeric:=0;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('fatura:'||_empresa_id::text));
 SELECT * INTO c FROM public.ciclos_cobranca WHERE empresa_id=_empresa_id AND inicio<=_ref AND fim>_ref;
 IF c.id IS NULL THEN RAISE EXCEPTION 'Ciclo sem preço registrado: revisão administrativa necessária'; END IF;
 IF c.fim>now() THEN RAISE EXCEPTION 'Aguarde o encerramento do ciclo para faturar'; END IF;
 SELECT id INTO v_id FROM public.faturas_plataforma WHERE empresa_id=_empresa_id AND ciclo_inicio=c.inicio;
 IF v_id IS NOT NULL THEN RETURN v_id; END IF;
 SELECT count(*) INTO v_usadas FROM public.participacoes_operacionais WHERE empresa_id=_empresa_id AND ativa AND data_evento>=c.inicio AND data_evento<c.fim;
 v_exc:=greatest(v_usadas-c.participacoes_incluidas,0); v_bruto:=round(c.mensalidade+v_exc*c.valor_excedente,2);
 v_desc:=CASE c.desconto_tipo WHEN 'percentual' THEN round(v_bruto*c.desconto_valor/100,2) WHEN 'isencao' THEN v_bruto WHEN 'valor' THEN least(c.desconto_valor,v_bruto) ELSE 0 END;
 IF c.trial_ate>=c.fim THEN v_desc:=v_bruto; END IF;
 INSERT INTO public.faturas_plataforma(empresa_id,assinatura_id,plano_id,plano_nome,ciclo_inicio,ciclo_fim,mensalidade,participacoes_incluidas,participacoes_usadas,participacoes_excedentes,valor_excedente_unit,valor_excedente_total,desconto,total,clt_ativos,status,vencimento,pago_em)
 VALUES(_empresa_id,c.assinatura_id,c.plano_id,c.plano_nome,c.inicio,c.fim,c.mensalidade,c.participacoes_incluidas,v_usadas,v_exc,c.valor_excedente,round(v_exc*c.valor_excedente,2),least(v_desc,v_bruto),greatest(v_bruto-v_desc,0),public.contar_clt_ativos(_empresa_id),CASE WHEN v_bruto-v_desc<=0 THEN 'paga' ELSE 'pendente' END,(c.fim+interval '5 days')::date,CASE WHEN v_bruto-v_desc<=0 THEN now() END) RETURNING id INTO v_id;
 RETURN v_id;
END; $$;
CREATE OR REPLACE FUNCTION public.tg_fechamentos_recurso()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF NOT public.recurso_habilitado(public.empresa_da_escala(NEW.escala_id),'fechamento') THEN RAISE EXCEPTION 'RECURSO_PLANO: faça upgrade para liberar fechamento financeiro'; END IF; RETURN NEW; END; $$;
CREATE TRIGGER tg_fechamentos_recurso_update BEFORE UPDATE ON public.fechamentos FOR EACH ROW EXECUTE FUNCTION public.tg_fechamentos_recurso();
CREATE OR REPLACE FUNCTION public.tg_pagamentos_recurso()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE v_empresa uuid; BEGIN
 v_empresa:=public.empresa_do_fechamento(NEW.fechamento_id);
 IF NOT public.recurso_habilitado(v_empresa,'financeiro') THEN RAISE EXCEPTION 'RECURSO_PLANO: faça upgrade para liberar pagamentos'; END IF;
 IF NEW.status='agendado' AND NOT public.recurso_habilitado(v_empresa,'agendamento_pix') THEN RAISE EXCEPTION 'RECURSO_PLANO: agendamento de Pix indisponível'; END IF; RETURN NEW; END; $$;
CREATE OR REPLACE FUNCTION public.tg_eventos_limite_plano()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE p public.planos; c record; v_qtd int; BEGIN
 IF NEW.status='cancelado' THEN RETURN NEW; END IF;
 p:=public.plano_da_empresa(NEW.empresa_id); IF p.limite_eventos_ciclo IS NULL THEN RETURN NEW; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('eventos:'||NEW.empresa_id::text));
 SELECT * INTO c FROM public.ciclo_da_empresa(NEW.empresa_id,NEW.data_inicio);
 SELECT count(*) INTO v_qtd FROM public.eventos WHERE empresa_id=NEW.empresa_id AND status<>'cancelado' AND data_inicio>=c.inicio AND data_inicio<c.fim AND id<>NEW.id;
 IF v_qtd>=p.limite_eventos_ciclo THEN RAISE EXCEPTION 'LIMITE_PLANO: limite de eventos por ciclo atingido; faça upgrade'; END IF; RETURN NEW; END; $$;
CREATE TRIGGER tg_eventos_limite_update BEFORE UPDATE OF data_inicio,status ON public.eventos FOR EACH ROW EXECUTE FUNCTION public.tg_eventos_limite_plano();
CREATE OR REPLACE FUNCTION public.tg_planos_validar_v2()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN
 IF NEW.mensalidade<0 OR NEW.valor_excedente<0 OR NEW.participacoes_incluidas<0 OR NEW.limite_clt<0 OR NEW.limite_eventos_ciclo<0 OR NEW.limite_pessoas_evento<0 OR NEW.limite_supervisores<0 OR NEW.retencao_evidencias_dias<1 THEN RAISE EXCEPTION 'Valores e limites de plano inválidos'; END IF;
 NEW.percentual:=0; NEW.taxa_fixa_pix:=0; RETURN NEW; END; $$;
CREATE TRIGGER tg_planos_validar_v2 BEFORE INSERT OR UPDATE ON public.planos FOR EACH ROW EXECUTE FUNCTION public.tg_planos_validar_v2();
DO $$ DECLARE f record; BEGIN FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('tg_escalas_limite_plano','tg_eventos_limite_plano','tg_freelancers_limite_clt','tg_user_roles_limite_supervisores','tg_escalas_sincronizar_participacao','tg_eventos_sincronizar_participacoes','tg_fechamentos_recurso','tg_pagamentos_recurso','tg_assinaturas_historico','tg_planos_historico','sincronizar_participacao') LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature); END LOOP; END $$;CREATE OR REPLACE FUNCTION public.ciclo_da_empresa(_empresa_id uuid,_ref timestamptz DEFAULT now()) RETURNS TABLE(inicio timestamptz,fim timestamptz) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$ DECLARE a timestamptz; n int; i timestamptz; f timestamptz; BEGIN
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
