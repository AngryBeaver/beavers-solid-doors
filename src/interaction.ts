import {
  amountToward,
  CLOSE_BELOW,
  iconPoint,
  leafSegments,
  midpoint,
  MODULE_ID,
  partsOf,
  sightPoints,
  turnOf,
  type DoorConfig,
  type Point,
} from "./core/door.js";
import { moveToAmount, previewAmount, resetPicture } from "./animation.js";
import { solidConfig } from "./leaf.js";
import { requestDoor, type DoorOutcome } from "./request.js";

/**
 * Foundry's door icon. A short click toggles the door as usual, press and drag moves it: the door follows the pointer
 * and stays where it is let go. Only this client sees the door move while dragging, the document changes once, on
 * release.
 */

/** Moved less than this many screen pixels before letting go: a click, not a drag. */
const DRAG_THRESHOLD_PX = 6;
const PREVIEW_COLOR = 0xff5500;

const rad = (deg: number) => (deg * Math.PI) / 180;

/** What the door can reach (an arc, or the fully open slide), the door where it would stand, and the amount as text. */
class DragPreview {
  private readonly graphics = new PIXI.Graphics();
  private readonly label: any;

  constructor(
    private readonly wall: any,
    private readonly config: DoorConfig,
  ) {
    const style = CONFIG.canvasTextStyle.clone();
    style.fontSize = 24 * canvas.dimensions.uiScale;
    this.label = new PIXI.Text("", style);
    this.label.anchor.set(0.5, 0.5);
    canvas.controls.addChild(this.graphics, this.label);
  }

  /** A filled sector around `center` from `from` turned by `deg` degrees. */
  private sector(center: Point, from: Point, deg: number) {
    const radius = Math.hypot(from.x - center.x, from.y - center.y);
    const closed = Math.atan2(from.y - center.y, from.x - center.x);
    const end = closed + rad(deg);
    this.graphics
      .moveTo(center.x, center.y)
      .arc(center.x, center.y, radius, Math.min(closed, end), Math.max(closed, end))
      .lineTo(center.x, center.y);
  }

  /** Every part's way from closed to fully open: arcs for turning doors, bands for sliding ones. */
  private reach() {
    const { c } = this.wall;
    const { kind, direction, double, max } = this.config;
    if (kind === "slide") {
      const open = leafSegments(c, this.config, max);
      leafSegments(c, this.config, 0).forEach(([x0, y0, x1, y1], i) => {
        const [ox0, oy0, ox1, oy1] = open[i];
        this.graphics.drawPolygon([x0, y0, x1, y1, ox1, oy1, ox0, oy0]);
      });
      return;
    }
    for (const part of partsOf(c, double)) {
      const deg = turnOf(part, direction, max);
      if (kind === "swing") this.sector(part.root, part.tip, deg);
      else {
        const center = midpoint(part.root, part.tip);
        this.sector(center, part.root, deg);
        this.sector(center, part.tip, deg);
      }
    }
  }

  draw(amount: number) {
    const s = canvas.dimensions.uiScale;
    const leaves = leafSegments(this.wall.c, this.config, amount);
    this.graphics
      .clear()
      .lineStyle(2 * s, PREVIEW_COLOR, 0.35)
      .beginFill(PREVIEW_COLOR, 0.08);
    this.reach();
    this.graphics.endFill().lineStyle(4 * s, PREVIEW_COLOR, 0.9);
    for (const [x0, y0, x1, y1] of leaves) this.graphics.moveTo(x0, y0).lineTo(x1, y1);

    // The label sits a bit beyond the first part's tip, where the pointer usually is not
    const [x0, y0, x1, y1] = leaves[0];
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1;
    const offset = 30 * s;
    const unit = this.config.kind === "slide" ? "%" : "°";
    this.label.text = Math.abs(amount) < CLOSE_BELOW ? "✕" : `${Math.abs(amount)}${unit}`;
    this.label.position.set(x1 + (dx / len) * offset, y1 + (dy / len) * offset);
  }

  destroy() {
    this.graphics.destroy();
    this.label.destroy();
  }
}

/** Tell the user why the door did not do what they asked. */
function warn(error: string) {
  if (error === "paused") ui.notifications.warn("GAME.PausedWarning", { localize: true });
  else ui.notifications.warn(`BEAVERS_SOLID_DOORS.error.${error}`, { localize: true });
}

/** Put the icon (40 × 40 × uiScale, positioned by its corner like Foundry does) centred on `point`. */
function placeIcon(control: any, point: Point) {
  const half = 20 * canvas.dimensions.uiScale;
  control.position.set(point.x - half, point.y - half);
}

/** Back to what the documents say: the picture, and the icon (DoorControl#reposition, patched below). */
function resetDrag(wall: any) {
  resetPicture(wall);
  wall.object?.doorControl?.reposition();
}

async function settle(wall: any, request: Promise<DoorOutcome>) {
  const dsBefore = wall.ds;
  const outcome = await request;
  if (outcome.error) {
    resetDrag(wall);
    warn(outcome.error);
    return;
  }
  // A changed ds animates by itself. Otherwise move the picture from wherever the drag left it to the stored amount.
  if (wall.ds === dsBefore) moveToAmount(wall);
  wall.object?.doorControl?.reposition();
}

/** Press on the door icon of a solid door: wait whether this becomes a click or a drag. */
function startGesture(control: any, event: any, config: DoorConfig) {
  const wall = control.wall.document;
  const open = wall.ds === CONST.WALL_DOOR_STATES.OPEN;
  const startX = event.clientX;
  const startY = event.clientY;
  const grab = {
    pointer: canvas.canvasCoordinatesFromClient({ x: startX, y: startY }),
    amount: open ? config.amount : 0,
  };
  let dragging = false;
  let amount = grab.amount;
  let preview: DragPreview | undefined;

  const onMove = (e: PointerEvent) => {
    if (!dragging) {
      if (Math.hypot(e.clientX - startX, e.clientY - startY) < DRAG_THRESHOLD_PX) return;
      dragging = true;
      preview = new DragPreview(wall, config);
    }
    const pointer = canvas.canvasCoordinatesFromClient({ x: e.clientX, y: e.clientY });
    amount = amountToward(wall.c, config, pointer, grab);
    previewAmount(wall, amount);
    preview!.draw(amount);
    placeIcon(control, iconPoint(wall.c, config, amount, true));
  };

  const finish = (e: PointerEvent) => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", finish);
    window.removeEventListener("pointercancel", finish);
    preview?.destroy();
    if (e.type === "pointercancel") {
      if (dragging) resetDrag(wall);
      return;
    }
    if (!dragging) void settle(wall, open ? requestDoor(wall, false) : requestDoor(wall, true, config.max));
    else if (Math.abs(amount) < CLOSE_BELOW) void settle(wall, requestDoor(wall, false));
    else void settle(wall, requestDoor(wall, true, amount));
  };

  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", finish);
  window.addEventListener("pointercancel", finish);
}

/**
 * Foundry shows a door icon only when a token sees the closed door's middle. An open solid door can hide exactly that
 * from a token behind it, which would leave the token trapped without a way to close the door. So the icon also shows
 * when the token sees any part of the open leaf. Foundry re-checks this whenever vision refreshes, which a moved leaf
 * triggers.
 */
function patchIsVisible(proto: any) {
  const original = Object.getOwnPropertyDescriptor(proto, "isVisible")?.get;
  if (!original) {
    console.warn(`${MODULE_ID} | DoorControl#isVisible not found, door icons only show when the doorway is seen`);
    return;
  }
  Object.defineProperty(proto, "isVisible", {
    configurable: true,
    get(this: any) {
      if (original.call(this)) return true;
      try {
        const wall = this.wall?.document;
        const config = solidConfig(wall);
        if (!config || wall.ds !== CONST.WALL_DOOR_STATES.OPEN) return false;
        const points = leafSegments(wall.c, config, config.amount).flatMap((segment) => sightPoints(segment));
        return points.length > 0 && canvas.visibility.testVisibility(points, { object: this, tolerance: 0 });
      } catch (e) {
        console.error(`${MODULE_ID} | could not test whether door ${this.wall?.id} is seen`, e);
        return false;
      }
    },
  });
}

/**
 * Foundry puts the icon in the middle of the doorway. An open single solid door carries it along (see iconPoint).
 * Foundry's own placement runs first, so if this ever fails the icon simply stays in the doorway.
 */
function patchReposition(proto: any) {
  const original = proto.reposition;
  if (typeof original !== "function") {
    console.warn(`${MODULE_ID} | DoorControl#reposition not found, door icons stay in the doorway`);
    return;
  }
  proto.reposition = function (this: any, ...args: unknown[]) {
    const result = original.apply(this, args);
    try {
      const wall = this.wall?.document;
      const config = solidConfig(wall);
      const open = wall?.ds === CONST.WALL_DOOR_STATES.OPEN;
      if (config && open && !config.double) placeIcon(this, iconPoint(wall.c, config, config.amount, true));
    } catch (e) {
      console.error(`${MODULE_ID} | could not move the icon of door ${this.wall?.id}`, e);
    }
    return result;
  };
}

/**
 * Replace the left click of the door icon for solid doors. The icon binds `this._onMouseDown` each time it is drawn,
 * so patching the prototype reaches every icon, also those drawn before.
 */
export function patchDoorControl() {
  const proto = foundry.canvas.containers.DoorControl.prototype;
  patchIsVisible(proto);
  patchReposition(proto);
  const original = proto._onMouseDown;
  proto._onMouseDown = function (this: any, event: any) {
    const wall = this.wall?.document;
    const config = solidConfig(wall);
    if (!config || event.button !== 0) return original.call(this, event);
    event.stopPropagation();

    // The same checks as the core door control
    if (!game.user.can("WALL_DOORS")) return false;
    if (game.paused && !game.user.isGM) {
      ui.notifications.warn("GAME.PausedWarning", { localize: true });
      return false;
    }
    if (wall.ds === CONST.WALL_DOOR_STATES.LOCKED) {
      if (!(game.user.isGM && game.keyboard.isModifierActive("ALT"))) this.wall._playDoorSound("test");
      return false;
    }

    try {
      startGesture(this, event, config);
    } catch (e) {
      console.error(`${MODULE_ID} | door gesture failed, falling back to a plain toggle`, e);
      return original.call(this, event);
    }
    return false;
  };
}
