# M04 — Fullscreen controls ও shared LiveKit media foundation

Updated: 2026-11-11. Scope: [M04](BUG_FIXING_MILESTONES.md), related
[LiveKit refactor review](LIVEKIT_REFACTOR_REVIEW.md)।

## Local findings

Source-level fullscreen fault confirmed: the fullscreen target was the pinned
stage, not the meeting shell. Toolbar/sidebar were outside that element, and
the stage was hidden in gallery view. Dialog/sheet/dropdown/select portals also
defaulted to `document.body`, outside the fullscreen top-layer subtree.
This establishes a local structural fault; the original laptop/browser report
still needs deployment/device confirmation.

## Changes

- Fullscreen targets the entire meeting shell in gallery and pinned views;
  toolbar, panels and overlays stay in the same subtree. The fullscreen indicator
  follows `fullscreenchange`; unsupported/denied requests show feedback.
- Scoped portal context keeps meeting dialogs, sheets, dropdowns and selects
  inside the shell. Other application pages retain their existing portal default.
- Shell uses dynamic viewport height and a shrinkable main region; sizing and
  complete responsive gallery/focus work remain M10–M12 tasks.
- Hook-owned LiveKit Room is exposed to `RoomContext`; no second connection or
  component-owned token/auth flow is introduced.
- Remote camera and screen-share rendering uses SDK `VideoTrack`. The single
  SDK `RoomAudioRenderer` owns remote audio; SDK videos are muted to prevent
  duplicate playback across focus/gallery. `StartAudio` provides a playback
  unlock button when required. Output selection also targets audio elements.
- Existing local preview/capture remains unchanged; legacy mesh rendering is
  retained only for explicit rollback rooms. Manual subscription policy remains
  hook-owned (`manageSubscription={false}`); adaptive stream is not enabled yet.
- No server routes, socket contracts, secrets, database schema or LiveKit
  networking configuration changed. Backend-authoritative roles, approved roster
  and microphone/session guards are retained.

## Validation and remaining acceptance

`pnpm test:meeting-ui` covers fullscreen entry, exit, unsupported browser/root,
and request failure. These are helper tests, not DOM interaction or media tests.
CI and `pnpm check` include this suite. Record final full-check/browser results
below before release.

Local results (2026-11-11):

- `pnpm check` passed: lint (0 errors, 10 existing warnings), frontend/backend
  typecheck, existing tests, 15 Safari/session/roster/mic tests, dependency tests,
  four fullscreen tests and production build. Existing middleware deprecation
  warning remains.
- A temporary frontend on port 3101 was inspected using a synthetic host/guest
  browser fixture. HTTP session/room and Socket.IO admission were mocked; media
  token intentionally returned 401. No real account, media capture or recording
  was used. Recording polling also produced backend-unavailable errors before
  its fixture was added; these are not evidence of a production recording bug.
- At 1366×768, participant sheet, nested quality select and participant action
  menu opened; each popup was confirmed inside the meeting shell. At 390×844,
  the More menu and recording consent dialog opened inside the same shell;
  no document horizontal overflow was measured. Consent was cancelled.
- Native fullscreen was attempted but the browser rejected it with
  `TypeError: not granted`. Error feedback displayed correctly. No restriction
  was bypassed, and native fullscreen entry/exit/interactions are **not passed**.
  These must be retested on the user's laptop; the exact rejection cause was
  not established. Browser F11 and real SFU audio/video were not verified.
- Screenshot: local ignored `.playwright-mcp/m04-mobile-menu.png`; contains only
  synthetic fixture data. Browser skill's preferred execution tool was absent;
  available Playwright tools were used as the documented fallback.

Release acceptance still requires real laptop app/tile/browser fullscreen:
mic/camera toggles, device selectors, chat, participants, host/recording dialogs,
share start/stop, leave, Escape and fullscreen re-entry. Test real remote audio
exactly once (including audio-only attendees), speaker output selection and
autoplay recovery; test Safari/iPhone as a receiver without assuming native
fullscreen/capture support. M10–M12 layout/name acceptance remains separate.

## Deployment hand-off

No Git or production commands were executed by the agent. Review and commit
locally with the manual workflow in [milestones](BUG_FIXING_MILESTONES.md#step-3-local-commit-server-deployment-ও-retest).
The native frontend service layout must be confirmed first:

```bash
cd /opt/tsmeet
sudo systemctl show tsmeet-frontend -p User -p WorkingDirectory -p ExecStart -p EnvironmentFiles
```

Do not share environment contents/secrets. Once the service's build/standalone
asset layout is confirmed, build and deploy the frontend in a maintenance window
and restart `tsmeet-frontend`. This M04 change does not require backend, LiveKit,
database or storage restart/deletion. Concurrent dependency/backend changes need
their own deployment review. Preserve the previous frontend release for rollback.
