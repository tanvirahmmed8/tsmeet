import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { POST } from '../app/api/media/token/route';

type CapturedRequest = {
  url: string;
  headers: Headers;
  body: string;
};

const frontendOrigin = 'https://piameet.powerinai.com';
const backendOrigin = 'http://backend:3002';
const requestBody = JSON.stringify({
  roomId: '5ce29459-43e0-49d3-b050-d6d22092319e',
  displayName: 'Test participant',
});

async function exerciseProxy(input: {
  cookie?: string;
  authorization?: string;
  backendStatus?: number;
  backendBody?: Record<string, unknown>;
}) {
  const previousBackendUrl = process.env.BACKEND_URL;
  const previousFetch = globalThis.fetch;
  const captured: CapturedRequest[] = [];
  process.env.BACKEND_URL = backendOrigin;

  globalThis.fetch = async (resource, init) => {
    captured.push({
      url: String(resource),
      headers: new Headers(init?.headers),
      body: typeof init?.body === 'string' ? init.body : '',
    });
    return new Response(
      JSON.stringify(input.backendBody ?? { token: 'redacted-livekit-token' }),
      {
        status: input.backendStatus ?? 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  };

  try {
    const headers = new Headers({ 'Content-Type': 'application/json' });
    if (input.cookie) headers.set('Cookie', input.cookie);
    if (input.authorization) headers.set('Authorization', input.authorization);
    const request = new NextRequest(`${frontendOrigin}/api/media/token`, {
      method: 'POST',
      headers,
      body: requestBody,
    });
    const response = await POST(request);
    return {
      response,
      responseBody: await response.json(),
      captured: captured[0],
    };
  } finally {
    globalThis.fetch = previousFetch;
    if (previousBackendUrl === undefined) {
      delete process.env.BACKEND_URL;
    } else {
      process.env.BACKEND_URL = previousBackendUrl;
    }
  }
}

test('media-token proxy preserves cookie authentication across different production subdomains', async () => {
  const result = await exerciseProxy({
    cookie: 'tsmeet_session=signed-host-session',
  });

  assert.equal(result.response.status, 200);
  assert.equal(result.captured.url, `${backendOrigin}/api/media/token`);
  assert.equal(result.captured.headers.get('cookie'), 'tsmeet_session=signed-host-session');
  assert.equal(result.captured.headers.get('authorization'), null);
  assert.equal(result.captured.headers.get('content-type'), 'application/json');
  assert.equal(result.captured.body, requestBody);
  assert.notEqual(new URL(`${frontendOrigin}/api/media/token`).hostname, new URL('https://piameet-api.powerinai.com').hostname);
});

test('media-token proxy forwards a guest session cookie without requiring Authorization', async () => {
  const result = await exerciseProxy({
    cookie: 'tsmeet_session=room-scoped-guest-session',
  });

  assert.equal(result.response.status, 200);
  assert.equal(result.captured.headers.get('cookie'), 'tsmeet_session=room-scoped-guest-session');
  assert.equal(result.captured.headers.get('authorization'), null);
});

test('media-token proxy forwards Authorization when explicitly supplied', async () => {
  const result = await exerciseProxy({
    cookie: 'tsmeet_session=signed-host-session',
    authorization: 'Bearer compatibility-token',
  });

  assert.equal(result.captured.headers.get('authorization'), 'Bearer compatibility-token');
});

test('media-token proxy preserves missing-session 401 response', async () => {
  const result = await exerciseProxy({
    backendStatus: 401,
    backendBody: { error: 'No token provided' },
  });

  assert.equal(result.response.status, 401);
  assert.deepEqual(result.responseBody, { error: 'No token provided' });
  assert.equal(result.captured.headers.get('cookie'), null);
  assert.equal(result.captured.headers.get('authorization'), null);
});

test('media-token proxy preserves expired-session authentication response', async () => {
  const result = await exerciseProxy({
    cookie: 'tsmeet_session=expired-session',
    backendStatus: 403,
    backendBody: { error: 'Invalid or expired token' },
  });

  assert.equal(result.response.status, 403);
  assert.deepEqual(result.responseBody, { error: 'Invalid or expired token' });
});
