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

## Two things that must not regress

1. **Data fetches are relative** (`assets/data/…`, no leading slash). Absolute
   root paths work on a custom domain but break on a project-subpath host.
2. **`.nojekyll` must stay.** Without it Pages runs Jekyll and silently drops
   paths beginning with `_`.

## Outstanding

- Custom domain `thisisdadpunk.com` not yet pointed here — DNS still at
  Hostinger parking. Needs the GitHub Pages A/AAAA records plus a `www` CNAME,
  then set the domain in repo Settings → Pages and enforce HTTPS.
- `hello@dadpunk.xyz` is published on the Punk Surveyor contact page but
  dadpunk.xyz has no MX records — that address does not receive mail.
