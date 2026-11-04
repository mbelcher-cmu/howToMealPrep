/**
 * The rules for cloud sync, kept free of the browser so they can be tested. The whole saved app
 * state travels as one document (profiles.settings), and the newer side wins.
 */
export interface SyncMeta {
  /** the account this device last synced with */
  userId: string | null;
  /** when this device last changed something (ms) */
  localAt: number;
  /** savedAt of the cloud copy this device last sent or received (ms) */
  remoteAt: number;
}

export interface RemoteDoc { v: 1; savedAt: number; state: Record<string, unknown> }

export type SyncAction = "pull" | "push" | "none";

/**
 * What to do when the device and the account meet.
 * - Nothing in the cloud yet: send this device's data up (if it has any).
 * - A device that hasn't been set up yet always takes the cloud copy.
 * - Otherwise whichever side changed most recently wins.
 */
export function decide(meta: SyncMeta, userId: string, remote: RemoteDoc | null, localOnboarded: boolean): SyncAction {
  const sameAccount = meta.userId === userId;
  if (!remote) return localOnboarded ? "push" : "none";
  if (!localOnboarded) return "pull";
  if (!sameAccount) return remote.savedAt >= meta.localAt ? "pull" : "push";
  const remoteChanged = remote.savedAt > meta.remoteAt;
  const localChanged = meta.localAt > meta.remoteAt;
  if (remoteChanged && localChanged) return remote.savedAt >= meta.localAt ? "pull" : "push";
  if (remoteChanged) return "pull";
  if (localChanged) return "push";
  return "none";
}

export function isRemoteDoc(x: unknown): x is RemoteDoc {
  const d = x as RemoteDoc | null;
  return !!d && typeof d === "object" && d.v === 1 && typeof d.savedAt === "number" && !!d.state && typeof d.state === "object";
}
