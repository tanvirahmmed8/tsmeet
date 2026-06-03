const os = require('os');

async function main() {
  const backendUrl = (process.env.BACKEND_URL || 'http://127.0.0.1:3002').replace(/\/+$/, '');
  const serviceToken = (process.env.RECORDER_SERVICE_TOKEN || '').trim();
  const pollIntervalMs = Number(process.env.RECORDER_POLL_INTERVAL_MS || 4000);
  const instanceId = process.env.RECORDER_SERVICE_INSTANCE_ID || `${os.hostname()}-${process.pid}`;

  if (!serviceToken) {
    throw new Error('RECORDER_SERVICE_TOKEN is required for recorder-worker');
  }

  const { chromium } = require('playwright');
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-fake-ui-for-media-stream', '--no-sandbox', '--disable-dev-shm-usage'],
  });

  const activeSessions = new Map();

  const apiFetch = async (pathname, init = {}) => {
    const response = await fetch(`${backendUrl}${pathname}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${serviceToken}`,
        ...(init.headers || {}),
      },
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`${pathname} failed: ${response.status} ${body}`);
    }
    return response.json();
  };

  const closeTrackedSession = async (sessionId) => {
    const current = activeSessions.get(sessionId);
    if (!current) return;
    activeSessions.delete(sessionId);
    try {
      await current.page.close();
    } catch {}
    try {
      await current.context.close();
    } catch {}
  };

  const launchRecorderPage = async (session) => {
    if (activeSessions.has(session.id)) return;

    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    });
    const page = await context.newPage();
    page.on('console', (msg) => {
      console.log(`[recorder:${session.id}] ${msg.type()}: ${msg.text()}`);
    });
    page.on('pageerror', (error) => {
      console.error(`[recorder:${session.id}] pageerror:`, error);
    });
    page.on('close', () => {
      activeSessions.delete(session.id);
    });

    const url = new URL(`${backendUrl}/recorder/${session.id}`);
    url.searchParams.set('roomId', session.roomId);
    url.searchParams.set('backendUrl', backendUrl);
    url.searchParams.set('signalingServer', backendUrl);
    url.searchParams.set('serviceToken', serviceToken);
    url.searchParams.set('serviceInstanceId', instanceId);

    activeSessions.set(session.id, { page, context });
    await page.goto(url.toString(), { waitUntil: 'networkidle' });
  };

  const reconcileTrackedSessions = async () => {
    for (const sessionId of Array.from(activeSessions.keys())) {
      try {
        const session = await apiFetch(`/api/recording-service/sessions/${sessionId}`);
        if (['completed', 'failed'].includes(session.status)) {
          await closeTrackedSession(sessionId);
        }
      } catch (error) {
        console.error(`[recorder:${sessionId}] reconcile failed:`, error.message || error);
      }
    }
  };

  const poll = async () => {
    try {
      const payload = await apiFetch('/api/recording-service/sessions/claimable');
      const sessions = Array.isArray(payload.sessions) ? payload.sessions : [];
      for (const session of sessions) {
        await launchRecorderPage(session);
      }
      await reconcileTrackedSessions();
    } catch (error) {
      console.error('[recorder-worker] poll failed:', error.message || error);
    }
  };

  const shutdown = async () => {
    for (const sessionId of Array.from(activeSessions.keys())) {
      await closeTrackedSession(sessionId);
    }
    await browser.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  console.log(`[recorder-worker] started instance ${instanceId}`);
  await poll();
  setInterval(poll, pollIntervalMs);
}

main().catch((error) => {
  console.error('[recorder-worker] fatal:', error);
  process.exit(1);
});
