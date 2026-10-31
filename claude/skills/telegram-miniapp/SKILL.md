---
name: telegram-miniapp
description: Running the game as a Telegram Mini App — the vendored Telegram WebApp SDK (libs/telegram-web-app.js), the single wrapper js/Telegram.js (global TG), the launch sequence (ready, expand, fullscreen, orientation lock, vertical swipes), safe areas and viewport, pause on deactivated, haptics, CloudStorage next to Store, the rewarded-ad hook, BotFather setup, HTTPS hosting and tunnels, debugging inside Telegram, and initData validation on a server. Read before touching anything Telegram-specific, before hosting a build for Telegram, and before adding any server that trusts a Telegram user.
---

# Telegram Mini App

## The rule

**The game runs the same in a plain browser and inside Telegram.** Every Telegram call goes
through one wrapper, `js/Telegram.js` (global `TG`); no other file touches
`window.Telegram.WebApp`. Every call is guarded by `TG.inside` and `TG.at(version)`, so a missing
method on an old client is a no-op, never an exception. `initDataUnsafe` is untrusted: nothing that
matters (leaderboard scores, purchases) is decided from it without server-side validation.

## The SDK is vendored, not loaded from telegram.org

ArcEngine ships zero external scripts (invariant 1); `tools/build.mjs` fails a build that has one.
Telegram's script `https://telegram.org/js/telegram-web-app.js` is therefore copied into
`libs/telegram-web-app.js`:

- first `<script>` in `index.html` (before `js/Constants.js`), and a row in `CODE_FILES`
  (`tools/asset-scan.mjs`), like every script;
- a header comment with the source URL, the `?NN` revision and the fetch date;
- re-vendored when a Bot API feature we need is newer than the copy.

Fetching it is a download from the network: get the Producer's approval first, every time.
Outside Telegram the script still defines `window.Telegram.WebApp`, but `initData` is `''`.

## Wrapper shape (`js/Telegram.js`)

```js
/** @satisfies {Record<string, any>} */
const TG = {
  /** @type {any} */ app: (typeof window !== 'undefined' && window.Telegram?.WebApp) || null,
  get inside() { return !!this.app?.initData; },
  at(v) { return this.inside && !!this.app.isVersionAtLeast?.(v); },
  get mobile() { return ['ios', 'android'].includes(this.app?.platform); },
};
```

Keep it a thin facade: methods named after game intents (`TG.boot()`, `TG.runStarted()`,
`TG.runEnded()`, `TG.haptic('shot')`), Telegram names inside. Colors and timings come from
`js/Constants.js` (invariant 3). Add the file to `index.html`, `CODE_FILES` and `globals.d.ts`
(`Window.Telegram`).

## API we use, by Bot API version

| Need | Call / field | Since |
|---|---|---|
| hide Telegram's placeholder | `ready()` | 6.0 |
| full height | `expand()`, `isExpanded` | 6.0 |
| version guard | `isVersionAtLeast(v)`, `version`, `platform` | 6.1 / 6.4 |
| haptics | `HapticFeedback.impactOccurred(style)`, `notificationOccurred(type)`, `selectionChanged()` | 6.1 |
| colors | `setHeaderColor`, `setBackgroundColor` | 6.1 |
| confirm close mid-run | `enableClosingConfirmation()` / `disableClosingConfirmation()` | 6.2 |
| cloud key-value | `CloudStorage.setItem/getItem/getItems/removeItem` | 6.9 |
| no swipe-to-minimize | `disableVerticalSwipes()`, `isVerticalSwipesEnabled` | 7.7 |
| fullscreen | `requestFullscreen()`, `exitFullscreen()`, `isFullscreen`, events `fullscreenChanged`, `fullscreenFailed` (`UNSUPPORTED`, `ALREADY_FULLSCREEN`) | 8.0 |
| portrait lock | `lockOrientation()`, `unlockOrientation()`, `isOrientationLocked` | 8.0 |
| safe areas | `safeAreaInset`, `contentSafeAreaInset`, events `safeAreaChanged`, `contentSafeAreaChanged` | 8.0 |
| minimized / restored | events `deactivated`, `activated` | 8.0 |
| home screen icon | `addToHomeScreen()`, `checkHomeScreenStatus(cb)` | 8.0 |
| share a result | `shareToStory(url, params)` (7.8), `shareMessage(id)` (8.0, needs a bot-prepared message) | 7.8 / 8.0 |
| payments (later) | `openInvoice(url, cb)`, Telegram Stars only for digital goods | 6.1 |

Events: `TG.app.onEvent(name, fn)` / `offEvent(name, fn)`.

## Launch sequence

Run from `main.js` as soon as the loading screen is visible, before the 3D scene finishes loading:

1. `ready()` — early: our loading screen replaces Telegram's placeholder.
2. `expand()`.
3. `at('7.7')` → `disableVerticalSwipes()`. Without it a downward swipe minimizes the game mid-run.
4. `at('8.0') && mobile` → `requestFullscreen()`; on `fullscreenFailed` stay expanded, no retry loop.
5. `at('8.0')` → `lockOrientation()` (the game is portrait only).
6. `at('6.1')` → `setHeaderColor` / `setBackgroundColor` to the game's background color.
7. On run start `enableClosingConfirmation()`, on run end `disableClosingConfirmation()`.

## Viewport and safe areas

- The canvas fills the window. In fullscreen Telegram draws its own close and menu buttons over the
  top of the game: HUD must stay below `safeAreaInset.top + contentSafeAreaInset.top`.
- Apply insets in ONE place: `UI.js` pads its root container from the CSS variables
  `--tg-safe-area-inset-*` and `--tg-content-safe-area-inset-*` (fallback `0px`). Never per element,
  never in game code (UI invariant 11, skill `claude/skills/ui/SKILL.md`).
- Resize the engine on `viewportChanged` only when its `isStateStable` is true; pin bottom controls
  to `viewportStableHeight` (`--tg-viewport-stable-height`), not `viewportHeight`.

## Lifecycle

- `deactivated` (or `document.visibilitychange` to hidden in a browser) → pause the run and mute
  `Sound3D`.
- `activated` → show the pause overlay; do not auto-resume. One tap resumes.

## Haptics

| Game event | Call |
|---|---|
| switch shot (tap on a fork) | `impactOccurred('light')` |
| resource picked up | `impactOccurred('soft')` |
| shield takes a hit | `impactOccurred('heavy')` |
| fall, crash, caught by the collapse | `notificationOccurred('error')` |
| new record | `notificationOccurred('success')` |

Fire on events only, never per frame.

## Storage

`Store` (`js/Constants.js`) stays the source of truth (invariant 7). Mirror small values to
`CloudStorage` when `at('6.9')`: best distance, settings. Limits: 1024 keys per user per bot, keys
1-128 chars of `A-Za-z0-9_-`, values up to 4096 chars; calls are async with callbacks. On boot read
the cloud value and keep the max with the local one; write after a run ends, not during it.

## Rewarded ad to continue a run

One function, `Ads.rewarded()` → `Promise<boolean>`. In dev and in a plain browser it is a stub
(resolves after a short fake delay). The ad network is the Producer's decision; its SDK is an
external script, so it gets the same vendoring question and approval as the Telegram SDK. A failed
or unavailable ad resolves `false` and the run ends normally — never block the end screen on it.

## Bot setup (the Producer does it in Telegram; agents never handle the token)

1. `@BotFather` → `/newbot` → bot token. The token is a secret: never in the repo, never in the
   client, never in a chat with an agent.
2. `/newapp` → a Mini App with a short name → direct link `t.me/<bot>/<app>`; or `/setmenubutton`
   for a menu button. The URL must be HTTPS.
3. Separate bots for dev and production, so a dev tunnel never replaces the public URL.

## Hosting

- Production is static: `build.bat` → `dist/*.zip` → any HTTPS static host. `BUILD_EXCLUDE`
  (`tools/asset-scan.mjs`) keeps `art_src`, `gamestudio`, `docs` out of the archive.
- Serve with gzip or brotli: `libs/babylon.js` is about 7 MB raw. Measure the first load on a
  mobile network before every tester build; sprites and textures are compressed or atlased first.
- Telegram's WebView caches hard: version file names or add a version query on each release.
- A phone against the dev server: expose port 8080 over HTTPS with a tunnel (for example
  `cloudflared tunnel --url http://localhost:8080`, random URL per start) and point the dev bot's
  Mini App URL at it. Installing a tunnel tool is a download: Producer's approval first.

## Debugging inside Telegram

- Telegram Desktop (Windows/Linux, Beta): Settings > Advanced > Experimental settings > Enable
  webview inspection; right-click in the app > Inspect.
- Android: enable USB debugging; in Telegram Settings press and hold the version number to open
  Debug Settings > Enable WebView Debug; open `chrome://inspect/#devices`.
- iOS: tap the Settings icon 10 times > Allow Web View Inspection; Safari on a Mac > Develop.
- Before Telegram, the game is checked in the Claude Desktop browser pane (skill
  `claude/skills/verify/SKILL.md`) with `TG.inside === false`.

## Validating initData on a server

The leaderboard function does this (`server/leaderboard/src/index.js`, `Authorization: tma <initData>`);
`TG.initData` is the only way the game reads the string. Purchases, when they come, follow the same rules:

- **Bot token (HMAC).** `secret_key = HMAC_SHA256(key = "WebAppData", message = bot_token)`;
  `data_check_string` = every received field except `hash`, URL-decoded, sorted by key,
  `key=value`, joined with `\n`; valid if `hex(HMAC_SHA256(key = secret_key, message =
  data_check_string)) == hash`. The classic bug is swapping key and message in the first step:
  Telegram's docs write `HMAC_SHA256(<message>, <key>)`.
- **Third party (Ed25519, no token).** `data_check_string` = `"<bot_id>:WebAppData\n"` + every
  field except `hash` and `signature`, sorted, `key=value`, joined with `\n`; verify the base64url
  `signature` with Telegram's public key (production
  `e7bf03a2fa4602af4580703d88dda5bb59f32ed8b02a56c187fe7d34caed242d`, test
  `40055058a4ee38156a06562e52eece92a771bcd8346a8c4615cb7376eddf72ec`).
- Check `auth_date` freshness with a window we choose. Telegram signs initData once, when the app
  opens, and never refreshes it: a window shorter than a session rejects honest runs. The leaderboard
  uses `LEADERBOARD_AUTH_MAX_SEC` (a day).
- Never accept a score as a bare number: the client sends the run seed and its input log, the
  server replays the deterministic rules and computes the score itself.

## Checklist for a Telegram tester build

- [ ] Plays to the end in a plain browser (`TG.inside === false`).
- [ ] A downward swipe during a run does not minimize the app.
- [ ] HUD clear of Telegram's buttons in fullscreen on a notched phone.
- [ ] Minimizing pauses; restoring shows the pause overlay.
- [ ] Best distance survives clearing the app (CloudStorage).
- [ ] Archive size and first-load time measured on a mobile network.
