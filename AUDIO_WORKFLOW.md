# AUDIO_WORKFLOW.md
## Audio Pipeline for "The Infected"

Built on PunkPlanet (M4 Pro 64GB, Budgewoi NSW) using only local, free tools.

### Tool Versions
- ffmpeg 8.1 (Homebrew, Apple clang 21.0.0)
- OmniVoice TTS server (k2-fsa/OmniVoice, MPS)
- Python 3.14 + requests (beat generation script)

### TTS Pipeline
- **Engine:** OmniVoice on localhost:5050
- **Patch:** `server.py` modified to pass `instruct` and `speed` to `model.generate()`
- **Voice mapping:**
  - Beats 1–10, 12–14, 21: `teenager, female, whisper` at `speed: 0.8`
  - Beat 11: `teenager, female` (no whisper) at `speed: 0.8`
  - Beats 15–16: `teenager, female, whisper, low pitch` at `speed: 0.8`
  - Beats 17–20: `teenager, female, very low pitch` at `speed: 0.8`
- **Kokoro TTS:** Installed (`kokoro-onnx` 0.4.7 + ONNX Runtime) but not benchmarked. OmniVoice locked as canonical.

### Per-Beat FX Recipes

| Act | Beats | Recipe | Description |
|---|---|---|---|
| Domestic | 1–10 | `lowpass=f=1200` + compressor `-18dB:3` | Behind the door — muffled, trapped |
| Panic | 11 | slap delay 50ms + fast comp `-15dB:4` | Hissed urgency |
| Dread | 12–16 | `asetrate=0.85` + `lowpass=f=900` | Under the bed — pitch down 15% |
| Horror | 17–20 | `asetrate=0.75` + `lowpass=f=700` | Under the bed deeper — pitch down 25% |
| Closing | 21 | `lowpass=f=1500` + fade 2s | Low-pass sweep + long fade to silence |

All beats: `loudnorm`, `afade` tail, resample to 48kHz mono.

### Project Structure

```
audio/
├── raw/                    — raw TTS outputs (21 beats)
├── processed/              — per-beat FX chains (21 files)
├── beds/                   — ambient layers (sub-rumble, room-tone)
├── mix/                    — narration_stem.wav, the_infected_mix.wav
├── scripts/                — process_all_beats.sh, final_mixdown.sh
│   └── mixdown_build.py      # Python stage-sequencer
├── mix_manifest.json       — machine-readable mapping
└── SCRIPT.md               — full 21-beat text
```

### Ambient Beds
- **sub_rumble.wav:** Brown noise, low-pass 80Hz, 30s loop, -28dB in mix
- **room_tone.wav:** Pink noise, band-pass 80Hz–3kHz, 60s loop, -35dB in mix
- Both looped to 257s and faded in/out at edges.

### How to Regenerate Everything

```bash
cd /Volumes/Second-Brain-1/AI/dadpunk/thisisdadpunk.com/audio

# 1. Regenerate raw TTS (optional, requires OmniVoice server on :5050)
python3 scripts/generate_raw_beats.py

# 2. Batch-process all 21 beats with FX
bash scripts/process_all_beats.sh

# 3. Build narrated + bed mixdown
bash scripts/final_mixdown.sh

# 4. Bake into video
bash scripts/final_mixdown.sh   # step 4 is included
```

### Mixdown Details
- Narration stem assembled in Python (mono s16 48kHz, clip-guarded additive mix).
- Sub-rumble and room-tone mixed at -28dB and -35dB respectively.
- Final limiter at -2dB TP.
- Output: `the_infected_mix.wav` (48kHz stereo s16, 47MB).
- Video: `The_Infected_FINAL.mp4` (1080x1920, 30fps, AAC 192k 48Hz stereo).

### Files
- Final video: `/Volumes/Second-Brain-1/AI/dadpunk/thisisdadpunk.com/The_Infected_FINAL.mp4`
- Audio mix: `/Volumes/Second-Brain-1/AI/dadpunk/thisisdadpunk.com/audio/mix/the_infected_mix.wav`
