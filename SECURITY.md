# Security Policy

## Reporting a vulnerability

**Do not open a public issue for a suspected vulnerability.**

Report it privately to the project maintainer:

- Use GitHub's **[Report a vulnerability](https://github.com/tanvirahmmed8/tsmeet/security/advisories/new)**
  form (Security → Advisories), or
- Contact the maintainer directly if you already have a private channel.

Please include:

- what the issue is and the impact you believe it has;
- the affected version, commit, or deployment configuration;
- clear reproduction steps or a proof of concept;
- any suggested remediation you already have.

**Never include** real credentials, session cookies, JWTs, LiveKit API secrets,
recorder tokens, MinIO keys, or production URLs containing secrets. Redact them.
If a secret has already been exposed, say so — rotation is the first fix.

### What to expect

| Stage | Target |
|---|---|
| Acknowledgement of your report | within 7 days |
| Initial assessment and severity | within 14 days |
| Fix or documented mitigation | depends on severity and complexity |

You will be credited in the advisory unless you ask not to be. Please give us a
reasonable window to ship a fix before publishing details.

## Supported versions

TSMeet is a self-hosted application without numbered releases. Security fixes
land on the default branch. **Track the default branch** — a deployment pinned to
an old commit does not receive fixes.

## Scope

**In scope**

- Authentication and session handling (`tsmeet_session` cookie, JWT issuance)
- Authorisation: waiting-room bypass, forged host or co-host privileges,
  obtaining a LiveKit token without approval
- Guest-token scope escaping its bound room
- Recording access control: reading, downloading, or deleting recordings you do
  not own; public exposure of the storage bucket
- Injection of any kind, including SQL and template injection in booking fields
- Secret exposure to browser code, logs, or build artifacts
- LiveKit webhook signature bypass
- Cross-tenant data leakage between calendars, rooms, or users

**Out of scope**

- Vulnerabilities in a deployment's own misconfiguration (an unauthenticated
  `/metrics` endpoint exposed publicly, a world-readable MinIO bucket, a weak
  `JWT_SECRET`, missing TLS). Report these as documentation gaps instead.
- Denial of service through raw traffic volume
- Findings that require a compromised host or a malicious browser extension
- Missing hardening headers with no demonstrated impact
- Social engineering and physical attacks
- Automated scanner output without a working proof of concept

## Deployment security requirements

If you run TSMeet, these are your responsibility, not the application's:

- Set a long, random, unique `JWT_SECRET`. Rotating it invalidates all sessions.
- Set unique `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET`, Redis password, MinIO
  credentials, and `RECORDER_SERVICE_TOKEN`. Never reuse the `change-me` values.
- Terminate TLS in front of both domains and keep certificates renewing.
- Keep `/metrics`, Grafana, Prometheus, and MinIO on a private network or behind
  authentication. `/metrics` is unauthenticated by design.
- Keep the recording bucket private. Downloads must go through the application's
  presigned URLs.
- Never commit `.env`, `server/.env`, generated production LiveKit YAML, or TLS
  private keys.
- Restrict `FRONTEND_URL` to the origins you actually serve.

See [docs/OPERATIONS_HANDBOOK.md](docs/OPERATIONS_HANDBOOK.md) and
[VPS_DEPLOYMENT_GUIDE.md](VPS_DEPLOYMENT_GUIDE.md) for the full production
checklist, and [ARCHITECTURE.md](ARCHITECTURE.md#security-model) for the
application's own security model.
