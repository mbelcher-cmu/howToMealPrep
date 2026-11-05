import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { communityFromRatings, type Community } from "@prep-cart/planner";

// Recipe ratings and community numbers, against every migration in an in-process Postgres (see rls.test.ts).
const MIGRATIONS = join(__dirname, "../../../supabase/migrations");
const users = Array.from({ length: 6 }, (_, i) => `${i + 1}`.repeat(8) + "-1111-1111-1111-111111111111");

describe("recipe ratings", () => {
  const db = new PGlite();
  const as = (who: string) => db.exec(`reset role; set role authenticated; set request.jwt.claim.sub = '${who}';`);
  const count = async () => Number((await db.query<{ n: number }>(`select count(*)::int as n from public.recipe_ratings`)).rows[0]!.n);
  const setMine = (doc: Record<string, unknown>) => db.query(`select public.set_my_ratings($1::jsonb)`, [JSON.stringify(doc)]);
  const community = async () => (await db.query<{ c: Community }>(`select public.recipe_community() as c`)).rows[0]!.c;

  beforeAll(async () => {
    await db.exec(`create schema auth; create table auth.users (id uuid primary key, email text);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create role anon; create role authenticated; grant usage on schema auth to anon, authenticated;`);
    for (const f of readdirSync(MIGRATIONS).filter((x) => x.endsWith(".sql")).sort()) await db.exec(readFileSync(join(MIGRATIONS, f), "utf8"));
    await db.exec(`grant usage on schema public to authenticated, anon;
      grant all on all tables in schema public to authenticated, anon;
      grant all on all sequences in schema public to authenticated;
      insert into auth.users values ${users.map((u) => `('${u}')`).join(", ")};`);
  }, 60000);

  it("mirrors a person's ratings, dropping removed ones, junk and their own recipes", async () => {
    await as(users[0]!);
    await setMine({ tacos: 5, curry: 2, custom_mine: 5, bad: 7, half: 2.5, text: "5" });
    expect((await db.query<{ recipe_id: string; stars: number }>(`select recipe_id, stars from public.recipe_ratings order by 1`)).rows)
      .toEqual([{ recipe_id: "curry", stars: 2 }, { recipe_id: "tacos", stars: 5 }]);
    await setMine({ tacos: 4 });
    expect((await db.query<{ recipe_id: string; stars: number }>(`select recipe_id, stars from public.recipe_ratings`)).rows).toEqual([{ recipe_id: "tacos", stars: 4 }]);
    await expect(db.exec(`insert into public.recipe_ratings (recipe_id, stars) values ('custom_x', 3)`)).rejects.toThrow();
  });

  it("never shows anyone else's ratings", async () => {
    await as(users[1]!);
    expect(await count()).toBe(0);
    await expect(db.exec(`insert into public.recipe_ratings (owner, recipe_id, stars) values ('${users[0]}', 'curry', 1)`)).rejects.toThrow(/row-level security/);
    await db.exec(`update public.recipe_ratings set stars = 1; delete from public.recipe_ratings;`);
    await as(users[0]!);
    expect(await count()).toBe(1);
    await db.exec(`reset role; set role anon; set request.jwt.claim.sub = '';`);
    expect(await count()).toBe(0);
    await expect(db.exec(`select public.set_my_ratings('{}')`)).rejects.toThrow();
  });

  it("shares only numbers that at least three people stand behind, matching the app's maths", async () => {
    await as(users[0]!);
    await setMine({});
    const rows: { user: string; recipe: string; stars: number }[] = [];
    const taste = [[5, 4, 1, 2], [4, 5, 2, 1], [5, 5, 2, 3], [1, 2, 5, 4], [2, 1, 4, 5]];
    const recipes = ["tacos", "burrito", "curry", "dal"];
    taste.forEach((stars, u) => stars.forEach((s, i) => rows.push({ user: users[u]!, recipe: recipes[i]!, stars: s })));
    // only two people rated "ramen": it must not show up anywhere
    rows.push({ user: users[0]!, recipe: "ramen", stars: 5 }, { user: users[1]!, recipe: "ramen", stars: 1 });
    for (const u of users.slice(0, 5)) {
      await as(u);
      await setMine(Object.fromEntries(rows.filter((r) => r.user === u).map((r) => [r.recipe, r.stars])));
    }
    await db.exec(`reset role; set role anon; set request.jwt.claim.sub = '';`);
    const c = await community();
    expect(JSON.stringify(c)).not.toContain("ramen");
    const js = communityFromRatings(rows);
    const key = (n: { a: string; b: string }) => `${n.a}|${n.b}`;
    expect(c.neighbors.map(key).sort()).toEqual(js.neighbors.map(key).sort());
    for (const n of js.neighbors) {
      const sql = c.neighbors.find((x) => key(x) === key(n))!;
      expect(Number(sql.sim)).toBeCloseTo(n.sim, 3);
      expect(Number(sql.n)).toBe(n.n);
    }
    expect(c.stats.map((s) => s.id).sort()).toEqual(recipes.slice().sort());
    expect(Number(c.stats.find((s) => s.id === "tacos")!.avg)).toBeCloseTo(17 / 5, 3);
    expect(Number(c.neighbors.find((n) => key(n) === "burrito|tacos")!.sim)).toBeGreaterThan(0.5);
    expect(Number(c.neighbors.find((n) => key(n) === "curry|tacos")!.sim)).toBeLessThan(-0.5);
  });

  it("deleting an account removes its ratings", async () => {
    await as(users[0]!);
    await db.exec(`select public.delete_account()`);
    expect(await count()).toBe(0);
    await as(users[1]!);
    expect(await count()).toBeGreaterThan(0);
  });
});

describe("community numbers on the device", async () => {
  const { parseCommunity, shareableRatings } = await import("../src/lib/recommend");

  it("keeps only well-formed numbers from the server", () => {
    expect(parseCommunity(null)).toBeNull();
    expect(parseCommunity({
      neighbors: [{ a: "x", b: "y", sim: "0.5", n: 4 }, { a: "x", b: "z", sim: 3, n: 4 }, { a: 1, b: "y", sim: 0.1, n: 3 }],
      stats: [{ id: "x", avg: "4.25", n: "5" }, { id: "y", avg: 9, n: 5 }],
    })).toEqual({ neighbors: [{ a: "x", b: "y", sim: 0.5, n: 4 }], stats: [{ id: "x", avg: 4.25, n: 5 }] });
  });

  it("shares catalog ratings only, never the person's own recipes", () => {
    expect(shareableRatings({ tacos: 5, custom_abc: 4, odd: 2.5, curry: 1 })).toEqual({ curry: 1, tacos: 5 });
  });
});
