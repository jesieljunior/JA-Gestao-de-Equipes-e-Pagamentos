revoke all on function public.has_role(uuid, public.papel_usuario) from public, anon;
grant execute on function public.has_role(uuid, public.papel_usuario) to authenticated;

revoke all on function public.empresa_atual() from public, anon;
grant execute on function public.empresa_atual() to authenticated;

revoke all on function public.empresa_da_equipe(uuid) from public, anon;
grant execute on function public.empresa_da_equipe(uuid) to authenticated;

revoke all on function public.empresa_da_escala(uuid) from public, anon;
grant execute on function public.empresa_da_escala(uuid) to authenticated;

revoke all on function public.empresa_do_fechamento(uuid) from public, anon;
grant execute on function public.empresa_do_fechamento(uuid) to authenticated;

revoke all on function public.criar_empresa(text, text) from public, anon;
grant execute on function public.criar_empresa(text, text) to authenticated;

revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.tg_atualizado_em() from public, anon, authenticated;