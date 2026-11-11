# TSMeet original sound family

Twelve original compositions rendered specifically for this project by
`scripts/generate-meeting-sounds.cjs`. No downloaded recordings, stock samples,
third-party sound packs or external audio APIs were used. These project assets
are included under the repository's [license](../../LICENSE.md).

Format: 44.1 kHz, stereo, 16-bit PCM WAV. Each cue is under 1.1 seconds, with
headroom and click-free fades; total size is approximately 1.78 MiB. The sound
family uses softly struck bell/key harmonics and finite stereo reflections.
WAV avoids extra codec dependencies and keeps the editable original lossless.

Audition at `/sounds/preview.html`, or in a meeting under
**More → Notification sounds → Preview a sound → Test sound**. Preview-page
players use system volume, not the in-meeting volume setting. No claim is made
that automated waveform checks replace listening on real speakers/headphones.

Regenerate deterministically from the repository root:

```bash
node scripts/generate-meeting-sounds.cjs
node scripts/generate-meeting-sounds.cjs --check
```

Edit the generator's MIDI/onset/touch recipes to change the compositions, then
regenerate and commit the WAV assets manually. When replacing existing files,
bump the audio revision query in `lib/meetingSounds.ts` so browser caches refresh.

`SOUND_ASSETS` in that module maps events to files. They are fetched from the
same origin and decoded after an audio-unlocking gesture; playback uses decoded
buffers with the existing volume, mute and cooldown controls. A failed or not-yet
loaded file falls back to the lightweight oscillator cue. This change does not
bypass Safari autoplay rules or alter meeting consent/authentication.
