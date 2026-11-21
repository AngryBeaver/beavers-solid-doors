import { MODULE_ID } from "./core/door.js";

/**
 * World settings. An open solid door can let tokens walk through its doorway while its leaf still blocks sight, light
 * and sound: a door left ajar can be squeezed through, but not seen through.
 */

export const PASSABLE = "passable";
export const PASSABLE_ABOVE = "passableAbove";
const DEFAULT_ABOVE = 5;

/** Whether open doors let tokens through, and above what share of their maximum opening (percent). */
export function passableSettings(): { enabled: boolean; above: number } {
  try {
    const enabled = game.settings.get(MODULE_ID, PASSABLE) !== false;
    const above = Number(game.settings.get(MODULE_ID, PASSABLE_ABOVE));
    return { enabled, above: Number.isFinite(above) ? above : DEFAULT_ABOVE };
  } catch {
    // Not registered yet: the defaults
    return { enabled: true, above: DEFAULT_ABOVE };
  }
}

export function registerSettings(onChange: () => void) {
  game.settings.register(MODULE_ID, PASSABLE, {
    name: "BEAVERS_SOLID_DOORS.settings.passable.name",
    hint: "BEAVERS_SOLID_DOORS.settings.passable.hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    onChange,
  });
  game.settings.register(MODULE_ID, PASSABLE_ABOVE, {
    name: "BEAVERS_SOLID_DOORS.settings.passableAbove.name",
    hint: "BEAVERS_SOLID_DOORS.settings.passableAbove.hint",
    scope: "world",
    config: true,
    type: Number,
    range: { min: 0, max: 100, step: 1 },
    default: DEFAULT_ABOVE,
    onChange,
  });
}
