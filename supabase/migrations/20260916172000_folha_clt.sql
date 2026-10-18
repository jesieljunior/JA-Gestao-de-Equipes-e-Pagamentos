-- Folha mensal CLT separada do fechamento por evento dos Frelas.
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

create index idx_folhas_clt_empresa_competencia on public.folhas_clt(empresa_id, competencia desc);