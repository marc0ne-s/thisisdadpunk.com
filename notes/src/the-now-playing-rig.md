---
title: Build the now-playing rig
dek: Apple Music goes into a local diffusion lane and comes back as a halftone print that only moves when there is music. Everything here was measured on one M4 Pro, including the parts that went wrong.
when: 2026.11.28
tags: TOUCHDESIGNER · STREAMDIFFUSION · MAC
kicker: // NOTE 002 · BUILD GUIDE
image: /assets/img/rig-chain-v2.svg
image_fit: contain
image_alt: Signal path: Apple Music to now.json, a local StreamDiffusion lane on port 7866, the TouchDesigner print pass, the HUD, the screen.
tryit: No cloud, no API key, no subscription. When the music stops the frame holds at exactly 0.000/255 change — the hardest requirement to meet, and the last one to work.
---

A record goes on in Apple Music. The sleeve runs through a small local diffusion model, gets pushed around by the music, and comes back printed. Three lines in the corner say what is playing.

Two rules decide everything. **The picture is the model's reply** — no structure re-mixed back over it. And **nothing moves without sound**: not slowly, not a little. Silence gives a frozen frame, measured rather than hoped for.

This is the build order, with the traps left in, because the traps are the useful part.

## What you need

A Mac with an Apple Silicon GPU (this runs on MPS; there is no CUDA path), TouchDesigner 2025, a StreamDiffusion checkout with SD1.5 and LCM-LoRA, and BlackHole plus `ffmpeg` for the audio. The free TouchDesigner key is non-commercial — no paid work — which is one reason this stays a build log.

## 01 · Metadata out of Music.app

A poller asks Music.app what is playing once a second and writes two files: `now.json`, and the sleeve at 512 px.

Two details matter. **`year` is always `"0"`** — Apple Music does not supply it, so anything built around era never fires. And **write atomically**, temp file then rename: TouchDesigner reads the same file, and catching it mid-write blanks the caption for a frame.

## 02 · The lane

A small HTTP server around StreamDiffusion. `POST /img2img` with a PNG body and the prompt in the query string, and back comes a 512×512 PNG. About **860 ms a frame**. The real settings live in the launcher's environment:

```bash
SD_PORT=7866 SD_SIZE=512 SD_T_INDEX=18,24 SD_DELTA=0.0 \
PYTORCH_ENABLE_MPS_FALLBACK=1 USE_PEFT_BACKEND=TRUE \
exec .venv/bin/python -u sd_server.py
```

`SD_T_INDEX` is the only knob that does anything: how many steps the sampler runs, and where they land. Early steps ignore your image and invent; late steps keep it and restyle. On one fixed sleeve:

| t_index | reads as |
|---|---|
| 46,48 | near-copy of the artwork |
| 36,42 | boldest redraw that still reads as the cover |
| 30,36 | motif reshaped, cover no longer faithful |
| **18,24** | **figures become blobs, type a barcode, layout survives — live** |
| 12,20 | cover gone |

The rig runs 18,24, which looks wrong beside the rest of that table. The reason is the crossfade: the cover supplies the quiet end, so the model only has to carry the destroyed end.

Two hard lessons. **`SD_DELTA` is a no-op here** — swept at 0.0, 0.35 and 0.5, and the outputs came back byte-identical. Don't spend an evening on it. And **never `POST /reset` while the bridge is live**: it opens a second MPS encoder mid-pass, and the lane dies with a dead port and no error.

On the base model, briefly: `sd-turbo` gave clean digital fill with no dot screen; SD1.5 with LCM-LoRA gave halftone bite with the layout held. Use the second, and set `SD_LCM=1`.

## 03 · Grade, blur, then the print

The reply passes a level TOP and a small blur — `Plateblur`, 2 px — on its way to the shader.

The grade exists for one failure: **dark sleeves**. A halftone screen needs mid-tones to make dots in, and a genuinely dark cover collapses the chain while every stage reports healthy: source 18.5/255, model reply 32.5, final frame 7.3. So the bridge measures the frame every 0.75 s and lifts gamma toward a 0.20 mean, clamped 1.0–1.45 and never below 1.0. The same sleeve afterwards: mean 0.106, artwork legible.

Then the important part. **The print is in the shader, not the prompt.** The model can only make soft pixels. Scored as a silkscreen finish, it read 5 out of 10 on the model alone and 7 out of 10 once a shader did the print work.

The shader does three things: the colour plates offset by a hair, a rotated halftone screen in the midtones with a coarser one in the shadows, and flat quantised ink instead of gradients. All of it scales off one value, the punch. Zero is barely there. 0.75 is a strong, coherent screen. One is over-baked.

Two mistakes, and the fixes are the useful bit. **Coarsen the screen as punch rises, don't tighten it** — a finer screen at this size disappears into grain, and a print reads as a print because you can see the dots. And **don't drive the misregistration off the same knob as the screen**: by 0.85 the colour fringing had swallowed the dot pattern and it read as digital glitch.

Each finish also needs its own ink weight. A photogravure has no dot screen; a xerox is nothing but screen and crush. Applying one strength to all of them made 41 processes look like the same treatment with different labels. So `Sdamount = Punchbase × weight` — soft processes held back, hard ones pushed.

## 04 · Motion happens after the model

Diffusion reconstructs composition, so a zoomed or rotated input comes back as the same cover redrawn in place. Source drift on its own measured **0.4 out of 255**: frozen.

That is why the movement lives on the far side of the reply. A displacement pass at weight 0.022, with a moving noise field, gives 13 out of 255 — visible — and the model cannot undo it.

## 05 · One clock, gated by sound

Every motion driver ran on wall clock at first, so a silent room still had a breathing print. Now there is exactly one clock and it only advances when there is signal:

```text
ctl -> act_max -> act_lp (smooth .25)
    -> act_gate -> act_clamp -> clock
```

Every animated expression reads `op('clock')[0]`. Measured: **0.000/255 change across 12 seconds of silence**.

Three gotchas. The gate leaks negative values and runs the clock backwards unless you clamp at zero. `inputConnectors[0].connect()` onto an occupied input leaves the old wire, so disconnect first, then print `op.inputs` to prove it. And bind the speed channel by index, not by name — a speedCHOP renames its output after its input.

## 06 · The audio tap

The nastiest failure in the build, because the music is playing the whole time. The chain needs the OS input reachable, TouchDesigner's audio device to actually be that device, and the player feeding it. Miss one and it looks exactly like a dead-reactive print.

Mine: `now.json` said playing, the device was BlackHole, and two separate taps both read **−91 dB in the same minute**. That is not wiring — the multi-output group had stalled, because its master device was a USB interface that sleeps, and a stalled group outputs nothing to any member. Set the group's master to the virtual device and audio returned everywhere at once: 8.05/255 mean, 37.8% of pixels moving over eight seconds.

Two rules out of it. **Never leave the system output on BlackHole to make the visuals work** — it succeeds and costs you your audio. And **measure the device, not the patch**: four seconds of `ffmpeg -f avfoundation -i ":N" -t 3 -af volumedetect -f null -` settles it. When every tap reads −91 dB while the player says it is playing, toggle the group's master before you open TouchDesigner.

## 07 · The HUD

Three lines, bottom left: track, artist, album · year. Three traps.

**`aligny='bottom'` does not move the block.** A text TOP keeps the text at the top of the frame whatever the alignment says; position it with `positiony`, in pixels. **`overTOP` and `compositeTOP` ate most of the text alpha** — a white glyph came out at 0.68 instead of 1.0, so the caption was invisible while its veil still dimmed the picture. `addTOP` is plain arithmetic and cannot fail: black adds nothing. And **long lines run under the sleeve**, which sits at the right edge and leaves 813 px of width at 28 pt.

There is no PIL inside TouchDesigner, so the honest way to fit a line is to render it: draw the candidate into a hidden text TOP at the same font and size, read its ink extent from the alpha channel, and add an ellipsis until it fits. A cast list measuring 1044 px fits to 763.

## Things that cost me an evening

- **A closed perform window starves the whole chain.** Nothing requests the output, so the input freezes and the lane stops — identical to a crashed model. Comparing `op('sd_send').cookAbsFrame` with `absTime.frame` tells you in one line. The rig now runs a 2 Hz keepalive, and the window must be open when the project is saved.
- **The audio meters saturate.** Energy sits at 1.000 for a whole track and kick retriggers every 0.166 s — 360 bpm. Never drive anything from them; measure RMS off the buffer.
- **`project.save()` can block past 15 s** and writes a new numbered file rather than overwriting. Check the folder; never retry the call.
- **TouchDesigner's Python defaults to ASCII**, so `open(path).read()` on a file containing an em dash raises `UnicodeDecodeError`. Pass `encoding='utf-8'`, or `utf-8-sig` for a BOM.
- **`/tmp` is wiped on reboot**, which silently kills the bridge. One `rig-up.sh` brings back lane, poller and project.

## What's honestly weak

- **Dark covers still fight it.** The auto-level is a compensator, not a fix.
- **41 finishes that read as maybe six.** The shader helps; one model pass cannot make a real cyanotype. If authenticity mattered more than variety I would keep four.
- **Track names in the prompt do nothing visual.** A/B tested — no lettering, legible or garbled. They earn their place as seeds for ink behaviour, not as words.

The thing it gets right: the record is not decoration on a visualiser, it is the input. Change the song and the print turns over. Stop the music and everything stops with it.
