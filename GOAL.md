# GOAL — The Infected

> Cinematic audio + vertical short film. Built on PunkPlanet (M4 Pro 64GB,
> Budgewoi NSW) using only local, free tools. 267s, 1080x1920, 30fps.

This file is the **canonical production state** for The Infected. It replaces
the older `memory-wiki/GOAL_The_Infected_Audio_Polish.md` (which is now a
historical goal-prompt, with a CORRECTIONS block reconciling the drift).

## TL;DR

- **Story:** A mother (Kaelith) barricaded in a cupboard with her children
  while creatures hunt outside. Slow-burn, domestic-turned-primal horror.
  21 narrative beats, ~267 seconds, vertical 1080x1920.
- **Status:** Audio locked at v8, video timing iterated through v11. **Not
  yet shipped** — there are still beat-overlap issues in the 17/18/19 window
  and a couple of unresolved card-vs-audio offsets in the dread/horror
  transition.
- **Design winner:** `The_Infected_FINAL_v6.mp4` (the additive text card
  design is canon). All later versions are timing tests against v6's video.
- **Next concrete action:** See "Blockers / open work" at the bottom.

## Canonical assets

| Slot | File | Notes |
|---|---|---|
| **Script** | `audio/SCRIPT.md` | 21 beats. Authoritative for story. **Character name is "Kaelith"** (was "Caleb" in older Whisper transcription, renamed 2026-06-03). |
| **Voice pipeline** | `AUDIO_WORKFLOW.md` | OmniVoice TTS, per-act voice tags, per-act FX recipes. |
| **Voice mapping** | `AUDIO_WORKFLOW.md` § "Voice mapping" | Beats 1-10 whisper · Beat 11 no-whisper · Beats 15-16 whisper+low-pitch · Beats 17-20 very-low-pitch · Beat 21 whisper. Speed 0.8 throughout. (The voice low-pitch band is 15-16, not 12-16; the FX Dread band in AUDIO_WORKFLOW.md is 12-16 — they're independent.) |
| **Definitive timing map** | `audio/MIX_v6.md` | The intent — audio start matches text-card start per beat. |
| **Vision-detected actual timings** | `audio/TIMING_AUDIT_v5.md` | Ground truth from frame analysis. Some beats drift 5-10s from `SCRIPT.md`. |
| **Manifest** | `audio/mix_manifest.json` | Machine-readable beat → FX → bed mapping. |
| **Last clean audio mix** | `audio/mix/the_infected_mix_v8.wav` | Stems and mixdowns v1-v8 in `audio/mix/`. |
| **Current master video** | `The_Infected_TIMING_TEST_v11.mp4` | 267s, vertical, additive text. **v9-v11 are sync-tests, not new audio stems.** |
| **Design-canon video** | `The_Infected_FINAL_v6.mp4` | The visual design Marcus signed off on. v9 mistake rebuilt this in Helvetica — v10 onwards reverted to v6's video. |
| **Handoffs** | `audio/mix/HANDOFF_v8.txt`, `HANDOFF_v9.txt`, `HANDOFF_v10.txt` | Per-version decision logs. |

## The version chain (decisions, not just files)

The project has 11 video variants and 8 audio mixes. The decisions behind
them matter more than the files:

| Version | What it was | Why | Outcome |
|---|---|---|---|
| v1-v4 audio (`audio/mix/the_infected_mix_v1.wav` ... `_v4.wav`) | Iterative mix tightening | Levels, beds, RMS normalisation | All superseded by v8 |
| `The_Infected_FINAL_v4.mp4` | First full bake of script→video | Earliest ship candidate | Superseded |
| `The_Infected_FINAL_v5.mp4` | Re-bake after timing-offset discovery | Fixes v4's 5-10s drift | Superseded |
| `The_Infected_FINAL_v6.mp4` | **Design winner** | Additive text card design, original 267s, 8s gaps between beats | **CANON** — keep, all later versions sync against this |
| `audio/mix/the_infected_mix_v6.wav` | Audio mix for v6 timing | Per-beat FX applied | Clean, but a few drift points remain |
| v7 (audio) | Per-act RMS lift, fade tails | Domestic -35, panic -28, dread -30, horror -26, closing -24 | Superseded by v8 |
| v8 (audio) | Last clean full mix, hand-tuned | `audio/mix/the_infected_mix_v8.wav` | **CURRENT AUDIO MASTER** |
| `The_Infected_FINAL_v5.mp4` → `_v6.mp4` (video) | Visual design refined to additive text | Marcus signed off on the zine/xerox-on-vertical look | This is the v6 video, still on disk |
| v9 video (`The_Infected_v9_SYNC.mp4`, `TIMING_TEST_v3`) | **MISTAKE** — rebuilt the entire video in Python (PIL + ffmpeg) | Tried to be clever about tighter pacing | Helvetica-on-black clinical text, dropped to 150s. Wrong. Reverted. |
| v10 video (`The_Infected_v10_SYNC.mp4`, `TIMING_TEST_v10`) | Lesson learned: keep v6 video, only fix audio sync | 20 card-start events detected in v6, 21 narration beats → beat 21 may group with beat 20 or sit on an undetected final card | Closer, but beat 21 still ambiguous |
| v11 video (`The_Infected_TIMING_TEST_v11.mp4`) | Current master candidate | Sync-test of v6 video against v8 audio | **CURRENT VIDEO** |

Handoff docs in `audio/mix/HANDOFF_v{8,9,10}.txt` document the per-version
decisions in detail. v8 is the audio bible. v9 is the cautionary tale.

## What's done (vs. what's not)

### Done
- [x] **Script:** 21 narrative beats, full story arc. `audio/SCRIPT.md`.
- [x] **Voice pipeline:** OmniVoice server patched, per-act voice tags
      locked. `AUDIO_WORKFLOW.md`.
- [x] **Raw TTS clips:** 21 beats generated, omni-voice profile per beat.
      `audio/raw/`.
- [x] **Per-beat FX:** All 21 processed clips rendered. `audio/processed/`.
- [x] **Ambient beds:** Sub-rumble + room-tone. `audio/beds/`.
- [x] **Mix v8:** Clean, gain-staged, limited, level-correct. `audio/mix/`.
- [x] **Video design v6:** Additive text card aesthetic, zine feel. **CANON.**
- [x] **v11 sync test:** v6 video + v8 audio, 267s, vertical.
- [x] **Documentation:** AUDIO_WORKFLOW, MIX_v6, TIMING_AUDIT_v5, handoffs.

### Open / blocking ship
- [ ] **Beat 21 placement** — frame analysis found 20 clear text-card
      transitions; beat 21 ("Because she knew what this meant") may be
      grouped with beat 20 or sit on an undetected final card. Visual
      verification needed.
- [ ] **Beat 17/18/19 overlap** — per `audio/MIX_v6.md`, beats 17 (187.7s),
      18 (195.1s), 19 (200.0s) are within 13s of each other and may overlap
      audibly. v8 mix has the spacing but the underlying script pacing
      might need a rewrite OR the audio needs a tighter dip in 17-18-19.
- [ ] **Beat 12 → 13/14 transition** — Beat 12 audio starts at 138.7s but
      beat 13 is at 140.8s and beat 14 at 145.5s. Card window may show
      beats 13/14 simultaneously (same card). Verify.
- [ ] **~~Script name vs video name~~** — **DONE 2026-06-03.** SCRIPT.md
      now uses "Kaelith", matching the video canon. Header note added
      in `SCRIPT.md` documenting the rename.
- [ ] **Master cut decision** — the chain of `The_Infected_FINAL_v4` through
      `_v6` and `The_Infected_TIMING_TEST_v2` through `_v11` is ~600MB of
      working files. Once v_final is signed off, prune everything except
      one final master + one audio mix + the design-canon v6 video for
      reference.
- [ ] **Deploy** — site is parked on Hostinger. Decide: ship The Infected
      on `thisisdadpunk.com/the-infected/` as an embed? Or keep it as
      behind-the-scenes project material?

## How to regenerate the whole pipeline (if you have to)

The full pipeline is reproducible from the `audio/scripts/` directory. Order:

1. `generate_raw_beats.py` — call OmniVoice for all 21 beats with per-act
   voice tags. Outputs to `audio/raw/`.
2. `process_all_beats.sh` — apply per-act FX chain (lowpass, asetrate
   pitch-down, compressor). Outputs to `audio/processed/`.
3. `audio/scripts/mixdown_v2.py` — RMS stage-sequencer, applies beds
   (`sub_rumble.wav` at -50dBFS, `room_tone.wav` at -52dBFS) under
   narration, normalises per-act (domestic -35, panic -28, dread -30,
   horror -26, closing -24), limits at -1.5dBFS true peak.
   Outputs to `audio/mix/the_infected_mix.wav` (and a versioned variant
   per mix iteration).
4. Mux narration stem with the v6 video (`The_Infected_FINAL_v6.mp4`)
   using ffmpeg, using the timing map in `audio/MIX_v6.md` as the
   per-beat offset source.

`audio/scripts/final_mixdown.sh` is the wrapper that does step 3 and 4.
`audio/scripts/regenerate.sh` does the whole pipeline from scratch.

## Blockers / open work (in priority order)

1. **Verify beat 21 placement in v6 video** (visual scan of the final
   30s of `The_Infected_FINAL_v6.mp4`). If there's a final text card,
   pin beat 21 to its start. If not, the audio needs to start during
   the same card as beat 20, with a longer tail.
2. **Solve the 17/18/19 overlap.** Three options: (a) rewrite the script
   to give 17/18/19 more breathing room, (b) tighten the v8 mix with
   a sidechain dip so beat 18 ducks under beat 17's tail, (c) accept
   the overlap if the source video has the same cards overlapping.
3. ~~**Update SCRIPT.md to "Kaelith".**~~ **DONE 2026-06-03.** SCRIPT.md
   and `audio/scripts/generate_raw_beats.py` now use "Kaelith". Header
   notes added to both files documenting the rename. No re-render
   needed — the existing `beat_02.wav` ... `beat_21.wav` already say
   "Kaelith" (per HANDOFF_v8.txt); only the script text was stale.
4. **Marcus watches and signs off the final cut.** v11 is the
   candidate (`The_Infected_TIMING_TEST_v11.mp4`, 267s, vertical).
   Watch end-to-end with the lights off. If it lands, the next step
   is the master-cut rename + chain prune (item 5). If it doesn't
   land, the next step is back to the overlap / beat 21 / FX tuning
   (items 1-2).
5. **Master-cut rename + chain prune.** Once Marcus signs off v11,
   rename to `The_Infected_FINAL.mp4` and prune the v4–v11 chain to
   the design-canon v6 video + the final master + one archived
   audio mix.
6. **Decide deploy.** The Infected is the strongest piece of DadPunk
   content we have. Where does it live publicly?

## Success criteria (when is this done?)

- [x] SCRIPT.md and video agree on character name ("Kaelith"). 2026-06-03.
- [ ] One audio master + one video master, signed off by Marcus.
- [ ] Drift points in beats 17-19 resolved (script edit OR mix edit, not both).
- [ ] Beat 21 placement verified and locked.
- [ ] The chain of v4-v11 working files pruned to one final + one
      design-canon.
- [ ] Marcus watches the final cut and says "that's the tension I wanted."

## Related

- Top-level project map — `/Volumes/Second-Brain-1/AI/dadpunk/README.md`
- Site README — `thisisdadpunk.com/README.md`
- Audio pipeline (canonical) — `thisisdadpunk.com/AUDIO_WORKFLOW.md`
- Older goal prompt (with CORRECTIONS block) —
  `thisisdadpunk.com/memory-wiki/GOAL_The_Infected_Audio_Polish.md`
- Brand identity — `/Volumes/Second-Brain-1/AI/dadpunk/BRAND.md`
