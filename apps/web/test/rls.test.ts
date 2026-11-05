import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

// Applies every migration to an in-process Postgres with a stand-in for Supabase's auth schema,
// then checks that one person can never read or write another person's rows.
const MIGRATIONS = join(__dirname, "../../../supabase/migrations");
const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";

describe("database row-level security", () => {
  const db = new PGlite();
  const as = (who: string) => db.exec(`reset role; set role authenticated; set request.jwt.claim.sub = '${who}';`);
  const count = async (table: string) => Number((await db.query<{ n: number }>(`select count(*)::int as n from public.${table}`)).rows[0]!.n);

  beforeAll(async () => {
    await db.exec(`create schema auth; create table auth.users (id uuid primary key, email text);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create role anon; create role authenticated; grant usage on schema auth to anon, authenticated;`);
    for (const f of readdirSync(MIGRATIONS).filter((x) => x.endsWith(".sql")).sort()) await db.exec(readFileSync(join(MIGRATIONS, f), "utf8"));
    await db.exec(`grant usage on schema public to authenticated, anon;
      grant all on all tables in schema public to authenticated, anon;
      grant all on all sequences in schema public to authenticated;
      insert into auth.users values ('${A}'), ('${B}');`);
    await as(A);
    await db.exec(`insert into public.plans (client_id, days, result, schedule) values ('p0', 7, '{}', '{}');
      insert into public.pantry_items (ingredient_id, grams) values ('peanut_butter', 270);
      insert into public.price_observations (ingredient_id, chain, price, source) values ('peanut_butter', 'aldi', 2.49, 'receipt');`);
  }, 60000);

  it("gives every new account a profile", async () => {
    await as(A);
    expect(await count("profiles")).toBe(1);
  });

  it("shows people only their own rows", async () => {
    await as(A);
    for (const t of ["plans", "pantry_items", "price_observations"]) expect(await count(t)).toBe(1);
    await as(B);
    for (const t of ["profiles", "plans", "pantry_items", "price_observations"]) expect(await count(t)).toBe(t === "profiles" ? 1 : 0);
  });

  it("refuses writes on someone else's behalf", async () => {
    await as(B);
    await expect(db.exec(`insert into public.plans (owner, client_id, days, result, schedule) values ('${A}', 'x', 7, '{}', '{}')`)).rejects.toThrow(/row-level security/);
    await db.exec(`update public.pantry_items set grams = 0`);
    await as(A);
    expect(Number((await db.query<{ g: string }>(`select grams as g from public.pantry_items`)).rows[0]!.g)).toBe(270);
  });

  it("lets signed-out visitors see nothing", async () => {
    await db.exec(`reset role; set role anon; set request.jwt.claim.sub = '';`);
    for (const t of ["profiles", "plans", "pantry_items", "price_observations"]) expect(await count(t)).toBe(0);
    expect((await db.query<{ ping: string }>("select public.ping()")).rows[0]!.ping).toBe("ok");
  });

  it("saves settings only when nobody else saved in between", async () => {
    await as(A);
    const save = async (expected: number, savedAt: number) =>
      (await db.query<{ ok: boolean }>(`select public.save_settings(${expected}, '{"v":2,"savedAt":${savedAt},"settings":{}}'::jsonb) as ok`)).rows[0]!.ok;
    expect(await save(0, 100)).toBe(true);
    expect(await save(0, 200)).toBe(false);
    expect(await save(100, 200)).toBe(true);
    await as(B);
    expect(await save(0, 50)).toBe(true);
    await as(A);
    expect((await db.query<{ s: string }>(`select settings->>'savedAt' as s from public.profiles`)).rows[0]!.s).toBe("200");
  });

  it("stores each recorded price once, however often a device sends it", async () => {
    await as(A);
    const add = `insert into public.price_observations (ingredient_id, chain, price, source, client_key) values ('rice', 'aldi', 1.99, 'manual', 'rice|aldi|x') on conflict (owner, client_key) do nothing`;
    await db.exec(add);
    await db.exec(add);
    expect(Number((await db.query<{ n: number }>(`select count(*)::int as n from public.price_observations where client_key is not null`)).rows[0]!.n)).toBe(1);
  });

  it("refuses to delete an account when signed out", async () => {
    await db.exec(`reset role; set role anon; set request.jwt.claim.sub = '';`);
    await expect(db.exec(`select public.delete_account()`)).rejects.toThrow();
  });

  it("deleting an account removes all its rows and nobody else's", async () => {
    await as(A);
    await db.exec(`insert into public.plans (client_id, days, result, schedule) values ('p1', 7, '{}', '{}')`);
    await db.exec(`select public.delete_account()`);
    for (const t of ["profiles", "plans", "pantry_items", "price_observations"]) expect(await count(t)).toBe(0);
    await db.exec(`reset role`);
    expect(Number((await db.query<{ n: number }>(`select count(*)::int as n from auth.users`)).rows[0]!.n)).toBe(1);
    await as(B);
    expect(await count("profiles")).toBe(1);
  });
});
