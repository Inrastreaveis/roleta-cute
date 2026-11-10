create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  role text not null default 'pending' check (role in ('owner','admin','moderator','pending')),
  created_at timestamptz not null default now()
);

create table if not exists public.participants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  normalized_name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.device_registrations (
  device_hash text primary key,
  participant_id uuid not null unique references public.participants(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.site_settings (
  key text primary key,
  value jsonb not null
);

create table if not exists public.links (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  url text not null,
  icon text not null default '💗',
  color text not null default '#f3a6c8',
  sort_order integer not null default 0,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.draws (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null,
  participant_id uuid references public.participants(id) on delete set null,
  winner_name text not null,
  is_current boolean not null default true,
  replaced_by uuid references public.draws(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists draws_batch_idx on public.draws(batch_id);
create index if not exists draws_created_idx on public.draws(created_at desc);

create table if not exists public.draw_events (
  id bigint generated always as identity primary key,
  event_type text not null check (event_type in ('draw_started','draw_replacement')),
  payload jsonb not null,
  created_at timestamptz not null default now()
);

insert into public.site_settings(key,value) values
 ('site_title','"Roleta Cute"'::jsonb),
 ('site_subtitle','"Entre na roleta e boa sorte! ✨"'::jsonb),
 ('theme','"pink"'::jsonb),
 ('background_type','"gradient"'::jsonb),
 ('background_value','""'::jsonb),
 ('music_file','""'::jsonb),
 ('music_title','""'::jsonb),
 ('music_enabled','false'::jsonb),
 ('allow_join','true'::jsonb)
on conflict (key) do nothing;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_already_exists boolean;
begin
  perform pg_advisory_xact_lock(73190421);
  select exists(select 1 from public.profiles where role = 'owner') into owner_already_exists;
  insert into public.profiles(id,email,role)
  values (new.id, lower(new.email), case when owner_already_exists then 'pending' else 'owner' end)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_roleta on auth.users;
create trigger on_auth_user_created_roleta
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.has_role(allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = any(allowed_roles)
  );
$$;

create or replace function public.owner_exists()
returns boolean
language sql
stable
security definer
set search_path = public
as $$ select exists(select 1 from public.profiles where role = 'owner'); $$;

create or replace function public.device_registration_status(p_device_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare found_row record;
begin
  if p_device_hash !~ '^[a-f0-9]{64}$' then
    return jsonb_build_object('registered',false,'participant',null);
  end if;
  select p.id,p.name,p.created_at into found_row
  from public.device_registrations d
  join public.participants p on p.id=d.participant_id
  where d.device_hash=p_device_hash;
  if not found then return jsonb_build_object('registered',false,'participant',null); end if;
  return jsonb_build_object('registered',true,'participant',to_jsonb(found_row));
end;
$$;

create or replace function public.register_participant(p_name text, p_device_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_name text;
  norm_name text;
  new_person public.participants%rowtype;
  allow_value jsonb;
begin
  select value into allow_value from public.site_settings where key='allow_join';
  if coalesce(allow_value,'true'::jsonb) <> 'true'::jsonb then
    raise exception 'As inscrições estão pausadas no momento.';
  end if;
  clean_name := left(trim(regexp_replace(coalesce(p_name,''), '\s+', ' ', 'g')),32);
  if char_length(clean_name) < 2 or clean_name !~ '[[:alnum:]]' then
    raise exception 'Digite um nome válido com pelo menos 2 caracteres.';
  end if;
  if p_device_hash !~ '^[a-f0-9]{64}$' then raise exception 'Identificador do dispositivo inválido.'; end if;
  if exists(select 1 from public.device_registrations where device_hash=p_device_hash) then
    raise exception 'Este dispositivo já participou. Cada dispositivo só pode se inscrever uma vez.';
  end if;
  norm_name := lower(clean_name);
  insert into public.participants(name,normalized_name)
    values(clean_name,norm_name) returning * into new_person;
  insert into public.device_registrations(device_hash,participant_id)
    values(p_device_hash,new_person.id);
  return jsonb_build_object('id',new_person.id,'name',new_person.name,'created_at',new_person.created_at);
exception
  when unique_violation then
    if exists(select 1 from public.device_registrations where device_hash=p_device_hash) then
      raise exception 'Este dispositivo já participou. Cada dispositivo só pode se inscrever uma vez.';
    end if;
    raise exception 'Esse nome já está participando da roleta.';
end;
$$;

create or replace function public.admin_add_participant(p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare clean_name text; new_person public.participants%rowtype;
begin
  if not public.has_role(array['owner','admin','moderator']) then raise exception 'Você não tem permissão para adicionar participantes.'; end if;
  clean_name := left(trim(regexp_replace(coalesce(p_name,''), '\s+', ' ', 'g')),32);
  if char_length(clean_name)<2 or clean_name !~ '[[:alnum:]]' then raise exception 'Digite um nome válido.'; end if;
  insert into public.participants(name,normalized_name) values(clean_name,lower(clean_name)) returning * into new_person;
  return jsonb_build_object('id',new_person.id,'name',new_person.name,'created_at',new_person.created_at);
exception when unique_violation then raise exception 'Esse nome já está participando da roleta.';
end;
$$;

create or replace function public.admin_remove_participant(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_role(array['owner','admin','moderator']) then raise exception 'Você não tem permissão para remover participantes.'; end if;
  delete from public.participants where id=p_id;
  if not found then raise exception 'Participante não encontrado.'; end if;
end;
$$;

create or replace function public.admin_clear_participants()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_role(array['owner','admin']) then raise exception 'Você não tem permissão para limpar a lista.'; end if;
  delete from public.participants;
end;
$$;

create or replace function public.perform_draw(p_count integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  total_count integer;
  batch uuid := gen_random_uuid();
  snapshot jsonb;
  winners jsonb;
begin
  if not public.has_role(array['owner','admin']) then raise exception 'Somente proprietário ou administrador pode sortear.'; end if;
  if p_count is null or p_count < 1 then raise exception 'Informe uma quantidade válida de ganhadores.'; end if;
  select count(*) into total_count from public.participants;
  if p_count > total_count then raise exception 'Existem apenas % participantes na roleta.', total_count; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) order by created_at,id),'[]'::jsonb)
    into snapshot from public.participants;
  with chosen as (
    select id,name from public.participants order by gen_random_uuid() limit p_count
  ), inserted as (
    insert into public.draws(batch_id,participant_id,winner_name)
    select batch,id,name from chosen
    returning id,participant_id,winner_name
  )
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'participant_id',participant_id,'name',winner_name)),'[]'::jsonb)
    into winners from inserted;
  insert into public.draw_events(event_type,payload)
    values('draw_started',jsonb_build_object('winners',winners,'participants',snapshot));
  return jsonb_build_object('winners',winners,'participants',snapshot);
end;
$$;

create or replace function public.redraw_winner(p_draw_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  old_draw public.draws%rowtype;
  chosen public.participants%rowtype;
  new_draw public.draws%rowtype;
  snapshot jsonb;
  winner_json jsonb;
begin
  if not public.has_role(array['owner','admin']) then raise exception 'Somente proprietário ou administrador pode refazer o sorteio.'; end if;
  select * into old_draw from public.draws where id=p_draw_id for update;
  if not found or not old_draw.is_current then raise exception 'Este resultado não está mais ativo.'; end if;
  select p.* into chosen from public.participants p
    where p.id <> coalesce(old_draw.participant_id,'00000000-0000-0000-0000-000000000000'::uuid)
      and not exists(select 1 from public.draws d where d.batch_id=old_draw.batch_id and d.is_current=true and d.participant_id=p.id)
    order by gen_random_uuid() limit 1;
  if not found then raise exception 'Não há outro participante disponível para substituir este ganhador.'; end if;
  insert into public.draws(batch_id,participant_id,winner_name)
    values(old_draw.batch_id,chosen.id,chosen.name) returning * into new_draw;
  update public.draws set is_current=false,replaced_by=new_draw.id where id=old_draw.id;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) order by created_at,id),'[]'::jsonb)
    into snapshot from public.participants;
  winner_json := jsonb_build_object('id',new_draw.id,'participant_id',chosen.id,'name',chosen.name);
  insert into public.draw_events(event_type,payload)
    values('draw_replacement',jsonb_build_object('oldDrawId',old_draw.id,'winner',winner_json,'participants',snapshot));
  return jsonb_build_object('winner',winner_json,'participants',snapshot);
end;
$$;

create or replace function public.set_user_role_by_email(p_email text,p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare affected integer;
begin
  if not public.has_role(array['owner']) then raise exception 'Somente o proprietário pode gerenciar permissões.'; end if;
  if p_role not in ('admin','moderator') then raise exception 'Permissão inválida.'; end if;
  update public.profiles set role=p_role where lower(email)=lower(trim(p_email)) and role <> 'owner';
  get diagnostics affected = row_count;
  if affected=0 then raise exception 'Não encontramos uma conta pendente com esse e-mail. Peça à pessoa para criar a conta primeiro.'; end if;
end;
$$;

create or replace function public.revoke_user_access(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_role(array['owner']) then raise exception 'Somente o proprietário pode revogar acessos.'; end if;
  if p_user_id=auth.uid() then raise exception 'Você não pode revogar seu próprio acesso.'; end if;
  update public.profiles set role='pending' where id=p_user_id and role <> 'owner';
  if not found then raise exception 'Conta não encontrada ou não pode ser revogada.'; end if;
end;
$$;

-- RLS
alter table public.profiles enable row level security;
alter table public.participants enable row level security;
alter table public.device_registrations enable row level security;
alter table public.site_settings enable row level security;
alter table public.links enable row level security;
alter table public.draws enable row level security;
alter table public.draw_events enable row level security;

drop policy if exists profiles_read_self_or_owner on public.profiles;
create policy profiles_read_self_or_owner on public.profiles for select to authenticated
  using (id=auth.uid() or public.has_role(array['owner']));

drop policy if exists participants_public_read on public.participants;
create policy participants_public_read on public.participants for select to anon,authenticated using (true);

drop policy if exists settings_public_read on public.site_settings;
create policy settings_public_read on public.site_settings for select to anon,authenticated using (true);
drop policy if exists settings_admin_insert on public.site_settings;
create policy settings_admin_insert on public.site_settings for insert to authenticated with check (public.has_role(array['owner','admin']));
drop policy if exists settings_admin_update on public.site_settings;
create policy settings_admin_update on public.site_settings for update to authenticated using (public.has_role(array['owner','admin'])) with check (public.has_role(array['owner','admin']));

drop policy if exists links_public_read on public.links;
create policy links_public_read on public.links for select to anon,authenticated using (enabled=true or public.has_role(array['owner','admin']));
drop policy if exists links_admin_insert on public.links;
create policy links_admin_insert on public.links for insert to authenticated with check (public.has_role(array['owner','admin']));
drop policy if exists links_admin_update on public.links;
create policy links_admin_update on public.links for update to authenticated using (public.has_role(array['owner','admin'])) with check (public.has_role(array['owner','admin']));
drop policy if exists links_admin_delete on public.links;
create policy links_admin_delete on public.links for delete to authenticated using (public.has_role(array['owner','admin']));

drop policy if exists draws_admin_read on public.draws;
create policy draws_admin_read on public.draws for select to authenticated using (public.has_role(array['owner','admin']));

drop policy if exists draw_events_public_read on public.draw_events;
create policy draw_events_public_read on public.draw_events for select to anon,authenticated using (true);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('roleta-assets','roleta-assets',true,31457280,array['image/jpeg','image/png','image/webp','audio/mpeg','audio/ogg','audio/wav','audio/mp4','audio/x-m4a'])
on conflict (id) do update set public=true,file_size_limit=31457280,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists roleta_assets_public_read on storage.objects;
create policy roleta_assets_public_read on storage.objects for select to anon,authenticated using (bucket_id='roleta-assets');
drop policy if exists roleta_assets_admin_insert on storage.objects;
create policy roleta_assets_admin_insert on storage.objects for insert to authenticated with check (bucket_id='roleta-assets' and public.has_role(array['owner','admin']));
drop policy if exists roleta_assets_admin_update on storage.objects;
create policy roleta_assets_admin_update on storage.objects for update to authenticated using (bucket_id='roleta-assets' and public.has_role(array['owner','admin'])) with check (bucket_id='roleta-assets' and public.has_role(array['owner','admin']));
drop policy if exists roleta_assets_admin_delete on storage.objects;
create policy roleta_assets_admin_delete on storage.objects for delete to authenticated using (bucket_id='roleta-assets' and public.has_role(array['owner','admin']));

revoke all on function public.owner_exists() from public;
grant execute on function public.owner_exists() to anon,authenticated;
revoke all on function public.device_registration_status(text) from public;
grant execute on function public.device_registration_status(text) to anon,authenticated;
revoke all on function public.register_participant(text,text) from public;
grant execute on function public.register_participant(text,text) to anon,authenticated;
revoke all on function public.admin_add_participant(text) from public;
grant execute on function public.admin_add_participant(text) to authenticated;
revoke all on function public.admin_remove_participant(uuid) from public;
grant execute on function public.admin_remove_participant(uuid) to authenticated;
revoke all on function public.admin_clear_participants() from public;
grant execute on function public.admin_clear_participants() to authenticated;
revoke all on function public.perform_draw(integer) from public;
grant execute on function public.perform_draw(integer) to authenticated;
revoke all on function public.redraw_winner(uuid) from public;
grant execute on function public.redraw_winner(uuid) to authenticated;
revoke all on function public.set_user_role_by_email(text,text) from public;
grant execute on function public.set_user_role_by_email(text,text) to authenticated;
revoke all on function public.revoke_user_access(uuid) from public;
grant execute on function public.revoke_user_access(uuid) to authenticated;

grant usage on schema public to anon,authenticated;
grant select on public.participants,public.site_settings,public.links,public.draw_events to anon,authenticated;
grant select on public.profiles,public.draws to authenticated;
grant insert,update,delete on public.site_settings,public.links to authenticated;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='participants') then
    alter publication supabase_realtime add table public.participants;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='site_settings') then
    alter publication supabase_realtime add table public.site_settings;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='links') then
    alter publication supabase_realtime add table public.links;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='draw_events') then
    alter publication supabase_realtime add table public.draw_events;
  end if;
end $$;
