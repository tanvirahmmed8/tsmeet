# SKILL: 3D Motion Video-Graphic UI Expert

Purpose
- Give AI agents a compact, reusable workflow for designing and implementing advanced 3D motion and video-graphic UI features (animated backgrounds, 3D layers, parallax, motion-timed transitions, reactive particle systems, GPU-accelerated effects) in this codebase.

When to use
- When adding or reviewing features that rely on WebGL/Three.js, CSS/JS animations, GPU-based postprocessing (WebGL, WebGPU, OffscreenCanvas), or integrating real-time video streams with 3D visuals (e.g., virtual backgrounds, AR overlays).

High-level workflow (step-by-step)
1. Discover: locate related code and assets.
   - Inspect `hooks/useWebRTC.ts`, `app/room/[roomId]/page.tsx`, and any `components/ui/*` that participate in video rendering.
   - Check docs: `WEBRTC_IMPLEMENTATION.md`, `ARCHITECTURE.md`.
2. Design/Constraints: capture UX goals and performance budget.
   - Decide CPU vs GPU tradeoffs, target frame-rate (e.g., 30/60fps), and device fallbacks.
   - Choose libraries (Three.js, regl, PixiJS, OffscreenCanvas) consistent with existing deps. Prefer zero-new-native builds unless justified.
3. Prototype: build small isolated demos under `components/dev-sandbox/` or `public/dev-samples/`.
   - Use minimal fixtures (camera stream stub, sample video) and include perf markers (FPS, frame drop logs).
4. Integrate: wire the prototype into `hooks/useWebRTC.ts` or a new `useVideoFX.ts` hook.
   - Keep API small: `startEffect(options)`, `stopEffect()`, `getProcessedTrack()`.
   - Use `canvas.captureStream()` and `replaceTrack()` to swap outgoing video reliably.
5. Performance & Safety:
   - Use requestAnimationFrame and avoid layout thrashing.
   - Use OffscreenCanvas/Workers when heavy pixel ops are needed.
   - Provide graceful degradation: camera-only fallback, low-quality mode.
6. Test & Validate:
   - Test on desktop and mobile, with CPU throttling, multiple peers connected.
   - Validate that signaling and replaceTrack behave (no DUP peers, no frozen streams).
7. Ship/Docs: add usage notes to `GETTING_STARTED.md` and update `AGENTS.md` with any new commands or build steps.

Decision points and branching
- If effect is per-frame heavy (segmentation, ML), prefer Web Worker + OffscreenCanvas or server-side pre-processing.
- If browser support for WebGPU is required, gate with a feature flag and fallback to WebGL.
- If the effect changes outgoing media format (resolution/bitrate), ensure encoding/bitrate constraints are communicated to the backend/room policy.

Quality criteria / Acceptance checks
- Visual: effect runs at target framerate on test devices; transitions are smooth and non-jarring.
- Reliability: swapping streams with `replaceTrack()` works without breaking existing PeerConnections.
- Performance: CPU and memory increase are within budget; verify <10% frame drops in standard scenarios.
- Accessibility: controls to disable motion; respect prefers-reduced-motion.
- Tests: small sandbox demo + basic manual checklist (start/stop, screen share, multi-peer checks).

Agent prompts/examples
- "Create a Three.js prototype that blends a live camera stream with a particle system and returns a `canvas` element captureStream." 
- "Add a new `useVideoFX` hook that applies a gaussian blur to the outgoing track using OffscreenCanvas and exposes `startEffect()`/`stopEffect()` APIs." 
- "Instrument `app/room/[roomId]/page.tsx` to toggle the effect and fallback to original track when disabled."

Files to update when implementing
- `hooks/useWebRTC.ts` (integrate processed outgoing tracks)
- `app/room/[roomId]/page.tsx` (controls + UI)
- `components/dev-sandbox/*` (prototype samples)
- `GETTING_STARTED.md` and `AGENTS.md` (usage and agent notes)

Ambiguities / Questions for the human
- Target device priority: Desktop-first, mobile-first, or equal?
- Allowed third-party libraries (Three.js, PixiJS, TensorFlow.js)?
- Performance targets (30fps on mid-range phones? 60fps desktop?)

Related agent customizations to add next
- `create-skill:ui-performance-audit` — checklist and scripts to measure FPS, CPU per-effect.
- `create-instruction:video-fallbacks` — rules for fallback modes and bandwidth-aware quality.

Output
- The skill creates a reproducible pattern: prototype → integrate via `useVideoFX` → test (multi-peer) → document.

Try prompts
- "Run the 3D motion prototype and produce a minimal `useVideoFX` hook for this repo." 
- "Add an OffscreenCanvas-based gaussian blur effect and demonstrate `replaceTrack()` integration."

