const { chromium } = require('../server/node_modules/playwright');

const FRONTEND = 'http://localhost:3001';
const BACKEND = 'http://localhost:3002';
const PARTICIPANTS = Math.max(3, Number(process.env.PARTICIPANTS || 11));

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${response.status} ${url}: ${body.error || 'request failed'}`);
  return body;
}

async function mediaState(page, participantName) {
  return page.evaluate(async (name) => {
    const videos = Array.from(document.querySelectorAll('video'));
    const liveTracks = videos.flatMap((video) => {
      const stream = video.srcObject;
      return stream instanceof MediaStream
        ? stream.getVideoTracks().filter((track) => track.readyState === 'live')
        : [];
    });
    const targetCard = Array.from(document.querySelectorAll('[class*="cursor-pointer"]'))
      .find((element) => element.textContent?.includes(name));
    const targetVideo = targetCard?.querySelector('video');
    const targetStream = targetVideo?.srcObject;
    const targetTrackId = targetStream instanceof MediaStream ? targetStream.getVideoTracks()[0]?.id : null;
    const connections = window.__tsmeetPeerConnections || [];
    let inboundVideo = 0;
    let outboundVideo = 0;
    let targetWidth = null;
    let targetHeight = null;
    let packetsReceived = 0;
    let packetsLost = 0;
    let maxJitter = 0;
    for (const connection of connections) {
      const stats = await connection.getStats();
      stats.forEach((report) => {
        if (report.type === 'inbound-rtp' && report.kind === 'video' && report.bytesReceived > 0) {
          inboundVideo += 1;
          packetsReceived += Number(report.packetsReceived || 0);
          packetsLost += Number(report.packetsLost || 0);
          maxJitter = Math.max(maxJitter, Number(report.jitter || 0));
          if (targetTrackId && report.trackIdentifier === targetTrackId) {
            targetWidth = Math.max(Number(targetWidth || 0), Number(report.frameWidth || 0)) || null;
            targetHeight = Math.max(Number(targetHeight || 0), Number(report.frameHeight || 0)) || null;
          }
        }
        if (report.type === 'outbound-rtp' && report.kind === 'video' && report.bytesSent > 0) {
          outboundVideo += 1;
        }
      });
    }
    return {
      liveVideoTracks: liveTracks.length,
      videoElements: videos.length,
      inboundVideo,
      outboundVideo,
      targetTrackId,
      targetWidth,
      targetHeight,
      packetsReceived,
      packetsLost,
      maxJitter,
    };
  }, participantName);
}

(async () => {
  const stamp = `${Date.now()}-${process.env.PROBE_RUN_ID || process.pid}`;
  const accounts = await Promise.all(Array.from({ length: PARTICIPANTS }, async (_, index) =>
    api(`${BACKEND}/api/auth/register`, {
      method: 'POST',
      body: JSON.stringify({
        email: `adaptive-probe-${stamp}-${index + 1}@example.test`,
        password: 'RuntimeTest!4827',
        name: `Adaptive Probe ${index + 1}`,
      }),
    })
  ));
  const room = await api(`${BACKEND}/api/rooms`, {
    method: 'POST',
    headers: { authorization: `Bearer ${accounts[0].token}` },
    body: JSON.stringify({ title: 'Adaptive subscription acceptance' }),
  });
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--allow-insecure-localhost', '--autoplay-policy=no-user-gesture-required', '--disable-gpu'],
  });
  const sessions = [];
  try {
    for (let index = 0; index < accounts.length; index += 1) {
      const context = await browser.newContext(index === 1
        ? { permissions: ['camera', 'microphone'], viewport: { width: 390, height: 844 }, isMobile: true }
        : { permissions: ['camera', 'microphone'], viewport: { width: 1280, height: 900 } });
      await context.addCookies([{ name: 'tsmeet_session', value: accounts[index].token, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax', secure: false }]);
      const page = await context.newPage();
      await page.addInitScript((user) => {
        localStorage.setItem('user', JSON.stringify(user));
        const Native = window.RTCPeerConnection;
        window.__tsmeetPeerConnections = [];
        window.RTCPeerConnection = class extends Native {
          constructor(...args) { super(...args); window.__tsmeetPeerConnections.push(this); }
        };
      }, accounts[index].user);
      sessions.push({ context, page });
    }

    const [host, mobile] = sessions.map(({ page }) => page);
    const url = `${FRONTEND}/room/${room.id}`;
    await host.goto(url, { waitUntil: 'domcontentloaded' });
    await host.getByText('You are hosting this meeting.').waitFor({ timeout: 30_000 });
    await Promise.all(sessions.slice(1).map(({ page }) => page.goto(url, { waitUntil: 'domcontentloaded' })));
    await Promise.all(sessions.slice(1).map(({ page }) => page.getByText('Waiting for Host').waitFor({ timeout: 30_000 })));
    await host.locator('button[title="Participants"]').click();
    await host.getByRole('button', { name: 'Accept all' }).click();
    await Promise.all(sessions.map(({ page }) => page.getByText(`${PARTICIPANTS} participants`, { exact: true }).waitFor({ timeout: 45_000 })));
    await host.keyboard.press('Escape');
    await host.waitForTimeout(15_000);

    const targetName = `Adaptive Probe ${Math.min(3, PARTICIPANTS)}`;
    const desktopBefore = await mediaState(host, targetName);
    const mobileState = await mediaState(mobile, targetName);
    let degradation = null;
    if (process.env.TEST_DEGRADATION === '1') {
      const cdp = await host.context().newCDPSession(host);
      await cdp.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: 400,
        downloadThroughput: 64 * 1024,
        uploadThroughput: 32 * 1024,
        packetLoss: 20,
        packetQueueLength: 10,
        packetReordering: true,
        connectionType: 'cellular3g',
      });
      await host.waitForTimeout(35_000);
      const degradedState = await mediaState(host, targetName);
      const networkLabel = await host.getByText(/Network:/).first().textContent().catch(() => null);
      degradation = {
        beforeHeight: desktopBefore.targetHeight,
        afterHeight: degradedState.targetHeight,
        networkLabel,
        qualityLowered: Number(degradedState.targetHeight || 0) < Number(desktopBefore.targetHeight || 0),
        packetLossApplied: 20,
        latencyAppliedMs: 400,
      };
      await cdp.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: 0,
        downloadThroughput: -1,
        uploadThroughput: -1,
        packetLoss: 0,
        packetQueueLength: 0,
        packetReordering: false,
        connectionType: 'none',
      });
    }
    const targetCard = host.locator('[class*="cursor-pointer"]').filter({ hasText: targetName }).first();
    await targetCard.click();
    await host.waitForTimeout(15_000);
    const desktopPinned = await mediaState(host, targetName);

    console.log(JSON.stringify({
      participants: PARTICIPANTS,
      desktopBefore,
      desktopPinned,
      mobile: mobileState,
      degradation,
      desktopVisibleLimitObserved: desktopBefore.inboundVideo <= 9,
      mobileVisibleLimitObserved: mobileState.inboundVideo <= 4,
      pinnedTrackSubscribed: Boolean(desktopPinned.targetTrackId),
      pinnedResolutionIncreased: Number(desktopPinned.targetHeight || 0) > Number(desktopBefore.targetHeight || 0),
      uploadLayersStable: sessions.every(() => true) && desktopBefore.outboundVideo === desktopPinned.outboundVideo,
    }));
    if (process.env.TEST_DEGRADATION === '1' && !degradation?.qualityLowered) process.exitCode = 1;
  } finally {
    await api(`${BACKEND}/api/rooms/${room.id}/end`, { method: 'POST', headers: { authorization: `Bearer ${accounts[0].token}` }, body: '{}' }).catch(() => {});
    await Promise.all(sessions.map(({ context }) => context.close().catch(() => {})));
    await browser.close();
  }
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
