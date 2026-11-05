-- Recipe ratings for recommendations. Each person's star ratings are their own rows; nobody can
-- read anyone else's. recipe_community() hands out only numbers worked out across at least three
-- people (how alike two recipes were rated, and each recipe's average), which is what the app
-- needs to say "people with your taste liked this". The same maths is in
-- packages/planner/src/recommend.ts (communityFromRatings) and a test keeps the two in step.

create table public.recipe_ratings (
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- only catalog recipes: people's own recipes (custom_...) stay private to them
  recipe_id text not null check (char_length(recipe_id) between 1 and 64 and recipe_id !~ '^custom_'),
  stars smallint not null check (stars between 1 and 5),
  updated_at timestamptz not null default now(),
  primary key (owner, recipe_id)
);
create index recipe_ratings_recipe on public.recipe_ratings (recipe_id);

alter table public.recipe_ratings enable row level security;
create policy "own ratings" on public.recipe_ratings for all
  using (owner = auth.uid()) with check (owner = auth.uid());

-- Replaces the caller's ratings with the ones in doc ({"recipe_id": stars, ...}). The app keeps
-- ratings in its synced settings and mirrors them here after each sync, so this is safe to repeat.
create function public.set_my_ratings(doc jsonb) returns void
language plpgsql security invoker set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if jsonb_typeof(doc) <> 'object' then raise exception 'ratings must be an object'; end if;
  if (select count(*) from jsonb_object_keys(doc)) > 2000 then raise exception 'too many ratings'; end if;
  delete from recipe_ratings where owner = auth.uid() and not doc ? recipe_id;
  insert into recipe_ratings (owner, recipe_id, stars)
    select auth.uid(), key, (value #>> '{}')::smallint
      from jsonb_each(doc)
     where key !~ '^custom_' and jsonb_typeof(value) = 'number' and (value #>> '{}')::numeric in (1, 2, 3, 4, 5)
  on conflict (owner, recipe_id) do update set stars = excluded.stars, updated_at = now()
    where recipe_ratings.stars is distinct from excluded.stars;
end $$;
revoke execute on function public.set_my_ratings(jsonb) from public, anon;
grant execute on function public.set_my_ratings(jsonb) to authenticated;

-- Community numbers for recommendations, open to everyone (signed in or not) because they hold no
-- one person's ratings:
--   neighbors: for each pair of recipes rated by at least 3 of the same people, the adjusted cosine
--              similarity of those people's ratings (each centred on that person's own average);
--   stats:     each recipe's average stars, once at least 3 people rated it.
create function public.recipe_community() returns jsonb
language sql stable security definer set search_path = public as $$
  with centred as (
    select owner, recipe_id, stars - avg(stars) over (partition by owner) as d
      from recipe_ratings
  ),
  pairs as (
    select x.recipe_id as a, y.recipe_id as b,
           sum(x.d * y.d) as dot, sum(x.d * x.d) as aa, sum(y.d * y.d) as bb, count(*) as n
      from centred x join centred y on x.owner = y.owner and x.recipe_id < y.recipe_id
     group by 1, 2
    having count(*) >= 3
  ),
  stats as (
    select recipe_id as id, avg(stars) as avg, count(*) as n
      from recipe_ratings group by 1 having count(*) >= 3
  )
  select jsonb_build_object(
    'neighbors', coalesce((select jsonb_agg(jsonb_build_object('a', a, 'b', b, 'sim', round((dot / sqrt(aa * bb))::numeric, 4), 'n', n))
                             from pairs where aa > 0 and bb > 0), '[]'::jsonb),
    'stats', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'avg', round(avg::numeric, 3), 'n', n)) from stats), '[]'::jsonb)
  )
$$;
revoke execute on function public.recipe_community() from public;
grant execute on function public.recipe_community() to anon, authenticated;
