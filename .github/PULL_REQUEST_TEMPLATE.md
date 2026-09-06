<!--
Thanks for contributing to TSMeet.
Read CONTRIBUTING.md before opening this PR.
-->

## Summary

<!-- What changes, and what does it mean for users or operators? -->

## Motivation

<!-- Linked issue, or the problem this solves. -->

Closes #

## Type of change

- [ ] Bug fix
- [ ] New feature
- [ ] Documentation
- [ ] Refactor / cleanup
- [ ] Deployment or infrastructure
- [ ] Tests

## Testing

Commands run:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

<!-- For Docker or deployment changes:
docker compose config
docker compose -f docker-compose.yml -f docker-compose.production.yml config
-->

Manual testing performed:

<!-- For meeting UI changes, test with two browser profiles:
join and leave, waiting-room admit/deny, camera/mic/speaker/screen-share
device controls, chat, hand raise, pinning, mute/remove, end meeting,
network-aware quality and reconnect. -->

## Screenshots or recording

<!-- Required for UI changes. -->

## Impact notes

<!-- Delete what does not apply. -->

- **Migrations:**
- **New or changed environment variables:** <!-- also updated in .env.example? -->
- **Deployment steps:** <!-- frontend rebuild? LiveKit recreate? -->
- **Volume impact:**

## Checklist

- [ ] The change is focused; no unrelated formatting or dependency churn
- [ ] Tests added or updated for behaviour changes
- [ ] Documentation updated (`README.md`, `API.md`, `ARCHITECTURE.md`, `FEATURES.md`, `docs/`)
- [ ] `.env.example` updated if configuration changed
- [ ] No secrets, `.env` files, generated production LiveKit YAML, or TLS keys added
- [ ] LiveKit media still uses `7881/tcp` and `7882/udp` mux — the `50000-60000` range is not reintroduced
- [ ] No browser-to-browser mesh connections added to normal rooms
- [ ] Browser auth still uses the HttpOnly `tsmeet_session` cookie; no JWTs in `localStorage`
- [ ] Recording changes preserve consent prompts, ownership checks, retention, and private storage
- [ ] Known limitations and follow-up work are stated explicitly
