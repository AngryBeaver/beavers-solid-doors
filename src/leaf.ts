import {
  kindOf,
  latestAmount,
  leafSegments,
  MODULE_ID,
  readConfig,
  type DoorConfig,
  type Segment,
} from "./core/door.js";
import { userAmounts } from "./stored.js";

/**
 * The open door as edges. Foundry makes an open door's own edge block nothing, this adds an edge for each moved part
 * of the door (one, or two for a double door) that blocks what the closed wall blocks. Edges live on the scene's
 * levels (v14), so movement, vision, light and sound all respect them, on every client and even without a canvas.
 */

/** A double door has two parts; the ids of both are always cleaned up, so switching single/double leaves nothing. */
const MAX_PARTS = 2;
const leafId = (wall: any, part: number) => `${MODULE_ID}.${wall.id}.${part}`;

/**
 * The solid-door config of a wall, or undefined if it is no solid door. Any plain door whose animation is Foundry's
 * swing, swivel or slide is solid; every other door, also one without animation, stays a plain Foundry door.
 * Secret doors never are: they are meant to look like a wall, not like a door that swings open.
 */
export function solidConfig(wall: any): DoorConfig | undefined {
  if (!wall || wall.door !== CONST.WALL_DOOR_TYPES.DOOR) return undefined;
  const kind = kindOf(wall.animation?.type);
  if (!kind) return undefined;
  const flags = wall.flags?.[MODULE_ID];
  const amount = latestAmount(flags, userAmounts(wall));
  return readConfig({ ...flags, amount }, kind, wall.animation);
}

/** The line Foundry draws for a wall, repeated for the open leaf, so the GM sees on the walls layer where it blocks. */
const LEAF_COLOR = 0x66cc66; // Foundry's colour of an open door
const drawn = new WeakMap<any, any>();

export function drawLeaf(wall: any) {
  const placeable = wall?.object;
  if (!placeable?.line || placeable.destroyed) return;
  let graphics = drawn.get(placeable);
  if (!graphics || graphics.destroyed) {
    graphics = placeable.addChild(new PIXI.Graphics());
    graphics.eventMode = "none"; // the leaf is no handle, the wall is selected at its own line
    drawn.set(placeable, graphics);
  }
  graphics.clear();
  const config = solidConfig(wall);
  if (!config || wall.ds !== CONST.WALL_DOOR_STATES.OPEN) return;
  const lw = 2 * canvas.dimensions.uiScale; // like Wall#getLineWidth
  for (const [x0, y0, x1, y1] of leafSegments(wall.c, config, config.amount)) {
    graphics
      .lineStyle(lw * 3, 0x000000, 1.0)
      .moveTo(x0, y0)
      .lineTo(x1, y1);
    graphics.lineStyle(lw, LEAF_COLOR, 1.0).moveTo(x0, y0).lineTo(x1, y1);
  }
}

function createEdge(wall: any, id: string, [x0, y0, x1, y1]: Segment): any {
  const { threshold, dir: direction, light, sight, sound, move } = wall;
  // darkness is a getter mirroring light on the v14 document, fall back to light in case it is missing
  const darkness = wall.darkness ?? light;
  const dpx = wall.parent.dimensions.distancePixels;
  // The same restrictions the closed wall has, see WallDocument#createEdge.
  return new foundry.canvas.geometry.edges.Edge(
    { x: x0, y: y0 },
    { x: x1, y: y1 },
    {
      id,
      object: wall,
      type: "wall",
      direction,
      light,
      darkness,
      sight,
      sound,
      move,
      threshold: {
        light: threshold.light * dpx,
        darkness: (threshold.darkness ?? threshold.light) * dpx,
        sight: threshold.sight * dpx,
        sound: threshold.sound * dpx,
        attenuation: threshold.attenuation,
      },
    },
  );
}

/** The leaf edges of an open solid door, none otherwise. */
function createLeaves(wall: any): any[] {
  const config = solidConfig(wall);
  if (!config || wall.ds !== CONST.WALL_DOOR_STATES.OPEN) return [];
  return leafSegments(wall.c, config, config.amount).map((segment, i) => createEdge(wall, leafId(wall, i), segment));
}

/** Put the leaf edges of this wall where they belong now, or remove them. Refreshes what the change affects. */
export function syncLeaf(wall: any, deleted = false) {
  const scene = wall.parent;
  if (!scene?.initializedEdges) return;
  const leaves = deleted ? [] : createLeaves(wall);
  for (const level of scene.levels) {
    const included = wall.includedInLevel(level);
    for (let i = 0; i < MAX_PARTS; i++) {
      const id = leafId(wall, i);
      const prior = level.edges.get(id);
      if (prior) level.edges.delete(id);
      const next = included ? leaves[i] : undefined;
      if (next) level.edges.set(id, next);
      if (!prior && !next) continue;
      const changed = new Set<string>();
      for (const type of CONST.EDGE_RESTRICTION_TYPES) {
        if (prior?.[type] || next?.[type]) changed.add(type);
      }
      // The core's own handler for a changed wall edge: vision, lighting, sounds, planned paths, region shapes.
      wall._onEdgeChange(level, next ?? null, prior ?? null, changed);
    }
  }
  drawLeaf(wall);
  // The icon rides on an open single door (DoorControl#reposition is patched in interaction.ts)
  wall.object?.doorControl?.reposition();
}

/** Every change to a wall's edge goes through WallDocument#initializeEdge: scene setup, create, update, delete. */
export function patchInitializeEdge() {
  const proto = foundry.documents.WallDocument.prototype;
  const original = proto.initializeEdge;
  proto.initializeEdge = function (this: any, options: { deleted?: boolean } = {}) {
    original.call(this, options);
    try {
      syncLeaf(this, !!options?.deleted);
    } catch (e) {
      console.error(`${MODULE_ID} | could not place the leaf of door ${this.id}`, e);
    }
  };
}
