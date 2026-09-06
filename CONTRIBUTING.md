# Contributing to TSMeet

Thanks for helping improve TSMeet. Contributions are welcome for bug fixes,
features, tests, documentation, accessibility, and deployment improvements.

## Before you start

1. Read [README.md](./README.md) for the product overview.
2. Read [SETUP_GUIDE.md](./SETUP_GUIDE.md) for local development.
3. For architecture or media changes, read [ARCHITECTURE.md](./ARCHITECTURE.md).
4. For production changes, read [VPS_DEPLOYMENT_GUIDE.md](./VPS_DEPLOYMENT_GUIDE.md).

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

Do not open a public issue for a suspected vulnerability. Contact the project
maintainer privately with reproduction details, affected versions, and a safe
way to follow up. Do not include credentials, session cookies, or production
URLs containing secrets in reports.

## License

By contributing, you agree that your contribution is provided under the
repository's [MIT License](./LICENSE.md).
