# TSMeet — Bug ও Feature Gap List

Report date: 2026-11-04

Phase 1 progress (2026-11-09): local Safari/session/roster changes prepared; production and real iPhone verification remain pending. See [PHASE_1_SAFARI.md](PHASE_1_SAFARI.md). BUG-01–03 remain open until acceptance retests pass.

Execution plan: [BUG_FIXING_MILESTONES.md](BUG_FIXING_MILESTONES.md) — প্রতি issue-এর verify, fix, commit/deploy/retest ধাপ ও ঘণ্টাভিত্তিক estimate।

এই তালিকা ব্যবহারকারীর testing report এবং হাতে লেখা ছবির ভিত্তিতে তৈরি। সব item খোলা আছে; স্বাধীনভাবে reproduce বা root cause যাচাই করা হয়নি। নিচের expected behaviour হলো যাচাই/সমাধানের লক্ষ্য, বর্তমান implementation-এর দাবি নয়।

## Test environment

- Mobile: iPhone 14 Pro Max, Safari; iOS/Safari version উল্লেখ করা হয়নি।
- Laptop: fullscreen সমস্যা রিপোর্ট করা হয়েছে; OS, browser/version এবং fullscreen mode উল্লেখ করা হয়নি।
- ছবির ১৪টি issue-এর device/browser নির্দিষ্ট করা হয়নি; সেগুলোকে শুধু Safari issue ধরে নেওয়া যাবে না।
- ব্যবহারকারীর deployment summary অনুযায়ী: Native Ubuntu VPS, self-hosted LiveKit, 1 vCPU, 2 GB RAM, 4 GB swap; host-সহ ১০ জন configured limit। ১০ জনের stable meeting এখনো পরীক্ষিত নয়।
- একই summary অনুযায়ী TURN disabled এবং recording storage configured নয়।

## iPhone Safari — reported bugs

- [ ] **BUG-01 — Participant count ১ দেখায়**
  - Local progress (2026-11-10): authoritative signaling snapshot দিয়ে stale SFU attendee পুনরায় count হওয়া আটকানো হয়েছে; 11 session/roster regression tests pass। Original production/iPhone cause এবং real-client acceptance এখনও pending; [M02 evidence](PHASE_1_SAFARI.md#m02-follow-up--participant-count-2026-11-10)।
  - Report: একাধিক participant থাকা অবস্থায় count ১ দেখাচ্ছে বলে রিপোর্ট করা হয়েছে; পরীক্ষার প্রকৃত participant সংখ্যা নিশ্চিত করতে হবে।
  - Expected: admitted participant-দের join/leave অনুযায়ী host-সহ count সব window-তে update হবে। Waiting room-এর count আলাদা থাকবে।
  - Verify: host ও guest দিয়ে join, admit, leave এবং reconnect করে participant list ও count মিলিয়ে দেখা।

- [ ] **BUG-02 — Microphone mute/unmute কাজ করে না**
  - Local progress (2026-11-10): pending unmute-এর পরে host/session authority recheck, lost track-এর fresh-tap recovery এবং preview cleanup যোগ হয়েছে। 15 session/roster/microphone tests pass; real iPhone-to-laptop audio acceptance pending। [M03 evidence](PHASE_1_SAFARI.md#m03-follow-up--microphone-lifecycle-2026-11-10)।
  - Report: Safari-তে microphone toggle কাজ করেনি।
  - Expected: mute করলে অন্য participant আর audio শুনবেন না; unmute করলে permission থাকা সাপেক্ষে audio ফিরবে এবং icon/status মিলবে।
  - Verify: অন্য device থেকে audio শুনে পরীক্ষা; শুধু button-এর icon বদলানোকে success ধরা যাবে না।

- [ ] **BUG-03 — Automatically logged out**
  - Report: নিজে logout না করলেও session থেকে বের হয়ে যায়।
  - Expected: valid session থাকলে অপ্রত্যাশিত sign-out হবে না; session expiry হলে পরিষ্কার message থাকবে।
  - Verify: account logout, meeting disconnect এবং guest-session expiry আলাদা করে শনাক্ত করতে হবে। কতক্ষণ পরে এবং refresh/background/foreground-এর পরে হয় তা record করতে হবে।

## Laptop — reported bug

- [ ] **BUG-04 — Fullscreen করলে controls কাজ করে না**
  - Report: laptop-এ fullscreen করার পরে আর কিছু কাজ করে না।
  - Expected: microphone, camera, chat, participants, share, leave এবং exit-fullscreen controls accessible ও usable থাকবে।
  - Verify: app fullscreen button, video-tile fullscreen এবং browser fullscreen আলাদা করে পরীক্ষা; panel/modal খোলা ও fullscreen থেকে ফেরার আচরণও পরীক্ষা।

## Meeting layout ও video — handwritten report

- [ ] **BUG-05 — Gallery view / speaker view কাজ করে না**
  - Report: gallery/speaker view হয় না।
  - Expected: সমর্থিত layout সঠিকভাবে render হবে এবং view পরিবর্তন করলে participant tiles update হবে।
  - Verify: ২ বা তার বেশি participant দিয়ে view selection ও active-speaker behaviour পরীক্ষা।

- [ ] **BUG-06 — Video বারবার blink করে / stable নয়**
  - Report: video অনেক blink করে; stable থাকা প্রয়োজন।
  - Expected: camera চালু থাকলে অপ্রয়োজনীয় flicker, disappearance বা repeated tile reset হবে না।
  - Verify: local preview ও remote video আলাদা করে দেখা; join/leave, layout change এবং network-quality change-এর সময় record করা।

- [ ] **BUG-07 — Video size সঠিক নয়**
  - Report: video size is not correct।
  - Expected: tile viewport-এর মধ্যে থাকবে; aspect ratio অস্বাভাবিকভাবে stretch হবে না এবং controls/name ঢেকে যাবে না।
  - Verify: mobile portrait/landscape, laptop, pinned view ও fullscreen-এ sizing পরীক্ষা।

- [ ] **BUG-08 — Video quality খুব খারাপ**
  - Report: video quality is very poor।
  - Expected: available network/device resources অনুযায়ী quality adjust হবে এবং অবস্থার উন্নতি হলে recover করবে।
  - Verify: local ও remote quality তুলনা; resolution, bitrate, packet loss, selected video layer ও server load সংগ্রহ করা। Root cause এখনো জানা নেই।

- [ ] **BUG-09 — Self-view mirrored; পরিবর্তন প্রয়োজন**
  - Report: নিজের video mirror হয়ে দেখা যায়।
  - Classification: UX preference / behaviour clarification; self-preview mirroring নিজে থেকেই transmission bug প্রমাণ করে না।
  - Expected: intended self-view orientation নির্ধারণ করে প্রয়োজনে mirror toggle দেওয়া; remote viewer-এর image orientation আলাদা করে যাচাই করা।

- [ ] **BUG-10 — User name দেখা যায় না**
  - Report: user-এর নাম দেখা যায় না।
  - Expected: participant name video tile ও participant list-এ readable থাকবে, camera on/off উভয় অবস্থায়।
  - Verify: gallery, speaker, pinned ও fullscreen views-এ label visibility/contrast পরীক্ষা।

## Audio, chat ও sharing — handwritten report

- [ ] **BUG-11 — Chat কাজ করে না**
  - Report: chat is not working।
  - Expected: host ও admitted guest দুই দিকেই message send/receive করতে পারবেন।
  - Verify: delivery, sender name, ordering এবং reconnect-এর পর নতুন message আদান-প্রদান পরীক্ষা।

- [ ] **BUG-12 — Screen sharing সঠিকভাবে কাজ করে না**
  - Report: screen share is not perfect; নির্দিষ্ট failure detail দেওয়া হয়নি।
  - Expected: browser সমর্থন করলে share শুরু/বন্ধ হবে এবং অন্য participant content দেখতে পাবেন; unsupported হলে পরিষ্কার feedback থাকবে।
  - Verify: failureটি start, display sizing, audio, remote delivery না stop-এর সময় হচ্ছে তা আলাদা করা।

- [ ] **BUG-13 — Noise cancellation কাজ করে না**
  - Report: background noise cancellation কাজ করছে না।
  - Expected: supported browser/device-এ enabled noise suppression কার্যকর হবে; unsupported capability সম্পর্কে UI বিভ্রান্তিকর দাবি করবে না।
  - Verify: remote listener দিয়ে একই noise condition-এ পরীক্ষা; capture settings ও device/browser support যাচাই।

- [ ] **BUG-14 — Lip-sync ঠিক নেই**
  - Report: audio ও ঠোঁটের movement মেলে না।
  - Expected: remote participant-এর audio/video synchronized থাকবে।
  - Verify: clap/speech test; delay শুরু থেকেই থাকে নাকি সময়ের সঙ্গে বাড়ে, network change বা screen share-এর সঙ্গে সম্পর্ক আছে কি না record করা।

## Missing features / configuration / control visibility

- [ ] **GAP-01 — Virtual background যোগ করা যায় না**
  - Report: virtual background add করা যাচ্ছে না।
  - Known project context: virtual backgrounds implemented নয়; package থাকা feature implemented হওয়ার প্রমাণ নয়।
  - Next step: feature request হিসেবে scope নির্ধারণ; implementation হলে supported device/browser-এ background apply/remove পরীক্ষা।

- [ ] **GAP-02 — Spotlight missing**
  - Report: spotlight option নেই।
  - Next step: host-controlled spotlight প্রয়োজন কি না এবং implementation আছে কি না যাচাই। Spotlight সবার view বদলায়; নিজের tile pin করা আলাদা behaviour।

- [ ] **GAP-03 — Recording missing / unavailable**
  - Report: হাতে লেখা তালিকায় recording-ও missing বলা হয়েছে।
  - Known deployment context: recording storage configured নয়; recording আপাতত optional/deferred। এটিকে confirmed recording-code bug বলা যাচ্ছে না।
  - Next step: recording enable করার সময় Egress/storage, host control visibility, consent, start/stop এবং playback যাচাই করা।

- [ ] **GAP-04 — Co-host option missing**
  - Report: co-host option দেখা যাচ্ছে না।
  - Expected: authorized host eligible participant-এর co-host controls দেখতে ও ব্যবহার করতে পারবেন।
  - Verify: host account, অন্য admitted participant, participant menu এবং mobile/desktop control visibility পরীক্ষা; missing feature নাকি role/UI issue তা নির্ধারণ।

## Suggested triage order

1. Session/logout, mute/unmute, fullscreen controls ও participant count (BUG-01–04)।
2. Chat, video stability/quality, lip-sync এবং screen sharing।
3. Layout, video size, name visibility, noise suppression ও co-host controls।
4. Mirror preference, spotlight, virtual backgrounds; recording deployment আলাদা optional কাজ।

## Verification record

প্রতিটি item সমাধানের সময় এর নিচে লিখতে হবে:

- Device, OS ও browser version; deployed build/commit।
- Host/guest role, participant count এবং network type।
- Reproduction steps, actual বনাম expected result।
- Confirmed cause, fix এবং relevant test results।
- Retest date ও result; credentials/token/cookie values ছাড়া evidence।

Fix implement ও affected scenario retest সফল হলে তবেই `[ ]` থেকে `[x]` করতে হবে।
