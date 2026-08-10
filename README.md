# SPACE DODGE 🚀

A complete, polished, production-ready **70-level space arcade campaign** built with
pure HTML5, CSS3, and vanilla JavaScript — no frameworks, no build tools, no backend,
no npm required.

Battle through **10 worlds** of 7 levels each, face **10 uniquely-designed bosses**,
unlock **5 ships**, and climb the high score board — all running as a static site.

## 🚀 Play It

Open `index.html` directly, or serve the folder with any static file server:

```bash
python3 -m http.server 8080
# visit http://localhost:8080
```

## 📁 Project Structure

```
/
├── index.html      All screens, canvas, touch controls, meta/SEO tags, AdSense + H5 Ads
├── style.css        Full responsive space-themed UI
├── game.js          Complete game engine (70-level campaign, bosses, ships, missions)
├── favicon.svg       Standalone icon (referenced by the og:image meta tag)
└── README.md         This file
```

Every visual is drawn procedurally on Canvas/CSS; every sound is synthesized at
runtime via the Web Audio API. No external image or audio files, no copyrighted assets.

## 🌌 The Campaign

**10 Worlds, 7 levels each (70 total), levels 1–70:**

| World | Levels | Boss |
|---|---|---|
| 1. Deep Space | 1–7 | Rock Titan |
| 2. Meteor Belt | 8–14 | Meteor Wyrm |
| 3. Laser Sector | 15–21 | Laser Sentinel |
| 4. Alien Frontier | 22–28 | Hive Queen |
| 5. Dreadnought Warzone | 29–35 | Dreadnought |
| 6. Gravity Sector | 36–42 | Gravity Wraith |
| 7. Minefield | 43–49 | Mine Lord |
| 8. Galactic War | 50–56 | War Titan |
| 9. Void Sector | 57–63 | Void Reaper |
| 10. Final Frontier | 64–70 | Void Titan (final boss) |

Every level is generated from a **reusable, data-driven level configuration**
(`buildLevels()` in `game.js`) — each entry has its own duration, difficulty/spawn-rate
multiplier, enemy palette, hazard set, and mission type, so the campaign is easy to
extend past 70 levels later without touching engine code.

**Mission types** rotate through each world: Survival, Combat (destroy N enemies),
Collection (collect N coins), Dodge (survive a denser hazard field), Mixed
(combined objectives), and Boss (defeat the boss — no timer, ends on boss defeat).

**Bosses** are each visually distinct (unique procedural shape, color, and name) and
mechanically distinct: every boss has a 4-phase health-gated attack system (aimed
shots → + radial bursts → + homing hunters → + laser sweeps as health drops), with a
warning banner and short entrance sequence before the fight begins.

## 🚀 Ships (unlock through play only — no pay-to-win)

| Ship | Unlocks at | Trait |
|---|---|---|
| Explorer | Default | Balanced |
| Interceptor | 10 levels completed | Fastest movement |
| Striker | 25 levels completed | Fastest fire rate |
| Guardian | 40 levels completed | Longest shield uptime, most armor |
| Phantom | 60 levels completed | Strong across every stat |

Selected in the **Ship Select** screen, which shows stat bars and unlock requirements.

## 🎮 Controls

**Desktop:** Arrow Keys / `WASD` to move · `Space` (hold) for shield boost · `P` to pause.
Your ship auto-fires forward — aim by positioning, not by pressing a fire button.

**Mobile:** Drag the joystick to move · hold ⚡ for shield boost · tap ⏸ to pause.
Controls auto-detect touch devices; force Touch/Keyboard from Settings.

## 🖥️ Screens

Loading · Main Menu (Continue/Level Select/Ship Select/How To Play/High Scores/Settings)
· How To Play · World Select · Level Select (per-world campaign map with best-score/
best-time/accuracy detail panel) · Ship Select · First-time Tutorial · Level Intro
(cinematic sector/threat/objective card) · Game (redesigned HUD: lives+score top-left,
level name+progress bar or boss health bar top-center, coins+pause top-right, combo
popup, boss warning banner) · Pause · Level Complete · Game Over · Campaign Complete
(after Level 70) · Settings · High Scores.

## 💾 Persistence

Everything is saved to `localStorage` under `spaceDodge_save_v2` and survives a
refresh: highest unlocked level, per-level best score/time/accuracy/coins/completion,
global best score/level/coins/survival time, bosses defeated, unlocked ships, selected
ship, tutorial-seen flag, campaign-complete flag, and all settings. A light migration
reads stats from the previous single-mode save format if present. localStorage access
is wrapped in try/catch so the game still runs (without persistence) if storage is
blocked.

**Unlock rule:** completing level N unlocks level N+1; every previously completed level
always remains selectable and replayable from Level Select, regardless of how far you've
progressed.

## 📢 Ads (unchanged from prior integration)

- Two standard AdSense banners (Main Menu, Game Over) using publisher ID
  `ca-pub-2733473358845322` with placeholder ad-slot IDs — replace with your real slot
  IDs in your AdSense dashboard; until then they render as empty responsive boxes and
  never break layout.
- **Google H5 Games Ads / Ad Placement API**: fires an interstitial (`adBreak`, type
  `'next'`) at exactly one natural break — immediately after a level is completed — and
  nowhere else. The game is fully paused for the duration of the ad break. A layered
  fallback guarantees gameplay always resumes: (1) if the Ad Placement API script never
  loaded, the call is skipped entirely; (2) if the ad SDK reports no ad was available,
  `adBreakDone` resumes play; (3) as a hard safety net, a 2.5s timeout force-resumes play
  even if the ad script queues the call but never processes it (e.g. blocked, offline, or
  the AdSense account isn't yet H5-approved) — the game can never hang waiting on an ad.
  Requires separate H5 Games Ads approval on your AdSense account
  (`https://adsense.google.com/start/h5-beta/`); until approved, this simply resolves via
  the fallback with no visible ad.

## 🔧 Customization Notes

- **Level tuning**: `buildLevels()` in `game.js` — duration, difficulty/spawn-rate curves,
  mission rotation, objective targets.
- **World themes/bosses**: the `WORLDS` array — enemy palette, hazards, boss name/shape/
  color per world.
- **Ships**: the `SHIPS` array — stats and unlock thresholds.
- **Colors/theme**: CSS custom properties in `:root` at the top of `style.css`.

## 🌐 Deployment (GitHub Pages)

Push this folder to a repo, enable Pages (source: `main` branch, root folder) — no build
step required. Works identically on any static host.

## ✅ Tested

- Full syntax check (`node --check game.js`) — clean.
- Every `getElementById`/CSS class reference in JS cross-matched against HTML/CSS —
  zero missing.
- Level generator validated against the full 70-level spec: exactly 10 boss levels at
  7/14/21/28/35/42/49/56/63/70, all 10 bosses visually and mechanically distinct
  (unique name, shape, color, phase-based attack set), normal-level durations in the
  ~95–175s (≈1.6–2.9 min) range scaling with progression.
- Unlock/replay/Continue logic validated against the exact scenarios in the spec:
  fresh save (only L1 unlocked), completing L1 unlocks L2 while L1 remains replayable,
  jumping to "reached level 25" leaves levels 1–24 replayable and 26+ locked, Continue
  selects the correct next-incomplete level, and Continue selects Level 70 once the
  campaign is fully complete.
- `localStorage` persistence simulated across a save → reload cycle — all fields
  (unlock progress, per-level completion, global best score) survive intact.
- H5 Ad Placement API fallback timeout tested in isolation against the worst case
  (script present but never processes the queued call) — confirmed the game always
  resumes within a bounded ~2.5s window rather than hanging.
- All files served locally over HTTP — every file returns 200, no 404s.
- AdSense publisher ID and H5 Ads integration confirmed unchanged/intact after the
  rewrite.

## 📌 Known Scope Notes

- Of the mission-type examples suggested in the design brief, **Survival, Combat,
  Collection, Dodge, Mixed, and Boss** are fully implemented as distinct mechanics.
  **Escort** (protecting an AI-controlled friendly ship) and **Hunter** (a dedicated
  "destroy this specific enemy" mode distinct from Combat) were not built as separate
  systems in this pass — Hunter-style play currently happens naturally within Combat
  levels whose enemy palette is dominated by a single enemy type. Flagging this
  explicitly rather than presenting it as fully covered.
- No background music track is included (only toggleable generated sound effects) —
  the Music setting exists in the UI as a reserved toggle for future use.
- Ad slot IDs are placeholders; swap in your real AdSense unit IDs when ready.
