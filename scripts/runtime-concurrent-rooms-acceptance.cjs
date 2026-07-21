const { spawn } = require('node:child_process');
const path = require('node:path');

const worker = path.join(__dirname, 'runtime-adaptive-acceptance.cjs');

function runRoom(label) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [worker], {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, PARTICIPANTS: '3', PROBE_RUN_ID: label },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`${label} exited ${code}: ${stderr || stdout}`));
        return;
      }
      const resultLine = stdout.trim().split(/\r?\n/).findLast((line) => line.startsWith('{'));
      if (!resultLine) {
        reject(new Error(`${label} returned no JSON result: ${stdout}`));
        return;
      }
      resolve({ label, ...JSON.parse(resultLine) });
    });
  });
}

(async () => {
  const startedAt = Date.now();
  const rooms = await Promise.all([runRoom('room-a'), runRoom('room-b')]);
  const passed = rooms.every((room) =>
    room.participants === 3
    && room.desktopBefore.liveVideoTracks >= 3
    && room.desktopBefore.inboundVideo >= 2
    && room.desktopBefore.outboundVideo >= 1
  );
  console.log(JSON.stringify({ concurrentRooms: rooms.length, elapsedMs: Date.now() - startedAt, passed, rooms }));
  if (!passed) process.exitCode = 1;
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
