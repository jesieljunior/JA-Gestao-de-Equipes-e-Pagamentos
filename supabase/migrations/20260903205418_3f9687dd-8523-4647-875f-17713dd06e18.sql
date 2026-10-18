revoke all on function public.saldo_empresa(uuid) from public, anon;
grant execute on function public.saldo_empresa(uuid) to authenticated, service_role;