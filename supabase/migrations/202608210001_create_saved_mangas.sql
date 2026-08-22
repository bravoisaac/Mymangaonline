create table if not exists public.saved_mangas (
  user_id uuid not null references auth.users (id) on delete cascade,
  manga_id text not null,
  manga jsonb not null,
  saved_at timestamptz not null default now(),
  primary key (user_id, manga_id),
  constraint saved_mangas_manga_id_length check (char_length(manga_id) between 1 and 512),
  constraint saved_mangas_payload_object check (jsonb_typeof(manga) = 'object'),
  constraint saved_mangas_payload_size check (octet_length(manga::text) <= 32768)
);

create index if not exists saved_mangas_user_saved_at_idx
  on public.saved_mangas (user_id, saved_at desc);

alter table public.saved_mangas enable row level security;

revoke all on table public.saved_mangas from anon;
grant select, insert, update, delete on table public.saved_mangas to authenticated;

drop policy if exists "Users can read their saved mangas" on public.saved_mangas;
create policy "Users can read their saved mangas"
  on public.saved_mangas
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert their saved mangas" on public.saved_mangas;
create policy "Users can insert their saved mangas"
  on public.saved_mangas
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their saved mangas" on public.saved_mangas;
create policy "Users can update their saved mangas"
  on public.saved_mangas
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their saved mangas" on public.saved_mangas;
create policy "Users can delete their saved mangas"
  on public.saved_mangas
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);
