const path = require('node:path');
const dotenv = require('../server/node_modules/dotenv');
const { chromium } = require('../server/node_modules/playwright');

dotenv.config({ path: path.join(__dirname, '..', 'server', '.env') });

const required = ['TURN_SERVER', 'TURN_USERNAME', 'TURN_PASSWORD', 'STUN_SERVER'];
for (const name of required) {
  if (!process.env[name]) throw new Error(`${name} is required in server/.env`);
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  });
  try {
    const page = await browser.newPage();
    const result = await page.evaluate(async (configuration) => {
      const first = new RTCPeerConnection(configuration);
      const second = new RTCPeerConnection(configuration);
      const candidateSummary = { first: [], second: [] };
      let resolveOpen;
      let rejectOpen;
      const opened = new Promise((resolve, reject) => {
        resolveOpen = resolve;
        rejectOpen = reject;
      });
      const timeout = setTimeout(() => rejectOpen(new Error('TURN-only data channel timed out')), 30_000);
      first.onicecandidate = ({ candidate }) => {
        if (!candidate) return;
        candidateSummary.first.push({ type: candidate.type, protocol: candidate.protocol });
        void second.addIceCandidate(candidate);
      };
      second.onicecandidate = ({ candidate }) => {
        if (!candidate) return;
        candidateSummary.second.push({ type: candidate.type, protocol: candidate.protocol });
        void first.addIceCandidate(candidate);
      };
      second.ondatachannel = ({ channel }) => {
        channel.onmessage = ({ data }) => {
          if (data === 'turn-relay-probe') resolveOpen(true);
        };
      };
      const channel = first.createDataChannel('turn-acceptance');
      channel.onopen = () => channel.send('turn-relay-probe');
      try {
        await first.setLocalDescription(await first.createOffer());
        await second.setRemoteDescription(first.localDescription);
        await second.setLocalDescription(await second.createAnswer());
        await first.setRemoteDescription(second.localDescription);
        let dataChannelOpened = false;
        let failure = null;
        try {
          await opened;
          dataChannelOpened = true;
        } catch (error) {
          failure = error instanceof Error ? error.message : String(error);
        }
        const selected = [];
        for (const peer of [first, second]) {
          const stats = await peer.getStats();
          for (const report of stats.values()) {
            if (report.type !== 'candidate-pair' || !report.nominated || report.state !== 'succeeded') continue;
            const local = stats.get(report.localCandidateId);
            const remote = stats.get(report.remoteCandidateId);
            selected.push({
              localType: local?.candidateType || null,
              localProtocol: local?.protocol || null,
              remoteType: remote?.candidateType || null,
              remoteProtocol: remote?.protocol || null,
            });
          }
        }
        return {
          dataChannelOpened,
          relayOnly: selected.length > 0 && selected.every((pair) => pair.localType === 'relay'),
          failure,
          iceStates: [first.iceConnectionState, second.iceConnectionState],
          selected,
          candidates: candidateSummary,
        };
      } finally {
        clearTimeout(timeout);
        first.close();
        second.close();
      }
    }, {
      iceTransportPolicy: 'relay',
      iceServers: [
        { urls: process.env.STUN_SERVER },
        {
          urls: process.env.TURN_SERVER,
          username: process.env.TURN_USERNAME,
          credential: process.env.TURN_PASSWORD,
        },
      ],
    });
    console.log(JSON.stringify(result));
    if (!result.dataChannelOpened || !result.relayOnly) process.exitCode = 1;
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
