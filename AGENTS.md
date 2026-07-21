# AGENTS.md

Purpose: Provide concise guidance for AI coding agents working on this repository so they can be productive immediately.

Quick actions for agents
- Start backend in `server/` with `pnpm run dev` (listens on port 3002).
- Start frontend from repo root with `pnpm run dev` (Next on port 3001).
- Use the Next API proxy routes under `app/api/` when making frontend API calls.

Key files and entry points
- Repo overview: [README.md](README.md)
- Setup and architecture notes: [SETUP_GUIDE.md](SETUP_GUIDE.md), [ARCHITECTURE.md](ARCHITECTURE.md)
- Frontend pages: [app/room/[roomId]/page.tsx](app/room/[roomId]/page.tsx)
- LiveKit media hook: [hooks/useLiveKitRoom.ts](hooks/useLiveKitRoom.ts)
- Backend entry: [server/index.ts](server/index.ts)
- Room manager service: [server/services/roomManager.ts](server/services/roomManager.ts)
- DB init: [server/db.ts](server/db.ts)

Conventions and important notes
- Do not modify production secrets or commit `.env` files. Use existing `.env` patterns in docs.
- The backend dev server uses `ts-node --transpile-only` (see `server/package.json`) for fast iteration; adding missing `@types` is optional if you prefer strict type checks.
- The project uses Next.js (Turbopack) and a separate signaling server (Socket.IO). Keep the two processes separate during development.
- When changing signaling logic, restart the backend to pick up socket handler updates.
- Virtual background uses `@mediapipe/selfie_segmentation` and requires the package to be installed.

Agent behavior rules (concise)
- Prefer linking to existing docs rather than copying large sections.
- Run tests or servers only when necessary; always state the command before executing it.
- Ask the human if uncertain about changing lockfiles (package-lock.json vs pnpm).
- Avoid committing secrets or machine-specific changes.

Where to look for more details
- Architecture: [ARCHITECTURE.md](ARCHITECTURE.md)
- Deployment notes: [COTURN_DEPLOYMENT_GUIDE.md](COTURN_DEPLOYMENT_GUIDE.md)

If you'd like, I can also create separate agent instructions for frontend/backend tasks or a small troubleshooting checklist for common dev issues (ports, ts-node flags, lockfile mismatch).
