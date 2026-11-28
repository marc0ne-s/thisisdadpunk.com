---
title: The print is in the shader, not the prompt
slug: the-print-is-in-the-shader
status: draft
date: 2026-11-28
summary: A now-playing rig that reprints album art, 41 print processes, and the measurements that killed most of my good ideas.
disclosure: Every generated image in this project is made locally on this machine. No third-party artwork is reproduced here.
tags: [touchdesigner, streamdiffusion, print, shaders, apple silicon]
---

# The print is in the shader, not the prompt

*A side project. Apple Music artwork → a local diffusion lane → a print pass in TouchDesigner, and two days of measurements that mostly told me my instincts were wrong.*

---

> **Try it:** the print pass runs in your browser now — no TouchDesigner, no model.
> Drop any image into <https://thisisdadpunk.com/lab/print/> and push the ink punch.

## What it is

Whatever is playing in Apple Music gets its sleeve pulled, pushed through a local StreamDiffusion lane running on this M4 Pro, and printed — halftone, misregistration, flat ink — on a 1024 frame. Thirty-odd print processes rotate underneath it. It reacts to the audio, and when the music stops, nothing moves at all. That last part is a hard rule I set early and had to rebuild the patch twice to actually honour.

Two things worth saying up front. It all runs locally; no cloud generation, no API. And it's a side project, not a product — I'm writing it up because the measurements are the interesting part and almost none of them were what I expected. It was built with DadPunk, the agent that runs on this machine: I set the brief and made the calls, it did most of the typing and a lot of the arguing. The numbers below are real either way.

## The brief I was actually working to

Three demands, and they pull against each other:

1. Push the finishes hard — the picture shouldn't look like a photo with a filter on it.
2. Never lose touch with the original sleeve. It has to still read as that record.
3. Silence means a still frame. Not a slow frame. A still one.

Points 1 and 2 fight each other. Point 3 turned out to be an architecture problem, not a settings problem.

## The two dials, and one of them was a lie

The lane is StreamDiffusion. The dominant knob is `t_index` — the denoise schedule. Early steps ignore the input; late steps preserve it. Measured on one fixed cover:

| schedule | what you get |
|---|---|
| 46,48 | near-copy of the artwork |
| 40,45 | same layout, sharper surface |
| **36,42** | **boldest redraw that still reads as the cover** |
| 30,36 | motif reshaped, no longer the artwork |

The other knob in the code, `SD_DELTA`, does nothing in this build. I swept it at 0.0 / 0.35 / 0.5 at a fixed schedule and the outputs were **byte-identical** — same MD5. The argument never reaches the sampler. I tuned a parameter that was disconnected.

That's the first lesson and it repeats all the way down: test whether the knob is connected before you calibrate it.

## The model can't do print, and no setting fixes that

I kept pushing the schedule harder trying to get a screenprint out of it, and getting noisy digital soup instead.

The lever wasn't the dial. It was underneath it.

| base model | schedule | local contrast | what it looks like |
|---|---|---|---|
| sd-turbo | 30,36 | 2.78 | clean digital fill, no screen, layout scrambled |
| **SD1.5 + LCM-LoRA** | **30,36** | **3.63** | **coarse halftone bite, ink edges, layout held** |
| SD1.5 + LCM-LoRA | 24,30 | 2.68 | texture past usefulness, typography gone |
| SDXS-512 | any | — | flat brown colour field in this build |

`local-contrast` here is the mean absolute greyscale gradient — a cheap proxy for "is there visible surface". It isn't a quality score; the frame still has to read. But as a comparison between two models on the same sleeve and prompt, it's honest.

sd-turbo is built for speed and it flattens everything into smooth digital fill. It has no concept of a dot screen. SD1.5 with an LCM LoRA at two steps doesn't just score higher — it produces halftone, ink edges and misregistration that wasn't in the prompt. Cost: about 860 ms per frame instead of 520–700 ms. Only the reply rate drops; the render stays at 29–37 fps.

## The print lives after the model

The single most useful thing I learned: **the model can only make soft pixels.** Silkscreen scored 5/10 from the model alone and 7/10 once the shader did the print work. You cannot prompt your way to a halftone screen.

So the print pass is a GLSL top: RGB plates offset by a hair, a rotated halftone screen in the midtones, flat quantised ink instead of gradients. Every strength in it scales off one parameter — `Sdamount`, 0 to 1 — instead of five constants I'd tuned by hand. Live at 0.75.

Two rules, both found the hard way:

**Coarsen the screen as the punch rises. Don't tighten it.** My first version went from a 3.4 px cell to 2.5 px, which is backwards. A finer screen at 512 disappears into grain at normal viewing distance. A print reads as a print because you can see the dots. It now goes 3.2 → 4.6 px, with a second coarser screen in the shadows.

**Don't drive the colour fringing off the same knob.** The first pass scaled misregistration and saturation with punch too, and by 0.85 the chromatic mess had swamped the dot lattice — the frame read as digital glitch, not ink. Punch now barely touches registration and saturation.

Calibration, on a frozen reply:

| punch | local contrast | reading |
|---|---|---|
| 0.00 | 0.0174 | dots barely there, smooth gradients |
| 0.62 | 0.0267 | screen visible, still soft |
| **0.75** | **0.0307** | **strong, coherent screen; sleeve legible** |
| 0.85 | 0.0321 | strongest at 1:1, starts competing with the artwork |
| 1.00 | 0.0340 | over-baked, dots dominate the forms |

### Freeze the input before you A/B a shader

The lane replies about once a second. Measure a ladder live and you're measuring five different frames. One of my runs reported punch 1.00 as *darker* than 0.00 purely because the track changed mid-loop.

Point the input at a copied reply, run the ladder, restore. Same-frame deltas are the only deltas worth reading. Obvious in hindsight; wrong on my first attempt.

## 41 finishes, one press

The pool grew from 13 finishes to 41 print processes — cyanotype, photogravure, letterpress, mimeograph, dot matrix, microfilm — plus 41 ink behaviours describing what the ink is doing (squeegee drag, roller chatter, ink starving at the edges). Each album gets a playlist of 14 drawn from its genre family plus wildcards, so a punk record is usually print but not always.

Then I put four of them side by side and had to admit the obvious: **they looked like the same treatment with different labels.**

Because they were. The shader applied one ink weight to all of them. A photogravure is a continuous-tone intaglio with no dot screen at all. A xerox is nothing but screen and crush. Rendering both at punch 0.75 is what made 41 prompts look like one.

So each finish now carries its own ink weight, and the shader runs at `Punchbase × weight`. Same sleeve, measured local contrast:

- cyanotype **4.76**
- photogravure **5.27**
- letterpress **6.27**
- xerox **7.49**

A 1.6× spread, where before they sat within a few percent of each other.

The general version of the lesson: adding names to a pool doesn't add range. The range lives in whatever the renderer does with them — and if that's constant, the names are decoration.

## Motion is not change, and drift is not motion

I kept being told the picture looked frozen, and kept answering with more frequent style switches. Wrong lever. Between switches the frame is a still image, and a still image is what reads as frozen.

When I measured the actual motion with the prompt frozen — the only way to isolate it — source drift alone moved **0.4/255 over four seconds**. Effectively zero.

The reason is a bit lovely: at this schedule the model *reconstructs* the composition. Zoom or rotate the input and it doesn't return a zoomed or rotated output, it returns the same cover redrawn in place. Drift changes what the model is looking at, which is useful, but it cannot carry visible movement.

So the motion stage sits after the model's reply — a noise-displaced layer the lane can't undo. At weight 0.022 and a noise speed of 0.22/s: **13.2/255 mean change, p95 36**. The panic setting I tried while hunting read 90/255, which looked like a bad VHS transfer.

## Silence means a still frame

Every motion driver in the patch was free-running on wall time. Stop the music, and the print kept breathing. That's the thing I refused to ship.

The fix was one gated clock: audio level → max of all channels → smoothed → range-clamped → integrating speed. Zero input means the clock doesn't advance, so every driver in the patch freezes together. Measured: **0.000/255 over twelve seconds of silence**, against 5.28/255 with audio.

Three things bit me while building it. The range-mapping node extrapolates *below* its floor, so silence fed the clock **-0.02** and it ran backwards. Clamping after the map didn't fix it; a limit node with min 0 did. Reconnecting an input left the old wire in place, so the clock kept integrating the leaking gate until I disconnected first. And the speed node renames its output channel after its input, so binding by name broke the moment the source changed — bind by index.

The rig also obeys the same gate: no style swap can repaint a frozen frame, and no backlog fires the instant audio returns.

## Things that were lying to me

A short list, because each one cost real time:

- **The energy channel sat at 1.0 for entire tracks.** Three bands summed and multiplied by 3, clamped at 1 — with real music they're already past the clamp. Anything driven by it was a constant. The kick channel had the same problem, retriggering every 0.166 s, which reads as 360 bpm.
- **`aligny='bottom'` does not move a text block.** The text stays at the top of the frame regardless. Placement is pixel offsets.
- **`overTOP` and `compositeTOP` threw away most of the text alpha** — a white glyph composited at 0.68 instead of 1.0, so the caption was invisible while its background veil still dimmed the picture. An add node can't fail that way.
- **Apple Music sends year `0`.** The era leg of every playlist was dead in practice.
- **A missing window kills the whole chain.** With the perform window closed nothing requests the output, so nothing cooks — including the bridge. It looks exactly like a crashed diffusion lane and isn't one.

## Honest limits

- The lane runs at ~1.2 fps. The motion hides it; nothing else does.
- These read as clearly different *treatments*. They are not chemically authentic prints. One SD1.5 pass plus one shader cannot produce a real Prussian-blue cyanotype, and I'm not going to pretend it does.
- Putting the artist name in the prompt produces no lettering — at this schedule the model has no budget to render type. It earns its place elsewhere: the track title seeds which ink behaviour starts, so two tracks on one record look like siblings rather than twins.
- Dark sleeves collapse the print pass. A cover averaging 18.5/255 came out at 7.3/255 — every stage reported healthy while the picture was gone. The fix is upstream: measure the mix, lift the gamma toward a 0.20 mean, never darken.
- If authenticity matters more than variety, the honest move is a shortlist — xerox, letterpress, stencil, overprint — rather than more names.

## Why this isn't a stream

I looked at putting it on a stream and the answer is boring: the rig works on other people's artwork and other people's recordings, and neither of those rights is mine to publish. Transformative-looking output doesn't change that.

So the version worth building runs on my own catalogue — sleeves I generate, tracks I made — where there's nothing to clear. Same rig, same measurements, no takedowns. That's the next step, and the measurements above don't change.

---

*Build notes, every failed idea included, live in `KNOBS.md` in the project. Numbers above are from that file, measured on this machine, with the source frozen where the comparison required it.*
