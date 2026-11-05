-- Sprint 2: sync each kind of data to its own table instead of one whole-app document,
-- and let people delete their account.

-- Plans are saved whole by the browser and never edited afterwards, so each one is a row keyed
-- by the id the browser gave it.
alter table public.plans add column client_id text;
alter table public.plans add column input_key text;
update public.plans set client_id = id::text where client_id is null;
alter table public.plans alter column client_id set not null;
alter table public.plans add constraint plans_owner_client unique (owner, client_id);
alter table public.plans add constraint plans_client_id_len check (char_length(client_id) <= 64);

-- A price someone recorded is one row; the browser's own key makes uploads safe to repeat.
alter table public.price_observations add column client_key text;
alter table public.price_observations add constraint price_obs_owner_key unique (owner, client_key);
create index price_obs_owner_id on public.price_observations (owner, id);

-- Settings are saved only if nobody else saved since this device last looked (compare and swap on
-- the document's savedAt). Returns false when another device got there first, so the browser
-- merges again instead of overwriting.
create function public.save_settings(expected bigint, doc jsonb) returns boolean
language plpgsql security invoker set search_path = public as $$
declare n int;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into public.profiles (id) values (auth.uid()) on conflict do nothing;
  update public.profiles set settings = doc
   where id = auth.uid()
     and coalesce((settings->>'savedAt')::bigint, 0) = coalesce(expected, 0);
  get diagnostics n = row_count;
  return n = 1;
end $$;
revoke execute on function public.save_settings(bigint, jsonb) from public, anon;
grant execute on function public.save_settings(bigint, jsonb) to authenticated;

-- Deletes the signed-in person's account. Every table references auth.users with on delete
-- cascade, so their profile, plans, pantry and prices go with it.
create function public.delete_account() returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  delete from auth.users where id = auth.uid();
end $$;
revoke execute on function public.delete_account() from public, anon;
grant execute on function public.delete_account() to authenticated;
