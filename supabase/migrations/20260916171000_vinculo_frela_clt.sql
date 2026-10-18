-- Evolui o cadastro legado de freelancers para suportar Frela e CLT.
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
  check (salario_mensal is null or salario_mensal > 0);