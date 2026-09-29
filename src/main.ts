import { MODULE_ID } from "./core/door.js";
import { moveToAmount, patchAnimations, reinitializePicture } from "./animation.js";
import { patchDoorControl } from "./interaction.js";
import { drawLeaf, patchInitializeEdge, syncLeaf } from "./leaf.js";
import { registerQuery } from "./request.js";
import { adoptUserAmounts, wallsChangedIn } from "./stored.js";
import { registerWallConfig } from "./wallConfig.js";

Hooks.once("init", () => {
  patchInitializeEdge();
  patchAnimations();
  registerQuery();
  patchDoorControl();
  registerWallConfig();
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
