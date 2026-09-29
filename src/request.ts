import { clampAmount, MODULE_ID } from "./core/door.js";
import { solidConfig } from "./leaf.js";
import { storeOnUser, wallAmountChanges } from "./stored.js";

/**
 * Opening and closing. Players may change a door's state (ds) themselves, but no flags, so a new amount goes through
 * the active GM's client with a user query. Without a GM the player stores the amount on their own user instead,
 * see stored.ts.
 */

export const QUERY = `${MODULE_ID}.setDoor`;
const QUERY_TIMEOUT_MS = 5000;

interface DoorRequest {
  sceneId: string;
  wallId: string;
  open: boolean;
  /** The opening amount to store, only when opening. */
  amount?: number;
}

/** Why `user` may not use this door now, or undefined. The same rules as Foundry's own door control. */
export function checkUse(wall: any, user: any): string | undefined {
  if (!solidConfig(wall)) return "no-door";
  if (!user?.can("WALL_DOORS")) return "not-allowed";
  if (game.paused && !user.isGM) return "paused";
  if (wall.ds === CONST.WALL_DOOR_STATES.LOCKED) return "locked";
  return undefined;
}

function applyDoor(wall: any, open: boolean, amount?: number) {
  const { OPEN, CLOSED } = CONST.WALL_DOOR_STATES;
  const changes: Record<string, unknown> = { ds: open ? OPEN : CLOSED };
  const config = solidConfig(wall)!;
  if (open && amount !== undefined) Object.assign(changes, wallAmountChanges(clampAmount(amount, config.max)));
  return wall.update(changes);
}

/** Runs on the GM's client. `user` is set by the server, so it is who really asked. */
async function onQuery(data: DoorRequest, { user }: { user: any }) {
  const wall = game.scenes.get(data?.sceneId)?.walls.get(data?.wallId);
  const error = checkUse(wall, user);
  if (error) return { ok: false, error };
  const amount = typeof data.amount === "number" && Number.isFinite(data.amount) ? data.amount : undefined;
  await applyDoor(wall, !!data.open, amount);
  return { ok: true };
}

export function registerQuery() {
  CONFIG.queries[QUERY] = onQuery;
}

export interface DoorOutcome {
  error?: string;
}

/** Open the door at `amount`, or close it. */
export async function requestDoor(wall: any, open: boolean, amount?: number): Promise<DoorOutcome> {
  const error = checkUse(wall, game.user);
  if (error) return { error };
  const config = solidConfig(wall)!;
  const sameAmount = amount === undefined || clampAmount(amount, config.max) === config.amount;

  // A GM writes everything itself; closing and opening at the stored amount need no flag change at all.
  if (game.user.isGM || !open || sameAmount) {
    await applyDoor(wall, open, game.user.isGM ? amount : undefined);
    return {};
  }

  const gm = game.users.activeGM;
  if (gm) {
    try {
      const request: DoorRequest = { sceneId: wall.parent.id, wallId: wall.id, open, amount };
      const result = await gm.query(QUERY, request, { timeout: QUERY_TIMEOUT_MS });
      return result?.ok ? {} : { error: result?.error ?? "gm-error" };
    } catch (e) {
      console.warn(`${MODULE_ID} | the GM did not answer, storing the opening on this user`, e);
    }
  }
  // The amount first: when the door opens, every client already knows how far
  await storeOnUser(wall, clampAmount(amount!, config.max));
  await applyDoor(wall, open);
  return {};
}
