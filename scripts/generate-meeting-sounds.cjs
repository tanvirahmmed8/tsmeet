/* Original TSMeet notification compositions. No samples or third-party audio.
 * Generate: node scripts/generate-meeting-sounds.cjs
 * Verify:   node scripts/generate-meeting-sounds.cjs --check
 */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const RATE = 44100;
// MIDI note, onset seconds, relative touch. A shared C-major palette gives the
// family a consistent identity; descending motifs signal departure/stopping.
const designs = {
  'participant-joined': [[72, 0, .8], [76, .12, 1], [79, .23, .35]],
  'participant-left': [[76, 0, .7], [72, .15, .85]],
  'join-request': [[76, 0, .85], [79, .17, 1], [76, .36, .55]],
  'chat-message': [[84, 0, .8], [88, .07, .5]],
  'hand-raised': [[74, 0, .75], [79, .14, 1]],
  'recording-started': [[60, 0, .65], [64, .15, .8], [67, .30, 1], [72, .32, .22]],
  'recording-stopped': [[67, 0, .7], [64, .16, .85], [60, .32, 1]],
  'recording-paused': [[67, 0, .7], [67, .24, .55]],
  'recording-resumed': [[64, 0, .75], [67, .14, .9], [72, .28, .65]],
  'connection-lost': [[62, 0, .7], [57, .21, .8]],
  'connection-restored': [[60, 0, .7], [64, .12, .8], [67, .24, .9]],
  'meeting-ended': [[67, 0, .7], [64, .18, .8], [60, .36, 1]],
};

function render(notes) {
  const duration = Math.max(...notes.map((note) => note[1])) + .64;
  const frames = Math.ceil(duration * RATE);
  const channels = [new Float64Array(frames), new Float64Array(frames)];
  notes.forEach(([midi, onset, touch], noteIndex) => {
    const frequency = 440 * 2 ** ((midi - 69) / 12);
    const start = Math.round(onset * RATE);
    const pan = (noteIndex % 2 ? .14 : -.14);
    for (let i = start; i < frames; i++) {
      const t = (i - start) / RATE;
      const attack = 1 - Math.exp(-t / .008);
      // Soft fundamental plus fast-decaying bell overtones: no harsh attack.
      const key = Math.sin(2 * Math.PI * frequency * t) * Math.exp(-t / .14)
        + .24 * Math.sin(2 * Math.PI * frequency * 2 * t) * Math.exp(-t / .075)
        + .09 * Math.sin(2 * Math.PI * frequency * 3.002 * t) * Math.exp(-t / .045);
      const release = Math.min(1, (duration - i / RATE) / .06);
      const sample = key * attack * touch * release;
      channels[0][i] += sample * Math.sqrt((1 - pan) / 2);
      channels[1][i] += sample * Math.sqrt((1 + pan) / 2);
      // Quiet, finite room reflections with slight stereo asymmetry.
      for (const [delay, level, side] of [[.047, .12, 0], [.061, .11, 1], [.103, .045, 1], [.127, .04, 0]]) {
        const reflected = i + Math.round(delay * RATE);
        if (reflected < frames) channels[side][reflected] += sample * level;
      }
    }
  });
  // Consistent perceived family level, with headroom and a final click-free fade.
  let peak = 0;
  for (const channel of channels) for (const sample of channel) peak = Math.max(peak, Math.abs(sample));
  const normalization = .64 / Math.max(peak, .001);
  const pcm = Buffer.alloc(frames * 4);
  for (let i = 0; i < frames; i++) {
    const fade = Math.min(1, i / (RATE * .004), (frames - 1 - i) / (RATE * .05));
    for (let side = 0; side < 2; side++) {
      const value = channels[side][i] * normalization * fade;
      assert.ok(Number.isFinite(value) && Math.abs(value) <= .65, 'Invalid or clipping audio');
      pcm.writeInt16LE(Math.round(value * 32767), i * 4 + side * 2);
    }
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(pcm.length + 36, 4); header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(2, 22);
  header.writeUInt32LE(RATE, 24); header.writeUInt32LE(RATE * 4, 28);
  header.writeUInt16LE(4, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

const directory = path.resolve(__dirname, '../public/sounds');
const check = process.argv.includes('--check');
if (!check) fs.mkdirSync(directory, { recursive: true });
let bytes = 0;
for (const [name, notes] of Object.entries(designs)) {
  const wav = render(notes);
  const target = path.join(directory, `${name}.wav`);
  if (check) assert.deepEqual(fs.readFileSync(target), wav, `${name}.wav does not match its composition`);
  else fs.writeFileSync(target, wav);
  bytes += wav.length;
  console.log(`${check ? 'Verified' : 'Created'} ${name}.wav (${(wav.length / 1024).toFixed(0)} KiB)`);
}
console.log(`12 original stereo WAV files; ${(bytes / 1024 / 1024).toFixed(2)} MiB total.`);
