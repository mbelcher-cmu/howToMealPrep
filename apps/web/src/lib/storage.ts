/** JSON helpers that survive Infinity (pantry staples) and blocked storage. */
export const encode = (v: unknown) => JSON.stringify(v, (_k, x) => (x === Infinity ? "__inf" : x));
export const decode = <T>(s: string): T => JSON.parse(s, (_k, x) => (x === "__inf" ? Infinity : x)) as T;

export const safeStorage = {
  getItem: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  setItem: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } },
  removeItem: (k: string) => { try { localStorage.removeItem(k); } catch { /* storage blocked */ } },
};
