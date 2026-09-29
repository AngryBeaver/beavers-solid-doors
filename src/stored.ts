import { MODULE_ID } from "./core/door.js";

/**
 * Where a door's opening amount is kept. The GM stores it on the wall. Players may not change a wall's flags, so
 * without a GM online a player stores it on their own user (which players may update); every client then uses the
 * newest of all of them. When a GM comes online, their client moves these onto the walls and clears them.
 */

const USER_DOORS = "doors";

/** Flag keys must not contain dots, so scene and wall id are joined with a dash. */
const userKey = (wall: any) => `${wall.parent.id}-${wall.id}`;

/** The amounts players stored for this door, in no particular order. */
export function userAmounts(wall: any): unknown[] {
  if (!game.users || !wall?.parent) return [];
  const key = userKey(wall);
  return game.users.map((u: any) => u.flags?.[MODULE_ID]?.[USER_DOORS]?.[key]).filter((e: unknown) => e);
}

/** The flag changes that store `amount` on the wall (GM only). */
export function wallAmountChanges(amount: number): Record<string, number> {
  return { [`flags.${MODULE_ID}.amount`]: amount, [`flags.${MODULE_ID}.time`]: Date.now() };
}

/** Store `amount` for this door on the current user, for a player without a GM online. */
export function storeOnUser(wall: any, amount: number) {
  return game.user.update({ [`flags.${MODULE_ID}.${USER_DOORS}.${userKey(wall)}`]: { amount, time: Date.now() } });
}

/** The walls whose stored amount a user update touched, from the update's changes. */
export function wallsChangedIn(changed: any): any[] {
  const doors = changed?.flags?.[MODULE_ID]?.[USER_DOORS];
  if (!doors || typeof doors !== "object") return [];
  return Object.keys(doors)
    .map((key) => key.split("-"))
    .map(([sceneId, wallId]) => game.scenes.get(sceneId)?.walls.get(wallId))
    .filter((wall: unknown) => wall);
}

/**
 * On the active GM's client: move what players stored onto the walls (where newer) and clear it from the users.
 * Entries of deleted walls or scenes are just cleared.
 */
export async function adoptUserAmounts() {
  if (!game.user.isActiveGM) return;
  for (const user of game.users) {
    const doors = user.flags?.[MODULE_ID]?.[USER_DOORS];
    if (!doors || typeof doors !== "object") continue;
    for (const [key, entry] of Object.entries<any>(doors)) {
      const [sceneId, wallId] = key.split("-");
      const wall = game.scenes.get(sceneId)?.walls.get(wallId);
      const stored = wall?.flags?.[MODULE_ID]?.time ?? 0;
      if (wall && Number.isFinite(entry?.amount) && Number.isFinite(entry?.time) && entry.time > stored) {
        await wall.update({ [`flags.${MODULE_ID}.amount`]: entry.amount, [`flags.${MODULE_ID}.time`]: entry.time });
      }
    }
    await user.update({ [`flags.${MODULE_ID}.${USER_DOORS}`]: new foundry.data.operators.ForcedDeletion() });
  }
}
