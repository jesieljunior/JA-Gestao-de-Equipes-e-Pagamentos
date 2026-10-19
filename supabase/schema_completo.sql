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
