# Hat Trick Moto

**Play it:** https://doubleode.github.io/motomotto/ (after GitHub Pages is turned on — see below)

A fast side-scrolling pixel motocross racer for the browser. Race up to 6 friends online, launch off big jumps, steer your bike through the air, and keep your engine from overheating. Pick from six riders and eight bike colors.

Everything (art, sound, names) is original and drawn or synthesized in code. There are no image or sound files.

---

## Put it online with GitHub Pages (free, about 10 minutes)

You don't need to install anything. You just upload the files to GitHub and turn on "Pages".

### 1. Make a GitHub account
Go to **https://github.com** and sign up (free). Remember your username — it becomes part of your game's web address.

### 2. Create a repository (a folder for your project)
1. Click the **+** in the top-right corner → **New repository**.
2. **Repository name:** `motomotto`
3. Choose **Public**. (GitHub Pages is free for public repositories.)
4. Leave the other boxes unchecked and click **Create repository**.

### 3. Upload the game files
1. On the new repository page, click the link **uploading an existing file**
   (or **Add file → Upload files**).
2. Drag these 6 files into the box — all of them, at the top level (not inside a folder):
   - `index.html`
   - `game.js`
   - `net.js`
   - `art.js`
   - `tracks.js`
   - `README.md`
3. Scroll down and click **Commit changes**.

### 4. Turn on GitHub Pages
1. In your repository, click **Settings** (top menu, gear icon).
2. In the left sidebar click **Pages**.
3. Under **Build and deployment → Source**, choose **Deploy from a branch**.
4. Under **Branch**, pick **main** and **/ (root)**, then click **Save**.
5. Wait 1–2 minutes and refresh the page. A box appears saying
   **"Your site is live at https://doubleode.github.io/motomotto/"**.

That address is your game. Bookmark it and share it.

### Updating the game later
Upload the changed file again the same way (**Add file → Upload files**). GitHub replaces the old one. The site updates within a minute or two — refresh your browser (on a phone you may need to close and reopen the tab).

### Just want to try it on your own computer first?
Double-click `index.html` to open it in your browser. Solo Practice, the Garage, and the Track Editor all work this way. Online play also needs an internet connection.

---

## Playing with friends online

1. **The host** opens the game and clicks **Host Online Race**.
   A 4-letter room code appears (like `KZQP`).
2. The host clicks **Copy link** and sends it to friends by text or chat.
   The link looks like `https://doubleode.github.io/motomotto/?room=KZQP`.
3. **Friends** open the link (or open the game, click **Join Online Race**, and type the code), then click **Join**.
   They can press **Change rider** first to pick a name, bike color, and rider.
4. In the lobby, each friend clicks **Ready**. The host can pick the track and laps, and add computer riders (CPU) to fill the grid.
5. When everyone shows **READY**, the host clicks **Start Race**.
6. After the race, the host clicks **Back to Lobby** to race again.

Good to know:
- Up to **6 riders** per race (people + CPU riders).
- **The host's game runs the race.** The host should keep the game open and on screen until the race ends. If the host leaves, the room closes.
- If a friend leaves mid-race, the race keeps going without them.
- Someone who joins while a race is running watches it, then joins the next one.
- Friends can open the Garage from the lobby and switch riders or colors — everyone sees the change.

### If joining doesn't work
- **"No room called…"** — check the code with the host (codes use letters only), and make sure the host is still in the lobby.
- **Stuck on "Connecting…"** — some school, office, or hotel Wi-Fi networks block the kind of direct connection this game uses. Try switching one player to mobile data or a home network.
- Online play uses the free public PeerJS service to help players find each other. If it's having a bad moment, wait a minute and try hosting again.

---

## Controls

| Action | Keyboard | Phone (hold sideways) |
|---|---|---|
| Throttle | **Z** (or Space) | **GAS** (right side) |
| Turbo | **X** | **TURBO** (right side) |
| Change lane up / down | **↑ / ↓** (works in the air too) | ▲ / ▼ (left side) |
| Lean back (nose up, float further) | **←** | ◀ (left side) |
| Lean forward (nose down, drop sooner) | **→** | ▶ (left side) |
| Pause / menu | **Esc** | **II** button |

On phones the game asks to go fullscreen when a race starts. Turn the phone sideways.

## How to race

- **Turbo** is faster but heats your engine. If the **TEMP** gauge fills up, you stall for 3 seconds. Ride over a **blue cooling strip** to reset it to zero.
- **Jumps:** you have lots of control in the air.
  - **Lean back** tips the nose up *and* lets you float further.
  - **Lean forward** tips the nose down *and* brings you down sooner — handy for landing on a downslope instead of overshooting.
  - You can even **change lanes in mid-air** to line up a landing or dodge a barrier.
  Land with your bike matching the slope of the ground for a **PERFECT** landing and a speed boost. Land badly and you crash.
- On the ground, holding **lean back** pops a wheelie, which tips your nose up for the next jump.
- **Mud** slows you down. **Hay bales** and **barriers** knock you off — switch lanes, or jump over them.
- Running into another rider's **back wheel** from behind makes *you* crash.
- When you crash, your rider tumbles, runs back to the bike, and hops on after about 2 seconds.

## Riders

Open **Garage** from the title screen to set your name, pick a bike color, and choose one of six riders — each has their own gear and helmet design:

**Ace** (stripe), **Blaze** (flames), **Bolt** (lightning), **Checkers** (checkered flag), **Nova** (star), **Moss** (stripe). Ace's gear matches your bike color. Your choices are saved in your browser.

## Tracks and the editor

Three built-in tracks: **Meadow Loop** (easy), **Dusty Canyon** (medium), **Thunder Gulch** (hard).

**Track Editor:**
- Pick a tool at the top (or press keys **1–9**), then click or tap the track.
  - Ramps (Bump, Medium, Big Jump, Double) cover all 4 lanes.
  - Mud, Cooling, Hay, and Barrier go in one lane — drag to paint several tiles.
  - Eraser removes items, or a ramp if you click on it.
- Scroll with the slider at the bottom, the arrow keys, your mouse wheel, or by tapping the mini-map.
- The red-tinted tiles at the start and end stay clear for the starting grid.
- **Test Ride** tries your track solo (1 lap). **Save** keeps it — it then shows up in Solo Practice and in the host's track list for online races. Friends don't need a copy; the host's game sends it to them when the race starts.
- **Share** gives you a code you can text to a friend; they paste it in their editor's Share box and press **Import**.
- **Load…** can also copy a built-in track so you can remix it.

Saved tracks and your rider live in your browser's storage. Clearing your browser data erases them, so use **Share** to keep a backup code of tracks you love.

---

## What's in each file

| File | What it does |
|---|---|
| `index.html` | The page: menus, lobby, wardrobe, editor buttons, touch controls, and styles. |
| `game.js` | The game engine: physics, jumps, heat, crashes, computer riders, drawing, sound, HUD, and the main loop. |
| `net.js` | Online multiplayer: hosting, joining, the lobby, and keeping everyone's race in sync. |
| `art.js` | The pixel-art helper, the bike and rider sprites, the six riders, and the Garage screen. |
| `tracks.js` | Ramp shapes, the three built-in tracks, and the track editor. |

### For tinkerers
- Physics numbers (speed, gravity, air control, heat rate, landing tolerance) are in the `PHYS` table near the top of `game.js`. Ramp heights are in `RAMPS` in `tracks.js`.
- Built-in tracks are listed in `BUILTIN_TRACKS` in `tracks.js` — each line is a ramp or item at a tile position.
- Bikes and riders are drawn as rows of letters in `art.js` (`BIKE_ROWS`, `RIDER_ROWS`). Each letter is a color; `.` is see-through; the black outline is added automatically. New riders go in the `RIDERS` list, and helmet designs in `HELMETS`.
- Testing online play with your own signaling server: run a PeerJS server and add `?peer=localhost:9000` to the address.

Online play uses [PeerJS](https://peerjs.com/) (MIT license), loaded from the jsDelivr CDN.
