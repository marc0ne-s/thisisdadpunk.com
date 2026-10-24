# thisisdadpunk.com

Live: **https://marc0ne-s.github.io/thisisdadpunk.com/**

The DadPunk artifact site. Static HTML/CSS/JS, no build step, no framework.
Content is data-driven — edit the JSON in `assets/data/`, never the HTML.

## Deploying

This repo's `gh-pages` branch IS the deployed site (GitHub Pages, source =
`gh-pages` / root). Pushing to it publishes.

Build and push from the working copy, not by hand:

```bash
/Users/marcus/.hermes/profiles/dadpunk/scripts/deploy_site.sh github
```

That script builds a clean bundle first and refuses to push if any media
master leaked in. **Do not deploy the project directory directly** — it holds
~965 MB of video masters and audio stems that are not web assets. The served
site is ~508 KB / 31 files.

Excluded from the bundle: `audio/`, `*.mp4`, `*.bak*`, `memory-wiki/`,
`node_modules/`, `.DS_Store`, `*.log`.

## Layout

```
index.html          the artifact — system bar, hero, project spread, build feed, traces
teaser.html         standalone teaser
punksurveyor/       7-page Punk Surveyor sub-site (nested static site)
assets/css/         main.css, artifact.css
assets/js/          artifact.js (renders from JSON), three-scene.js (WebGL hero), main.js
assets/data/        fleet.json · projects.json · build-fragments.json · agent-traces.json
.nojekyll           stops Pages running Jekyll (which drops _-prefixed paths)
```

`projects.archive.json` holds the full project list; `projects.json` is what
actually renders. Keep them in sync if you curate.

## Live data (system bar, footer, traces)

The bar reads `assets/data/fleet.json`; the traces panel reads
`assets/data/agent-traces.json`. Both are **generated from real machine state**,
never hand-edited:

```bash
/Users/marcus/.hermes/profiles/dadpunk/scripts/gen_fleet_json.py --dry-run  # inspect
/Users/marcus/.hermes/profiles/dadpunk/scripts/refresh_site_data.sh         # regenerate + deploy if changed
```

`refresh_site_data.sh` is wired to the Hermes cron job `dadpunk-site-data-refresh`
(every 6h, script-only, silent when nothing changed). Rules it enforces:

- **Measure or omit.** If tailscale/ssh/router can't be reached, that field is
  dropped rather than filled with a plausible number.
- **Absolute timestamps in JSON.** Every "45m ago" is computed in `artifact.js`
  from `ts`; a stored relative string freezes forever and reads as fresh.
- `active_agents` = installed Hermes profiles (not "agents currently running").
- `last_build` = newest commit across the AI repo tree; the bar shows a date
      instead of a bare HH:MM when it isn't today.

`fleet.json:disk_status` measures the APFS **Data** volume
(`/System/Volumes/Data`) plus Second-Brain-1 and SlagHeap over ssh. `df /` on
macOS reports the read-only system snapshot and understates real usage badly.

## Two things that must not regress

1. **Data fetches are relative** (`assets/data/…`, no leading slash). Absolute
   root paths work on a custom domain but break on a project-subpath host.
2. **`.nojekyll` must stay.** Without it Pages runs Jekyll and silently drops
   paths beginning with `_`.

## Outstanding

- Custom domain `thisisdadpunk.com` not yet pointed here — DNS still at
  Hostinger parking (`2.57.91.91`, ns1/ns2.dns-parking.com). Required records:
  ```
  A     @    185.199.108.153
  A     @    185.199.109.153
  A     @    185.199.110.153
  A     @    185.199.111.153
  AAAA  @    2606:50c0:8000::153
  AAAA  @    2606:50c0:8001::153
  AAAA  @    2606:50c0:8002::153
  AAAA  @    2606:50c0:8003::153
  CNAME www  marc0ne-s.github.io
  ```
  Then repo Settings → Pages → custom domain + enforce HTTPS.
  Do not set the custom domain in Pages before DNS resolves, or the working
  github.io URL redirects to a dead host.
- `hello@dadpunk.xyz` is published on the Punk Surveyor contact page but
  dadpunk.xyz has no MX records — that address does not receive mail. Needs a
  real mailbox or removal; not changed here because it's Marcus's call.
- Traces only refresh when something writes a `## [date time] Agent | …` header
  to `~/ObsidianVault/Log/log.md`. Right now only DadPunk does, so the other
  five traces sit at their June dates (shown as dates, not "5mo ago", so the
  staleness is legible rather than disguised).
