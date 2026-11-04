import { describe, expect, it } from "vitest";
import { decide, isRemoteDoc, type RemoteDoc, type SyncMeta } from "../src/lib/sync-rules";

const doc = (savedAt: number): RemoteDoc => ({ v: 1, savedAt, state: { onboarded: true } });
const meta = (m: Partial<SyncMeta>): SyncMeta => ({ userId: "u1", localAt: 0, remoteAt: 0, ...m });

describe("sync rules", () => {
  it("uploads a set-up device when the account is empty, and does nothing for a blank one", () => {
    expect(decide(meta({ userId: null, localAt: 5 }), "u1", null, true)).toBe("push");
    expect(decide(meta({ userId: null }), "u1", null, false)).toBe("none");
  });
  it("a new device always takes the account's copy", () => {
    expect(decide(meta({ userId: null, localAt: 999 }), "u1", doc(10), false)).toBe("pull");
  });
  it("first sign-in on a used device: the newer side wins", () => {
    expect(decide(meta({ userId: null, localAt: 50 }), "u1", doc(100), true)).toBe("pull");
    expect(decide(meta({ userId: null, localAt: 150 }), "u1", doc(100), true)).toBe("push");
  });
  it("only one side changed since the last sync", () => {
    expect(decide(meta({ localAt: 100, remoteAt: 100 }), "u1", doc(200), true)).toBe("pull");
    expect(decide(meta({ localAt: 300, remoteAt: 100 }), "u1", doc(100), true)).toBe("push");
    expect(decide(meta({ localAt: 100, remoteAt: 100 }), "u1", doc(100), true)).toBe("none");
  });
  it("both changed: the most recent edit wins", () => {
    expect(decide(meta({ localAt: 300, remoteAt: 100 }), "u1", doc(200), true)).toBe("push");
    expect(decide(meta({ localAt: 150, remoteAt: 100 }), "u1", doc(200), true)).toBe("pull");
  });
  it("recognises only well-formed cloud copies", () => {
    expect(isRemoteDoc(doc(1))).toBe(true);
    expect(isRemoteDoc({})).toBe(false);
    expect(isRemoteDoc(null)).toBe(false);
    expect(isRemoteDoc({ v: 1, savedAt: "x", state: {} })).toBe(false);
  });
});
