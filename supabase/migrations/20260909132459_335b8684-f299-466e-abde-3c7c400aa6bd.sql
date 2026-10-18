revoke execute on function public.tem_papel_plataforma(uuid, papel_plataforma) from public, anon;
revoke execute on function public.eh_equipe_plataforma() from public, anon;
revoke execute on function public.preco_efetivo(uuid) from public, anon;
grant execute on function public.tem_papel_plataforma(uuid, papel_plataforma) to authenticated, service_role;
grant execute on function public.eh_equipe_plataforma() to authenticated, service_role;
grant execute on function public.preco_efetivo(uuid) to authenticated, service_role;

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
  if auth.uid() is not null
     and _empresa_id is distinct from public.empresa_atual()
     and not public.eh_equipe_plataforma() then
    raise exception 'sem acesso a esta agencia';
  end if;

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