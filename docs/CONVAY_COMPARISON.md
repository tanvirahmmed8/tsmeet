# Convay বনাম TSMeet — Features ও Product Gap Analysis

Research date: **2026-11-05**

এই তুলনা Convay-এর public product pages এবং TSMeet-এর বর্তমান local source code/docs পড়ে তৈরি। Convay-এর logged-in app, paid plan, source code বা infrastructure পরীক্ষা করা হয়নি। এখানে reverse engineering বলতে public product-এর capabilities ও workflows বিশ্লেষণ বোঝানো হয়েছে; internal implementation নিশ্চিত করা হয়নি।

## কীভাবে status পড়বেন

- **আমাদের আছে:** local source-এ implementation আছে; production/browser test passed হওয়ার নিশ্চয়তা নয়।
- **আংশিক / optional:** কিছু implementation আছে, অথবা service configuration/device support লাগে।
- **আমাদের নেই:** reviewed source-এ ব্যবহারযোগ্য matching workflow পাওয়া যায়নি। SDK/package capability-কে application feature ধরা হয়নি।
- **Convay দাবি করে:** official public page-এ feature লেখা আছে; স্বাধীন functional/security/load test করা হয়নি। Plan availability আলাদা করে verify করতে হবে।
- **Convay-তে অযাচাইকৃত:** reviewed pages-এ matching detail পাওয়া যায়নি; এটি feature নেই হওয়ার প্রমাণ নয়।

TSMeet evidence: [FEATURES.md](../FEATURES.md), [API.md](../API.md), [meeting UI](../app/room/[roomId]/page.tsx), [LiveKit hook](../hooks/useLiveKitRoom.ts), [backend handlers](../server/index.ts), [calendar service](../server/services/calendarService.ts), [recording routes](../server/routes/recordings.ts)।

## 1. আমাদের আছে — Convay-এর সঙ্গেও মিল আছে

### Meeting ও moderation

| Feature | TSMeet-এর অবস্থা | Convay public evidence |
|---|---|---|
| Browser থেকে video/audio meeting | Code আছে; দুইজনের production call সফল বলে user report | Browser join ও HD audio/video দাবি: [Video conferencing](https://convay.com/product/video-conferencing/) |
| Meeting dashboard ও shareable link | আছে | Dashboard ও meeting links দাবি: [Video conferencing](https://convay.com/product/video-conferencing/) |
| Waiting room / admit / deny | আছে | Lobby/waiting room দাবি: [Video conferencing](https://convay.com/product/video-conferencing/) |
| Co-host ও meeting roles | আছে; control visibility bug report আছে | Co-host/moderator ও role control দাবি: [Video conferencing](https://convay.com/product/video-conferencing/) |
| Mute/remove ও meeting lock | আছে | Admin moderation ও meeting lock দাবি: [Admin controls](https://convay.com/product/granular-admin-controls/), [Video conferencing](https://convay.com/product/video-conferencing/) |
| Screen sharing | আছে; reported reliability issue retest বাকি | Screen/app sharing দাবি: [Video conferencing](https://convay.com/product/video-conferencing/) |
| Hand raise | আছে | Hand raise/reactions দাবি: [Video conferencing](https://convay.com/product/video-conferencing/) |
| In-meeting text chat | আছে; delivery bug report আছে | Live meeting chat দাবি: [Video conferencing](https://convay.com/product/video-conferencing/) |
| Gallery view | Code আছে; layout bug report আছে | Gallery feature উল্লেখ: [Homepage](https://convay.com/) |
| দুর্বল network-এর জন্য adaptation | Adaptive subscription ও low-data mode আছে; quality bug report আছে | Low-bandwidth optimization দাবি: [Unified communications](https://convay.com/unified-communications-in-one-platform/) |

### Deployment, recording ও background — মিল আছে, parity নিশ্চিত নয়

| Feature | TSMeet-এর অবস্থা | Convay public evidence |
|---|---|---|
| নিজের server-এ hosting | Self-hosted application; user report অনুযায়ী native Ubuntu-তে চলছে | On-premise/private deployment option দাবি: [Digital sovereignty](https://convay.com/product/digital-sovereignty/) |
| Recordings ও archive | Egress/MinIO implementation optional; বর্তমান VPS-এ recording storage configured নয় | Recording দাবি: [Homepage](https://convay.com/), [Big meeting](https://convay.com/big-meeting/) |
| Audit logging | Moderation/recording actions-এর server audit আছে; enterprise immutable audit নয় | Broader audit chain দাবি: [Confidentiality chain](https://convay.com/product/the-confidentiality-chain/) |
| API integration | REST ও socket contracts আছে | API access দাবি: [Video conferencing](https://convay.com/product/video-conferencing/) |
| Virtual background / blur | বর্তমান hook-এ processor wiring আছে; browser support ও real-device success retest প্রয়োজন | Virtual background উল্লেখ: [Homepage](https://convay.com/) |

**Background নিয়ে documentation discrepancy:** [LiveKit hook](../hooks/useLiveKitRoom.ts)-এর `applyBackground()` এখন `BackgroundProcessor`, `track.setProcessor()` এবং capability check ব্যবহার করে। Meeting UI-এ blur/image controls আছে। পুরোনো [feature inventory](../FEATURES.md) ও [bug list](BUG_LIST.md)-এর “not implemented” বক্তব্য বর্তমান code-এর সঙ্গে মেলে না। এই comparison-এ code evidence অগ্রাধিকার পেয়েছে; এতে পুরোনো bug resolved ঘোষণা করা হচ্ছে না।

## 2. Convay-এর আছে বলে দাবি — আমাদের নেই

নিচের তালিকা missing product capability; এগুলো বর্তমান bug list-এর সব item-এর সমার্থক নয়।

### AI ও meeting intelligence

Convay-এর [AI Suite](https://convay.com/ai-suite/) নিচের capabilities দাবি করে। TSMeet-এ matching pipeline/workflow পাওয়া যায়নি:

- Live/post-meeting speech transcription।
- Live captions ও multilingual subtitles।
- Spoken content/chat/meeting notes translation।
- AI meeting summary ও minutes।
- Minutes/transcript review ও editing workflow।
- Action items, responsible person ও suggested deadline extraction।
- Speaker identification / speaker-tagged transcripts।
- In-person recording upload থেকে searchable transcript ও minutes।
- Dedicated AI noise cancellation। TSMeet-এর browser capture settings বা LiveKit transport থাকা এর equivalent নয়।

### Collaboration

| Convay capability | TSMeet-এ missing অংশ | Source |
|---|---|---|
| Live whiteboard ও annotation | Shared drawing/annotation workflow | [Unified communications](https://convay.com/unified-communications-in-one-platform/) |
| Breakout rooms | Host create/assign/move/return workflow | [Video conferencing](https://convay.com/product/video-conferencing/) |
| Polls ও feedback | Poll creation, voting ও results | [Video conferencing](https://convay.com/product/video-conferencing/) |
| Emoji reactions | Hand raise-এর বাইরের reaction events/UI | [Homepage](https://convay.com/) |
| Persistent team/private/group chat | Meeting শেষ হওয়ার পর searchable conversation workspace | [Integrated chat](https://convay.com/product/integrated-chat/) |
| Chat threads, mentions ও message reactions | Thread/@mention/reaction data ও UX | [Integrated chat](https://convay.com/product/integrated-chat/) |
| Chat file/media sharing | General attachment upload/download controls | [Integrated chat](https://convay.com/product/integrated-chat/) |
| Convay Drive / document management | Folder, general file search, version history, collaborative editing | [File management](https://convay.com/product/secure-file-sharing-document-management/) |

Private recording storage থাকা general team drive/file management হওয়ার সমান নয়।

### Enterprise security ও administration

| Convay capability | TSMeet-এ missing অংশ | Source |
|---|---|---|
| Enterprise SSO / LDAP / SAML | External identity provider integration | [User provisioning](https://convay.com/product/secure-user-provisioning/) |
| MFA | Additional authentication-factor verification; generic OTP UI component যথেষ্ট নয় | [User provisioning](https://convay.com/product/secure-user-provisioning/) |
| Organization/department roles | Tenant admin hierarchy ও custom permission policy; আমাদের meeting roles সীমিত | [Admin controls](https://convay.com/product/granular-admin-controls/) |
| Domain, country ও IP restrictions | Meeting-level policy enforcement; CORS বা ordinary room lock equivalent নয় | [Admin controls](https://convay.com/product/granular-admin-controls/), [Homepage](https://convay.com/) |
| Device approval ও scheduled compliance alerts | Device governance / policy report workflows | [Admin controls](https://convay.com/product/granular-admin-controls/) |
| Enterprise provisioning/deprovisioning | Organization identity lifecycle; guest retention cleanup আলাদা | [User provisioning](https://convay.com/product/secure-user-provisioning/) |
| E2EE ও AES-256 security claims | Reviewed TSMeet flow-এ application E2EE/key-distribution configuration পাওয়া যায়নি | [Encryption](https://convay.com/product/e2ee-aes-256-security/) |
| Confidentiality watermark / immutable audit | Forensic mark ও tamper-evident evidence system; existing audit rows equivalent নয় | [Confidentiality chain](https://convay.com/product/the-confidentiality-chain/) |

TSMeet-এর DTLS-SRTP transit encryption-কে server-blind E2EE বলা যাবে না। Convay-এর E2EE claim-এর scope, key handling এবং AI/server recording-এর সঙ্গে compatibility public copy থেকে independently verified নয়। Compliance marketing-কে certification proof হিসেবেও ধরা হয়নি।

### Large events, apps ও product configuration

- **Large meeting / webinar workflows:** Convay up to 10,000 participants দাবি করে। TSMeet-এর reviewed deployment/capacity evidence দিয়ে equivalent scale দাবি করা যায় না। [Big meeting](https://convay.com/big-meeting/)
- **Moderated webinar Q&A:** dedicated audience-question moderation নেই। সাধারণ text chat equivalent নয়। [Big meeting](https://convay.com/big-meeting/)
- **Social livestreaming:** meeting থেকে YouTube/Facebook multi-platform broadcast control নেই; আমাদের Egress code MP4/S3 recording করে। [Streaming](https://convay.com/product/social-media-streaming/)
- **Native mobile apps:** Convay Play Store/App Store app উল্লেখ করে; TSMeet repository-তে native iOS/Android client পাওয়া যায়নি। Responsive browser UI আলাদা। [Video conferencing](https://convay.com/product/video-conferencing/)
- **Recurring meeting management ও personal meeting identity:** Convay দাবি করে; TSMeet-এর weekly booking availability recurring meeting series-এর সমান নয়। [Video conferencing](https://convay.com/product/video-conferencing/), [Homepage](https://convay.com/)
- **Single-use meeting links:** TSMeet guest token room-bound হলেও single-use invitation redemption workflow পাওয়া যায়নি। [Video conferencing](https://convay.com/product/video-conferencing/)
- **White-label ও multi-tenant setup:** Convay configurable offering দাবি করে; source edit করে brand বদলানো full tenant branding/admin product নয়। [Video conferencing](https://convay.com/product/video-conferencing/)

## 3. আমাদের আছে — Convay-তে একই detail publicভাবে নিশ্চিত পাওয়া যায়নি

এটি “তাদের নেই” তালিকা নয়। Demo/vendor confirmation ছাড়া competitor-এর absence প্রমাণ করা সম্ভব নয়।

| TSMeet feature / control | আমাদের evidence | Convay সম্পর্কে সিদ্ধান্ত |
|---|---|---|
| Repository-level MIT license ও editable source | [LICENSE.md](../LICENSE.md) | Reviewed public product pages থেকে matching MIT/source distribution terms confirm হয়নি; on-premise ≠ open source |
| Appointment booking by calendar slug | [Public booking UI](../components/calendar/public-calendar-booking.tsx), [public routes](../server/routes/publicCalendars.ts) | Convay meeting scheduling আছে; matching public availability/slot booking detail unverified |
| Embeddable booking widget `/embed/<slug>` | [FEATURES.md](../FEATURES.md), [API.md](../API.md) | Matching embed workflow unverified |
| Personal / event / round-robin booking | [Calendar service](../server/services/calendarService.ts) | Convay-তে round-robin appointment assignment unverified |
| Per-member availability, buffers, holidays ও disabled slots | [Calendar service](../server/services/calendarService.ts) | Detailed appointment rules unverified |
| Custom booking form ও confirmation variables | [Calendar form](../components/calendar/calendar-form.tsx) | Matching schema-driven booking form unverified |
| Per-calendar concurrent overbooking protection | [Calendar service](../server/services/calendarService.ts), [ARCHITECTURE.md](../ARCHITECTURE.md) | Convay internal concurrency strategy জানা যায়নি |
| Owner-controlled MinIO/S3-compatible recording storage | [Egress service](../server/services/egress.ts) | Convay cloud/on-premise storage বলে; customer-configurable MinIO backend detail unverified |
| Pause/resume recording segments ও per-part download | [Recording routes](../server/routes/recordings.ts) | Exact segmentation/download semantics unverified |
| Configurable guest identity retention cleanup | [Guest cleanup](../server/services/guestCleanup.ts) | Matching guest-row policy unverified |
| Source-level media policy ও explicit low-data control | [Media policy](../lib/mediaNetworkPolicy.ts), [LiveKit hook](../hooks/useLiveKitRoom.ts) | Convay network optimization বলে; equivalent exposed controls/source customization unverified |

Booking reminder offsets আমাদের API ফেরত দেয়; email delivery wired নয়। `allowRescheduling` setting থাকলেও complete rescheduling flow নেই। এগুলোকে TSMeet advantage হিসেবে ধরা হয়নি। Convay API access ও on-premise hosting দাবি করে, তাই “তাদের API/self-hosting নেই” বলা ভুল হবে। [Convay video conferencing](https://convay.com/product/video-conferencing/), [Digital sovereignty](https://convay.com/product/digital-sovereignty/)

## 4. আমাদের feature আছে, কিন্তু bug/verification বাকি

Source-level availability এবং release readiness আলাদা। [BUG_LIST.md](BUG_LIST.md) ও [fix milestones](BUG_FIXING_MILESTONES.md) অনুসারে:

- Safari participant count, microphone toggle ও unexpected logout রিপোর্ট আছে।
- Laptop fullscreen controls, layouts, sizing ও name visibility রিপোর্ট আছে।
- Chat, video flicker/quality, lip-sync ও screen-share reliability retest প্রয়োজন।
- Co-host code আছে, কিন্তু reported visibility issue verify করতে হবে।
- Background processor code আছে, কিন্তু device capability ও actual effect success যাচাই হয়নি।
- Noise suppression-এর actual results অযাচাইকৃত; dedicated AI denoiser feature পাওয়া যায়নি।
- Recording code আছে, কিন্তু user-provided native VPS summary অনুযায়ী storage configured নয়।
- Host-controlled shared spotlight code পাওয়া যায়নি; personal pin আলাদা। Reviewed Convay pages থেকেও exact spotlight semantics confirm হয়নি।

এই research-এর সময় app/browser test, server commands বা bug fix চালানো হয়নি।

## 5. Capacity ও architecture comparison-এর সীমা

| বিষয় | TSMeet | Convay |
|---|---|---|
| Media implementation evidence | Self-hosted LiveKit SFU; Socket.IO application events | Public pages থেকে exact SFU/MCU, framework বা topology জানা যায়নি |
| Current native VPS | User report: 1 vCPU / 2 GB RAM; configured cap 10, 10-person stability untested | Equivalent minimum hardware বা per-meeting topology reviewed pages-এ verified নয় |
| Repository reference capacity | Docs-এ 8-vCPU reference node-এ 20 tested বলা আছে; এই review-এ test rerun হয়নি; default ceiling 50 | Up to 10,000 participant marketing claim; independent benchmark বা identical workload comparison নয় |
| API scaling | Single backend; in-memory RoomManager authority | Internal scaling/HA strategy অজানা |

Convay-এর 10,000 figure কত simultaneous camera publisher, কোন layout/bitrate, কত node এবং কোন plan—এই evidence ছাড়া TSMeet-এর 10/20/50-এর সঙ্গে সরাসরি performance ratio বানানো যাবে না। Source: [Convay Big Meeting](https://convay.com/big-meeting/); local [capacity notes](CAPACITY_AND_SCALING.md)।

## 6. Public product থেকে বোঝা যায় এমন Convay structure

এটি capability-based interpretation, vendor-এর internal architecture diagram নয়:

1. Meeting/calling layer: video/audio, waiting room, moderator roles, sharing। [Meetings](https://convay.com/product/video-conferencing/)
2. Collaboration layer: persistent chat, files, whiteboard। [Unified communications](https://convay.com/unified-communications-in-one-platform/)
3. AI layer: transcripts, subtitles, minutes, action items। [AI Suite](https://convay.com/ai-suite/)
4. Enterprise governance layer: organization permissions ও identity provisioning। [Admin](https://convay.com/product/granular-admin-controls/), [Provisioning](https://convay.com/product/secure-user-provisioning/)
5. Distribution/deployment: browser/app access, large events, on-premise offering। [Meetings](https://convay.com/product/video-conferencing/), [Sovereignty](https://convay.com/product/digital-sovereignty/)

TSMeet-এর বর্তমান differentiation হলো self-controlled source + appointment booking workflow। Convay-এর public positioning বিস্তৃত collaboration, AI এবং enterprise governance-এ। এটি reviewed evidence থেকে product interpretation; exclusivity বা quality ranking নয়।

## 7. TSMeet-এর practical next priorities

1. Existing [bug-fixing milestones](BUG_FIXING_MILESTONES.md) অনুযায়ী Safari auth/audio, fullscreen, count/chat ও media stability verify/fix/retest।
2. Supported-device capability feedback ও existing background/co-host/recording status পরিষ্কার করা।
3. তারপর প্রয়োজন অনুযায়ী reactions, polls, whiteboard, persistent chat ও breakout scope নির্ধারণ।
4. AI চাইলে self-hosted transcription দিয়ে শুরু; language accuracy, consent, storage ও extra compute budget verify করা।
5. Organization customers দরকার হলে SSO, tenant RBAC ও governance-এর আলাদা design।

এই priority list নতুন feature implementation authorization বা fixed delivery estimate নয়। Existing 1-vCPU server-এ AI/recording/10,000-participant capability ধরে নেওয়া যাবে না।

## Sources ও remaining verification

Convay claims-এর পাশে official links এবং TSMeet claims-এর পাশে repository evidence দেওয়া হয়েছে। Public pages-এ বহু feature commercial/enterprise offering হতে পারে; free plan-এ সব আছে বলা হয়নি। Vendor-এর “hacker-proof”, “zero risk” বা compliance ভাষাকে independently verified guarantee হিসেবে ব্যবহার করা হয়নি।

পরবর্তী confirmation দরকার: Convay plan matrix, actual app demo, source/license terms, booking widget/round-robin support, API docs, browser feature matrix, E2EE mode বনাম AI/recording compatibility এবং reproducible scale benchmark।
