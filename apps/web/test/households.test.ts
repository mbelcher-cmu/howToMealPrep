import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

// Household invites, against every migration in an in-process Postgres (see rls.test.ts).
const MIGRATIONS = join(__dirname, "../../../supabase/migrations");
const OWNER = "11111111-1111-1111-1111-111111111111";
const KID = "22222222-2222-2222-2222-222222222222";
const STRANGER = "33333333-3333-3333-3333-333333333333";

describe("household invites", () => {
  const db = new PGlite();
  const as = (who: string) => db.exec(`reset role; set role authenticated; set request.jwt.claim.sub = '${who}';`);
  const one = async <T>(sql: string) => (await db.query<{ v: T }>(sql)).rows[0]!.v;
  let code = "";

  beforeAll(async () => {
    await db.exec(`create schema auth; create table auth.users (id uuid primary key, email text);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create role anon; create role authenticated; grant usage on schema auth to anon, authenticated;`);
    for (const f of readdirSync(MIGRATIONS).filter((x) => x.endsWith(".sql")).sort()) await db.exec(readFileSync(join(MIGRATIONS, f), "utf8"));
    await db.exec(`grant usage on schema public to authenticated, anon;
      grant all on all tables in schema public to authenticated, anon;
      grant all on all sequences in schema public to authenticated;
      insert into auth.users values ('${OWNER}', 'michael@example.com'), ('${KID}', 'sam@example.com'), ('${STRANGER}', 'x@example.com');`);
    await as(OWNER);
    await db.exec(`insert into public.plans (client_id, days, result, schedule) values ('p1', 7, '{"cart":[]}', '{"days":[]}');
      select public.save_settings(0, '{"v":2,"savedAt":10,"settings":{"currentId":"p1","weekOf":"2026-11-09","checked":{"aldi:rice":true}}}');`);
  }, 60000);

  it("the owner makes an invite code", async () => {
    await as(OWNER);
    code = await one<string>(`select public.create_household_invite() as v`);
    expect(code).toMatch(/^[A-Z0-9]{8}$/);
    const info = await one<{ role: string; invites: unknown[] }>(`select public.household_info() as v`);
    expect(info.role).toBe("owner");
    expect(info.invites).toHaveLength(1);
  });

  it("nobody sees the household plan before joining", async () => {
    await as(KID);
    expect(await one(`select public.household_plan() as v`)).toBeNull();
    expect(await one(`select public.household_info() as v`)).toBeNull();
  });

  it("someone joins with the code and sees the owner's current plan", async () => {
    await as(KID);
    expect(await one<string>(`select public.join_household('${code.toLowerCase()}') as v`)).toBe("michael");
    const hp = await one<{ ownerName: string; weekOf: string; checked: Record<string, boolean>; plan: { id: string; days: number } }>(`select public.household_plan() as v`);
    expect(hp.ownerName).toBe("michael");
    expect(hp.plan.id).toBe("p1");
    expect(hp.weekOf).toBe("2026-11-09");
    expect(hp.checked).toEqual({ "aldi:rice": true });
    // still no direct access to the owner's rows
    expect(Number(await one(`select count(*)::int as v from public.plans`))).toBe(0);
    const info = await one<{ role: string; members: { name: string }[] }>(`select public.household_info() as v`);
    expect(info.role).toBe("member");
    expect(info.members.map((m) => m.name)).toEqual(["sam"]);
  });

  it("a code works once", async () => {
    await as(STRANGER);
    await expect(db.exec(`select public.join_household('${code}')`)).rejects.toThrow(/invite not valid/);
    await expect(db.exec(`select public.join_household('NOPE1234')`)).rejects.toThrow(/invite not valid/);
  });

  it("the owner can remove someone, and they lose access", async () => {
    await as(OWNER);
    await db.exec(`select public.leave_household('${KID}')`);
    await as(KID);
    expect(await one(`select public.household_plan() as v`)).toBeNull();
  });

  it("a stranger can't remove members of someone else's household", async () => {
    await as(OWNER);
    const c = await one<string>(`select public.create_household_invite() as v`);
    await as(KID);
    await db.exec(`select public.join_household('${c}')`);
    await as(STRANGER);
    await db.exec(`select public.leave_household('${KID}')`);
    await as(KID);
    expect(await one(`select public.household_plan() as v`)).not.toBeNull();
  });

  it("members can't make invites, and signed-out visitors can't call anything", async () => {
    await as(KID);
    await expect(db.exec(`select public.create_household_invite()`)).rejects.toThrow(/already in another household/);
    await db.exec(`reset role; set role anon; set request.jwt.claim.sub = '';`);
    await expect(db.exec(`select public.household_plan()`)).rejects.toThrow(/permission denied/);
  });

  it("deleting the owner's account ends the household", async () => {
    await as(OWNER);
    await db.exec(`select public.delete_account()`);
    await as(KID);
    expect(await one(`select public.household_info() as v`)).toBeNull();
  });
});
