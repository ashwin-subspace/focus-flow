# Focus Flow

A Pomodoro focus timer with tasks, session tracking and daily streaks. Installable on
Android and iPhone as a home-screen app, and fully usable offline.

No build step, no dependencies — plain HTML, CSS and JavaScript.

## Features

- **25 / 5 / 15 timer** — focus, short break, long break, auto-advancing through a
  four-session cycle before each long break.
- **Tasks** — add, complete and delete. Mark one as the active task and every focus
  session you finish against it adds a 🍅.
- **Streaks** — counts consecutive days with at least one completed focus session.
- **Works offline** — a service worker caches the whole app, so it opens with no signal.
- **Survives a locked screen** — timing is anchored to an absolute deadline rather than
  counting ticks, so backgrounding the app or locking the phone doesn't cause drift.
  A session that ends while you're away completes correctly when you return.
- **Buzzes when time's up** — vibration plus a notification, since the screen is usually off.
- Everything is stored on the device. No account, no server, no tracking.

## Running locally

Any static file server works:

```bash
npx -y serve . -l 4321
```

Then open http://localhost:4321.

## Installing on a phone

Open the deployed URL and:

- **Android (Chrome)** — tap **Install** on the prompt, or ⋮ → *Install app*.
- **iPhone (Safari)** — tap **Share** → *Add to Home Screen*. This must be Safari;
  Chrome on iOS cannot install web apps.

## Deploying

Any static host serves this as-is. It is built for a project subpath (all asset,
manifest and service-worker paths are relative), so GitHub Pages works without changes.

## Notes

- `sw.js` uses stale-while-revalidate: the app opens instantly from cache and quietly
  refreshes in the background, so a new deploy is picked up on the next launch.
- Bump `CACHE` in `sw.js` only when you need to force every client to discard its cache.
