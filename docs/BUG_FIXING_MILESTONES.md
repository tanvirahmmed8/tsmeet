# TSMeet — Bug Fixing Milestones

Created: 2026-11-04
Source: [BUG_LIST.md](BUG_LIST.md)

এটি execution plan; কোনো bug verified/fixed বা production test passed বলে দাবি করা হচ্ছে না।
১৮টি item-এর প্রতিটিতে ঠিক তিনটি tracked step থাকবে:
**Verify → Fix → Local commit + server deployment commands + retest**।

## সময়ের হিসাব ও কাজের নিয়ম

- Estimate একজন developer-এর focused engineering hours; guarantee বা calendar deadline নয়।
- প্রতিটি estimate-এ investigation, implementation, relevant automated/manual checks এবং deployment/retest সময় আছে। Step 2-এ local regression checks; Step 3-এ release ও real-device/server retest।
- Server access, iPhone/laptop tester পাওয়া, approval, download/build queue বা hardware upgrade-এর অপেক্ষা এই ঘণ্টায় ধরা নেই।
- Step 1 শেষ হলে actual cause অনুযায়ী estimate revise করতে হবে। Reproduce না হলে evidence ও `Needs evidence` status থাকবে; অনুমানভিত্তিক fix নয়।
- Valid bug না হলে Step 1-এ `Expected behaviour`, `Configuration issue`, `Unsupported browser` বা `Feature gap` লিখতে হবে। Code fix লাগবে না হলে Step 2 `N/A — reason`; Step 3-এ resolution/docs ও verification evidence থাকবে। Dummy commit প্রয়োজন নেই।
- এক milestone সম্পূর্ণ হলে পরেরটিতে যাব। Shared cause থাকলে related items এক fix-এ সমাধান করা যাবে, কিন্তু প্রতিটির acceptance test আলাদা হবে।
- Agent Git command চালাবে না; user-কে exact local commit/push এবং server commands দেবে। Server command-এর output নিয়ে পরের সিদ্ধান্ত হবে।
- Production native Ubuntu + systemd; Docker deployment commands এই plan-এর production path নয়।
- Current production summary: 1 vCPU / 2 GB RAM, host-সহ ১০ জন configured limit, TURN disabled, recording storage configured নয়। এগুলো verification-এর সময় পুনরায় confirm করতে হবে।
- সব step শুরুতে unchecked। Relevant evidence ছাড়া `[x]` হবে না; blocked/deferred item done হিসেবে mark হবে না।

## Estimate overview

ঘণ্টা (h); Step 3-এর মধ্যে local commit, deployment এবং post-deployment test অন্তর্ভুক্ত।

| Milestone | Source | কাজ | 1. Verify | 2. Fix | 3. Release + test | Total |
|---|---|---|---:|---:|---:|---:|
| M01 | BUG-03 | Unexpected logout | 2–4 h | 3–6 h | 2–3 h | 7–13 h |
| M02 | BUG-01 | Participant count | 1–2 h | 2–4 h | 1.5–2.5 h | 4.5–8.5 h |
| M03 | BUG-02 | Safari microphone mute/unmute | 2–3 h | 3–6 h | 2–3 h | 7–12 h |
| M04 | BUG-04 | Laptop fullscreen controls | 1–2 h | 2–4 h | 1.5–2.5 h | 4.5–8.5 h |
| M05 | BUG-11 | Chat delivery | 1–2 h | 2–4 h | 1.5–2.5 h | 4.5–8.5 h |
| M06 | BUG-06 | Video blinking / instability | 2–4 h | 3–6 h | 2–3 h | 7–13 h |
| M07 | BUG-08 | Poor video quality | 2–4 h | 3–6 h | 2–4 h | 7–14 h |
| M08 | BUG-14 | Lip-sync | 2–4 h | 3–6 h | 2–3 h | 7–13 h |
| M09 | BUG-12 | Screen sharing | 2–3 h | 3–5 h | 2–3 h | 7–11 h |
| M10 | BUG-05 | Gallery / speaker view | 1–2 h | 2–4 h | 1.5–2.5 h | 4.5–8.5 h |
| M11 | BUG-07 | Video sizing | 1–2 h | 2–3 h | 1–2 h | 4–7 h |
| M12 | BUG-10 | Participant names | 0.5–1 h | 1–2 h | 1–1.5 h | 2.5–4.5 h |
| M13 | BUG-13 | Noise suppression | 2–3 h | 2–4 h | 2–3 h | 6–10 h |
| M14 | GAP-04 | Co-host control visibility | 1–2 h | 2–4 h | 1.5–2.5 h | 4.5–8.5 h |
| M15 | BUG-09 | Self-view mirror preference | 0.5–1 h | 1–2 h | 1–1.5 h | 2.5–4.5 h |
| M16 | GAP-02 | Host spotlight | 1–2 h | 4–7 h | 2–3 h | 7–12 h |
| M17 | GAP-01 | Virtual backgrounds | 2–4 h | 8–16 h | 3–5 h | 13–25 h |
| M18 | GAP-03 | Recording availability (optional) | 2–3 h | 4–8 h | 2–4 h | 8–15 h |

| Scope | Estimated effort |
|---|---:|
| M01–M15: reported bugs, co-host verification, mirror preference | 79.5–144.5 h |
| M16–M17: spotlight + virtual backgrounds | 20–37 h |
| M18: optional recording | 8–15 h |
| সব ১৮টি item | **107.5–196.5 h** |

উপরের estimates মূল bug-fix baseline। নিচের LiveKit component integration-এর
জন্য shared **8–14 h** allowance একবার যোগ হবে (প্রতি milestone-এ নয়);
updated full-scope planning range **115.5–210.5 h**, ২০% buffer-সহ প্রায়
**139–253 h**। M04 verification-এ installed SDK compatibility ও prototype দেখে
allowance revise করতে হবে; এটি fixed delivery commitment নয়।
M16–M18 feature/infrastructure work; core bug-fix release-এর completion এগুলোর উপর নির্ভর করবে না।
Recording আগের সিদ্ধান্ত অনুযায়ী deferred থাকবে যতক্ষণ deployment capacity ও enablement অনুমোদিত না হয়।
Full AI noise cancellation, নতুন hardware provisioning এবং বড় architecture migration এই estimate-এর বাইরে।

## Meeting UI — LiveKit component-based implementation direction

Updated: 2026-11-10. Primary scope: **M04, M10, M11, M12**। Related rendering
checks: **M06, M08, M09**; M07-এ adaptive subscription compatibility এবং M15-এ
self-view mirror behaviour preserve করতে হবে। সব reported issue responsive/UI
cause ধরে নেওয়া যাবে না—track delivery, network ও identity mapping আলাদা verify।

- Existing custom meeting screen-এর media/rendering অংশে installed
  `@livekit/components-react`-এর compatible `RoomContext`/room provider,
  `ParticipantTile`/`VideoTrack`, `GridLayout`, focus layout ও audio renderer
  evaluate/reuse করতে হবে। Public API installed version-এ আছে কি না আগে যাচাই;
  package/lockfile upgrade প্রয়োজন হলে user approval নিতে হবে।
- TSMeet branding, responsive toolbar/sidebar, waiting-room/host/recording
  controls থাকবে custom। Ready-made meeting screen দিয়ে product policy replace
  নয়; একটি existing `Room` instance reuse, দ্বিতীয় media connection নয়।
- Shared integration **M04 Step 2**-তে শুরু হবে, M10–M12 তা reuse করবে;
  একই foundation আলাদা milestone-এ আবার implement/estimate নয়। প্রয়োজনমতো
  focused components-এ meeting UI ভাগ করা হবে, unrelated rewrite নয়।
- SDK components-এর সঙ্গে custom `srcObject` plumbing ও analyser একসঙ্গে
  duplicate playback/active-speaker ownership তৈরি করবে না। Active speaker-এর
  জন্য SDK events ব্যবহার; approved roster, host-mute/session guards বজায় রাখা।
- Component adoption alone fullscreen portal placement, CSS overflow, names,
  accessibility বা Safari behaviour ঠিক করবে—এমন দাবি নয়। Fullscreen root-এর
  মধ্যে toolbar ও portal overlays reachable রাখতে হবে; ছোট viewport/orientation
  change, sidebar-open ও keyboard/touch interactions test করতে হবে।
- Media rendering প্রস্তুত হওয়ার পরে adaptive stream evaluate করতে হবে;
  existing manual subscription/quality policy-এর সঙ্গে conflict রাখা যাবে না।
  এই UI scope দিয়ে network/server root cause resolved ঘোষণা নয়।

Shared allowance investigation, integration, regression ও deployment validation
সব মিলিয়ে একবার গণনা করা; baseline bug-specific hours-এর সঙ্গে একই কাজ
double-count নয়। M04 Step 1-এ breakdown ও revised totals লিখতে হবে।

**UI milestones-এর Step 1/Step 3 test matrix:** supported small mobile
portrait/landscape, tablet ও laptop; app/tile/browser fullscreen; sidebar
open/closed; camera/mic off, long names, screen-share focus, participant
join/leave এবং pin/hide-self। Real iPhone Safari ও laptop-এ compare করতে হবে;
চলতি configured participant limit অতিক্রম নয়। Screenshots-এর সঙ্গে actual
control interaction/audio playback ফলও record করতে হবে। `pnpm check` pass
বা SDK component ব্যবহার করা একা responsive/device acceptance নয়।

Detailed overlap/preservation rationale: [LIVEKIT_REFACTOR_REVIEW.md](LIVEKIT_REFACTOR_REVIEW.md)।
প্রতি milestone-এ আগের মতোই **তিনটি step** থাকবে। এই section নতুন completion
claim নয়; M01–M03-এর local fixes এবং pending real-device acceptance অপরিবর্তিত।

## Milestone execution checklist

### M01 — BUG-03: Unexpected logout

Status: Step 2 local fix and automated checks complete (confirmed 2026-11-10); Step 1 production/iPhone verification and Step 3 deployment/retest pending. M01 remains open. Estimate: **7–13 h**. Evidence and release instructions: [PHASE_1_SAFARI.md](PHASE_1_SAFARI.md).

- [ ] **Step 1 — Verify (2–4 h):** Safari-তে sign-in, refresh, background/foreground ও reconnect reproduce; account logout বনাম meeting disconnect আলাদা করা। Local-এ না হলে server auth response status, cookie attributes, proxy forwarding ও session expiry পরীক্ষা; token/cookie value সংগ্রহ নয়। ফলাফলে classification, reproduction steps, local/server difference ও evidence লিখতে হবে।
- [x] **Step 2 — Fix (3–6 h):** Local session/proxy fixes implemented: backend-verified cookie থেকে identity restore, valid account/same-room guest cookie preserve, verification outage-এ retry feedback এবং legitimate expiry/authorization checks বজায় রাখা। `pnpm check` passed, including 9 Safari session/roster regression tests; production/iPhone root-cause confirmation ও acceptance এখনও pending। Evidence: [PHASE_1_SAFARI.md](PHASE_1_SAFARI.md).
- [ ] **Step 3 — Local commit → server commands → retest (2–3 h):** নিচের release procedure অনুযায়ী scoped commit/push commands, প্রয়োজনীয় native server deployment/restart commands এবং rollback instructions দিতে হবে। Commit/build deployed হয়েছে confirm করে test: Valid session-এ unexpected logout নেই; expired session-এ সঠিক message; iPhone Safari ও laptop দুটোতেই পরীক্ষা। Result ও commit reference record হলে step complete।

### M02 — BUG-01: Participant count

Status: Step 2 local fix and automated checks complete (2026-11-10); original production/iPhone reproduction and deployment/retest pending. M02 remains open. Estimate: **4.5–8.5 h**. Evidence: [PHASE_1_SAFARI.md](PHASE_1_SAFARI.md#m02-follow-up--participant-count-2026-11-10).

- [ ] **Step 1 — Verify (1–2 h):** ২–৩টি client দিয়ে join/admit/leave/reconnect করে local count তুলনা। Server-only হলে Socket.IO connection, room membership, deployed build এবং backend instance count যাচাই। ফলাফলে classification, reproduction steps, local/server difference ও evidence লিখতে হবে।
- [x] **Step 2 — Fix (2–4 h):** Signaling/media roster merge বজায় রেখে authoritative server snapshot-এর পরে stale SFU entry দিয়ে departed/removed attendee পুনরায় count হওয়া আটকানো হয়েছে। Media-off admitted users ও reconnect identity deduplication বজায় আছে। `pnpm check` passed: lint (0 errors, 10 existing warnings), typecheck, existing tests, 11 Safari/session/roster tests, dependency tests এবং production build। Real-client/server acceptance এখনও pending।
- [ ] **Step 3 — Local commit → server commands → retest (1.5–2.5 h):** নিচের release procedure অনুযায়ী scoped commit/push commands, প্রয়োজনীয় native server deployment/restart commands এবং rollback instructions দিতে হবে। Commit/build deployed হয়েছে confirm করে test: সব client-এ host-সহ admitted count মেলে; waiting guest ও reconnect duplicate হিসেবে গণনা হয় না। Result ও commit reference record হলে step complete।

### M03 — BUG-02: Safari microphone mute/unmute

Status: Step 2 local lifecycle fix and automated checks complete (2026-11-10); Step 1 real iPhone/audio verification and Step 3 deployment/retest pending. M03 remains open. Estimate: **7–12 h**. Evidence: [PHASE_1_SAFARI.md](PHASE_1_SAFARI.md#m03-follow-up--microphone-lifecycle-2026-11-10).

- [ ] **Step 1 — Verify (2–3 h):** Real iPhone Safari ও laptop listener দিয়ে mute/unmute reproduce; permissions, audio track publication এবং UI state পরীক্ষা। Server logs শুধু publish/moderation mismatch হলে প্রয়োজন। ফলাফলে classification, reproduction steps, local/server difference ও evidence লিখতে হবে।
- [x] **Step 2 — Fix (3–6 h):** Local lifecycle gaps fixed: pending unmute-এর পরে host/session authority recheck ও প্রয়োজনে mute, preview publication failure cleanup, ended-track indicator এবং device-loss fresh-tap recovery। `pnpm check` passed: lint (0 errors, 10 existing warnings), typecheck, all tests including 15 Safari/session/roster/microphone tests, production build। Actual iPhone-to-laptop audio ও production acceptance এখনও pending; original report-এর root cause independently confirmed নয়।
- [ ] **Step 3 — Local commit → server commands → retest (2–3 h):** নিচের release procedure অনুযায়ী scoped commit/push commands, প্রয়োজনীয় native server deployment/restart commands এবং rollback instructions দিতে হবে। Commit/build deployed হয়েছে confirm করে test: অন্য device-এ muted audio শোনা যায় না; unmute-এ ফেরে; repeated toggle ও background থেকে ফিরে পরীক্ষা। Result ও commit reference record হলে step complete।

### M04 — BUG-04: Laptop fullscreen controls

Status: Not started. Estimate: **4.5–8.5 h**.

- [ ] **Step 1 — Verify (1–2 h):** App, tile ও browser fullscreen আলাদা করে local reproduce; fullscreen element, dialog/menu placement ও pointer/focus পরীক্ষা। Server check কেবল deployed build আলাদা হলে। ফলাফলে classification, reproduction steps, local/server difference ও evidence লিখতে হবে।
- [ ] **Step 2 — Fix (2–4 h + shared integration allowance-এর প্রযোজ্য অংশ):** Verified fullscreen fault fix-এর সঙ্গে shared LiveKit component foundation শুরু: existing Room instance provider/context-এ expose, SDK-compatible track/audio rendering prototype এবং TSMeet toolbar/sidebar integration। Fullscreen root ও dialog/menu portal container, focus/exit controls ঠিক করা; double connection/audio নয়। M10–M12 reuse করবে। Relevant regression test ও `pnpm check` চালিয়ে result লিখতে হবে।
- [ ] **Step 3 — Local commit → server commands → retest (1.5–2.5 h):** নিচের release procedure অনুযায়ী scoped commit/push commands, প্রয়োজনীয় native server deployment/restart commands এবং rollback instructions দিতে হবে। Commit/build deployed হয়েছে confirm করে test: Fullscreen-এর ভিতর mic/camera, chat, participant panel, share, leave এবং exit controls কাজ করে। Result ও commit reference record হলে step complete।

### M05 — BUG-11: Chat delivery

Status: Not started. Estimate: **4.5–8.5 h**.

- [ ] **Step 1 — Verify (1–2 h):** Host ও guest দুই দিকের local delivery পরীক্ষা; server-only হলে socket authorization, room membership, event delivery ও reconnect পরীক্ষা। ফলাফলে classification, reproduction steps, local/server difference ও evidence লিখতে হবে।
- [ ] **Step 2 — Fix (2–4 h):** Confirmed event/state/rendering issue fix; sender identity ও room authorization বজায় রাখা। Relevant regression test ও local checks চালিয়ে result লিখতে হবে।
- [ ] **Step 3 — Local commit → server commands → retest (1.5–2.5 h):** নিচের release procedure অনুযায়ী scoped commit/push commands, প্রয়োজনীয় native server deployment/restart commands এবং rollback instructions দিতে হবে। Commit/build deployed হয়েছে confirm করে test: দুই দিকেই message যায়; duplicate নেই; reconnect-এর পরে নতুন message যায় এবং sender readable। Result ও commit reference record হলে step complete।

### M06 — BUG-06: Video blinking / instability

Status: Not started. Estimate: **7–13 h**.

- [ ] **Step 1 — Verify (2–4 h):** Local/remote feed আলাদা করে join/leave, layout switch ও quality change record। Server-only হলে LiveKit reconnect/track events ও browser WebRTC stats তুলনা। ফলাফলে classification, reproduction steps, local/server difference ও evidence লিখতে হবে।
- [ ] **Step 2 — Fix (3–6 h):** Shared LiveKit rendering foundation ব্যবহার করে confirmed unnecessary remount, resubscription বা track replacement ঠিক করা; stable track keys ও attach/detach lifecycle বজায় রাখা। Custom MediaStream recreation ও SDK rendering একসঙ্গে চালানো নয়। Network/capture cause হলে আলাদা fix; component migration দিয়ে resolved দাবি নয়। Relevant regression test ও local checks চালিয়ে result লিখতে হবে।
- [ ] **Step 3 — Local commit → server commands → retest (2–3 h):** নিচের release procedure অনুযায়ী scoped commit/push commands, প্রয়োজনীয় native server deployment/restart commands এবং rollback instructions দিতে হবে। Commit/build deployed হয়েছে confirm করে test: বারবার tile reset/blink নেই; ৩০ মিনিটের call-এ layout ও participant changes-এর পর video stable। Result ও commit reference record হলে step complete।

### M07 — BUG-08: Poor video quality

Status: Not started. Estimate: **7–14 h**.

- [ ] **Step 1 — Verify (2–4 h):** Resolution, bitrate, loss, selected layer ও CPU/network সংগ্রহ; local বনাম production, Wi-Fi বনাম mobile data তুলনা। VPS-এ read-only resource/network checks প্রয়োজন। ফলাফলে classification, reproduction steps, local/server difference ও evidence লিখতে হবে।
- [ ] **Step 2 — Fix (3–6 h):** Evidence অনুযায়ী subscription/quality recovery/capture policy fix; server/network configuration cause হলে নির্দিষ্ট change plan। Hardware capacity সীমা হলে তা document করা। Relevant regression test ও local checks চালিয়ে result লিখতে হবে।
- [ ] **Step 3 — Local commit → server commands → retest (2–4 h):** নিচের release procedure অনুযায়ী scoped commit/push commands, প্রয়োজনীয় native server deployment/restart commands এবং rollback instructions দিতে হবে। Commit/build deployed হয়েছে confirm করে test: ভালো network-এ quality recover করে; low network-এ audio usable; ৪→৬→১০ participant progressive test-এর actual results লেখা, capacity দাবি নয়। Result ও commit reference record হলে step complete।

### M08 — BUG-14: Lip-sync

Status: Not started. Estimate: **7–13 h**.

- [ ] **Step 1 — Verify (2–4 h):** দুই device দিয়ে clap/speech test; time drift ও screen-share impact record। Browser stats এবং প্রয়োজন হলে LiveKit/server CPU/network correlate। ফলাফলে classification, reproduction steps, local/server difference ও evidence লিখতে হবে।
- [ ] **Step 2 — Fix (3–6 h):** Shared SDK track/audio renderer দিয়ে confirmed attachment/lifecycle fault fix; remote audio-এর একটিমাত্র playback owner এবং camera/screen audio separation যাচাই। Buffering/network cause আলাদা তদন্ত; arbitrary fixed delay দিয়ে কারণ ঢেকে রাখা নয়। Relevant regression test ও local checks চালিয়ে result লিখতে হবে।
- [ ] **Step 3 — Local commit → server commands → retest (2–3 h):** নিচের release procedure অনুযায়ী scoped commit/push commands, প্রয়োজনীয় native server deployment/restart commands এবং rollback instructions দিতে হবে। Commit/build deployed হয়েছে confirm করে test: Start ও ৩০ মিনিট পরে noticeable drift নেই; camera toggle, reconnect ও share-এর পরে sync যাচাই। Result ও commit reference record হলে step complete।

### M09 — BUG-12: Screen sharing

Status: Not started. Estimate: **7–11 h**.

- [ ] **Step 1 — Verify (2–3 h):** Failureটি start, remote display, sizing, audio না stop—প্রথমে isolate। Target browser capability local-এ verify; server check শুধু track delivery failure হলে। ফলাফলে classification, reproduction steps, local/server difference ও evidence লিখতে হবে।
- [ ] **Step 2 — Fix (3–5 h):** Supported flow-এর confirmed bug fix; screen-share track shared LiveKit focus rendering-এ দেখানো, content-fit/contain sizing ও camera filmstrip responsive রাখা। Capture permission/audio support SDK component দিয়ে বাড়বে না—unsupported capability-তে পরিষ্কার feedback। Relevant regression test ও local checks চালিয়ে result লিখতে হবে।
- [ ] **Step 3 — Local commit → server commands → retest (2–3 h):** নিচের release procedure অনুযায়ী scoped commit/push commands, প্রয়োজনীয় native server deployment/restart commands এবং rollback instructions দিতে হবে। Commit/build deployed হয়েছে confirm করে test: Laptop share start/stop ও remote reception কাজ করে; iPhone receiver পরীক্ষা; source browser সমর্থন অনুযায়ী audio যাচাই। Result ও commit reference record হলে step complete।

### M10 — BUG-05: Gallery / speaker view

Status: Not started. Estimate: **4.5–8.5 h**.

- [ ] **Step 1 — Verify (1–2 h):** Multiple participant ও speaker change দিয়ে local layout test। Existing control অনুপস্থিত নাকি runtime bug তা যাচাই; production build mismatch হলে server check। ফলাফলে classification, reproduction steps, local/server difference ও evidence লিখতে হবে।
- [ ] **Step 2 — Fix (2–4 h):** M04-এর shared foundation reuse করে compatible LiveKit grid/focus layout ও track hooks দিয়ে gallery/speaker view তৈরি; custom AudioContext analyser-এর বদলে SDK active-speaker events map করা। TSMeet layout selection, pin/hide-self ও screen-share priority বজায় রাখা; admitted media-off user-এর placeholder দেখানো। Missing behaviour feature scope হিসেবে record; relevant regression test ও local checks চালিয়ে result লিখতে হবে।
- [ ] **Step 3 — Local commit → server commands → retest (1.5–2.5 h):** নিচের release procedure অনুযায়ী scoped commit/push commands, প্রয়োজনীয় native server deployment/restart commands এবং rollback instructions দিতে হবে। Commit/build deployed হয়েছে confirm করে test: Gallery ও speaker view সঠিকভাবে বদলায়; pin/hide-self এবং participant leave-এর পর layout সঠিক। Result ও commit reference record হলে step complete।

### M11 — BUG-07: Video sizing

Status: Not started. Estimate: **4–7 h**.

- [ ] **Step 1 — Verify (1–2 h):** Mobile portrait/landscape, laptop ও fullscreen-এ tile size/aspect ratio reproduce; সাধারণত local UI check যথেষ্ট। ফলাফলে classification, reproduction steps, local/server difference ও evidence লিখতে হবে।
- [ ] **Step 2 — Fix (2–3 h):** Shared LiveKit tiles/layout reuse করে viewport-height, min-size, aspect ratio, paging/overflow ও sidebar-open sizing ঠিক করা। Camera framing ও screen content-fit আলাদা; toolbar safe-area, portrait/landscape ও fullscreen-এ visible থাকবে। Adaptive rendering integration-এর dimensions/subscription ownership পরীক্ষা; relevant regression test ও local checks চালিয়ে result লিখতে হবে।
- [ ] **Step 3 — Local commit → server commands → retest (1–2 h):** নিচের release procedure অনুযায়ী scoped commit/push commands, প্রয়োজনীয় native server deployment/restart commands এবং rollback instructions দিতে হবে। Commit/build deployed হয়েছে confirm করে test: Stretch/overflow নেই; supported viewport-এ names ও controls visible; orientation switch ঠিক থাকে। Result ও commit reference record হলে step complete।

### M12 — BUG-10: Participant names

Status: Not started. Estimate: **2.5–4.5 h**.

- [ ] **Step 1 — Verify (0.5–1 h):** Name data আছে কিন্তু label hidden, নাকি data missing—local test। Missing identity/event হলে backend/proxy trace প্রয়োজন। ফলাফলে classification, reproduction steps, local/server difference ও evidence লিখতে হবে।
- [ ] **Step 2 — Fix (1–2 h):** Shared LiveKit ParticipantTile/name component বা compatible custom overlay ব্যবহার; approved roster-এর userId ↔ media identity mapping, name fallback ও camera-off placeholder বজায় রাখা। Theme contrast, long Bengali/English names, truncation/accessibility এবং controls-এর সঙ্গে overlap fix। Missing backend identity component দিয়ে তৈরি নয়; relevant regression test ও local checks চালিয়ে result লিখতে হবে।
- [ ] **Step 3 — Local commit → server commands → retest (1–1.5 h):** নিচের release procedure অনুযায়ী scoped commit/push commands, প্রয়োজনীয় native server deployment/restart commands এবং rollback instructions দিতে হবে। Commit/build deployed হয়েছে confirm করে test: Host/guest নাম camera on/off, gallery, speaker, pinned ও fullscreen-এ readable। Result ও commit reference record হলে step complete।

### M13 — BUG-13: Noise suppression

Status: Not started. Estimate: **6–10 h**.

- [ ] **Step 1 — Verify (2–3 h):** Real Safari ও laptop-এ supported capture constraints/settings ও remote-listener A/B test। Browser limitation হলে bug হিসেবে misclassify নয়; server check শুধু relay/processing evidence থাকলে। ফলাফলে classification, reproduction steps, local/server difference ও evidence লিখতে হবে।
- [ ] **Step 2 — Fix (2–4 h):** Supported suppression settings ও UI mismatch fix; unsupported capability document। Custom AI denoiser এই estimate-এর বাইরে। Relevant regression test ও local checks চালিয়ে result লিখতে হবে।
- [ ] **Step 3 — Local commit → server commands → retest (2–3 h):** নিচের release procedure অনুযায়ী scoped commit/push commands, প্রয়োজনীয় native server deployment/restart commands এবং rollback instructions দিতে হবে। Commit/build deployed হয়েছে confirm করে test: একই noise condition-এ support অনুযায়ী improvement যাচাই; speech ক্ষতিগ্রস্ত নয়; unsupported device-এ misleading control নেই। Result ও commit reference record হলে step complete।

### M14 — GAP-04: Co-host control visibility

Status: Not started. Estimate: **4.5–8.5 h**.

- [ ] **Step 1 — Verify (1–2 h):** Host + eligible admitted user দিয়ে local menu ও permissions verify; server-only হলে persisted role/authorization এবং deployed version পরীক্ষা। ফলাফলে classification, reproduction steps, local/server difference ও evidence লিখতে হবে।
- [ ] **Step 2 — Fix (2–4 h):** Confirmed role/UI bug fix; backend authoritative permissions বজায় রাখা। Relevant regression test ও local checks চালিয়ে result লিখতে হবে।
- [ ] **Step 3 — Local commit → server commands → retest (1.5–2.5 h):** নিচের release procedure অনুযায়ী scoped commit/push commands, প্রয়োজনীয় native server deployment/restart commands এবং rollback instructions দিতে হবে। Commit/build deployed হয়েছে confirm করে test: Host co-host assign/remove করতে পারেন; co-host permissions কাজ করে; সাধারণ guest unauthorized action করতে পারেন না। Result ও commit reference record হলে step complete।

### M15 — BUG-09: Self-view mirror preference

Status: Not started. Estimate: **2.5–4.5 h**.

- [ ] **Step 1 — Verify (0.5–1 h):** Local preview ও remote view text/orientation তুলনা; expected mirror preference নির্ধারণ। Server check সাধারণত দরকার নেই। ফলাফলে classification, reproduction steps, local/server difference ও evidence লিখতে হবে।
- [ ] **Step 2 — Fix (1–2 h):** প্রয়োজনীয় self-preview mirror toggle/behaviour implement; transmitted camera বা shared text অনিচ্ছাকৃতভাবে mirror নয়। Relevant regression test ও local checks চালিয়ে result লিখতে হবে।
- [ ] **Step 3 — Local commit → server commands → retest (1–1.5 h):** নিচের release procedure অনুযায়ী scoped commit/push commands, প্রয়োজনীয় native server deployment/restart commands এবং rollback instructions দিতে হবে। Commit/build deployed হয়েছে confirm করে test: Self-view setting কাজ করে; remote viewer ও screen-share text orientation অপরিবর্তিত/সঠিক। Result ও commit reference record হলে step complete।

### M16 — GAP-02: Host spotlight

Status: Not started. Estimate: **7–12 h**.

- [ ] **Step 1 — Verify (1–2 h):** Existing pin বনাম shared spotlight code/behaviour যাচাই। Host-controlled shared view না থাকলে missing feature হিসেবে scope; server role/event design review প্রয়োজন। ফলাফলে classification, reproduction steps, local/server difference ও evidence লিখতে হবে।
- [ ] **Step 2 — Fix (4–7 h):** Authorized host spotlight set/clear, participant leave ও late join state implement; socket contract বদলালে API.md update। Relevant regression test ও local checks চালিয়ে result লিখতে হবে।
- [ ] **Step 3 — Local commit → server commands → retest (2–3 h):** নিচের release procedure অনুযায়ী scoped commit/push commands, প্রয়োজনীয় native server deployment/restart commands এবং rollback instructions দিতে হবে। Commit/build deployed হয়েছে confirm করে test: সব participant spotlight দেখেন; pin থেকে আলাদা; guest privilege escalation নেই; spotlighted user leave ও late join handled। Result ও commit reference record হলে step complete।

### M17 — GAP-01: Virtual backgrounds

Status: Not started. Estimate: **13–25 h**.

- [ ] **Step 1 — Verify (2–4 h):** বর্তমানে unimplemented feature হিসেবে baseline confirm; supported browser/device, processor compatibility ও performance prototype; Safari fallback ঠিক করা। ফলাফলে classification, reproduction steps, local/server difference ও evidence লিখতে হবে।
- [ ] **Step 2 — Fix (8–16 h):** Agreed supported devices-এর জন্য blur/image background, remove/reset ও processor cleanup implement; unsupported device feedback। Relevant regression test ও local checks চালিয়ে result লিখতে হবে।
- [ ] **Step 3 — Local commit → server commands → retest (3–5 h):** নিচের release procedure অনুযায়ী scoped commit/push commands, প্রয়োজনীয় native server deployment/restart commands এবং rollback instructions দিতে হবে। Commit/build deployed হয়েছে confirm করে test: Camera toggle, switching, reconnect ও দীর্ঘ call-এ processing ঠিক; real iPhone Safari support/performance test; limitations documented। Result ও commit reference record হলে step complete।

### M18 — GAP-03: Recording availability (optional)

Status: Not started. Estimate: **8–15 h**.

- [ ] **Step 1 — Verify (2–3 h):** Reported storage/Egress absence verify; host UI বনাম unavailable infrastructure আলাদা করা। Server resources, service configuration ও private storage checks প্রয়োজন। ফলাফলে classification, reproduction steps, local/server difference ও evidence লিখতে হবে।
- [ ] **Step 2 — Fix (4–8 h):** Capacity/enablement সিদ্ধান্ত হলে Egress + private storage configure; confirmed code bugs fix; consent/ownership/retention বজায় রাখা। Relevant regression test ও local checks চালিয়ে result লিখতে হবে।
- [ ] **Step 3 — Local commit → server commands → retest (2–4 h):** নিচের release procedure অনুযায়ী scoped commit/push commands, প্রয়োজনীয় native server deployment/restart commands এবং rollback instructions দিতে হবে। Commit/build deployed হয়েছে confirm করে test: Start/stop, agreed lifecycle controls, artifact playback/download, ownership ও consent পরীক্ষা; failed jobs/storage errors visible। Result ও commit reference record হলে step complete।

## Step 1: server checks কখন প্রয়োজন

Local-এ reproduce হলে প্রথমে code/browser evidence নিয়ে কাজ করা হবে। শুধু production-এ হলে
deployed commit, service state, proxy/auth এবং media stats তুলনা করতে হবে।
Localhost media permission বা desktop browser pass করলেই real iPhone Safari pass ধরা যাবে না।

User প্রয়োজন অনুযায়ী server-এ এই read-only commands চালাবেন:

```bash
cd /opt/tsmeet
git status --short
git rev-parse HEAD
systemctl is-active nginx mysql redis-server livekit tsmeet-backend tsmeet-frontend
systemctl show tsmeet-backend tsmeet-frontend -p User -p WorkingDirectory -p ExecStart
sudo journalctl -u tsmeet-backend -u livekit --since "15 minutes ago" --no-pager -n 150
free -h
df -h
uptime
```

Commands প্রয়োজন অনুযায়ী নির্বাচন করতে হবে; প্রতিটি bug-এর জন্য সব logs দরকার নেই।
Output share করার আগে credentials, cookies, tokens এবং participant private data redact করতে হবে।
Environment files বা `systemctl show ... -p Environment` output share নয়।
Service name/paths উপরের deployment summary থেকে নেওয়া; পরিবর্তিত হলে আগে verify।

## Step 2: local fix ও acceptance gate

Code change হলে repository-required checks:

```powershell
pnpm.cmd lint
pnpm.cmd typecheck
pnpm.cmd test
pnpm.cmd build
```

Root ও server dependencies আগে install থাকতে হবে। Lockfile regeneration লাগলে আগে user-এর অনুমতি নিতে হবে।
Checks fail করলে কারণ ও remediation লিখতে হবে; pass বলা যাবে না।
Docs/config-only resolution হলে applicable validation লিখতে হবে; application test না চালালে তা স্পষ্ট উল্লেখ।

- REST/socket contract বদলালে [API.md](../API.md) update।
- Configuration বদলালে relevant `.env.example` update।
- User-visible behaviour বদলালে [FEATURES.md](../FEATURES.md) ও প্রয়োজনমতো [USER_GUIDE.md](USER_GUIDE.md) update।
- Browser auth, server-authoritative roles, recording consent ও private storage rules বজায় রাখা।

## Step 3: local commit, server deployment ও retest

প্রতিটি milestone-এ নিচের sequence অনুসরণ করতে হবে। Commands তখনকার verified change অনুযায়ী
সুনির্দিষ্টভাবে দিতে হবে; নিচের placeholder-গুলো হুবহু paste করার commands নয়।

**Local — user runs manually:**

```powershell
git status --short
git diff --check
git diff -- <changed-file-paths>
git add -- <only-this-milestone-files>
git diff --cached --stat
git diff --cached
git commit -m "fix: <issue-id-and-description>"
git push origin <working-branch>
```

আগে থেকেই staged থাকা unrelated changes review করতে হবে। PR/branch workflow হলে approved
commit production branch-এ যাওয়ার পরে server update; push হলেই deployed হয়েছে ধরে নেওয়া নয়।

**Native server — user runs after the deployment plan is reviewed:**

```bash
cd /opt/tsmeet
git status --short
git rev-parse HEAD
git pull --ff-only origin <deployment-branch>
git rev-parse HEAD
```

Working tree dirty বা branch/history mismatch হলে stop করে reconcile; production edits overwrite নয়।
আগের commit ও প্রয়োজনীয় config/database backup rollback reference হিসেবে রাখতে হবে।
Deployment active meeting interrupt করতে পারে, তাই maintenance window-তে restart।

| Change | Server action to include in that milestone |
|---|---|
| Frontend UI, hook, Next API proxy বা public build-time config | Verify service user/ExecStart; appropriate frozen dependency install, production build, standalone assets preparation if that is the service layout, then restart `tsmeet-frontend` |
| Backend REST/Socket.IO/service logic | Install dependencies if changed using the deployment's existing lockfile/package manager; restart `tsmeet-backend`; verify auth/room events |
| LiveKit configuration | Back up and validate targeted YAML change; keep UDP mux; restart `livekit` during maintenance and reconnect test |
| Nginx routing | Validate with `sudo nginx -t`; only if successful, `sudo systemctl reload nginx`; verify HTTP and WebSocket paths |
| Database migration | Back up first; review migration/recovery plan; backend startup can migrate schema, so code-only rollback may be insufficient |
| Documentation-only | No application restart; verify updated document links/content |
| Recording infrastructure | Only after M18 enablement decision; provide separately verified worker/storage setup, access and resource checks |

Frontend service may use a prepared standalone directory; blindly running `pnpm build` + restart
is insufficient until its actual `ExecStart` and static asset locations are confirmed.
For each code/config milestone deliver **exact runnable commands** after that inspection.
Use the installed service user and existing environment loading; no production source editing.
Do not delete database/storage volumes or regenerate secrets as a deployment shortcut.

After applicable restart:

```bash
systemctl is-active tsmeet-frontend tsmeet-backend livekit
sudo journalctl -u tsmeet-frontend -u tsmeet-backend --since "5 minutes ago" --no-pager -n 100
```

Then verify health at the route confirmed from the application/proxy configuration, deployed commit,
and the milestone's acceptance test on real devices. Service `active` or HTTP 200 alone is insufficient.
Failed retest means milestone remains open; provide a rollback to the verified previous release/config
using the same build/restart process, including database compatibility where relevant.

## Evidence to record under each milestone

This is a record template, not a fourth tracked step.

```text
Classification:
Reproduction / device + OS + browser:
Local result:
Server commands and relevant sanitized result:
Confirmed cause:
Files / config changed:
Local checks and results:
Commit / deployed build:
Server deployment commands supplied and executed:
Post-deployment acceptance result:
Rollback reference:
Actual hours: Verify __ / Fix __ / Release+test __
Status: Not started / Investigating / Fixing / Awaiting deployment / Retest failed / Done / Deferred / N/A
```

শেষে related [BUG_LIST.md](BUG_LIST.md) item update করতে হবে। Expected behaviour বা unsupported
capability হলে resolution reason লিখতে হবে; implemented fix বলে mark করা যাবে না।

