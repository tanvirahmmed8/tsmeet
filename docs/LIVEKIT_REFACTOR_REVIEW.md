# TSMeet — LiveKit Integration ও Refactor Review

Review date: 2026-11-10

## সিদ্ধান্ত

TSMeet-এর কিছু custom media code LiveKit-এর existing capability-এর সঙ্গে
overlap করে। সব custom code অপ্রয়োজনীয় নয়; application policy ও media transport
আলাদা রেখে integration সরল করা সম্ভব। এটি source-level review, completed
refactor বা browser test result নয়।

Local evidence: [LiveKit hook](../hooks/useLiveKitRoom.ts),
[meeting UI](../app/room/[roomId]/page.tsx),
[network policy](../lib/mediaNetworkPolicy.ts),
[participant roster](../lib/meetingParticipants.ts),
[microphone operation guard](../lib/microphoneOperation.ts)।

## 1. যেগুলো LiveKit দিয়ে সরল করা যায়

| বর্তমান implementation | মূল্যায়ন | Refactor direction |
|---|---|---|
| Meeting UI-তে `AudioContext`, analyser ও animation loop দিয়ে active speaker নির্ধারণ | LiveKit active-speaker capability-এর সঙ্গে স্পষ্ট overlap | SDK active-speaker events থেকে identity map করা; প্রয়োজন হলে শুধু UI hold/debounce রাখা |
| `adaptiveStream: false` রেখে manual subscription ও video dimensions নির্ধারণ | Built-in adaptive stream-এর বিকল্প custom implementation | SDK-aware track rendering প্রস্তুত করে adaptive stream evaluate করা; শুধু flag পাল্টানো যথেষ্ট নয় |
| প্রতি ৫ সেকেন্ডে RTP stats পড়ে network tier নির্ধারণ ও camera `restartTrack()` | LiveKit/WebRTC congestion control-এর ওপর additional policy; পুরোটা duplication নয় | Diagnostics ও explicit low-data policy রাখা; overlapping automatic quality/capture adjustments review করে কমানো |
| Track থেকে নতুন `MediaStream` বানিয়ে video element-এর `srcObject` বসানো | Custom rendering plumbing ও lifecycle synchronization | LiveKit track `attach`/`detach` অথবা React track components evaluate করা; audio playback ownership স্পষ্ট রাখা |
| Mic/camera state ও SDK events manually sync | কিছু product-specific state দরকার; SDK state mirroring-এর অংশ কমানো সম্ভব | SDK hooks/events-কে media state-এর ভিত্তি করা; user intent ও moderation policy আলাদা রাখা |

LiveKit reference: [track rendering, active speaker ও adaptive stream](https://docs.livekit.io/transport/media/subscribe/),
[camera/microphone publishing ও mute controls](https://docs.livekit.io/transport/media/publish/)।
Implementation-এর আগে installed SDK/component version-এর API ও behaviour যাচাই
করতে হবে; public docs-এর example সরাসরি compatible ধরে নেওয়া যাবে না।

## 2. যেগুলো আমাদের application code-এই রাখতে হবে

- **Login ও session:** HttpOnly cookie, same-origin API proxy, account/guest identity।
- **Admission ও permissions:** waiting room, admit/deny, host/co-host roles এবং backend authorization।
- **Media-independent roster:** admitted participant SFU-তে connect না হলেও count/list-এ থাকবে; waiting guest ও hidden recorder count হবে না। LiveKit media roster একা এর বিকল্প নয়।
- **User preferences:** explicit low-data mode, mute/camera intent, pin/layout preference।
- **Moderation safety:** pending unmute-এর মধ্যে host mute বা leave হলে permission/session recheck। SDK mute method ব্যবহার করলেও application policy guard প্রয়োজন।
- **Recording policy:** consent, ownership, private storage, quota ও retention।
- **Scheduling ও booking:** application-specific calendar workflows।

Chat/hand raise বর্তমানে Socket.IO application events দিয়ে চলে। LiveKit-এর
অন্যান্য capability থাকলেও এই review-তে transport migration প্রয়োজনীয় বলে
নির্ধারণ করা হয়নি। Current boundary: media LiveKit, application events Socket.IO।

## 3. প্রস্তাবিত refactor order

এটি প্রস্তাব; নিচের কাজগুলো এখনো implement বা verified হয়নি।

1. **Active speaker:** custom audio analyser-এর জায়গায় LiveKit events ব্যবহার;
   local/remote identity, silence, pin ও speaker layout behaviour পরীক্ষা।
2. **Media rendering:** SDK track attachment/components ব্যবহার; stable track
   lifecycle, mute/unpublish, camera-off avatar, screen share এবং single-owner
   audio playback যাচাই।
3. **Adaptive subscriptions:** rendering integration প্রস্তুত হলে adaptive stream
   enable/evaluate; conflicting manual dimensions/subscriptions সরল করা।
   Hidden tiles, pinned speaker, screen-share priority ও low-data limits বজায় রাখা।
4. **Quality policy cleanup:** measured behaviour অনুযায়ী redundant polling ও
   automatic camera restarts কমানো; diagnostics ও explicit user controls রাখা।

Custom policy এবং adaptive stream একই track-এর quality/subscription নিয়ে
পরস্পরবিরোধী সিদ্ধান্ত নেবে না—প্রতি সিদ্ধান্তের একটিমাত্র owner নির্ধারণ করতে হবে।

## 4. আগের bug fixes-এর সঙ্গে সম্পর্ক

[M01–M03](BUG_FIXING_MILESTONES.md)-এর সব fix বাদ দেওয়া যাবে না। Cookie identity
recovery, authoritative admitted roster ও microphone permission/session guards
application-level requirements। Refactor-এর সময় এগুলোর tests ও behaviour
preserve করতে হবে।

Custom media plumbing ছোট হলে maintenance ও synchronization সমস্যা কমতে পারে;
এটি original Safari bug-এর root cause বা guaranteed resolution-এর প্রমাণ নয়।
বর্তমান verification status: [Phase 1 evidence](PHASE_1_SAFARI.md)।

## 5. Acceptance ও release gate

- Repository checks: `pnpm check`; existing regression coverage preserve/update।
- দুই/তিন client-এ admitted count, leave/remove/reconnect, camera/mic-off behaviour।
- Real iPhone Safari থেকে laptop listener-এ actual mute/unmute audio test;
  background/foreground, permission denial/retry ও host-mute race।
- Active-speaker changes, gallery/pin, screen sharing ও visible/hidden tile quality।
- Audio যেন duplicate না বাজে; autoplay restriction হলে actionable feedback।
- Network variation-এ quality recovery, bandwidth ও camera flicker তুলনা;
  শুধু code কমেছে বলে performance improvement দাবি নয়।
- Manual commit, frontend rebuild/deployment ও real-device retest ছাড়া milestone
  complete নয়। Verified deployment layout ব্যবহার করতে হবে; database/storage
  volume বা secrets পরিবর্তন এই refactor-এর অংশ নয়।

এই document তৈরি করতে application behaviour পরিবর্তন করা হয়নি। বিস্তারিত
runtime boundaries: [ARCHITECTURE.md](../ARCHITECTURE.md)।
