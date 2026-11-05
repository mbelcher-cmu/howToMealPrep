-- Sprint 2: household invites. One person (the owner) plans and shops; the people they invite see
-- the same plan and grocery list on their own phones. Nobody can read anyone else's data directly:
-- members get the owner's current plan only through household_plan().

create table public.households (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null unique references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null unique references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) <= 60),
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create table public.household_invites (
  code text primary key check (code ~ '^[A-Z0-9]{8}$'),
  household_id uuid not null references public.households (id) on delete cascade,
  expires_at timestamptz not null default now() + interval '7 days',
  used_by uuid references auth.users (id) on delete set null
);

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.household_invites enable row level security;
-- reads and writes go through the functions below; direct access sees only your own household
create policy "own household" on public.households for select using (owner = auth.uid());
create policy "household members" on public.household_members for select
  using (user_id = auth.uid() or household_id in (select id from public.households where owner = auth.uid()));

-- a short name for someone, from their profile or email
create function public.person_name(uid uuid) returns text language sql stable security definer set search_path = public, auth as $$
  select coalesce(nullif(trim(p.display_name), ''), split_part(u.email, '@', 1), 'Someone')
  from auth.users u left join public.profiles p on p.id = u.id where u.id = uid
$$;
revoke execute on function public.person_name(uuid) from public, anon, authenticated;

-- Makes an invite code for the caller's household, creating the household on first use.
create function public.create_household_invite() returns text
language plpgsql security definer set search_path = public as $$
declare hid uuid; c text;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if exists (select 1 from household_members where user_id = auth.uid()) then
    raise exception 'already in another household' using errcode = 'P0001';
  end if;
  insert into households (owner) values (auth.uid()) on conflict (owner) do nothing;
  select id into hid from households where owner = auth.uid();
  delete from household_invites where household_id = hid and (expires_at < now() or used_by is not null);
  if (select count(*) from household_invites where household_id = hid) >= 10 then
    raise exception 'too many open invites' using errcode = 'P0001';
  end if;
  c := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  insert into household_invites (code, household_id) values (c, hid);
  return c;
end $$;

-- Joins the household behind a code. Returns the owner's name.
create function public.join_household(invite text) returns text
language plpgsql security definer set search_path = public as $$
declare inv household_invites; own uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into inv from household_invites where code = upper(trim(invite)) for update;
  if not found or inv.expires_at < now() or inv.used_by is not null then
    raise exception 'invite not valid' using errcode = 'P0001';
  end if;
  select owner into own from households where id = inv.household_id;
  if own = auth.uid() then raise exception 'own household' using errcode = 'P0001'; end if;
  if exists (select 1 from households where owner = auth.uid()) then
    raise exception 'owns a household' using errcode = 'P0001';
  end if;
  delete from household_members where user_id = auth.uid();
  insert into household_members (household_id, user_id, display_name) values (inv.household_id, auth.uid(), person_name(auth.uid()));
  update household_invites set used_by = auth.uid() where code = inv.code;
  return person_name(own);
end $$;

-- Who is in the caller's household, as owner or member.
create function public.household_info() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare hid uuid; own uuid;
begin
  if auth.uid() is null then return null; end if;
  select id, owner into hid, own from households where owner = auth.uid();
  if hid is null then
    select h.id, h.owner into hid, own from household_members m join households h on h.id = m.household_id where m.user_id = auth.uid();
  end if;
  if hid is null then return null; end if;
  return jsonb_build_object(
    'role', case when own = auth.uid() then 'owner' else 'member' end,
    'ownerName', person_name(own),
    'members', coalesce((select jsonb_agg(jsonb_build_object('id', user_id, 'name', display_name) order by joined_at) from household_members where household_id = hid), '[]'::jsonb),
    'invites', case when own = auth.uid() then coalesce((select jsonb_agg(jsonb_build_object('code', code, 'expiresAt', expires_at)) from household_invites where household_id = hid and used_by is null and expires_at > now()), '[]'::jsonb) else '[]'::jsonb end
  );
end $$;

-- Leave the household you joined, or (as owner) remove someone from yours.
create function public.leave_household(member uuid default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if member is null or member = auth.uid() then
    delete from household_members where user_id = auth.uid();
  else
    delete from household_members m using households h
     where h.id = m.household_id and h.owner = auth.uid() and m.user_id = member;
  end if;
end $$;

-- Cancels an unused invite code (owner only).
create function public.cancel_household_invite(invite text) returns void
language sql security definer set search_path = public as $$
  delete from household_invites i using households h
   where h.id = i.household_id and h.owner = auth.uid() and i.code = upper(trim(invite)) and i.used_by is null
$$;

-- The household's current plan, for a member: the owner's current plan and the week it's for.
create function public.household_plan() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare own uuid; s jsonb; pid text; p plans;
begin
  if auth.uid() is null then return null; end if;
  select h.owner into own from household_members m join households h on h.id = m.household_id where m.user_id = auth.uid();
  if own is null then return null; end if;
  select settings->'settings' into s from profiles where id = own;
  pid := s->>'currentId';
  if pid is null then return jsonb_build_object('ownerName', person_name(own), 'plan', null); end if;
  select * into p from plans where owner = own and client_id = pid;
  if not found then return jsonb_build_object('ownerName', person_name(own), 'plan', null); end if;
  return jsonb_build_object(
    'ownerName', person_name(own),
    'weekOf', s->'weekOf',
    'checked', coalesce(s->'checked', '{}'::jsonb),
    'plan', jsonb_build_object('id', p.client_id, 'key', coalesce(p.input_key, ''), 'createdAt', p.created_at, 'days', p.days, 'result', p.result, 'schedule', p.schedule)
  );
end $$;

do $$
declare f text;
begin
  foreach f in array array['create_household_invite()', 'join_household(text)', 'household_info()', 'leave_household(uuid)', 'cancel_household_invite(text)', 'household_plan()'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
