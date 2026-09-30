/**
 * Pure logic of a solid door. No Foundry globals in here so it can be unit tested.
 *
 * A solid door is a door wall that really moves when it opens, and where it ends up (the leaf) blocks instead of the
 * closed wall. It moves the way Foundry's door animation of the same type moves the door picture:
 * - swing: turns around the wall's first point (A),
 * - swivel: turns around its middle,
 * - slide: moves along its own line, towards A.
 * Foundry's "Open Direction" reverses that (the other side, or towards B). A double door is two halves, the second one
 * hinged at B and mirrored, exactly like Foundry draws it.
 * The opening amount is in degrees for swing and swivel and in percent of the (half) door's length for slide.
 * Angles on the screen turn clockwise for positive values (scene y points down), like PIXI rotation.
 */

export const MODULE_ID = "beavers-solid-doors";

/** Segment [x0, y0, x1, y1] in scene pixels, like a wall's `c`. */
export type Segment = readonly [number, number, number, number];
export type Point = { x: number; y: number };
export type Kind = "swing" | "swivel" | "slide";
export type Direction = 1 | -1;

/** Foundry's door animation types that make a solid door. Every other type, and no animation, stays a plain door. */
export const KINDS: readonly Kind[] = ["swing", "swivel", "slide"];

export function kindOf(animationType: unknown): Kind | undefined {
  return KINDS.find((k) => k === animationType);
}

/**
 * What the maximum of each kind may be, and what Foundry's animation strength 1 means in it (the default maximum is
 * strength × perStrength, so a door opens as far as Foundry's animation opened it). A swivel turned by 180° is the
 * closed door again, so it stops at 90°. A slide stops when it has freed the whole doorway.
 */
export const LIMITS: Readonly<Record<Kind, { min: number; max: number; step: number; perStrength: number }>> = {
  swing: { min: 5, max: 180, step: 5, perStrength: 90 },
  swivel: { min: 5, max: 90, step: 5, perStrength: 90 },
  slide: { min: 5, max: 100, step: 5, perStrength: 100 },
};

/**
 * An opening amount with the time it was set (ms since epoch). The GM stores it on the wall, a player without a GM
 * online on their own user; the newest one wins.
 */
export interface Stamped {
  amount: number;
  time: number;
}

/** The newest usable amount: the wall's own (`amount`, `time`, time 0 if missing) or a newer one from a user. */
export function latestAmount(wallFlags: unknown, fromUsers: unknown[]): unknown {
  const w = (wallFlags ?? {}) as Record<string, unknown>;
  let amount = w.amount;
  let time = finite(w.time) ? w.time : 0;
  for (const entry of fromUsers) {
    const e = (entry ?? {}) as Record<string, unknown>;
    if (finite(e.amount) && finite(e.time) && e.time > time) {
      amount = e.amount;
      time = e.time;
    }
  }
  return amount;
}

/** The parts of Foundry's door animation config that decide how a solid door moves. */
export interface Animation {
  direction?: number;
  double?: boolean;
  strength?: number;
}

export interface DoorConfig {
  kind: Kind;
  /** Foundry's Open Direction: 1 as drawn, -1 the other way. */
  direction: Direction;
  double: boolean;
  /** How far the door opens at most, > 0. */
  max: number;
  /** How far the door is open now, 0..max. Only matters while the door is open. */
  amount: number;
}

/** An opening dragged below this (degrees or percent) closes the door. */
export const CLOSE_BELOW = 3;

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const round = (v: number) => Math.round(v) + 0; // + 0: no -0
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v)) + 0;

/** Limit an amount to what the door can open: 0..max. */
export function clampAmount(amount: number, max: number): number {
  return clamp(amount, 0, max);
}

/**
 * Read the module's flags and Foundry's animation settings of a wall into a complete config.
 * Anything missing or broken gets a sane default.
 */
export function readConfig(flags: unknown, kind: Kind, animation?: Animation | null): DoorConfig {
  const f = (flags ?? {}) as Record<string, unknown>;
  const limits = LIMITS[kind];
  const strength = finite(animation?.strength) ? animation.strength : 1;
  const max = clamp(finite(f.max) && f.max > 0 ? f.max : strength * limits.perStrength, limits.min, limits.max);
  // A door that is open but has no (or no usable) amount opens all the way, like a plain Foundry door.
  let amount = finite(f.amount) ? clampAmount(f.amount, max) : max;
  if (amount < CLOSE_BELOW) amount = max;
  return {
    kind,
    direction: animation?.direction === -1 ? -1 : 1,
    double: animation?.double === true,
    max,
    amount,
  };
}

/**
 * One moving part of a door, as Foundry draws it: from its root (the end at the wall's endpoint) to its tip.
 * A single door is one part from A to B. A double door is two halves, from A and from B to the middle; the second
 * turns the other way (sign -1), so both open to the same side.
 */
export interface Part {
  root: Point;
  tip: Point;
  sign: Direction;
}

export function midpoint(p: Point, q: Point): Point {
  return { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
}

export function partsOf(c: Segment, double: boolean): Part[] {
  const a = { x: c[0], y: c[1] };
  const b = { x: c[2], y: c[3] };
  if (!double) return [{ root: a, tip: b, sign: 1 }];
  const m = midpoint(a, b);
  return [
    { root: a, tip: m, sign: 1 },
    { root: b, tip: m, sign: -1 },
  ];
}

/** `p` turned around `pivot` by `deg` degrees, clockwise on the screen. */
export function rotate(p: Point, pivot: Point, deg: number): Point {
  const r = (deg * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const dx = p.x - pivot.x;
  const dy = p.y - pivot.y;
  return { x: pivot.x + dx * cos - dy * sin, y: pivot.y + dx * sin + dy * cos };
}

/** The signed angle a part turns by when the door is open by `amount` degrees. */
export function turnOf(part: Part, direction: Direction, amount: number): number {
  return direction * part.sign * amount;
}

/** How far a sliding part has moved at `percent`: towards its root (or away with direction -1), by that share. */
export function slideOffset(part: Part, direction: Direction, percent: number): Point {
  const f = (direction * percent) / 100;
  return { x: (part.root.x - part.tip.x) * f, y: (part.root.y - part.tip.y) * f };
}

/** Where each part of the door stands when opened by `amount`, rounded to whole pixels like wall coordinates. */
export function leafSegments(c: Segment, config: Omit<DoorConfig, "max" | "amount">, amount: number): Segment[] {
  return partsOf(c, config.double).map((part) => {
    let p: Point;
    let q: Point;
    if (config.kind === "slide") {
      const d = slideOffset(part, config.direction, amount);
      p = { x: part.root.x + d.x, y: part.root.y + d.y };
      q = { x: part.tip.x + d.x, y: part.tip.y + d.y };
    } else {
      const deg = turnOf(part, config.direction, amount);
      const pivot = config.kind === "swivel" ? midpoint(part.root, part.tip) : part.root;
      p = rotate(part.root, pivot, deg);
      q = rotate(part.tip, pivot, deg);
    }
    return [round(p.x), round(p.y), round(q.x), round(q.y)] as const;
  });
}

/**
 * Where the door icon belongs. Closed, and for double doors (whose halves stand apart, leaving the doorway between
 * them free), in the middle of the doorway as Foundry has it. An open single door carries it along on its middle; a
 * sliding door only until its middle reaches the edge of the doorway (at 50 %), then the icon stays at that edge, so it
 * never ends up over the wall the door slides into.
 */
export function iconPoint(
  c: Segment,
  config: Omit<DoorConfig, "max" | "amount">,
  amount: number,
  open: boolean,
): Point {
  const center = midpoint({ x: c[0], y: c[1] }, { x: c[2], y: c[3] });
  if (!open || config.double) return center;
  if (config.kind === "slide") {
    const d = slideOffset(partsOf(c, false)[0], config.direction, Math.min(amount, 50));
    return { x: center.x + d.x, y: center.y + d.y };
  }
  const [x0, y0, x1, y1] = leafSegments(c, config, amount)[0];
  return midpoint({ x: x0, y: y0 }, { x: x1, y: y1 });
}

/**
 * Points to test whether a token can see a leaf: along it, just off both of its sides (the leaf itself blocks sight,
 * so a point on it would be hidden from both sides). Like Foundry's test for the closed door, which uses its midpoint
 * only, but spread along the leaf so seeing any part of the open door counts.
 */
export function sightPoints(segment: Segment, offset = 3, along: readonly number[] = [0.25, 0.5, 0.75, 0.95]): Point[] {
  const [x0, y0, x1, y1] = segment;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const length = Math.hypot(dx, dy);
  if (!length) return [];
  // Perpendicular to the leaf, `offset` long
  const nx = (-dy / length) * offset;
  const ny = (dx / length) * offset;
  return along.flatMap((t) => {
    const x = x0 + dx * t;
    const y = y0 + dy * t;
    return [
      { x: x + nx, y: y + ny },
      { x: x - nx, y: y - ny },
    ];
  });
}

/**
 * The opening in degrees that turns `from` (seen from `pivot`) towards `pointer`, limited to 0..max. `sign` is the
 * way the part turns when opening. The raw angle repeats every `period` degrees (360, or 180 for a swivel where both
 * halves look alike); near the wrap it may come out on the wrong side, so every repeat is tried and the one that
 * needs the least clamping wins. A door opening up to the full period therefore follows the pointer all the way.
 */
function turnToward(pivot: Point, from: Point, pointer: Point, sign: number, max: number, period: number): number {
  const closed = Math.atan2(from.y - pivot.y, from.x - pivot.x);
  const aim = Math.atan2(pointer.y - pivot.y, pointer.x - pivot.x);
  const half = period / 2;
  let raw = (((aim - closed) * 180) / Math.PI) * sign;
  raw = ((((raw + half) % period) + period) % period) - half;
  let best = 0;
  let bestMiss = Infinity;
  for (const candidate of [raw - period, raw, raw + period]) {
    const clamped = clampAmount(candidate, max);
    const miss = Math.abs(candidate - clamped);
    if (miss < bestMiss) {
      best = clamped;
      bestMiss = miss;
    }
  }
  return round(best);
}

/** How far `pointer` is along a sliding part's way, from `start`, in percent of the part's length. */
function slidPercent(part: Part, direction: Direction, start: Point, pointer: Point): number {
  const u = slideOffset(part, direction, 100);
  const lengthSq = u.x * u.x + u.y * u.y || 1;
  return (((pointer.x - start.x) * u.x + (pointer.y - start.y) * u.y) / lengthSq) * 100;
}

/** Where the drag started: the pointer and how far the door was open then. A single slide moves relative to it. */
export interface Grab {
  pointer: Point;
  amount: number;
}

/**
 * The opening amount that puts the door at `pointer`, limited to what the door allows.
 * - Swing and swivel point the door at the pointer; for a double door the half on the pointer's side.
 * - A single slide moves by as much as the pointer moved along the door since `grab`.
 * - A double slide opens as far as the pointer is from the middle, along the door: each half's inner end follows it.
 */
export function amountToward(c: Segment, config: Omit<DoorConfig, "amount">, pointer: Point, grab: Grab): number {
  const parts = partsOf(c, config.double);
  if (config.kind === "slide") {
    const percent = config.double
      ? Math.max(...parts.map((part) => slidPercent(part, config.direction, part.tip, pointer)))
      : grab.amount + slidPercent(parts[0], config.direction, grab.pointer, pointer);
    return round(clampAmount(percent, config.max));
  }
  // The half on the pointer's side: A's half before the middle, B's after it
  const [a, b] = [parts[0].root, parts[parts.length - 1].root];
  const t = (pointer.x - a.x) * (b.x - a.x) + (pointer.y - a.y) * (b.y - a.y);
  const lengthSq = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  const part = parts.length > 1 && t > lengthSq / 2 ? parts[1] : parts[0];
  const sign = config.direction * part.sign;
  if (config.kind === "swivel") {
    const center = midpoint(part.root, part.tip);
    return turnToward(center, part.tip, pointer, sign, config.max, 180);
  }
  return turnToward(part.root, part.tip, pointer, sign, config.max, 360);
}
