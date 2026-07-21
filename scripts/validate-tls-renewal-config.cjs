const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const timer = read('infrastructure/systemd/tsmeet-certbot-renew.timer');
const service = read('infrastructure/systemd/tsmeet-certbot-renew.service');
const hook = read('infrastructure/certbot/reload-livekit.sh');

assert.match(timer, /^OnCalendar=\*-\*-\* 00,12:00:00$/m);
assert.match(timer, /^RandomizedDelaySec=1h$/m);
assert.match(timer, /^Persistent=true$/m);
assert.match(service, /certbot renew --quiet --deploy-hook/);
assert.match(service, /reload-livekit\.sh/);
assert.match(hook, /docker compose/);
assert.match(hook, /kill -s HUP livekit/);

console.log('TLS renewal timer and LiveKit deploy hook configuration are valid');
