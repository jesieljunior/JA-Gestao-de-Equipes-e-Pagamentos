create or replace function public.proteger_validacao_fiscal_empresa()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    if new.fiscal_status = 'validado' and old.fiscal_status is distinct from 'validado' then
      raise exception 'a validação fiscal só pode ser aprovada pela administração da plataforma';
    end if;
    if new.fiscal_validado_em is distinct from old.fiscal_validado_em
       or new.fiscal_validado_por is distinct from old.fiscal_validado_por then
      raise exception 'os dados de validação fiscal são protegidos';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.proteger_validacao_fiscal_empresa() from public, anon, authenticated;
grant execute on function public.proteger_validacao_fiscal_empresa() to service_role;

drop trigger if exists tg_empresas_proteger_validacao_fiscal on public.empresas;
create trigger tg_empresas_proteger_validacao_fiscal
before update of fiscal_status, fiscal_validado_em, fiscal_validado_por on public.empresas
for each row execute function public.proteger_validacao_fiscal_empresa();
