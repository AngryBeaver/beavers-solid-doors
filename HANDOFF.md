# Handoff: Beaver's Solid Doors

Work was started in another Claude Code session (rooted in `C:\ssc\beavers-mobile-pawn`) and continues here.
Read this file first, then the source files listed under "Done". Delete this file once the module is complete.

## Goal

A Foundry VTT **v14** module (`beavers-solid-doors`) where doors really swing:

- A door wall gets a **hinge** at one endpoint (A = `c[0],c[1]` or B = `c[2],c[3]`) and a **max opening angle**
  from -180 to 180 (never 0). The sign decides the side it opens to. Positive = clockwise on screen.
- **Open**, the door is the same segment turned around the hinge by the current angle. That turned segment (the
  "leaf") blocks movement/sight/light/sound like the closed wall did. The doorway itself becomes free.
- **Interaction** on Foundry's door icon: a short click toggles as usual (open = to max angle, closed). Press, hold
  and drag: the door follows the pointer around the hinge (clamped 0..max); on release it stays at that angle.
  Dragged back below 3 degrees it closes.
- The door picture (Foundry's DoorMesh, only exists when the wall has an animation texture) swings to exactly the
  stored angle.

Scaffolding (build.mjs, package.json, module.json template, tsconfig, prettier config, vitest) is copied from
`C:\ssc\beavers-mobile-pawn` and should stay in that style: esbuild single bundle, loose `any` Foundry globals in
`src/foundry.d.ts`, pure logic in `src/core/` with vitest tests in `test/`.

## Design decisions (agreed with the user)

- **Data**: `flags.beavers-solid-doors = { max, amount }` (positive, degrees or percent). Any door animated with the
  core `swing`, `swivel` or `slide` is solid, no extra types and no on/off (user, 2026-09-29). The core animation
  functions of those three are wrapped (`patchAnimations`). Side / slide direction = core `animation.direction`,
  double doors = core `animation.double` (two halves, second hinged at B, mirrored, two leaf edges `<id>.0/.1`).
  `max` defaults to core `strength` (1 = 90° / 100 %), the Strength input is hidden for solid doors.
  Other types, no animation and secret doors: plain Foundry door.
- **Blocking**: the wall's own edge stays untouched (Foundry makes it non-blocking when `ds` is OPEN). A second
  edge, id `beavers-solid-doors.<wallId>`, type `"wall"`, object = the WallDocument, is added for the leaf.
- **Permissions**: players may only change `ds` on walls, not flags. New angles go through the active GM's client
  with a v14 user query. Without a GM a player stores `{amount, time}` on their own user
  (`flags.beavers-solid-doors.doors.<sceneId>-<wallId>`), the wall stores `time` too, the newest wins
  (`latestAmount`); the active GM adopts and clears them on `ready` (`src/stored.ts`).
- **Double doors**: supported (see Data).
- **Leaf vs other walls**: not checked in v1 (a door may swing through a wall).

## Verified in the Foundry v14.368 source

The source is in `C:\vtts\v14.368\container_cache\FoundryVTT-14.368.zip` (`resources/app/client`, `common`).

- Edges are scene-document data in v14, per level: `scene.levels` -> `level.edges` (a Map). `Scene#initializeEdges`
  calls `wall.initializeEdge()` for every wall; create/update/delete also go through `WallDocument#initializeEdge`.
  After changing an edge, the core calls `wall._onEdgeChange(level, newEdge, priorEdge, changedTypes)` which
  refreshes vision, lighting, sounds, planned movement paths and region shapes. `wall.includedInLevel(level)`.
- `WallDocument#_onUpdate` only re-initializes the edge for `c, levels, light, move, sight, sound, dir, door, ds,
  threshold` changes, not for flags.
- `BaseWall.#canUpdate`: non-GM users may update only `ds`, and not to/from LOCKED.
- `foundry.canvas.geometry.edges.Edge(a, b, {id, object, type, direction, light, darkness, sight, sound, move,
  threshold})`. Core threshold values are multiplied by `scene.dimensions.distancePixels`.
- `DoorControl` (`foundry.canvas.containers.DoorControl`): `_onMouseDown` checks `game.user.can("WALL_DOORS")`,
  pause (`GAME.PausedWarning`), locked (`this.wall._playDoorSound("test")`), then updates `ds`.
- `DoorMesh` (`foundry.canvas.containers.DoorMesh`): single door pivots on endpoint A with anchor (0, 0.5).
  `_closedPosition` / `_animatedPosition` are protected (underscore) snapshots `{x, y, rotation, scaleX, scaleY, ...}`;
  the private `#refresh` copies `_animatedPosition` onto the sprite. `initialize(animation)` is public and snaps to the
  current state. `animate(open)` returns early if the open state did not change. `animationId` =
  `Door.<wallId>.<style>`, styles `"single" | "doubleL" | "doubleR"`. Core swing: `rotation += PI * direction *
  strength / 2`.
- `CONFIG.Wall.animationTypes[type] = {label, initialize?, animate, preAnimate?, postAnimate?, easing?, duration}`;
  `initialize` and `animate` are called with `this` = the DoorMesh. Wall placeable: `wall.object.doorMeshes` (Set).
  A DoorMesh exists only when `animation.type` and `animation.texture` are set.
- `foundry.canvas.animation.CanvasAnimation.animate(attributes, {name, duration, easing, ontick})`, a new animation
  with the same name replaces the old one; `terminateAnimation(name)`; `easeInOutCosine`.
- User queries: `CONFIG.queries[name] = async (data, {user}) => result`, `user` is the querying user (set by the
  server). Call with `game.users.activeGM.query(name, data, {timeout})`. Players have `QUERY_USER` by default.
- `canvas.canvasCoordinatesFromClient({x, y})` converts client coordinates to scene coordinates.
- Wall config sheet: `WallConfig` (ApplicationV2, parts `body` + `footer`), hook `renderWallConfig`.
- Door icons in `CONFIG.controlIcons` (`doorOpen`, `doorClosed`, `doorLocked`).

## Status (2026-09-29)

All code is written: `src/core/door.ts` (pure geometry per kind, tested in `test/door.test.ts`), `leaf.ts`,
`animation.ts`, `request.ts`, `interaction.ts`, `wallConfig.ts`, `main.ts`, `lang/en.json`, `css/`, `README.md`.
`pnpm typecheck`, `pnpm test` and `pnpm build` pass. Nothing is committed yet.

Also verified in the source: `CONFIG.Wall.animationTypes` entries may set `midpoint: true` (DoorMesh then anchors
at 0.5 and pivots on the wall's midpoint, used by swivel). Core slide moves the picture by `(a - b) * strength`,
i.e. towards A.

## Still to do

- Test in Foundry (`pnpm devbuild`): each kind, both hinges/sides and signs, click and drag, GM and player,
  no GM online, a door with and without texture, switching the animation type in the wall sheet.
- Delete this file once that passes.
