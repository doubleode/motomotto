# Hat Trick Moto

**Play it:** https://doubleode.github.io/motomotto/ (after GitHub Pages is turned on — see below)

A side-scrolling pixel motocross racer for the browser. Race up to 6 friends online, hit jumps, manage your engine heat — and stack up to 5 silly hats on your helmet that wobble on every landing and go flying when you crash.

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
   - `hats.js`
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
Double-click `index.html` to open it in your browser. Solo Practice, the Wardrobe, and the Track Editor all work this way. Online play also needs an internet connection.

---

## Playing with friends online

1. **The host** opens the game and clicks **Host Online Race**.
   A 4-letter room code appears (like `KZQP`).
2. The host clicks **Copy link** and sends it to friends by text or chat.
   The link looks like `https://doubleode.github.io/motomotto/?room=KZQP`.
3. **Friends** open the link (or open the game, click **Join Online Race**, and type the code), then click **Join**.
   They can press **Change rider** first to pick a name, bike color, and hats.
4. In the lobby, each friend clicks **Ready**. The host can pick the track and laps, and add computer riders (CPU) to fill the grid.
5. When everyone shows **READY**, the host clicks **Start Race**.
6. After the race, the host clicks **Back to Lobby** to race again.

Good to know:
- Up to **6 riders** per race (people + CPU riders).
- **The host's game runs the race.** The host should keep the game open and on screen until the race ends. If the host leaves, the room closes.
- If a friend leaves mid-race, the race keeps going without them.
- Someone who joins while a race is running watches it, then joins the next one.
- Friends can open the Wardrobe from the lobby and change hats — everyone sees the new stack.

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
| Change lane up / down | **↑ / ↓** | ▲ / ▼ (left side) |
| Lean back | **←** | ◀ (left side) |
| Lean forward | **→** | ▶ (left side) |
| Pause / menu | **Esc** | **II** button |

On phones the game asks to go fullscreen when a race starts. Turn the phone sideways.

## How to race

- **Turbo** is faster but heats your engine. If the **TEMP** gauge fills up, you stall for 3 seconds. Ride over a **blue cooling strip** to reset it to zero.
- **Jumps:** in the air, lean back or forward so your bike matches the slope of the ground where you'll land.
  Match it closely for a **PERFECT** landing and a speed boost. Land badly and you crash.
- On the ground, holding **lean back** pops a wheelie, which tips your nose up for the next jump.
- **Mud** slows you down. **Hay bales** and **barriers** knock you off — switch lanes, or jump over them.
- Running into another rider's **back wheel** from behind makes *you* crash.
- When you crash, your rider tumbles, runs back to the bike, and hops on after about 2 seconds. Your hats bounce down the track and pop back on.

## Hats

Open **Hat Wardrobe** from the title screen. Tap hats to stack them (5 max, repeats allowed — five rubber ducks is a valid lifestyle). Use ▲ ▼ to reorder and X to remove. **Randomize** picks a random stack and color. Your name, color, and hats are saved in your browser.

24 hats: Cowboy Hat, Top Hat, Propeller Beanie, Chef Hat, Pirate Hat, Viking Helmet, Traffic Cone, Party Hat, Crown, Wizard Hat, Baseball Cap, Sombrero, Bunny Ears, Fishbowl, Birthday Cake, Tiny Umbrella, Fez, Mohawk, Graduation Cap, Rubber Duck, Antlers, Pineapple, Halo, Flower Pot.

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
| `hats.js` | The pixel-art helper, all 24 hats, the wobble and fly-off physics, and the wardrobe. |
| `tracks.js` | Ramp shapes, the three built-in tracks, and the track editor. |

### For tinkerers
- Physics numbers (speed, gravity, heat rate, landing tolerance) are in the `PHYS` table near the top of `game.js`.
- Built-in tracks are listed in `BUILTIN_TRACKS` in `tracks.js` — each line is a ramp or item at a tile position.
- Hats are drawn as rows of letters in `HAT_DEFS` in `hats.js`. Each letter is a color from `PAL`; `.` is see-through; the black outline is added automatically. Add a new entry and it appears in the wardrobe.
- Testing online play with your own signaling server: run a PeerJS server and add `?peer=localhost:9000` to the address.

Online play uses [PeerJS](https://peerjs.com/) (MIT license), loaded from the jsDelivr CDN.
