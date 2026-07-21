const BACKEND = 'http://localhost:3002';
const PROMETHEUS = 'http://localhost:9091';

async function json(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

(async () => {
  const stamp = Date.now();
  const registered = await json(`${BACKEND}/api/auth/register`, {
    method: 'POST',
    body: JSON.stringify({
      email: `alert-probe-${stamp}@example.test`,
      password: 'RuntimeTest!4827',
      name: 'Alert Probe',
    }),
  });
  if (!registered.response.ok) throw new Error(`Registration failed: ${registered.response.status}`);
  const account = registered.body;
  const roomResult = await json(`${BACKEND}/api/rooms`, {
    method: 'POST',
    headers: { authorization: `Bearer ${account.token}` },
    body: JSON.stringify({ title: 'Egress failure alert probe' }),
  });
  if (!roomResult.response.ok) throw new Error(`Room create failed: ${roomResult.response.status}`);
  const room = roomResult.body;
  try {
    // The LiveKit room is intentionally never joined/created, so Egress must fail.
    const started = await json(`${BACKEND}/api/recordings/sessions/start`, {
      method: 'POST',
      headers: { authorization: `Bearer ${account.token}` },
      body: JSON.stringify({ roomId: room.id, consentConfirmed: true }),
    });
    let failure = started;
    if (started.response.status === 201) {
      await new Promise((resolve) => setTimeout(resolve, 2_000));
      failure = await json(`${BACKEND}/api/recordings/sessions/${started.body.id}/stop`, {
        method: 'POST',
        headers: { authorization: `Bearer ${account.token}` },
        body: '{}',
      });
    }
    if (failure.response.status !== 500) throw new Error(`Expected Egress failure 500, received ${failure.response.status}`);
    await new Promise((resolve) => setTimeout(resolve, 35_000));
    const alerts = await json(`${PROMETHEUS}/api/v1/alerts`);
    if (!alerts.response.ok) throw new Error(`Prometheus alerts query failed: ${alerts.response.status}`);
    const recordingAlert = alerts.body.data?.alerts?.find(
      (alert) => alert.labels?.alertname === 'RecordingFailure' && alert.state === 'firing'
    );
    console.log(JSON.stringify({
      egressFailureStatus: failure.response.status,
      recordingFailureAlertState: recordingAlert?.state || null,
      recordingFailureSeverity: recordingAlert?.labels?.severity || null,
    }));
    if (!recordingAlert) throw new Error('RecordingFailure alert did not reach firing state');
  } finally {
    await json(`${BACKEND}/api/rooms/${room.id}/end`, {
      method: 'POST',
      headers: { authorization: `Bearer ${account.token}` },
      body: '{}',
    }).catch(() => {});
  }
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
