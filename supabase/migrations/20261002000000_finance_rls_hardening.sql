-- FASE 2B-2: hardening de propriedade financeira e isolamento multi-tenant em banco
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
