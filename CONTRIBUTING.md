# Contributing to TSMeet

Thanks for helping improve TSMeet. Contributions are welcome for bug fixes,
features, tests, documentation, accessibility, and deployment improvements.

This project follows a [Code of Conduct](./CODE_OF_CONDUCT.md). By taking part,
you agree to uphold it.

## Before you start

| Read this | When |
|---|---|
| [README.md](./README.md) | Always — product overview and quick start |
| [SETUP_GUIDE.md](./SETUP_GUIDE.md) | Always — local development setup |
| [docs/USER_GUIDE.md](./docs/USER_GUIDE.md) | To understand a feature from the user's side |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Architecture, media, auth, or state changes |
| [API.md](./API.md) | Any REST or Socket.IO change |
| [VPS_DEPLOYMENT_GUIDE.md](./VPS_DEPLOYMENT_GUIDE.md) | Production or deployment changes |
| [docs/README.md](./docs/README.md) | The documentation index and writing conventions |
| [SECURITY.md](./SECURITY.md) | Before reporting anything security-related |

Please search existing issues and pull requests before opening a new one.

## Development setup

Use Node.js 20 or newer and pnpm. The easiest setup runs infrastructure in
Docker and the application processes locally:

```bash
cp .env.example .env                 # PowerShell: Copy-Item .env.example .env
docker compose up -d mysql redis livekit

pnpm install
pnpm dev                              # frontend on http://localhost:3001

cd server
pnpm install
pnpm run dev                          # backend on http://localhost:3002
```

Never commit `.env`, `server/.env`, production secrets, generated production
LiveKit YAML, or TLS private keys.

## Working on a change

1. Create a focused branch from the default branch:

   ```bash
   git checkout -b feat/short-description
   ```

2. Keep the change focused and avoid unrelated formatting or dependency updates.
3. Add or update tests for behavior changes.
4. Update the relevant documentation and `.env.example` when configuration changes.
   Adding or removing a REST route or socket event means updating
   [API.md](./API.md) **in the same pull request** — it is the contract, and a
   stale one is worse than none. Follow the conventions in
   [docs/README.md](./docs/README.md#documentation-conventions).
5. Run the checks below before opening a pull request.

Suggested branch prefixes are `feat/`, `fix/`, `docs/`, `test/`, `refactor/`,
and `chore/`.

## Testing and validation

Run from the repository root:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

For Docker or deployment changes, also validate Compose configuration:

```bash
docker compose config
docker compose -f docker-compose.yml -f docker-compose.production.yml config
```

For LiveKit networking changes, confirm the VPS configuration uses `7881/tcp`
and `7882/udp` UDP mux and does not reintroduce the old `50000-60000` range.

For meeting UI changes, manually test with two browser profiles:

- join and leave flows;
- waiting-room admit/deny;
- camera, microphone, speaker and screen-share device controls;
- chat, hand raise, pinning, mute/remove, and end-meeting behavior;
- network-aware quality and reconnect behavior.

## Media and authentication rules

- LiveKit SFU is the default media provider. Do not add browser-to-browser mesh
  connections to normal rooms.
- Browser authentication uses the HttpOnly `tsmeet_session` cookie and the
  same-origin Next.js `/api` proxy. Do not restore JWTs in localStorage.
- Never expose `JWT_SECRET`, `LIVEKIT_API_SECRET`, Redis passwords, recorder
  tokens, or MinIO credentials to browser code or logs.
- Socket.IO is for application events and moderation; LiveKit transports media.
- Recording changes must preserve consent prompts, ownership checks, retention,
  and private storage behavior.

## Commit and pull request guidance

Use a clear imperative commit subject, for example:

```text
fix: preserve session cookie for media token requests
docs: clarify LiveKit UDP mux deployment
```

A pull request should include:

- a short summary of the user-visible or operational change;
- linked issue or motivation, when applicable;
- tests and commands run;
- screenshots or a short recording for UI changes;
- migration, environment, deployment, or volume-impact notes;
- confirmation that no secrets or generated production files were added.

Keep pull requests small enough to review. Be explicit about known limitations
and follow-up work rather than silently changing behavior outside the request.

## Reporting security issues

Do not open a public issue for a suspected vulnerability. Follow
[SECURITY.md](./SECURITY.md), which covers the private reporting channel, what
to include, what is in and out of scope, and the response times you can expect.
Never include credentials, session cookies, or production URLs containing
secrets.

## License

By contributing, you agree that your contribution is provided under the
repository's [MIT License](./LICENSE.md).
