import { KINDS, MODULE_ID, partsOf, slideOffset, turnOf, type DoorConfig } from "./core/door.js";
import { solidConfig } from "./leaf.js";

/**
 * The door picture. Foundry draws a door with an animation texture as a DoorMesh (two for a double door) and moves it
 * by a fixed amount. For solid doors Foundry's own swing, swivel and slide animations move it by the door's own amount
 * instead, the same way the leaf that blocks moved. Every other door keeps Foundry's animation untouched.
 */

const DEFAULT_DURATION = 500;
const rad = (deg: number) => (deg * Math.PI) / 180;

/** The part of the door a mesh draws: the second half of a double door is DOUBLE_RIGHT, everything else the first. */
function partOf(mesh: any, wall: any, config: DoorConfig) {
  const right = mesh.animationId?.endsWith(`.${foundry.canvas.containers.DoorMesh.DOOR_STYLES.DOUBLE_RIGHT}`);
  const parts = partsOf(wall.c, config.double);
  return parts[right ? parts.length - 1 : 0];
}

/** The picture's position or rotation for a door opened by `amount`, relative to where Foundry put it closed. */
function targetsAt(mesh: any, wall: any, config: DoorConfig, amount: number) {
  const closed = mesh._closedPosition;
  const parent = mesh._animatedPosition;
  const part = partOf(mesh, wall, config);
  if (config.kind !== "slide") {
    return [{ parent, attribute: "rotation", to: closed.rotation + rad(turnOf(part, config.direction, amount)) }];
  }
  const d = slideOffset(part, config.direction, amount);
  return [
    { parent, attribute: "x", to: closed.x + d.x },
    { parent, attribute: "y", to: closed.y + d.y },
  ];
}

/** Foundry's swing, swivel and slide: solid doors go to their own amount, other doors as before. */
export function patchAnimations() {
  for (const kind of KINDS) {
    const type = CONFIG.Wall.animationTypes[kind];
    if (!type) {
      console.warn(`${MODULE_ID} | Foundry has no "${kind}" door animation, its doors are not solid`);
      continue;
    }
    const original = type.animate;
    type.animate = function (this: any, open: boolean) {
      const wall = this.object?.document;
      const config = solidConfig(wall);
      if (!config) return original.call(this, open);
      return targetsAt(this, wall, config, open ? config.amount : 0);
    };
  }
}

/** The door meshes of a solid door. */
function meshesOf(wall: any): any[] {
  const meshes = wall?.object?.doorMeshes;
  return meshes && solidConfig(wall) ? [...meshes] : [];
}

/** Copy the animated position onto the picture, what DoorMesh does on each animation tick. */
function show(mesh: any) {
  const a = mesh._animatedPosition;
  mesh.position.set(a.x, a.y);
  mesh.rotation = a.rotation;
}

/**
 * The door stays open but its amount changed. Foundry only animates open/close, so move the picture here.
 * The animation runs under the mesh's own name: a core animation of the same door is replaced, not fought.
 */
export function moveToAmount(wall: any) {
  const config = solidConfig(wall);
  if (!config) return;
  const open = wall.ds === CONST.WALL_DOOR_STATES.OPEN;
  for (const mesh of meshesOf(wall)) {
    void foundry.canvas.animation.CanvasAnimation.animate(targetsAt(mesh, wall, config, open ? config.amount : 0), {
      name: mesh.animationId,
      duration: wall.animation?.duration ?? DEFAULT_DURATION,
      easing: foundry.canvas.animation.CanvasAnimation.easeInOutCosine,
      ontick: () => show(mesh),
    });
  }
}

/** While a door is dragged: move the picture on this client only, no document changes. */
export function previewAmount(wall: any, amount: number) {
  const config = solidConfig(wall);
  if (!config) return;
  for (const mesh of meshesOf(wall)) {
    foundry.canvas.animation.CanvasAnimation.terminateAnimation?.(mesh.animationId);
    // Into _animatedPosition too, so the real animation afterwards starts where the preview stopped
    for (const { parent, attribute, to } of targetsAt(mesh, wall, config, amount)) parent[attribute] = to;
    show(mesh);
  }
}

/** Drop a preview: back to what the document says. */
export function resetPicture(wall: any) {
  for (const mesh of meshesOf(wall)) mesh.initialize(wall.animation);
}

/** The maximum changed: the target moved, let the meshes set themselves up again. */
export function reinitializePicture(wall: any) {
  for (const mesh of wall?.object?.doorMeshes ?? []) mesh.initialize(wall.animation);
}
