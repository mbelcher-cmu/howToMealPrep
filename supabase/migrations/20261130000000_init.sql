-- Prep Cart: first schema. Every table is private to its owner through row-level security.
-- Applied to both projects (staging, production) with `supabase db push`.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 60),
  -- the app's settings (targets, preferences, household) as one document; the browser store's shape
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users (id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  days smallint not null check (days between 1 and 28),
  -- the planner's result and schedule, as produced in the browser
  result jsonb not null,
  schedule jsonb not null,
  shopped_at timestamptz
);
create index plans_owner_created on public.plans (owner, created_at desc);

create table public.pantry_items (
  owner uuid not null references auth.users (id) on delete cascade default auth.uid(),
  ingredient_id text not null,
  -- null grams means "always have it" (a staple)
  grams numeric check (grams is null or grams >= 0),
  use_by date,
  updated_at timestamptz not null default now(),
  primary key (owner, ingredient_id)
);

create table public.price_observations (
  id bigint generated always as identity primary key,
  owner uuid not null references auth.users (id) on delete cascade default auth.uid(),
  ingredient_id text not null,
  chain text not null,
  price numeric(8, 2) not null check (price > 0 and price < 1000),
  source text not null check (source in ('manual', 'receipt', 'sale', 'live')),
  observed_on date not null default current_date,
  zip text check (zip ~ '^[0-9]{5}$')
);
create index price_obs_lookup on public.price_observations (ingredient_id, chain, observed_on desc);

alter table public.profiles enable row level security;
alter table public.plans enable row level security;
alter table public.pantry_items enable row level security;
alter table public.price_observations enable row level security;

create policy "own profile" on public.profiles for all using (id = auth.uid()) with check (id = auth.uid());
create policy "own plans" on public.plans for all using (owner = auth.uid()) with check (owner = auth.uid());
create policy "own pantry" on public.pantry_items for all using (owner = auth.uid()) with check (owner = auth.uid());
create policy "own prices" on public.price_observations for all using (owner = auth.uid()) with check (owner = auth.uid());

-- keep updated_at honest
create function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger pantry_touch before update on public.pantry_items for each row execute function public.touch_updated_at();

-- a profile row for every new account
create function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin insert into public.profiles (id) values (new.id) on conflict do nothing; return new; end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- a tiny public read the keep-alive job can call without touching anyone's data
create function public.ping() returns text language sql stable as $$ select 'ok'::text $$;
grant execute on function public.ping() to anon;
