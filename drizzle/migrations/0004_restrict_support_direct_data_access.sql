create or replace function public.eh_equipe_plataforma()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.tem_papel_plataforma(auth.uid(), 'admin_master');
$$;

revoke all on function public.eh_equipe_plataforma() from public, anon;
grant execute on function public.eh_equipe_plataforma() to authenticated, service_role;
