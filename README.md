# thisisdadpunk.com

The manifesto site. Three.js hero, live agent pulse, punk zine aesthetic.
Also the production workspace for "The Infected", a 267s vertical horror
short built on PunkPlanet using only local, free tools.

## What lives here

```
thisisdadpunk.com/
├── index.html             # The site — Three.js hero, agent pulse, zine layout
├── AUDIO_WORKFLOW.md      # The Infected — canonical audio pipeline
├── GOAL.md                # The Infected — current production state & next steps
├── README.md              # (this file)
├── memory-wiki/           # Goal prompts / handoffs for fresh sessions
│   └── GOAL_The_Infected_Audio_Polish.md
├── audio/                 # The Infected narration, FX, mixes
│   ├── SCRIPT.md          # 21-beat script (source of truth for story)
│   ├── MIX_v6.md          # Definitive timing map
│   ├── TIMING_AUDIT_v5.md # Vision-detected actual card timings
│   ├── mix_manifest.json  # Machine-readable beat → FX → bed mapping
│   ├── raw/               # 21 raw TTS clips
│   ├── processed/         # 21 per-beat FX-rendered clips
│   ├── beds/              # Ambient sub-rumble + room-tone
│   ├── mix/               # Stems and full mixdowns (v1–v8)
│   └── scripts/           # ffmpeg/sox recipes, mixdown_build.py
├── assets/
│   ├── css/main.css, artifact.css
│   ├── js/main.js, three-scene.js, now.js, projects.js, artifact.js
│   ├── data/now.json, projects.json, fleet.json, agent-traces.json, build-fragments.json
│   ├── fonts/             # (Google Fonts; placeholder dir)
│   └── img/               # (placeholder dir)
├── punksurveyor/          # Sub-site for the photoreal 3D walkthrough service
│   └── README.md          # service scope + deploy notes
├── captures/              # (empty; see /Volumes/Second-Brain-1/AI/dadpunk/captures/)
└── *.mp4                  # The Infected video renders (v1 through v11)
```

The `audio/` directory is the heart of the production. The site itself is
just `index.html` + `assets/`. The video files and the `punksurveyor/`
sub-site ride along because they live in the same project tree.

## The site (index.html)

Single-page. Three.js canvas behind a zine layout. Live agent pulse that
fetches from `assets/data/now.json` (and the other data files) to surface
fleet state. No build step, no framework. Three.js loaded via service worker
cache or direct CDN — `sw.js` and `manifest.json` are at the parent
project root (synthriders-web-editor reuses the pattern; the
thisisdadpunk.com site itself does not currently PWA-cache).

System bar shows: brand · pulse · agent count · build timestamp · location.
That's the "live machine" aesthetic. The site's job is to be a living
artifact, not a brochure.

## The Infected — production state

See `GOAL.md` for the canonical status. Short version:

- **Script:** 21 beats, complete. `audio/SCRIPT.md`.
- **Voice:** OmniVoice TTS (PunkPlanet, port 5050). Voice mapping locked
  in `AUDIO_WORKFLOW.md`. Character is **Kaelith** (renamed in SCRIPT.md
  2026-06-03 to match the video canon).
- **Audio mix chain:** v1 through v8 in `audio/mix/`. **Last clean mix:**
  `audio/mix/the_infected_mix_v8.wav`.
- **Video chain:** `The_Infected_*.mp4` at the project root. **Current
  master:** `The_Infected_TIMING_TEST_v11.mp4` (267s, vertical, all 21
  beats with FX applied). v9-v11 are sync-tests of the video, not new
  audio stems.
- **Blockers:** See `GOAL.md` — the timeline still has a few drift
  points and a couple of beats with overlap (per `audio/MIX_v6.md` and
  `audio/TIMING_AUDIT_v5.md`).

## The Punk Surveyor sub-site (`punksurveyor/`)

A 7-page marketing site for the photoreal 3D walkthrough service. Static
HTML + Three.js hero + one `flatbread.glb` mesh. See
`punksurveyor/README.md` for service scope, pricing posture, and deploy
status.

## The data layer (`assets/data/`)

`now.json`, `projects.json`, `fleet.json`, `agent-traces.json`,
`build-fragments.json` are JSON files the site fetches to render the live
state. They are committed to the repo and updated by hand (or by an
agent) when fleet state changes. They are NOT generated at build time.

## Design system

Inherited from `/Volumes/Second-Brain-1/AI/dadpunk/BRAND.md`:

- **Palette:** Black `#0a0a0a` · Off-white `#e8e4de` · Safety orange `#e85d04` · Olive `#5c5b3a` · Olive-dark `#3a3925` · Orange-dim `#c44d03`
- **Type:** Archivo Black (display) · IBM Plex Mono (body)
- **Texture:** Full-bleed grain overlay, scanlines, Xerox misregistration
  on "DAD", ACES filmic tonemap, additive blending

## Deploy

Parked on Hostinger (2.57.91.91). Static — drop the directory on any web
host, it runs. No backend, no build. The video files (~600MB combined
across all the v4–v11 renders) probably should NOT be deployed with the
site; only the current master should ship.

**Pre-deploy cleanup TODO:**
- Decide which `.mp4` is the master (v11 at time of writing).
- Delete the older `index.html.bak-20260601-*` files from the root.
- Decide on `The_Infected_*.mp4` retention — keep masters, delete working
  drafts once v_final is signed off.
- Wire the `contact.html` form (Punk Surveyor sub-site) to a backend or
  remove the dead link.

## Maintenance

- `AUDIO_WORKFLOW.md` is the canonical audio doc. The `memory-wiki/`
  GOAL prompt is a goal/handoff file, not the workflow doc — keep them
  separate and reconcile drift in the GOAL file's CORRECTIONS block.
- `GOAL.md` is the canonical production-state doc. Update it whenever
  the master render or the master audio mix changes.
- The video files in this directory are working masters. Once
  The_Infected ships, consolidate to one final file.

## Related

- Top-level project map — `/Volumes/Second-Brain-1/AI/dadpunk/README.md`
- Brand identity — `/Volumes/Second-Brain-1/AI/dadpunk/BRAND.md`
- Punk Surveyor sub-site — `punksurveyor/README.md`
- SynthRiders editor — `../synthriders-web-editor/README.md`
- Splat training (feeds the Punk Surveyor proof) — `../splat-training/README.md`
