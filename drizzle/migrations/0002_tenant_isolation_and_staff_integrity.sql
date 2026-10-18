create or replace function public.impedir_troca_empresa_usuario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.empresa_id is distinct from old.empresa_id
     and old.empresa_id is not null
     and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'não é permitido alterar a empresa vinculada ao usuário';
  end if;
  return new;
end;
$$;

revoke all on function public.impedir_troca_empresa_usuario() from public, anon, authenticated;
grant execute on function public.impedir_troca_empresa_usuario() to service_role;

drop trigger if exists tg_usuarios_bloqueia_troca_empresa on public.usuarios;
create trigger tg_usuarios_bloqueia_troca_empresa
before update of empresa_id on public.usuarios
for each row execute function public.impedir_troca_empresa_usuario();

drop policy if exists "empresas_insert" on public.empresas;
revoke insert on public.empresas from authenticated;

create unique index if not exists freelancers_empresa_cpf_unique
on public.freelancers (empresa_id, cpf);

create or replace function public.validar_escala_mesma_empresa()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa_equipe uuid;
  v_empresa_freelancer uuid;
begin
  select public.empresa_da_equipe(new.equipe_id) into v_empresa_equipe;
  select empresa_id into v_empresa_freelancer from public.freelancers where id = new.freelancer_id;
  if v_empresa_equipe is null or v_empresa_freelancer is null or v_empresa_equipe is distinct from v_empresa_freelancer then
    raise exception 'freelancer e equipe devem pertencer à mesma empresa';
  end if;
  return new;
end;
$$;

revoke all on function public.validar_escala_mesma_empresa() from public, anon, authenticated;
grant execute on function public.validar_escala_mesma_empresa() to service_role;

drop trigger if exists tg_escalas_mesma_empresa on public.escalas;
create trigger tg_escalas_mesma_empresa
before insert or update of equipe_id, freelancer_id on public.escalas
for each row execute function public.validar_escala_mesma_empresa();
