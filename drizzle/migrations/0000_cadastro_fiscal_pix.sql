-- Cadastro fiscal mínimo da empresa antes de liberar pagamentos Pix.
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
grant execute on function public.empresa_fiscal_validada(uuid) to authenticated, service_role;
