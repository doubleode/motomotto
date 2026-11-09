# Hat Trick Moto

**Play it:** https://doubleode.github.io/motomotto/ (after GitHub Pages is turned on — see below)

A flowing side-scrolling pixel motocross racer for the browser. Ride rolling dirt, launch off big tabletops, doubles and triples for long airtime, lean the bike to land on the downslope and keep your speed — and race up to 6 friends online as ghosts. You pick your own speed with the gas and the brake. Pick from six riders and eight bike colors.

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
Double-click `index.html` to open it in your browser. Solo Race, the Garage, and the Track Editor all work this way. Online play also needs an internet connection.

---

## Playing with friends online

1. **The host** opens the game and clicks **Host Online Race**.
   A 4-letter room code appears (like `KZQP`).
2. The host clicks **Copy link** and sends it to friends by text or chat.
   The link looks like `https://doubleode.github.io/motomotto/?room=KZQP`.
3. **Friends** open the link (or open the game, click **Join Online Race**, and type the code), then click **Join**.
   They can press **Change rider** first to pick a name, bike color, and rider.
4. In the lobby, each friend clicks **Ready**. The host picks the track and can add computer riders (CPU) to fill the grid.
5. When everyone shows **READY**, the host clicks **Start Race**.
6. After the race, the host clicks **Back to Lobby** to race again.

Good to know:
- Up to **6 riders** per race (people + CPU riders).
- **Everyone rides their own bike on their own device**, so the controls feel instant no matter the connection. Other riders appear as **ghosts** — you ride right through each other, like racing a time trial side by side.
- **The host runs the room** (the lobby, the computer riders, and the finishing order). The host should keep the game open until the race ends. If the host leaves, the room closes.
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
| Gas | **Z**, Space, or **↑** (or W) | **GAS** (big button, right side) |
| Brake | **X** or **↓** (or S) | **BRAKE** (right side) |
| Lean back | **←** (or A) | **BACK** (left side) |
| Lean forward | **→** (or D) | **FWD** (left side) |
| Pause / menu | **Esc** | **II** button |

On phones the game asks to go fullscreen when a race starts. Turn the phone sideways.

## How to ride

Races go from the start gate to the finish line. The whole game is about **flow** — keeping your speed through the dirt.

- **Pick your speed.** Hold **GAS** to go faster, let go to coast, and squeeze the **BRAKE** to slow down. The **MPH** gauge in the top corner shows how fast you're going.
- **Big air.** The jumps are big — a good hit gives you around two seconds in the air. Too slow and you'll come up short and "case" the jump; too fast (especially after a downhill) and you'll overshoot the landing onto the flat. Tap the brake before a jump if you're carrying too much speed.
- **Gravity matters.** Rolling downhill speeds you up; climbing slows you down.
- **Landings are everything.** In the air, lean to spin the bike. Land with your wheels lined up with the slope — ideally on the *downside* of a jump — and you keep your speed. A lined-up landing on a downslope is a **PERFECT** and gives you a boost (chain them for a combo). Land flat and you lose speed. Land way off and you crash.
- **Pop and scrub.** Lean **back** as you leave a jump to pop higher. Lean **forward** at the lip to stay low and fast.
- **Rollers and whoops.** Hit them neutral and they'll buck you into the air. Lean **forward** to soak them up and stay glued to the ground.
- **Wheelies.** Lean back on the ground with the gas on.
- **Flips!** Spin a full backflip or frontflip and land it to get a speed boost.
- **Mud** slows you down.
- When you crash, your rider tumbles, runs back to the bike, and hops on after about 2 seconds.

## Riders

Open **Garage** from the title screen to set your name, pick a bike color, and choose one of six riders — each has their own gear and helmet design:

**Ace** (stripe), **Blaze** (flames), **Bolt** (lightning), **Checkers** (checkered flag), **Nova** (star), **Moss** (stripe). Ace's gear matches your bike color. Your choices are saved in your browser.

## Tracks and the editor

Three built-in tracks: **Meadow Run** (easy, about 45 seconds), **Canyon Rush** (medium, about 50), **Thunder Ridge** (hard, about 60).

**Track Editor** — tracks are built from pieces, like snapping blocks together:
- Tap a piece on the toolbar to add it **after the highlighted piece**: Flat, Rollers, Whoops, Tabletop, Double, Big Triple, Step-Up, Step-Down, Big Roller, Hill Up, Hill Down, Mud.
- Tap a piece on the track to highlight it. **&lt; / &gt;** move it earlier or later, **Remove** deletes it, **Undo** takes back your last change.
- Scroll by dragging the track, with the arrow keys, your mouse wheel, or by tapping the mini-map at the bottom.
- **Test Ride** rides the whole track. **Ride from here** starts you just before the highlighted piece — handy for practicing one jump.
- **Save** keeps it — it then shows up in Solo Race and in the host's track list for online races. Friends don't need a copy; the host's game sends it to them when the race starts.
- **Share** gives you a short code you can text to a friend; they paste it in their editor's Share box and press **Import**.
- **Load…** can also copy a built-in track so you can remix it.

Saved tracks and your rider live in your browser's storage. Clearing your browser data erases them, so use **Share** to keep a backup code of tracks you love.

---

## What's in each file

| File | What it does |
|---|---|
| `index.html` | The page: menus, lobby, Garage, editor buttons, touch controls, and styles. |
| `game.js` | The game engine: bike physics, jumps, landings, gas and brake, crashes, computer riders, ghosts, drawing, sound, HUD, and the main loop. |
| `net.js` | Online multiplayer: hosting, joining, the lobby, and keeping everyone's race in sync. |
| `art.js` | The pixel-art helper, the bike and rider sprites, the six riders, and the Garage screen. |
| `tracks.js` | Track pieces, the three built-in tracks, turning pieces into terrain, and the track editor. |

### For tinkerers
- Physics numbers (speed, gravity, spin speed, landing tolerance, top speed `vMax`, brake strength) are in the `PHYS` table near the top of `game.js`. `crashTol` makes landings more or less forgiving.
- Jump shapes are in `PIECES` in `tracks.js` — each piece is a few segments like `kick(104, 46)` (a jump face 104 pixels long and 46 tall). Built-in tracks in `BUILTIN_TRACKS` are just lists of piece names.
- Bikes and riders are drawn with simple shapes (lines, circles, polygons) snapped to a pixel grid in `art.js` — `paintBike` draws the bike, `paintRiderOnBike` the rider (the knees and elbows bend automatically), and the black outline is added for you. New riders go in the `RIDERS` list.
- Testing online play with your own signaling server: run a PeerJS server and add `?peer=localhost:9000` to the address.

Online play uses [PeerJS](https://peerjs.com/) (MIT license), loaded from the jsDelivr CDN.
