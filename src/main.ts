import { amountToward, CLOSE_BELOW, leafSegments, MODULE_ID } from "./core/door.js";
import { moveToAmount, patchAnimations, reinitializePicture } from "./animation.js";
import { patchDoorControl } from "./interaction.js";
import { drawLeaf, patchInitializeEdge, solidConfig, syncLeaf } from "./leaf.js";
import { registerQuery, requestDoor } from "./request.js";
import { adoptUserAmounts, wallsChangedIn } from "./stored.js";
import { registerWallConfig } from "./wallConfig.js";

/**
 * For other modules and macros: `game.modules.get("beavers-solid-doors").api`.
 * - solidConfig(wall): how a WallDocument moves ({kind, direction, double, max, amount}), undefined if it is no solid
 *   door. Works without a canvas.
 * - requestDoor(wall, open, amount?): open (to `amount`, default the stored one) or close, with the same rules and
 *   GM routing as clicking the door icon. Resolves to {error?}.
 * - leafSegments(c, config, amount) / amountToward(c, config, pointer, grab): the pure geometry. Any frame works
 *   that is the scene turned, moved or scaled (not mirrored); segments come back rounded to whole units.
 * - CLOSE_BELOW: an opening dragged below this closes the door.
 */
const api = { solidConfig, requestDoor, leafSegments, amountToward, CLOSE_BELOW };

Hooks.once("init", () => {
  patchInitializeEdge();
  patchAnimations();
  registerQuery();
  patchDoorControl();
  registerWallConfig();
  game.modules.get(MODULE_ID).api = api;
});

// A GM coming online takes over what players stored while no GM was there
Hooks.once("ready", () => void adoptUserAmounts().catch((e) => console.error(`${MODULE_ID} | adopting failed`, e)));

/** A new amount alone: the open door moves further, its leaf and picture follow. */
function amountChanged(wall: any) {
  syncLeaf(wall);
  moveToAmount(wall);
}

/**
 * Foundry only moves a wall's edge for changes to its core blocking data, not for its animation or flags.
 * A new animation (type, direction, double) or maximum can move the whole leaf, or make the door solid or plain.
 */
Hooks.on("updateWall", (wall: any, changed: any) => {
  const flags = changed.flags?.[MODULE_ID] ?? {};
  try {
    if ("animation" in changed || "max" in flags) {
      syncLeaf(wall);
      reinitializePicture(wall);
    } else if ("amount" in flags && !("ds" in changed)) amountChanged(wall);
  } catch (e) {
    console.error(`${MODULE_ID} | could not update door ${wall.id}`, e);
  }
});

// A player without a GM stored an amount on their user
Hooks.on("updateUser", (_user: any, changed: any) => {
  for (const wall of wallsChangedIn(changed)) {
    try {
      amountChanged(wall);
    } catch (e) {
      console.error(`${MODULE_ID} | could not update door ${wall.id}`, e);
    }
  }
});

// Foundry redraws a wall's line (drawn, moved, opened, closed): draw the leaf with it
Hooks.on("refreshWall", (wall: any) => drawLeaf(wall.document));
