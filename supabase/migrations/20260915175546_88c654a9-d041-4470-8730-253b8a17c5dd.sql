create type public.tipo_pessoa as enum ('pf','pj');
create type public.status_funding as enum ('draft','pending','available','partially_reserved','reserved','consumed','refund_pending','refunded','failed','cancelled');
create type public.status_lote_pagamento as enum ('draft','awaiting_approval','approved','funding_pending','funded','processing','partially_paid','paid','failed','cancelled');
create type public.tipo_documento_fiscal as enum ('nfse','nfe','rpa','receipt','other');
create type public.status_documento_fiscal as enum ('pending','received','validated_manually','rejected','cancelled');

alter table public.clientes
  add column if not exists tipo_pessoa public.tipo_pessoa not null default 'pj',
  add column if not exists razao_social text,
  add column if not exists nome_fantasia text,
  add column if not exists ativo boolean not null default true,
  add column if not exists responsavel_nome text,
  add column if not exists responsavel_cargo text,
  add column if not exists canal_preferencial text,
  add column if not exists cep text,
  add column if not exists logradouro text,
  add column if not exists numero text,
  add column if not exists complemento text,
  add column if not exists bairro text,
  add column if not exists cidade text,
  add column if not exists uf text,
  add column if not exists codigo_municipio text,
  add column if not exists inscricao_municipal text,
  add column if not exists inscricao_estadual text,
  add column if not exists inscricao_estadual_isento boolean not null default false,
  add column if not exists regime_fiscal text,
  add column if not exists codigo_servico text,
  add column if not exists email_financeiro text,
  add column if not exists vencimento_preferencial integer;

update public.clientes
set razao_social = coalesce(razao_social, nome),
    nome_fantasia = coalesce(nome_fantasia, nome),
    email_financeiro = coalesce(email_financeiro, email)
where razao_social is null or nome_fantasia is null or email_financeiro is null;

alter table public.clientes
  add constraint clientes_documento_formato check (cpf_cnpj is null or cpf_cnpj ~ '^[0-9]{11}$|^[0-9]{14}$'),
  add constraint clientes_uf_formato check (uf is null or uf ~ '^[A-Z]{2}$'),
  add constraint clientes_cep_formato check (cep is null or cep ~ '^[0-9]{8}$'),
  add constraint clientes_vencimento_preferencial check (vencimento_preferencial is null or vencimento_preferencial between 1 and 31),
  add constraint clientes_canal_preferencial check (canal_preferencial is null or canal_preferencial in ('email','telefone','whatsapp'));
create unique index if not exists uq_clientes_empresa_documento on public.clientes(empresa_id, cpf_cnpj) where cpf_cnpj is not null;

create or replace function public.validar_cliente_evento_mesma_empresa()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.cliente_id is not null and not exists (
    select 1 from public.clientes c where c.id = new.cliente_id and c.empresa_id = new.empresa_id
  ) then raise exception 'cliente e evento devem pertencer a mesma organizacao'; end if;
  return new;
end; $$;
create trigger tg_eventos_cliente_mesma_empresa before insert or update of cliente_id, empresa_id on public.eventos for each row execute function public.validar_cliente_evento_mesma_empresa();
create trigger tg_cobrancas_cliente_mesma_empresa before insert or update of cliente_id, empresa_id on public.cobrancas for each row execute function public.validar_cliente_evento_mesma_empresa();

create or replace function public.tem_capacidade(_user_id uuid, _capacidade text)
returns boolean language sql stable security definer set search_path = public as $$
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

create table public.convites_equipe (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  email text not null,
  papel public.papel_usuario not null,
  token_hash text not null unique,
  convidado_por uuid not null,
  expira_em timestamptz not null,
  aceito_em timestamptz,
  revogado_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
grant select, insert, update, delete on public.convites_equipe to authenticated;
grant all on public.convites_equipe to service_role;
alter table public.convites_equipe enable row level security;
create policy "convites_admin" on public.convites_equipe for all to authenticated
 using (empresa_id = public.empresa_atual() and public.has_role(auth.uid(),'admin'))
 with check (empresa_id = public.empresa_atual() and public.has_role(auth.uid(),'admin'));
create trigger tg_convites_equipe_atualizado_em before update on public.convites_equipe for each row execute function public.tg_atualizado_em();

create table public.lotes_pagamento (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  evento_id uuid references public.eventos(id) on delete set null,
  descricao text not null,
  status public.status_lote_pagamento not null default 'draft',
  valor_total numeric(12,2) not null default 0 check (valor_total >= 0),
  aprovado_por uuid,
  aprovado_em timestamptz,
  chave_idempotencia text unique,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
grant select, insert, update, delete on public.lotes_pagamento to authenticated;
grant all on public.lotes_pagamento to service_role;
alter table public.lotes_pagamento enable row level security;
create policy "lotes_leitura" on public.lotes_pagamento for select to authenticated using (empresa_id = public.empresa_atual() or public.eh_equipe_plataforma());
create policy "lotes_financeiro_escrita" on public.lotes_pagamento for all to authenticated using (empresa_id = public.empresa_atual() and public.tem_capacidade(auth.uid(),'financeiro.gerenciar')) with check (empresa_id = public.empresa_atual() and public.tem_capacidade(auth.uid(),'financeiro.gerenciar'));
create trigger tg_lotes_pagamento_atualizado_em before update on public.lotes_pagamento for each row execute function public.tg_atualizado_em();

create table public.fundings (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  finalidade text not null,
  valor_total numeric(12,2) not null check (valor_total > 0),
  valor_disponivel numeric(12,2) not null default 0 check (valor_disponivel >= 0),
  valor_reservado numeric(12,2) not null default 0 check (valor_reservado >= 0),
  valor_utilizado numeric(12,2) not null default 0 check (valor_utilizado >= 0),
  valor_devolvido numeric(12,2) not null default 0 check (valor_devolvido >= 0),
  status public.status_funding not null default 'draft',
  cobranca_id uuid references public.cobrancas(id) on delete set null,
  referencia_parceiro text,
  chave_idempotencia text not null unique,
  criado_por uuid not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint fundings_soma_valida check (valor_disponivel + valor_reservado + valor_utilizado + valor_devolvido <= valor_total)
);
grant select, insert, update, delete on public.fundings to authenticated;
grant all on public.fundings to service_role;
alter table public.fundings enable row level security;
create policy "fundings_leitura" on public.fundings for select to authenticated using (empresa_id = public.empresa_atual() or public.eh_equipe_plataforma());
create policy "fundings_financeiro_escrita" on public.fundings for all to authenticated using (empresa_id = public.empresa_atual() and public.tem_capacidade(auth.uid(),'financeiro.gerenciar')) with check (empresa_id = public.empresa_atual() and public.tem_capacidade(auth.uid(),'financeiro.gerenciar'));
create trigger tg_fundings_atualizado_em before update on public.fundings for each row execute function public.tg_atualizado_em();

create table public.alocacoes_funding (
  id uuid primary key default gen_random_uuid(),
  funding_id uuid not null references public.fundings(id) on delete restrict,
  lote_id uuid not null references public.lotes_pagamento(id) on delete restrict,
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  valor_reservado numeric(12,2) not null check (valor_reservado > 0),
  valor_utilizado numeric(12,2) not null default 0 check (valor_utilizado >= 0 and valor_utilizado <= valor_reservado),
  valor_devolvido numeric(12,2) not null default 0 check (valor_devolvido >= 0 and valor_devolvido <= valor_reservado),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique(funding_id,lote_id)
);
grant select, insert, update, delete on public.alocacoes_funding to authenticated;
grant all on public.alocacoes_funding to service_role;
alter table public.alocacoes_funding enable row level security;
create policy "alocacoes_leitura" on public.alocacoes_funding for select to authenticated using (empresa_id = public.empresa_atual() or public.eh_equipe_plataforma());
create policy "alocacoes_financeiro_escrita" on public.alocacoes_funding for all to authenticated using (empresa_id = public.empresa_atual() and public.tem_capacidade(auth.uid(),'financeiro.gerenciar')) with check (empresa_id = public.empresa_atual() and public.tem_capacidade(auth.uid(),'financeiro.gerenciar'));
create trigger tg_alocacoes_funding_atualizado_em before update on public.alocacoes_funding for each row execute function public.tg_atualizado_em();

create table public.cobrancas_plataforma (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  assinatura_id uuid references public.assinaturas(id) on delete set null,
  tipo text not null check (tipo in ('assinatura','taxa_evento','taxa_pix','ajuste')),
  descricao text not null,
  competencia date,
  valor numeric(12,2) not null check (valor >= 0),
  status public.status_cobranca not null default 'rascunho',
  referencia_parceiro text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
grant select on public.cobrancas_plataforma to authenticated;
grant all on public.cobrancas_plataforma to service_role;
alter table public.cobrancas_plataforma enable row level security;
create policy "cobrancas_plataforma_leitura" on public.cobrancas_plataforma for select to authenticated using (empresa_id = public.empresa_atual() or public.eh_equipe_plataforma());
create trigger tg_cobrancas_plataforma_atualizado_em before update on public.cobrancas_plataforma for each row execute function public.tg_atualizado_em();

create table public.documentos_fiscais (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  cliente_id uuid references public.clientes(id) on delete set null,
  freelancer_id uuid references public.freelancers(id) on delete set null,
  evento_id uuid references public.eventos(id) on delete set null,
  pagamento_id uuid references public.pagamentos(id) on delete set null,
  cobranca_plataforma_id uuid references public.cobrancas_plataforma(id) on delete set null,
  tipo public.tipo_documento_fiscal not null,
  status public.status_documento_fiscal not null default 'pending',
  numero text,
  serie text,
  chave_acesso text,
  emissor_documento text,
  emissor_nome text,
  destinatario_documento text,
  destinatario_nome text,
  competencia date,
  valor numeric(12,2) check (valor is null or valor >= 0),
  arquivo_caminho text,
  arquivo_nome text,
  arquivo_tipo text,
  observacoes text,
  criado_por uuid not null,
  validado_por uuid,
  validado_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
grant select, insert, update, delete on public.documentos_fiscais to authenticated;
grant all on public.documentos_fiscais to service_role;
alter table public.documentos_fiscais enable row level security;
create policy "documentos_leitura" on public.documentos_fiscais for select to authenticated using (empresa_id = public.empresa_atual() or public.eh_equipe_plataforma());
create policy "documentos_organizacao_escrita" on public.documentos_fiscais for all to authenticated using (empresa_id = public.empresa_atual() and (public.tem_capacidade(auth.uid(),'financeiro.gerenciar') or public.tem_capacidade(auth.uid(),'cadastros.gerenciar'))) with check (empresa_id = public.empresa_atual() and (public.tem_capacidade(auth.uid(),'financeiro.gerenciar') or public.tem_capacidade(auth.uid(),'cadastros.gerenciar')));
create trigger tg_documentos_fiscais_atualizado_em before update on public.documentos_fiscais for each row execute function public.tg_atualizado_em();

create table public.logs_auditoria (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references public.empresas(id) on delete set null,
  ator_id uuid not null,
  ator_contexto text not null check (ator_contexto in ('organizacao','suporte','admin_master','sistema')),
  acao text not null,
  recurso_tipo text not null,
  recurso_id uuid,
  resultado text not null check (resultado in ('sucesso','falha')),
  detalhes jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now()
);
grant select on public.logs_auditoria to authenticated;
grant insert on public.logs_auditoria to authenticated;
grant all on public.logs_auditoria to service_role;
alter table public.logs_auditoria enable row level security;
create policy "auditoria_leitura" on public.logs_auditoria for select to authenticated using ((empresa_id = public.empresa_atual() and public.has_role(auth.uid(),'admin')) or public.eh_equipe_plataforma());
create policy "auditoria_insercao_propria" on public.logs_auditoria for insert to authenticated with check (ator_id = auth.uid() and (empresa_id is null or empresa_id = public.empresa_atual() or public.eh_equipe_plataforma()));

create index idx_convites_empresa on public.convites_equipe(empresa_id);
create index idx_fundings_empresa_status on public.fundings(empresa_id,status);
create index idx_lotes_empresa_status on public.lotes_pagamento(empresa_id,status);
create index idx_alocacoes_empresa on public.alocacoes_funding(empresa_id);
create index idx_cobrancas_plataforma_empresa on public.cobrancas_plataforma(empresa_id);
create index idx_documentos_empresa on public.documentos_fiscais(empresa_id);
create index idx_documentos_cliente on public.documentos_fiscais(cliente_id);
create index idx_logs_empresa_data on public.logs_auditoria(empresa_id,criado_em desc);

-- Escrita por capacidade nas tabelas operacionais existentes.
drop policy if exists "configuracoes_all" on public.configuracoes;
create policy "configuracoes_leitura" on public.configuracoes for select to authenticated using (empresa_id = public.empresa_atual() or public.eh_equipe_plataforma());
create policy "configuracoes_admin_escrita" on public.configuracoes for all to authenticated using (empresa_id = public.empresa_atual() and public.tem_capacidade(auth.uid(),'configuracoes.gerenciar')) with check (empresa_id = public.empresa_atual() and public.tem_capacidade(auth.uid(),'configuracoes.gerenciar'));

drop policy if exists "clientes_all" on public.clientes;
create policy "clientes_leitura" on public.clientes for select to authenticated using (empresa_id = public.empresa_atual() or public.eh_equipe_plataforma());
create policy "clientes_cadastro_escrita" on public.clientes for all to authenticated using (empresa_id = public.empresa_atual() and public.tem_capacidade(auth.uid(),'cadastros.gerenciar')) with check (empresa_id = public.empresa_atual() and public.tem_capacidade(auth.uid(),'cadastros.gerenciar'));

drop policy if exists "freelancers_all" on public.freelancers;
create policy "freelancers_leitura" on public.freelancers for select to authenticated using (empresa_id = public.empresa_atual() or public.eh_equipe_plataforma());
create policy "freelancers_cadastro_escrita" on public.freelancers for all to authenticated using (empresa_id = public.empresa_atual() and public.tem_capacidade(auth.uid(),'cadastros.gerenciar')) with check (empresa_id = public.empresa_atual() and public.tem_capacidade(auth.uid(),'cadastros.gerenciar'));

drop policy if exists "eventos_all" on public.eventos;
create policy "eventos_leitura" on public.eventos for select to authenticated using (empresa_id = public.empresa_atual() or public.eh_equipe_plataforma());
create policy "eventos_gestao_escrita" on public.eventos for all to authenticated using (empresa_id = public.empresa_atual() and public.tem_capacidade(auth.uid(),'eventos.gerenciar')) with check (empresa_id = public.empresa_atual() and public.tem_capacidade(auth.uid(),'eventos.gerenciar'));

drop policy if exists "equipes_all" on public.equipes;
create policy "equipes_leitura" on public.equipes for select to authenticated using (public.empresa_da_equipe(id) = public.empresa_atual() or public.eh_equipe_plataforma());
create policy "equipes_gestao_escrita" on public.equipes for all to authenticated using (public.empresa_da_equipe(id) = public.empresa_atual() and public.tem_capacidade(auth.uid(),'eventos.gerenciar')) with check (exists(select 1 from public.eventos e where e.id = equipes.evento_id and e.empresa_id = public.empresa_atual()) and public.tem_capacidade(auth.uid(),'eventos.gerenciar'));

drop policy if exists "escalas_all" on public.escalas;
create policy "escalas_leitura" on public.escalas for select to authenticated using (public.empresa_da_equipe(equipe_id) = public.empresa_atual() or public.eh_equipe_plataforma());
create policy "escalas_gestao_escrita" on public.escalas for all to authenticated using (public.empresa_da_equipe(equipe_id) = public.empresa_atual() and public.tem_capacidade(auth.uid(),'eventos.gerenciar')) with check (public.empresa_da_equipe(equipe_id) = public.empresa_atual() and public.tem_capacidade(auth.uid(),'eventos.gerenciar'));

drop policy if exists "pontos_all" on public.pontos;
create policy "pontos_leitura" on public.pontos for select to authenticated using (public.empresa_da_escala(escala_id) = public.empresa_atual() or public.eh_equipe_plataforma());
create policy "pontos_operacao_escrita" on public.pontos for all to authenticated using (public.empresa_da_escala(escala_id) = public.empresa_atual() and public.tem_capacidade(auth.uid(),'operacao.supervisionar')) with check (public.empresa_da_escala(escala_id) = public.empresa_atual() and public.tem_capacidade(auth.uid(),'operacao.supervisionar'));

drop policy if exists "ocorrencias_all" on public.ocorrencias;
create policy "ocorrencias_leitura" on public.ocorrencias for select to authenticated using (public.empresa_da_escala(escala_id) = public.empresa_atual() or public.eh_equipe_plataforma());
create policy "ocorrencias_operacao_escrita" on public.ocorrencias for all to authenticated using (public.empresa_da_escala(escala_id) = public.empresa_atual() and public.tem_capacidade(auth.uid(),'operacao.supervisionar')) with check (public.empresa_da_escala(escala_id) = public.empresa_atual() and public.tem_capacidade(auth.uid(),'operacao.supervisionar'));

drop policy if exists "fechamentos_all" on public.fechamentos;
create policy "fechamentos_leitura" on public.fechamentos for select to authenticated using (public.empresa_da_escala(escala_id) = public.empresa_atual() or public.eh_equipe_plataforma());
create policy "fechamentos_aprovacao_escrita" on public.fechamentos for all to authenticated using (public.empresa_da_escala(escala_id) = public.empresa_atual() and public.tem_capacidade(auth.uid(),'fechamento.aprovar')) with check (public.empresa_da_escala(escala_id) = public.empresa_atual() and public.tem_capacidade(auth.uid(),'fechamento.aprovar'));

drop policy if exists "pagamentos_all" on public.pagamentos;
create policy "pagamentos_leitura" on public.pagamentos for select to authenticated using (public.empresa_do_fechamento(fechamento_id) = public.empresa_atual() or public.eh_equipe_plataforma());
create policy "pagamentos_financeiro_escrita" on public.pagamentos for all to authenticated using (public.empresa_do_fechamento(fechamento_id) = public.empresa_atual() and public.tem_capacidade(auth.uid(),'financeiro.gerenciar')) with check (public.empresa_do_fechamento(fechamento_id) = public.empresa_atual() and public.tem_capacidade(auth.uid(),'financeiro.gerenciar'));

revoke all on function public.validar_cliente_evento_mesma_empresa() from public, anon, authenticated;
grant execute on function public.validar_cliente_evento_mesma_empresa() to service_role;