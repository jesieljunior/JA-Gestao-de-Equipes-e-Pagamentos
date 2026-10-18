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
create index idx_ocorrencias_escala on public.ocorrencias(escala_id);