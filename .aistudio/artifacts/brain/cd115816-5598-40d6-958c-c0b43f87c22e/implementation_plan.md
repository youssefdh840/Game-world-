# Security Audit & Vulnerability Hardening Plan

Comprehensive security review and multi-layer hardening across Firestore security rules, environment variable configurations, and client-side input sanitization to eliminate cheating, unauthorized data tampering, key exposure, and XSS injection vectors.

### User Review & Critical Decisions

> [!IMPORTANT]
> The security hardening follows the principle of defense-in-depth: strict database access control rules on the backend, environment variable abstraction, and zero-trust input sanitization on the client.

- **Confirmed Decision (Firestore Access & Cheat Prevention)**: Enforce authenticated writes (`request.auth != null`) for user profiles, game rooms, matchmaking queues, and scores. Prevent users from escalating privileges (setting `role: 'admin'`), forging other players' scores, or rewriting finished matches.
- **Confirmed Decision (Input Sanitization & XSS Defense)**: Implement strict HTML escaping, length bounding, and protocol validation for usernames, chat messages, and avatar URLs. Only secure `https://` URLs and safe image data URIs are permitted for avatars, blocking `javascript:` and dangerous pseudo-protocols.
- **Confirmed Decision (Environment Variables & Key Protection)**: Abstract all Firebase configuration parameters into environment variables (`.env.example` / `import.meta.env`), remove legacy hardcoded keys from codebase source files, and maintain fallback resilience.

---

### 1. Overview & Core Concept

- **What It Does**: Hardens the entire application against unauthorized database mutations, game score spoofing, credential exposure, and cross-site scripting (XSS) attacks.
- **Target Audience / Persona**: All global players, guest explorers, and administrators using Mapia.
- **Key Value**: Guarantees fair competitive integrity in 1v1 duels and leaderboards, secures user profile data, and protects client environments from malicious script execution.

---

### 2. User Experience & Visual Design

- **Key User Flows**:
  - **Profile Editing**: When entering a custom avatar URL or editing username/bio, real-time sanitization and protocol checks immediately catch and warn about invalid/unsafe formats without breaking layout.
  - **In-Game Chat**: Messages are cleanly sanitized against script tags and malformed characters while preserving valid international Unicode text and emojis.
  - **Matchmaking & Game Arena**: Players experience seamless real-time duels where scores sync legitimately through authorized player permissions.
- **Visual Identity & Theme**:
  - Maintained the sleek Nordic Atlas indie game visual identity (`#0B0F19` deep oceanic canvas, slate surfaces, sharp cyan/amber accents).
  - Validation feedback toasts and error messages adhere to clean, border-accented containers (`border-rose-500/40 text-rose-200`) with smooth fade-in animations.

---

### 3. Key Product Decisions & Trade-Offs

- **Decision 1: Granular Role & Field Locking in Firestore Rules**:
  - *Chosen Approach*: Specifically lock `uid`, `role`, `createdAt`, and `email` from being arbitrarily updated by users. Separate host and guest score updates in `gameRooms/{roomId}` so a player cannot artificially increase or decrease their opponent's score.
  - *Why*: In 1v1 multiplayer games, without field-level mutation boundaries in security rules, a rogue client could easily set `guestScore: 0` or `hostScore: 9999` directly via Firestore SDK.
  - *Alternatives Considered*: Server-authoritative Cloud Functions only. Rejected because AI Studio runtime runs directly with Firebase Client SDK and Firestore real-time listeners; robust rules provide near-instantaneous validation with zero additional server overhead.
- **Decision 2: Avatar URL Protocol Whitelist**:
  - *Chosen Approach*: Only accept URLs starting with `https://` or safe image data URIs (`data:image/png;base64,`, etc.), with max string length bounds.
  - *Why*: Prevents malicious users from embedding `javascript:...` pseudo-protocols or triggering mixed-content HTTP requests.
- **Decision 3: Environment Variable Abstraction with Safe Fallback**:
  - *Chosen Approach*: Read configuration via `import.meta.env.VITE_FIREBASE_*` while safely falling back to `firebase-applet-config.json` if environment variables are not set. Remove all legacy hardcoded strings in code.
  - *Why*: Meets production standards for Twelve-Factor apps without breaking existing AI Studio preview deployments.

---

### 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────────────────────┐
│                        MAPIA SECURITY TOPOLOGY                         │
└────────────────────────────────────────────────────────────────────────┘

  [ Client User Input ] ────────► [ src/utils/security.ts ]
  - Usernames, Bio               - escapeHtml / sanitizeText
  - Avatar URLs                  - isValidAvatarUrl (https only)
  - In-Game Chat                 - Profanity & Length Bounds
          │
          ▼
  [ Firebase Client SDK ] ──────► [ Environment Variables ]
  - Auth: Google / Anonymous      - import.meta.env.VITE_FIREBASE_*
  - Firestore Client              - .env.example template
          │
          ▼
  [ Firestore Security Rules (firestore.rules) ]
  ┌──────────────────────────────────────────────────────────────────────┐
  │ 1. users/{userId}                                                    │
  │    - isOwner(userId): can only edit own profile                      │
  │    - role immutability: cannot escalate to 'admin'                   │
  │    - uid & createdAt immutability                                    │
  │ 2. gameRooms/{roomId}                                                │
  │    - host can only update hostScore / hostAnswer / room states       │
  │    - guest can only update guestScore / guestAnswer / guestReady     │
  │    - terminal lock: no edits after status == 'finished'             │
  │ 3. gameRooms/{roomId}/messages/{msgId}                               │
  │    - senderId == request.auth.uid & sender is in room                │
  │ 4. matchmaking/{ticketId}                                            │
  │    - only ticket owner can update or delete                          │
  └──────────────────────────────────────────────────────────────────────┘
          │
          ▼
  [ Firestore Database Engine ] (Verified, Sealed, Tamper-Proof)
```

- **Implementation Steps**:
  1. **Security Utility (`src/utils/security.ts`)**:
     - Implement `escapeHtml(str)`, `sanitizeUsername(name)`, `sanitizeChatMessage(text)`, `isValidAvatarUrl(url)`, and `sanitizeAvatarUrl(url)`.
     - Wire into `ProfileScreen.tsx`, `GameRoomScreen.tsx`, and `gameService.ts`.
  2. **Environment Variable Protection**:
     - Update `.env.example` with standard `VITE_FIREBASE_*` variable definitions.
     - Refactor `src/services/firebase.ts` to consume `import.meta.env.VITE_FIREBASE_*` dynamically, removing the hardcoded API key check string.
  3. **Hardened `firestore.rules` & `firebase-blueprint.json`**:
     - Fortify `users/{userId}` to prevent privilege escalation (`role: 'admin'`) and identity spoofing.
     - Fortify `gameRooms/{roomId}` to enforce participant-only updates and prevent cross-player score manipulation.
     - Deploy the updated rules via `DeployRules` RPC action.
  4. **Verification**:
     - Run `compile_applet` and `lint_applet` to verify clean build without regressions.

---

### 5. Multiplayer Audio Loop Fix & Single-Answer Locking

- **Problem Addressed**:
  1. A runaway 50ms interval in `GameRoomScreen.tsx` continuously scheduled bell sound triggers (`sounds.playStart()`) 20 times per second throughout matches.
  2. The runaway interval continuously re-triggered the round reset effect, resetting `hasAnswered` back to `false` and allowing unlimited option clicks and thousands of illegitimate points.
- **Resolutions Applied**:
  - Replaced countdown timer in `GameRoomScreen.tsx` with a self-terminating, clean countdown that terminates immediately and silences match transition sounds.
  - Implemented `hasAnsweredCurrentRoundRef` in `GameRoomScreen.tsx` to provide immediate synchronous locking on the first answer click.
  - Guarded round reset logic to strictly execute only when `activeRoundRef.current !== room.currentRound`.
  - Added `disabled` and `pointer-events-none select-none` to option buttons once answered, guaranteeing that players can only answer once per question.

---

### 6. Immediate Round Advance Upon Both Players Answering (No 50-Second Wait)

- **Problem Addressed**:
  - When both players submitted their answers early in a 50-second round, the game was failing to advance immediately due to:
    1. Redundant nested `currentQuestion` containing `undefined` properties passed to `updateDoc`, causing Firestore updates to silently reject.
    2. Overzealous `clearTimeout(roundTransitionTimeoutRef.current)` in the timer effect cleanup which cancelled the 1-second advance timeout upon state re-render.
    3. Host-only advance restriction that prevented the guest from committing the round increment if host lagged.
---

### 7. Google Authentication Session Persistence Fix

- **Problem Addressed**:
  - When users logged in using their Google account, closing or refreshing the site caused them to be automatically logged out or demoted to an anonymous guest account upon returning.
- **Root Causes Identified**:
  1. `src/services/firebase.ts` executed an unconditional eager `signInAnonymously(auth)` at top-level module import. When the user reopened the site, this eager call ran before Firebase Auth could restore the Google user credential from `IndexedDB`, overwriting the Google session with a new anonymous guest.
  2. `src/services/matchmakingService.ts` also executed `ensureFirebaseAuth().catch(() => {})` at top-level module import and in `ensureFirebaseAuth()` called `signInAnonymously(auth)` immediately when `auth.currentUser` was `null`, without awaiting `auth.authStateReady()`.
  3. `src/context/AuthContext.tsx` had an `else` branch in `onAuthStateChanged` that eagerly attempted anonymous sign-in whenever `user` was temporarily `null`.
  4. Explicit `browserLocalPersistence` from `firebase/auth` was not configured before `signInWithPopup`.
- **Resolutions Applied**:
  1. Configured `setPersistence(auth, browserLocalPersistence)` in both `src/services/firebase.ts` and before popup sign-in in `src/context/AuthContext.tsx`.
  2. Removed all eager, top-level `signInAnonymously(auth)` invocations from `firebase.ts` and `matchmakingService.ts`.
  3. In `matchmakingService.ts`, updated `ensureFirebaseAuth()` to await `auth.authStateReady()` before checking `auth.currentUser`, ensuring existing Google/Email authenticated sessions are recognized and never overwritten with anonymous credentials.
---

### 8. Host & Guest Live Score and Answer Synchronization Fix

- **Problem Addressed**:
  - Across all 4 game modes, chat and matchmaking worked, but the opponent's answers and points did not appear on the other player's screen, making it look as though the opponent never answered or never chose an option, and forcing rounds to wait 50 seconds to timeout.
- **Root Causes Identified**:
  1. `subscribeToFallbackRoom` in `src/services/multiplayerFallback.ts` had an active `setInterval` polling every 450ms that unconditionally called `onUpdate(fresh)` with the local device's memory/localStorage copy. On real mobile devices playing over the internet, this local copy had stale, un-answered opponent state, continuously resetting the opponent's answers and score back to `null` and `0` twice every second.
  2. In `GameRoomScreen.tsx`, the room snapshot merge logic only preserved the local player's answer within the round (host preserved `hostAnswer`, guest preserved `guestAnswer`). Whenever a lagging snapshot arrived without the opponent's newly submitted answer, the opponent's answer was wiped out back to `null`.
  3. In `src/services/gameService.ts`, `submitPlayerAnswer` used `updateDoc` across dual document references (`refs`), which failed with `No document to update` on non-existent `room_code_` IDs, causing `Promise.all` to reject. Additionally, `hostScore` and `guestScore` were omitted from updates when points earned was 0.
- **Resolutions Applied**:
  1. Updated `GameRoomScreen.tsx` snapshot merge so that within an active round, both `hostAnswer` and `guestAnswer` are preserved against lagging packets, and accumulated scores are preserved monotonically via `Math.max`.
  2. Fixed `subscribeToFallbackRoom` to only emit updates when `updatedAt` has actually progressed, eliminating the continuous 450ms state erasure.
  3. Replaced fragile `updateDoc` calls with `setDoc(r, cleanUpdates, { merge: true })` across dual document references with individual error guards so writes never fail if an alternate ID doesn't exist yet, and ensured scores are always synchronized in all round submissions.


