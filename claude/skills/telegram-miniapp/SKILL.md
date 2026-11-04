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
| orientation lock (holds the CURRENT orientation, no call asks for one) | `lockOrientation()`, `unlockOrientation()`, `isOrientationLocked` | 8.0 |
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
5. `at('8.0')` → `lockOrientation()` for the portrait game. On the wide screen (the setting or `?land`) the lock waits for the turn (`TG.holdOrientation`, `Game.fitOrientation`): locked early it would hold portrait.
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

- `deactivated` (or `document.visibilitychange` to hidden in a browser) → pause the run and hold
  `Sound3D` (`setHeld`, through the `onActive` of `TG.boot`): a minimized app may stay visible.
- `activated` → release the sound, show the pause overlay; do not auto-resume. One tap resumes.

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

One function, `Ads.rewarded()` → `Promise<boolean>` (`js/Ads.js`). In dev, in a plain browser and with
every network off it grants the reward after a short delay. A failed or unavailable ad resolves `false`
and the run ends normally — never block the end screen on it.

Networks (`Ads.NETWORKS`) are on when their id in `Constants.js` is set; ids are public. Each offer starts
from the next network and passes on when it has no ad, so every network gets the same chances and the
dashboards compare directly. A viewer who closes the ad ends the offer without a reward.

An ad network's script is the one exception to invariant 1: it loads from the network's host, on the first
offer, inside Telegram only (the CrazyGames SDK: on their portal only, at boot, see Portals), and its address
is an `ADS_*_SCRIPT` line of `Constants.js`, the only lines
`tools/build.mjs` allows besides `LEADERBOARD_URL`. The networks update these scripts on their side, so
they are not vendored. Before a network goes on, name it in `privacy.html`.

- Adsgram: `window.Adsgram.init({ blockId }).show()` resolves `{ done }`, rejects with `{ error }` on a skip
  or a failure; `error` tells them apart.
- Monetag: the Rewarded Interstitial, not the Rewarded Popup, which leaves for an external page. The
  promise resolves on an early close too: only `reward_event_type === 'valued'` is a view.

In Telegram every lost run also ends with an ad (`ADS_AFTER_LOSS`, 1 — on): `Ads.afterLoss()` asks the same
networks in turn with nothing to earn. `Game._lossAd` shows it when the player leaves the end dialog by "Again"
or "Menu", once per run, so it never stacks with the continue offer of that dialog; the tutorial and a restart
from pause show none, and the dialog's buttons wait while it plays. Not on CrazyGames: their rules allow one ad
at an end of a run, and the portal has its own midgame (see Portals).

## Portals

The same build also goes to CrazyGames (`_handoff/crazygames`, made by `tools/build.mjs`). Their HTML5 SDK v3 is
an ad network's script like the others: its address is `ADS_CRAZYGAMES_SCRIPT`, it loads through
`Ads._script`, and one wrapper, `js/CrazyGames.js` (global `CG`), is the only file that touches
`window.CrazyGames`.

- **Where it loads.** Only when the page's own host is `crazygames.com` or under it (their sitelock check), and
  never when `TG.inside`. `?useLocalSdk=true`, the SDK's own switch to its local mode, loads it on any host for a
  check: on the dev server the SDK logs every call and shows a stand-in ad. `CG.ready` is true only after
  `init()` resolved in the `crazygames` or `local` environment; `disabled` or a failed script leave the game as
  it is everywhere else.
- **Events.** `loadingStart` when the SDK comes while the loading screen is up, `loadingStop` in `hideLoader`;
  `Game.update` tells `CG.gameplay(mode === 'play')` every frame and the wrapper sends only changes, so start,
  pause, resume, the end of a run and the menu are all covered; `happytime` on a beaten record, never on the
  first run's.
- **The rewarded continue.** On CrazyGames `Ads.rewarded()` asks only `requestAd('rewarded')`; Adsgram and
  Monetag never load there. `adFinished` is the reward; `adblock` and any `adsDisabled…` code (SDK 3.8 answers `adsDisabledBasicLaunch` at once in the basic launch) mean no ad comes this
  session, and since the portal rejects a rewarded button that does nothing, the reward is free then;
  `unfilled` and the rest end the offer, and the end dialog says to try next run instead of offering it again.
  The dialog's buttons wait while the ad is pending. The game is muted only from `adStarted` to the answer.
- **The ad between runs.** Their rules allow either a rewarded "keep playing" or a midgame ad with the restart
  at one end of a run, never both, and never on navigation buttons. So `Ads.midgame()` asks
  `requestAd('midgame')` only from "Again" of an end dialog whose run already used its continue
  (`ADS_CRAZYGAMES_MIDGAME`, 1 — on); the SDK keeps midgame ads 3 minutes apart and answers `adCooldown` in
  between, and any answer lets the new run start. In Telegram the ad between runs is the after-loss ad below.
- **The leaderboard.** CrazyGames keeps its own table (invited games only, weekly seasons from Monday 09:00
  UTC, shown on their site), so the game shows none there. With `LEADERBOARD_CRAZYGAMES` on, the end of a run
  of a player logged in to CrazyGames goes to `POST /crazygames/score` of the leaderboard function with
  `Authorization: cg <getUserToken({ signingKeyType: 'IN_GAME_AUTH' })>`, only when it beats that player's
  best of the week on this device. The function checks the token against
  `https://userportal.crazygames.com/.well-known/jwks.json` (RS256, by `kid`), replays the run and posts the
  meters to their Leaderboard API with the secret `CRAZYGAMES_API_KEY`. Guests are not sent; the auth prompt
  is never opened by the game. Setup steps: `server/leaderboard/README.md`.
- **Their rules the game follows there.** `muteAudio` of the portal's settings overrules the game's volumes
  (`Sound3D.setMuted`); the portal's `systemInfo.locale` picks the language until the player chooses one, and
  that guess is not saved; Start goes straight into a run (the tutorial until it is passed), because a full
  launch allows at most one click before gameplay. The shop, donation, leaderboard, friend challenge and exit
  stay hidden off Telegram.

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
