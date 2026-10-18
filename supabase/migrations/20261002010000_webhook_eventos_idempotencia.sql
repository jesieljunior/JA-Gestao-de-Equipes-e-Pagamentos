create table if not exists public.webhook_eventos (
  id uuid primary key default gen_random_uuid(),
  chave_idempotencia text not null unique,
  evento text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'processado' check (status in ('processado','falha')),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

grant select, insert on public.webhook_eventos to authenticated;
grant all on public.webhook_eventos to service_role;

alter table public.webhook_eventos enable row level security;

create policy "webhook_eventos_leitura" on public.webhook_eventos
for select to authenticated
using (public.eh_equipe_plataforma());

create policy "webhook_eventos_insercao" on public.webhook_eventos
for insert to authenticated
with check (public.eh_equipe_plataforma() or auth.uid() is not null);

create trigger tg_webhook_eventos_atualizado_em
before update on public.webhook_eventos
for each row execute function public.tg_atualizado_em();

create index if not exists idx_webhook_eventos_status on public.webhook_eventos(status, criado_em desc);
