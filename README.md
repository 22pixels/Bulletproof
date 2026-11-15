# ROOT

An ASCII parkour + hacking game. You are a rogue AI. Bullets are only data.

```
python3 -m http.server 8000
# game:   http://localhost:8000
# editor: http://localhost:8000/editor.html
```

| Key | Action |
|---|---|
| A / D | move |
| W / Space | jump (hold for height) |
| S | drop through `=` platforms |
| Q | bubble (bullet time) |
| E | use terminal |
| ESC | disconnect from terminal |

Level 1 hint: terminal `$` near the middle, read the boot log. There is also a secret terminal up the platform stair.

## Level editor (`editor.html`)

Paint levels with the mouse, switch tiles with hotkeys, press **P** to playtest in the real game.

| Key | Tile / action |
|---|---|
| W | `#` wall |
| Q | `=` one-way platform |
| R | `^` spikes |
| E | `G` guard |
| T | terminal, cycles a-f (Shift+T goes back) |
| D | door, cycles 1-9 (or press 1-9 directly) |
| S | `@` player start (only one) |
| X | `>` level exit (only one) |
| A | erase |
| M | select tool (copy / paste / duplicate / move, see below) |
| F / B | flood-fill tool / brush |
| P | playtest in a new tab |
| - / + | zoom (Ctrl+wheel also works) |
| Ctrl+Z / Ctrl+Y | undo / redo |
| Ctrl+S | download `levelN.js` |

Left-drag paints, right-drag erases, Shift-drag fills a rectangle.

**Select, copy, paste, duplicate, move.** Press **M**, drag a box over part of the map (Ctrl+A = everything).
Ctrl+C copy, Ctrl+X cut, **Ctrl+V** paste: the block follows the mouse, click to stamp it (as many times as you like), right-click or Esc to stop.
**Ctrl+D** duplicates the selection next to itself and selects the copy, so pressing it again chains along. **Del** clears the selection.
**Drag inside the selection to move it; Alt-drag copies it.** In-world text inside the box comes along. Pastes only fill non-empty cells, so terrain underneath survives.
A copy never duplicates the `@` start or `>` exit (a cut or a move carries them). All of it is undoable. Events are not part of the selection; use **duplicate** on an event card instead. The right panel lists problems
(missing exit, a door nothing can open...) using the same checks the game runs at startup, and edits the
level's sidecar JSON (name, intro, bubble limits, terminal files and unlock codes). "Wire doors" adds an unlock
code for any door no terminal opens. Drafts autosave in the browser.

To ship a level: download `levelN.js` into `src/levels/`, then import it in `src/levels/index.js` and add it to `LEVELS`.
Other URL options for the game: `?level=3` jumps to a level, `?new` wipes the save, `?custom` plays the editor's level.

Tests: `npm test`. Itch / web build: `npm run build` writes `dist/` (just `index.html` and the modules the game uses).

## Combat and bullet time

- Q opens the bubble any time it is ready. It lasts `duration` (5 s), or press Q again to drop it early.
- Click on a held bullet to pick it; otherwise the closest is selected. Click away from the bullets to fire the selected one.
- The player moves at `playerTimeScale` (0.4) inside the bubble. Dying switches the bubble off and clears bullets.
- Every guard has its own timer. Fire rate: `GUARD.interval` in `src/config.js`, or per level in the editor's Text tab (`"guard": { "interval": 0.8 }`).
- Bosses: put `B` on the map (editor hotkey V). Movement, attacks and phases are all in `src/boss.js`; boss stats are `BOSS` in config or `"boss": {hp, interval, opens}` per level.
- Editor Text tab: level name and intro, guard / bubble / boss settings, and every terminal's files and unlock codes as form fields. Raw JSON is still available.
- In-world text: editor Text tool (Y). Click empty space and type; click a label to edit, drag to move, A-/A+ for size (8-64 px). Stored as `labels: [{x, y, text, size}]`, drawn by `src/labels.js` in both the editor and the game. It scrolls with the level and never fades.
- Checkpoints: `C` tile (editor hotkey C; the old `K` letter still loads). Touch one to move your respawn point; terminals still count too.
- Dying: per level `"respawn": "checkpoint"` (default) or `"start"` (back to the `@`). Editor Text tab, **Dying / respawn at**. Default for every level: `RESPAWN` in `src/config.js`.
- Flying guards: `F` tile (hotkey G). `patrol` flies an oval around where it was placed; `follow` chases you. Settings: `FLYER` in config.js, per level in the Text tab, or per flyer in an event's flyer action.
- Events (game states): editor Events tab. When all conditions are true (all guards dead, player near a point, past a line, seconds elapsed, after another event, door open, **player presses a key**), the actions run once (message, in-world text, **despawn text**, spawn/remove wall, spawn/remove **wall lines**, spawn guard/flyer/boss, open/close door). Each event also has a **wait** field: seconds to wait after the conditions first become true before the actions run (`"delay": 5` in the level data). The wait is latched, so once the trigger has happened the event fires even if the player walks away. Use it for "5 seconds after the player passes this line, spawn the guards". (The older `after another event` condition with its own delay still works for chaining.) Map overlays show E1, E2... (`E1+5s` when delayed). Logic is in `src/events.js`; add new kinds to `COND` / `ACT` there.

- **Passthrough walls**: the `spawn / remove wall` action has a **tile** field, `#` solid (default) or `=` passthrough (jump up through it, S to drop). `"tile": "="` in the level data. Remove clears either kind.
- **Wall lines**: the `spawn / remove wall lines (mixed types)` action holds any number of lines, each with its own start (`x`, `y`), `len`, `dir` (`h` horizontal or `v` vertical) and `tile` (`#` or `=`), so one event can raise a solid pillar and two passthrough ledges at once. `pick line` drags it out on the map (longer side wins); `duplicate` copies a line. Map overlays draw solid lines dashed and passthrough lines dotted. Data: `{ "type": "walls", "mode": "spawn", "lines": [ { "x": 10, "y": 5, "len": 6, "dir": "h", "tile": "=" } ] }`.
- **All dead in an area**: give the `all dead` condition two corner cells (`pick area`, or the four corner fields). Only enemies whose home cell is inside the box count, and at least one of them must actually be shot dead: if they all just vanish (removed by anything other than a kill) it never fires. Leave the corners blank for the old whole-level behaviour.
- **Player presses a key**: `pick`-style button, click it then press the key (default Y). Fires on the moment of the press, so combined with other conditions the key has to be pressed while they are all true. Keys the game already uses (A/D/W/S/Q/E/C/Space) still do their normal job as well.
- **Player dies in a box**: fires once the player has been sent back (death, spikes or a pit) from a cell inside the box (`pick area`; no corners = anywhere). Pair it with **respawn here**: moves the player to the picked cell and makes it their respawn point from then on (also when the level is set to respawn at the start). Because an event fires once, this is for the first such death.
- **Despawn text**: `pick text`, click a cell the text sits on; every in-world text touching that cell is removed (works on level text and on text spawned by earlier events).

## Doors

A door is a digit `1`-`9` in the level map. It is solid and drawn as `%` until its digit is unlocked, then it vanishes. Unlocking only ever adds the digit to the level's open set, and doors are never re-locked except by an event. Ways to open one:
- A terminal unlock code: in the level's terminal data, `unlocks: [{ code, doors: ['1'] }]`. The player types `unlock <code>` (codes are found in files with `ls` / `cat`). The editor's Wire doors button writes a stub code for any door nothing opens.
- A boss dying: `"boss": { "opens": ["2"] }` unlocks those doors when the boss reaches 0 hp.
- An event action `open / close door` (also the only way to close one again), and an event can wait on the `door is open` condition.
Level validation fails if a door in the map can never be opened by any of these.

## Boss editor (`boss-editor.html`)

Draw a boss frame by frame and map its attacks onto the frames.
- **Animations**: any number (idle, attack, ...), each a list of ASCII frames with its own length in ms, loop or play-once. Draw with the mouse (right-drag erases, press any key to change glyph), onion skin shows the previous frame, plus flip / shift / duplicate.
- **Copy, paste, drag and drop frames**: Ctrl+C copies the current frame (drawing and length), **Ctrl+V** pastes it as a new frame after the current one, **Ctrl+Shift+V** pastes over the current frame, Ctrl+X cuts, Ctrl+D duplicates (buttons: copy / paste / paste over). The clipboard works across animations and across bosses in other tabs; a pasted frame is padded or cropped to the boss's size. **Drag a frame in the strip to reorder it** (a bar shows where it lands; Alt/Ctrl-drag copies; drop on the `+` at the end for the last place), or **drop it on an animation name in the left list to copy it to the end of that animation**. Shots follow the frames they are mapped to when frames are moved or inserted. Undoable.
- **Attacks**: an attack plays one animation, and each **shot** fires the moment the animation reaches the frame you pick: aimed at the player, a fixed angle, or a ring; bullet count, spread, speed and where it leaves the body (`pick origin`, then click the canvas).
- **Phases**: which idle animation, movement (`still` / `sway` / `hover`), and attacks to cycle through at what hp, plus attack rate.
- **Stage preview** plays animations and tests attacks against a player `@` you can move.
Export: Download `name.js` into `src/bosses/`, import it in `src/bosses/index.js`, then pick it in a level's Text tab (Boss, boss design) or set `"boss": { "design": "name" }`. The hit radius is how close a reflected bullet has to get to the centre cell to hurt it. `src/bosses/root.js` is the shipped example, built from the original boss. Without a design the boss uses the old built-in one in `src/boss.js`. Data format and rules: top of `src/boss-data.js`.
