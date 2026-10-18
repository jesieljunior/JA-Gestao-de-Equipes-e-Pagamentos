create or replace function public.tem_capacidade(_user_id uuid, _capacidade text)
returns boolean language sql stable security invoker set search_path = public as $$
  select case _capacidade
    when 'cadastros.gerenciar' then public.has_role(_user_id,'admin') or public.has_role(_user_id,'coordenador')
    when 'configuracoes.gerenciar' then public.has_role(_user_id,'admin')
    when 'eventos.gerenciar' then public.has_role(_user_id,'admin') or public.has_role(_user_id,'coordenador')
    when 'operacao.supervisionar' then public.has_role(_user_id,'admin') or public.has_role(_user_id,'coordenador') or public.has_role(_user_id,'supervisor')
    when 'fechamento.aprovar' then public.has_role(_user_id,'admin') or public.has_role(_user_id,'coordenador')
    when 'financeiro.gerenciar' then public.has_role(_user_id,'admin') or public.has_role(_user_id,'financeiro')
    when 'relatorios.ver' then exists(select 1 from public.user_roles ur where ur.user_id = _user_id)
    else false end;
$$;
revoke all on function public.tem_capacidade(uuid,text) from public, anon;
grant execute on function public.tem_capacidade(uuid,text) to authenticated, service_role;