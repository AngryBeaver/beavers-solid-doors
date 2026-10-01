# Beaver's Solid Doors
![Foundry Core Compatible Version](https://img.shields.io/endpoint?url=https%3A%2F%2Ffoundryshields.com%2Fversion%3Fstyle%3Dflat%26url%3Dhttps%3A%2F%2Fgithub.com%2FAngryBeaver%2Fbeavers-solid-doors%2Freleases%2Flatest%2Fdownload%2Fmodule.json)
![Foundry System](https://img.shields.io/endpoint?url=https%3A%2F%2Ffoundryshields.com%2Fsystem%3FnameType%3Draw%26showVersion%3D1%26style%3Dflat%26url%3Dhttps%3A%2F%2Fgithub.com%2FAngryBeaver%2Fbeavers-solid-doors%2Freleases%2Flatest%2Fdownload%2Fmodule.json)
![Download Count](https://img.shields.io/github/downloads/AngryBeaver/beavers-solid-doors/total)

A Foundry VTT v14 module where doors really move when they open.

- **Open**, a solid door is its wall moved to where the door now stands. That leaf blocks movement, sight, light and
  sound like the closed door did, and the part of the doorway it left is free.
- **Click** the door icon to open or close it as usual. **Press and drag** it: the door follows the pointer and stays
  where you let go, so it can stand open only a crack. Drag it back to (almost) closed and it closes.
- The door picture (if the door has a texture) moves by exactly the same amount.

## Which doors are solid

Every door animated with Foundry's **Swing**, **Swivel** or **Slide** is solid while the module is active; nothing to
switch on. The door moves the way Foundry's animation moves its picture:

| Animation | The door                                          | "Opens up to"       |
|-----------|---------------------------------------------------|---------------------|
| Swing     | turns around the wall's start point               | 5° to 180°          |
| Swivel    | turns around its middle                           | 5° to 90°           |
| Slide     | slides along its wall towards the start point     | 5 % to 100 %        |

- **Open Direction** (Foundry's setting) turns the other way, or slides towards the end point.
- **Double Door** (Foundry's setting) splits the door in two halves that open mirrored, like Foundry draws them.
- **Opens up to** is in the *Solid door* section of the wall sheet. It replaces Foundry's Strength, which is hidden
  for solid doors; until set, it follows the Strength (1 = 90° or the full length).

Doors without animation, with Ascend or Descend, and secret doors stay plain Foundry doors: open, the doorway is
simply free.

## Notes

- Players may only open and close doors, not change a wall. A new opening goes to the GM's client, which stores it
  on the wall. Without a GM online the player stores it on their own user and every client uses the newest one; the
  next GM to log in moves these onto the walls.
- The GM sees the open door's wall on the Walls layer, drawn like an open door (green) where the door stands.
- A player sees the door icon when their token sees the doorway (as in Foundry) or any part of the open door, so an
  open door never hides its own icon from a token trapped behind it.
- The icon rides on an open single door: on its middle when it turns; when it slides, along with it up to the edge
  of the doorway. Double doors keep it in the doorway between their halves. Works with or without a GM.
- A door without a texture still works, it just has no picture.
- The leaf is not tested against other walls, a door can swing through a wall.

## API

For other modules and macros, `game.modules.get("beavers-solid-doors").api`:

- `solidConfig(wall)`: how a WallDocument moves, `{kind, direction, double, max, amount}`, or `undefined` for a door
  that is no solid door. Works without a canvas.
- `requestDoor(wall, open, amount?)`: open (to `amount`, default the stored one) or close the door, with the same rules
  and GM routing as clicking its icon. Resolves to `{error?}`.
- `leafSegments(c, config, amount)` and `amountToward(c, config, pointer, grab)`: the pure geometry. Any frame works
  that is the scene turned, moved or scaled (not mirrored); segments come back rounded to whole units.
- `CLOSE_BELOW`: an opening dragged below this closes the door.

[Beaver's Mobile Pawn](https://github.com/AngryBeaver/beavers-mobile-pawn) uses it to let players drag doors open from
their phone.

## Development

```
pnpm install
pnpm test
pnpm build      # dist/
pnpm devbuild   # into the Foundry data folder from package.json "devDir"
```
