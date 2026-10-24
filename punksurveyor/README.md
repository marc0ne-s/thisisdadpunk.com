# Punk Surveyor

A photoreal 3D walkthrough service for the spaces that don't get Matterport.
Captured with iPhone Pro + LiDAR + Osmo Pocket 3, processed on a Mac mini M4 Pro,
delivered as WebXR-ready tours and a `flatbread.glb` mesh.

This directory is the public-facing marketing site for that service — not the
service pipeline itself.

## What lives here

```
punksurveyor/
├── index.html        # Hero + cinematic flythrough
├── process.html      # How a job runs (capture → process → deliver)
├── proof.html        # Live walkthrough demo + screenshots
├── packages.html     # Three engagement models (direct / white-label / punk)
├── about.html        # Who + gear + why
├── agents.html       # Real-estate agents pitch
├── contact.html      # Book a shoot
├── walk-realestate.html  # Long-form real-estate walkthrough page
└── assets/
    ├── css/punksurveyor.css
    ├── img/          (empty — was a planned assets dir, currently unused)
    ├── js/           (empty — Three.js is loaded via importmap in index.html)
    └── meshes/flatbread.glb   (the Flatbread scan, served to proof.html)
```

All 7 HTML pages share the same nav, the same orange/olive/black palette from
`/Volumes/Second-Brain-1/AI/dadpunk/BRAND.md`, and the same zine grain overlay.
Three.js r0.160 is loaded from unpkg via an importmap — no build step.

## Pricing

There is no public pricing. `packages.html` deliberately omits dollar figures
because every space is different and Marcus quotes per job within 24h. The
service is positioned at A$150–2,500 per deliverable depending on scan size,
deliverable type (live tour / iframe embed / raw .splat), and whether it's
direct, white-label, or art-direction.

The sub-contract section in `packages.html` is honest about the Matterport
Capture Services Program (A$80–150/scan technician fee) and why Punk Surveyor
is the alternative path.

## The actual service pipeline (NOT in this folder)

Capture and processing live elsewhere. The pipeline uses:

- **Capture rig:** iPhone 14 Pro LiDAR + Osmo Pocket 3 + Belkin stand. Rig
  control scripts in `/Volumes/Second-Brain-1/AI/dadpunk/tools/`.
- **Photogrammetry:** COLMAP + nerfstudio. The training pipeline is in
  `/Volumes/Second-Brain-1/AI/dadpunk/splat-training/` (Colab T4 GPU, ~15-30 min
  per scene, free).
- **Capture handbook:** see the project context links in
  `/Volumes/Second-Brain-1/AI/dadpunk/README.md` (top-level project map).

## Design system

- **Palette:** Black `#0a0a0a`, off-white `#e8e4de`, safety orange `#e85d04`,
  olive `#5c5b3a`. Olive-dark `#3a3925`, orange-dim `#c44d03` for accents.
- **Type:** Archivo Black (display) + IBM Plex Mono (body). Both Google Fonts.
- **Texture:** Full-bleed grain overlay, scanlines on the proof walkthrough,
  Xerox misregistration on the "PUNK" wordmark. Matches the
  thisisdadpunk.com aesthetic from `/Volumes/Second-Brain-1/AI/dadpunk/BRAND.md`.

## Deploy

The site is intended to live at `thisisdadpunk.com/punksurveyor/` (or its own
subdomain — TBD with Marcus). The whole thing is static — drop the folder on
any web host and it runs. No backend, no build, no `node_modules`.

## Status

- **All 7 pages built and styled.** Last touched 2026-06-02.
- **No real-world shoots yet.** Site is ready for the first client; pipeline
  was dogfooded on the Flatbread scan (served as `proof.html` background mesh).
- **TODO before public launch:** Replace the Flatbread `.glb` with a real
  paying-client walkthrough (or get explicit permission to keep the
  Flatbread self-shoot on the proof page). Confirm the `contact.html` form
  posts somewhere — currently it has no backend wired up.

## Related

- `BRAND.md` — `/Volumes/Second-Brain-1/AI/dadpunk/BRAND.md` (palette + type)
- Splat training — `/Volumes/Second-Brain-1/AI/dadpunk/splat-training/README.md`
- Flatbread self-shoot — `/Volumes/Second-Brain-1/AI/dadpunk/captures/2026-04-28-flat/`
- Top-level project map — `/Volumes/Second-Brain-1/AI/dadpunk/README.md`
