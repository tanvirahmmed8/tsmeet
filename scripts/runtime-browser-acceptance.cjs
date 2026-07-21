const { chromium } = require('../server/node_modules/playwright');

const FRONTEND = 'http://localhost:3001';
const BACKEND = 'http://localhost:3002';

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${response.status} ${url}: ${body.error || 'request failed'}`);
  return { response, body };
}

async function createUser(index, stamp) {
  const { body } = await jsonRequest(`${BACKEND}/api/auth/register`, {
    method: 'POST',
    body: JSON.stringify({
      email: `browser-probe-${stamp}-${index}@example.test`,
      password: 'RuntimeTest!4827',
      name: `Browser Probe ${index}`,
    }),
  });
  return body;
}

async function createPage(browser, account) {
  const context = await browser.newContext({
    permissions: ['camera', 'microphone'],
  });
  await context.addCookies([{
    name: 'tsmeet_session',
    value: account.token,
    domain: 'localhost',
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
    secure: false,
  }]);
  const page = await context.newPage();
  if (process.env.DEBUG_BROWSER === '1') {
    page.on('console', (message) => console.error(`[browser:${account.user.id}] ${message.type()}: ${message.text()}`));
    page.on('pageerror', (error) => console.error(`[browser:${account.user.id}] pageerror: ${error.message}`));
  }
  await page.addInitScript(({ user, forceRelay }) => {
    localStorage.setItem('user', JSON.stringify(user));
    const NativePeerConnection = window.RTCPeerConnection;
    window.__tsmeetPeerConnections = [];
    window.RTCPeerConnection = class TrackedPeerConnection extends NativePeerConnection {
      constructor(...args) {
        if (forceRelay) {
          args[0] = { ...(args[0] || {}), iceTransportPolicy: 'relay' };
        }
        super(...args);
        window.__tsmeetPeerConnections.push(this);
      }
      setConfiguration(configuration) {
        return super.setConfiguration(forceRelay
          ? { ...configuration, iceTransportPolicy: 'relay' }
          : configuration);
      }
    };
  }, { user: account.user, forceRelay: process.env.FORCE_RELAY === '1' });
  return { context, page };
}

async function mediaEvidence(page) {
  return page.evaluate(async () => {
    const peerConnections = window.__tsmeetPeerConnections || [];
    let outboundAudio = 0;
    let outboundVideo = 0;
    let bytesSent = 0;
    const selectedCandidates = [];
    for (const connection of peerConnections) {
      const stats = await connection.getStats();
      stats.forEach((report) => {
        if (report.type === 'candidate-pair' && report.state === 'succeeded' && report.nominated) {
          const local = stats.get(report.localCandidateId);
          selectedCandidates.push({
            candidateType: local?.candidateType || null,
            protocol: local?.protocol || null,
            relayProtocol: local?.relayProtocol || null,
          });
        }
        if (report.type !== 'outbound-rtp' || report.isRemote) return;
        if (report.kind === 'audio' && report.bytesSent > 0) outboundAudio += 1;
        if (report.kind === 'video' && report.bytesSent > 0) outboundVideo += 1;
        bytesSent += Number(report.bytesSent || 0);
      });
    }
    const videos = Array.from(document.querySelectorAll('video'));
    const liveVideoTracks = videos.reduce((count, video) => {
      const stream = video.srcObject;
      if (!(stream instanceof MediaStream)) return count;
      return count + stream.getVideoTracks().filter((track) => track.readyState === 'live').length;
    }, 0);
    return {
      peerConnections: peerConnections.length,
      outboundAudio,
      outboundVideo,
      bytesSent,
      liveVideoTracks,
      videoElements: videos.length,
      selectedCandidates,
    };
  });
}

async function outboundBytes(page) {
  return page.evaluate(async () => {
    let audio = 0;
    let video = 0;
    for (const connection of window.__tsmeetPeerConnections || []) {
      const stats = await connection.getStats();
      stats.forEach((report) => {
        if (report.type !== 'outbound-rtp' || report.isRemote) return;
        if (report.kind === 'audio') audio += Number(report.bytesSent || 0);
        if (report.kind === 'video') video += Number(report.bytesSent || 0);
      });
    }
    return { audio, video };
  });
}

(async () => {
  const stamp = Date.now();
  const accounts = await Promise.all([1, 2, 3].map((index) => createUser(index, stamp)));
  const { body: room } = await jsonRequest(`${BACKEND}/api/rooms`, {
    method: 'POST',
    headers: { authorization: `Bearer ${accounts[0].token}` },
    body: JSON.stringify({ title: 'Three browser SFU acceptance' }),
  });

  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--allow-insecure-localhost',
      '--autoplay-policy=no-user-gesture-required',
      '--auto-select-desktop-capture-source=Entire screen',
      '--enable-usermedia-screen-capturing',
      '--allow-http-screen-capture',
      '--disable-gpu',
    ],
  });

  const sessions = [];
  try {
    for (const account of accounts) sessions.push(await createPage(browser, account));
    const [host, guestTwo, guestThree] = sessions.map((session) => session.page);
    const roomUrl = `${FRONTEND}/room/${room.id}`;

    await host.goto(roomUrl, { waitUntil: 'domcontentloaded' });
    try {
      await host.getByText('You are hosting this meeting.').waitFor({ timeout: 30_000 });
    } catch (error) {
      const roomResponse = await host.evaluate(async (id) => {
        const response = await fetch(`/api/rooms/${id}`);
        const body = await response.json().catch(() => null);
        return {
          status: response.status,
          creatorId: body?.creator_id ?? null,
          mediaProvider: body?.media_provider ?? null,
        };
      }, room.id);
      console.error(JSON.stringify({ url: host.url(), roomResponse, body: (await host.locator('body').innerText()).slice(0, 2000) }));
      throw error;
    }

    await Promise.all([
      guestTwo.goto(roomUrl, { waitUntil: 'domcontentloaded' }),
      guestThree.goto(roomUrl, { waitUntil: 'domcontentloaded' }),
    ]);
    await Promise.all([
      guestTwo.getByText('Waiting for Host').waitFor({ timeout: 30_000 }),
      guestThree.getByText('Waiting for Host').waitFor({ timeout: 30_000 }),
    ]);

    const participantsButton = host.locator('button[title="Participants"]');
    if (await participantsButton.count() !== 1) throw new Error('Could not locate Participants control');
    await participantsButton.click();
    await host.getByText('Join requests').waitFor({ timeout: 20_000 });
    const acceptAllButton = host.getByRole('button', { name: 'Accept all' });
    if (await acceptAllButton.count() !== 1) throw new Error('Could not locate Accept all control');
    await acceptAllButton.click();

    await Promise.all([
      host.getByText('3 participants', { exact: true }).waitFor({ timeout: 30_000 }),
      guestTwo.getByText('3 participants', { exact: true }).waitFor({ timeout: 30_000 }),
      guestThree.getByText('3 participants', { exact: true }).waitFor({ timeout: 30_000 }),
    ]);
    await host.keyboard.press('Escape');
    await host.waitForTimeout(4_000);

    let reconnect = null;
    if (process.env.TEST_RECONNECT === '1') {
      await guestTwo.reload({ waitUntil: 'domcontentloaded' });
      await guestTwo.getByText('3 participants', { exact: true }).waitFor({ timeout: 30_000 });
      await guestTwo.waitForTimeout(4_000);
      reconnect = await mediaEvidence(guestTwo);
    }

    let audioOnly = null;
    if (process.env.TEST_AUDIO_ONLY === '1') {
      const cameraButton = host.locator('button[title]').filter({ has: host.locator('svg.lucide-video') });
      const viewerTracksBefore = (await mediaEvidence(guestTwo)).liveVideoTracks;
      await cameraButton.click();
      await host.waitForTimeout(2_000);
      const before = await outboundBytes(host);
      await host.waitForTimeout(4_000);
      const after = await outboundBytes(host);
      const viewerTracksAfter = (await mediaEvidence(guestTwo)).liveVideoTracks;
      audioOnly = {
        audioBytesDelta: after.audio - before.audio,
        videoBytesDelta: after.video - before.video,
        viewerTracksBefore,
        viewerTracksAfter,
      };
      const cameraOffButton = host.locator('button[title]').filter({ has: host.locator('svg.lucide-video-off') });
      await cameraOffButton.click();
      await host.waitForTimeout(2_000);
    }

    let screenShare = null;
    if (process.env.TEST_SCREEN_SHARE === '1') {
      const shareButton = host.locator('button[title="Share screen only"]');
      if (await shareButton.count() !== 1) throw new Error('Could not locate screen-share control');
      const beforeShare = await mediaEvidence(host);
      await shareButton.click();
      await host.waitForTimeout(5_000);
      screenShare = {
        before: beforeShare,
        publisher: await mediaEvidence(host),
        viewers: await Promise.all([guestTwo, guestThree].map(mediaEvidence)),
      };
    }

    let recording = null;
    if (process.env.TEST_RECORDING === '1') {
      const { body: started } = await jsonRequest(`${BACKEND}/api/recordings/sessions/start`, {
        method: 'POST',
        headers: { authorization: `Bearer ${accounts[0].token}` },
        body: JSON.stringify({ roomId: room.id, consentConfirmed: true }),
      });
      await host.waitForTimeout(40_000);
      const { body: stopped } = await jsonRequest(
        `${BACKEND}/api/recordings/sessions/${started.id}/stop`,
        {
          method: 'POST',
          headers: { authorization: `Bearer ${accounts[0].token}` },
          body: '{}',
        }
      );
      await host.waitForTimeout(5_000);
      const ownerResponse = await fetch(`${BACKEND}/api/recordings/${started.id}/video`, {
        redirect: 'manual',
        headers: { authorization: `Bearer ${accounts[0].token}` },
      });
      const signedUrl = ownerResponse.headers.get('location');
      const guestResponse = await fetch(`${BACKEND}/api/recordings/${started.id}/video`, {
        redirect: 'manual',
        headers: { authorization: `Bearer ${accounts[1].token}` },
      });
      const objectResponse = signedUrl ? await fetch(signedUrl) : null;
      const { body: recordings } = await jsonRequest(`${BACKEND}/api/recordings`, {
        headers: { authorization: `Bearer ${accounts[0].token}` },
      });
      const metadata = recordings.find((item) => item.id === started.id);
      const keepRecording = process.env.KEEP_RECORDING === '1';
      const deleteResponse = keepRecording ? null : await fetch(`${BACKEND}/api/recordings/${started.id}`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${accounts[0].token}` },
      });
      const deletedObjectResponse = !keepRecording && signedUrl ? await fetch(signedUrl) : null;
      recording = {
        id: started.id,
        startedStatus: started.status,
        stoppedStatus: stopped.status,
        archiveStatus: metadata?.status,
        ownerStatus: ownerResponse.status,
        guestStatus: guestResponse.status,
        signedObjectStatus: objectResponse?.status,
        deleteStatus: deleteResponse?.status,
        deletedObjectStatus: deletedObjectResponse?.status,
      };
    }

    if (process.env.TEST_SCREEN_SHARE === '1') {
      const shareButton = host.locator('button[title="Share screen only"]');
      await shareButton.click();
      await host.waitForTimeout(2_000);
      screenShare.afterStop = await mediaEvidence(host);
    }

    const beforeToggle = await mediaEvidence(host);
    const cameraButtons = host.locator('button[title]').filter({ has: host.locator('svg.lucide-video') });
    const microphoneButtons = host.locator('button[title]').filter({ has: host.locator('svg.lucide-mic') });
    if (await cameraButtons.count() < 1 || await microphoneButtons.count() < 1) {
      console.error(JSON.stringify({
        beforeToggle,
        videoOnIcons: await host.locator('svg.lucide-video').count(),
        videoOffIcons: await host.locator('svg.lucide-video-off').count(),
        micOnIcons: await host.locator('svg.lucide-mic').count(),
        micOffIcons: await host.locator('svg.lucide-mic-off').count(),
        titledButtons: await host.locator('button[title]').evaluateAll((buttons) => buttons.map((button) => button.getAttribute('title'))),
      }));
      throw new Error('Could not locate active camera/microphone controls');
    }
    const cameraButton = cameraButtons.last();
    const microphoneButton = microphoneButtons.last();
    await cameraButton.click();
    await microphoneButton.click();
    await host.waitForTimeout(1_000);
    const controlsOff = {
      cameraOff: await host.locator('svg.lucide-video-off').count() > 0,
      microphoneOff: await host.locator('svg.lucide-mic-off').count() > 0,
    };
    const cameraOffButton = host.locator('button[title]').filter({ has: host.locator('svg.lucide-video-off') });
    const microphoneOffButton = host.locator('button[title]').filter({ has: host.locator('svg.lucide-mic-off') });
    await cameraOffButton.click();
    await microphoneOffButton.click();
    await host.waitForTimeout(2_000);
    const controlsOn = {
      cameraOn: await host.locator('svg.lucide-video').count() > 0,
      microphoneOn: await host.locator('svg.lucide-mic').count() > 0,
    };

    const evidence = await Promise.all(sessions.map(({ page }) => mediaEvidence(page)));
    const consoleErrors = (await Promise.all(sessions.map(({ page }) => page.evaluate(() => [])))).flat();
    console.log(JSON.stringify({
      roomId: room.id,
      waitingRoomObserved: true,
      participantCount: 3,
      recording,
      screenShare,
      reconnect,
      audioOnly,
      beforeToggle,
      controlsOff,
      controlsOn,
      browsers: evidence,
      consoleErrors,
    }));
  } finally {
    await jsonRequest(`${BACKEND}/api/rooms/${room.id}/end`, {
      method: 'POST',
      headers: { authorization: `Bearer ${accounts[0].token}` },
      body: '{}',
    }).catch(() => {});
    await Promise.all(sessions.map(({ context }) => context.close().catch(() => {})));
    await browser.close();
  }
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
