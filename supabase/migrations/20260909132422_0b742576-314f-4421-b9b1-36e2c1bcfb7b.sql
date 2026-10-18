-- ============ papéis da plataforma ============
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
create policy "plataforma le movimentos" on public.movimentos_saldo for select to authenticated using (public.eh_equipe_plataforma());