# Phase 1 — Safari Compatibility

Updated: 2026-11-09. Scope: BUG-01 participant count, BUG-02 microphone controls,
BUG-03 unexpected logout. References: [bug list](BUG_LIST.md),
[milestones M01–M03](BUG_FIXING_MILESTONES.md).

Status: Local changes prepared. Real iPhone Safari and production acceptance
remain pending. No Git command or production deployment was executed by the agent.

## Findings and changes

| Concern | Confirmed source behaviour before | Local change |
|---|---|---|
| Pre-join microphone | Toggle returned immediately without a media participant | Explicit preview capture from buttons; preview tracks publish on admission |
| Capture preferences | Join enabled mic/camera unconditionally; camera denial could abort initialization | Preserve on/off choices, default off, isolate device failures from roster initialization |
| Repeated mic taps / status | React state determined toggle direction | Read publication state, guard overlapping calls, sync indicators from SDK events |
| Unmute approval | Socket callback started capture | Approval unlocks mic; participant taps to start capture |
| Participant count | Peers came only from media roster | Merge admitted signaling roster with media; exclude self/recorders and deduplicate identities |
| Socket reconnect | Initial join payload discarded | Repeat join for backend reauthorization and previous approval recovery |
| Account identity | Local profile required; guest proxy always replaced session | Backend-verified cookie identity; preserve valid account/same-room guest cookie |
| Session verification outage | Missing local profile could trigger guest/login flow | Retry feedback; do not replace account cookie on verification outage |

These are confirmed code issues, not independently reproduced production root
causes. Account expiry remains 7 days; guest expiry remains 12 hours. Session
lookup does not renew tokens. New `/api/auth/session` is Next.js-only; backend
routes and socket payload schemas are unchanged. See [API.md](../API.md).

## Local checks

### M02 follow-up — participant count (2026-11-10)

Source review confirmed a local roster ordering gap: merging every SFU identity
back into an already received signaling snapshot could retain a departed or
removed attendee until LiveKit delivered its disconnect. This is not proof of
the original production Safari report's root cause.

The hook now tracks whether an authoritative signaling snapshot has arrived.
Before the first snapshot, media-only arrivals remain a fallback. After it,
only admitted signaling members contribute to the remote roster; matching SFU
entries supply tracks, not additional attendees. Cleanup resets that snapshot
state. No REST/socket payload, backend authorization, or server configuration
changed.

Two regression cases cover stale media after leave/removal, empty snapshots,
excluded non-admitted identities/recorders, three-client media-off counts, and
replacement sockets on reconnect. `pnpm test:safari` passes all 11 tests.
These are automated roster/session tests, not a browser or physical Safari test.
Full `pnpm check` also passed on 2026-11-10 after this change: lint (0 errors,
10 existing warnings), frontend/backend typecheck, all regression suites and
the production build. The middleware naming deprecation warning remains.

Release gate: test two/three real clients (including iPhone Safari), admit a
waiting guest, leave/remove one attendee, then reconnect with media off. Compare
toolbar count and participant rows on every client. Waiting guests and hidden
recorders must not count; host must count exactly once. Deployment is pending;
use the service inspection and native deployment process below. The M02 change
itself requires a frontend rebuild, not a backend/LiveKit restart. Any concurrent
dependency/backend update needs its own deployment review.

Final `pnpm.cmd check` passed on 2026-11-09: lint (0 errors, 10 warnings),
frontend/backend typecheck, the existing test suite, 9 new session/roster
regression tests, and production build. The build still warns about the existing
Next.js middleware naming convention. No lockfile change was needed.

Individual checks: `pnpm.cmd lint`, `pnpm.cmd typecheck`, `pnpm.cmd test`,
`pnpm.cmd test:safari`, and `pnpm.cmd build`.
The Safari regression suite covers mocked session/proxy/roster scenarios, not
physical microphone audio or iOS lifecycle behaviour. These need real-device tests.

## Local commit — user runs manually

Review staged changes, then stage only Phase 1 files:

```powershell
git status --short
git diff --check
git add -- hooks/useLiveKitRoom.ts lib/meetingParticipants.ts lib/browserSession.ts
git add -- app/api/auth/_session.ts app/api/auth/session/route.ts app/api/auth/guest/route.ts
git add -- "app/room/[roomId]/page.tsx" app/dashboard/page.tsx app/dashboard/recordings/page.tsx app/dashboard/api-docs/page.tsx
git add -- app/calendars/page.tsx app/calendars/create/page.tsx "app/calendars/manage/[calendarId]/edit/page.tsx" "app/calendars/manage/[calendarId]/bookings/page.tsx" components/calendar/calendar-manager.tsx
git add -- tests/safariCompatibility.test.ts package.json .github/workflows/ci.yml
git add -- API.md FEATURES.md docs/BUG_LIST.md docs/BUG_FIXING_MILESTONES.md docs/PHASE_1_SAFARI.md docs/README.md
git diff --cached --stat
git diff --cached
git commit -m "fix: restore cookie sessions and improve Safari meeting controls"
git push origin main
```

This assumes the working branch is `main`. Separate unrelated staged work first.
Lockfiles were not regenerated; package changes only add a test/check command.

## Native VPS service inspection — user runs manually

```bash
cd /opt/tsmeet
git status --short
git rev-parse HEAD
sudo systemctl show tsmeet-frontend -p User -p WorkingDirectory -p ExecStart -p EnvironmentFiles
systemctl is-active nginx mysql redis-server livekit tsmeet-backend tsmeet-frontend
free -h
df -h
```

Provide sanitized output, not environment contents or credentials. The frontend
service user, ExecStart, build location and environment loading have not been
verified in this session. Exact build/copy/restart commands follow this inspection.

Deployment sequence once the service layout is confirmed:

1. Record previous commit/release and arrange a maintenance window.
2. From a clean production working tree, update with
   `git pull --ff-only origin main` after the intended commit reaches `main`.
3. As the verified application user, install root dependencies from the existing
   frozen lockfile and build using the existing production environment.
4. If ExecStart targets `.next/standalone/server.js`, prepare matching
   `.next/standalone/.next/static` and `.next/standalone/public` assets. If a
   separate release directory is used, prepare that layout instead.
5. Restart **tsmeet-frontend**, then verify session and meeting flows. This phase
   has no backend source, schema, LiveKit or Nginx configuration change. The
   existing backend must provide `/api/auth/verify`.
6. If retest fails, restore the recorded previous frontend release/build and
   restart the same service. Preserve database/storage data.

Frontend rebuild is required because the meeting hook is bundled and the new
session proxy must be included. Do not run Docker deployment commands for this
native setup or restart with a partially prepared standalone build.

Post-deployment diagnostics:

```bash
systemctl is-active tsmeet-frontend tsmeet-backend livekit
sudo journalctl -u tsmeet-frontend -u tsmeet-backend --since "10 minutes ago" --no-pager -n 100
curl -i https://piameet.powerinai.com/api/auth/session
```

Unauthenticated curl should return `401` JSON with `Cache-Control: private,
no-store`. A signed-in browser should receive `200`. Do not paste real cookies
into shared commands or logs. Service-active/HTTP checks alone are not acceptance.

## iPhone + laptop acceptance

Record iOS/Safari version, laptop OS/browser, deployed commit and network type.

- [ ] Clear only localStorage profile (keep cookie), reload dashboard and open
  a meeting: account identity/host permissions remain correct.
- [ ] Valid account guest-entry request preserves cookie; backend verification
  outage gives retry feedback rather than account replacement.
- [ ] Same-room anonymous guest refresh retains identity while session is valid;
  another room still requires its own authorization.
- [ ] Two/three admitted clients show matching counts, including camera/mic-off
  users; pending guests are excluded.
- [ ] Background Safari for 30–60 seconds and switch Wi-Fi/mobile data: after
  reauthorization the roster settles without duplicates.
- [ ] Pre-join mic button requests permission; join preserves mute choice;
  camera denial does not prevent mic or participant roster initialization.
- [ ] Listen on laptop: Safari mute stops audio, unmute resumes audio, and rapid
  repeated taps do not duplicate capture.
- [ ] Host mute suppresses audio; approval alone does not capture; participant
  tap unmutes. Background recovery does not override host mute.
- [ ] Run a 30-minute call; distinguish reconnect from account logout; real
  session expiry still gives correct authentication errors.
- [ ] Leave/end meeting stops capture indicators; repeat on laptop for regression.

Keep BUG-01–03 and milestone release/retest steps open until these pass.
