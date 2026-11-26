# Brief: build an in-app AI agent (voice + chat) that can do anything in the app

You are adding an assistant to a Next.js App Router app (React 19, TypeScript, Tailwind, MongoDB, server-only modules). People must be able to **talk to it or type to it from any screen**, and it must be able to **answer questions about anything in the app, move them around the app, read what is on their screen, and carry out real tasks**, with every change confirmed by the person first.

This brief describes what to build and how we built the same thing in a sister project (a hospital claims app). Follow the architecture; adapt the screens, tools and wording to your app.

---

## 1. What "done" looks like

### The experience
1. **One way in.** A single small mark at the bottom centre of every screen (our logo letter with a coloured dot). Tap it, or press Ctrl/⌘ J, to talk. There is no second floating button.
2. **Voice is primary, Siri-style.**
   - Tapping opens a glass bar at the bottom centre.
   - The bar shows the person's words as they speak and the assistant's reply as a caption.
   - The screen edge glows while it listens, mint and moving with the voice level; it turns amber and breathes while it thinks.
   - Tapping the mark while it speaks interrupts it.
   - The bar stays open while the assistant moves the person between screens.
3. **Cards above the bar.** Anything the assistant wants to show or do appears as a card above the voice bar:
   - a written breakdown (numbers, lists),
   - a "Take me there?" offer,
   - a proposed change with Accept / Reject.
4. **Chat only for more detail.** An "Open in chat" button on the voice bar (or Ctrl/⌘ K) opens a side panel with the same conversation as text. The panel also holds any special modes; we have a consultation "Scribe" mode. On phones the panel is a bottom sheet about 58% of the screen tall, never full screen.
5. **The mark's dot is the state:** green resting, bright mint listening (swells with the voice), amber pulsing thinking, blue speaking, red error.
6. **A travel animation when the assistant navigates:**
   - The page softens behind frosted glass.
   - A band of mint light sweeps across.
   - A chip reads "Taking you to Claims · Refused".
   - The glass lifts when the new page has painted.
   - It lasts under a second, at most about 2 s, and never blocks clicks.

### The behaviour (acceptance tests, all must pass)
| Person says | Agent does |
|---|---|
| "Take me to my previous 10 claims" | Searches (newest first, limit 10), **navigates at once** to a list of exactly those 10, says one sentence about what is on screen |
| "Where can I find the refused claims?" | Answers in one sentence, shows a **"Take me there?"** card, asks out loud; navigates only after "yes" |
| "Show me the claims with the insurer" | Opens the right tab (not "which insurer?") |
| "Open the second one" | Calls `get_screen`, opens item 2 of what is listed |
| "Take me to the patients of Omar Hadad" (misheard) | Fuzzy-matches Dr. Omar Haddad, opens his filtered list |
| "Tell me about Priya Ayer" (misheard, on screen) | Finds Priya Iyer (people on screen and in today's list first) |
| "What risks has the system flagged here?" | Reads the live check panel on the right (shared by the page) and explains in plain words |
| "Help me resolve the risk" (needs an approval) | Explains it (e.g. "the approval on file expired on 11 Nov"), proposes **Request approval**, does it on "yes" |
| "Help me resolve the risk" (needs values) | Asks the doctor for each blank in the fix template, **never invents a value**, proposes writing the filled template into the note, writes it on "yes" |
| "Send this claim" | Proposes it (card), asks "Shall I send it?", executes only on a clear yes |
| "No, don't" | Rejects the proposal |
| "Which insurer refuses us most?" | Answers with data, does **not** navigate; breakdown goes on a card, short summary spoken |
| Arabic in | Arabic out; otherwise **always English** (we caught a voice model answering in Hindi) |

Commands navigate; questions offer. Reads and navigation never need approval. **Anything that changes a record always waits for an explicit yes**, said or tapped.

---

## 2. Architecture

```
                 ┌──────────────────── browser ─────────────────────┐
 mic ─AudioWorklet→ LiveVoice (Gemini Live websocket, ephemeral token)
                    │  toolCall ─┬─ READ  → POST /api/assistant/tool  (server runs it)
                    │            ├─ WRITE → proposal card (store), returns proposalId
                    │            └─ SCREEN → run in browser (navigate, offer, get_screen,
                    │                         go_back, confirm_change, reject_change)
 chat panel ─ POST /api/assistant/chat → server agent loop (Groq → Gemini fallback)
                    returns { reply, proposals[], actions[] } → browser runs actions
 pages ─ setAssistantPage / useAssistantScreen → store (what is open + listed + details)
                 └───────────────────────────────────────────────────┘
```

**One tool catalogue, three kinds of tools.** This is the core idea:
- **READ tools** run on the server and return facts. They never change data.
- **WRITE tools** never run directly. They become a *proposal* (a card) with an id. The model must ask, and only `confirm_change(proposalId)` after a clear yes executes it, through the same API routes the screens use.
- **SCREEN tools** run in the browser at once without approval, because they never change a record: `navigate`, `offer_navigation`, `get_screen`, `go_back`, `confirm_change`, `reject_change`.

The same declarations, instructions and helpers serve both voice and chat, so the two can't drift apart.

### Files we ended up with (use as a map)
| File | Role |
|---|---|
| `lib/assistant/tools.ts` | All tool declarations (Gemini `FunctionDeclaration` format), `runReadTool`, `systemInstruction(hospital, ctx, voice)`, `namesHint(db)`, `ContextSchema` (zod), `screenAnswer` |
| `lib/assistant/sitemap.ts` | The app map: screens, tabs, synonyms, `pathFor(destination)` (validated links), `describeSitemap()` for the prompt. Shared client/server, no server imports |
| `lib/assistant/names.ts` | Fuzzy name matching (see §6) |
| `lib/assistant/agent.ts` | Typed-chat agent loop: Groq first, Gemini fallback, up to 6 steps; WRITE → proposals with ids, SCREEN → `actions[]`, `get_screen` answered from the request context |
| `lib/assistant/models.ts`, `keys.ts` | Model lists and fallbacks; separate API keys for the assistant (`ASSISTANT_GEMINI_API_KEY`, `ASSISTANT_GROQ_API_KEY`) so it can't starve the app's own AI |
| `app/api/assistant/token/route.ts` | Mints a **single-use ephemeral Gemini Live token** and returns `{ token, models, voice, systemInstruction, tools }`. The API key never reaches the browser |
| `app/api/assistant/tool/route.ts` | Runs READ tools for the voice session; refuses WRITE/SCREEN; trims results to ~6,000 chars |
| `app/api/assistant/chat/route.ts` | Typed chat: validates context, runs `runAgent` |
| `components/assistant/store.ts` | Tiny external store (`useSyncExternalStore`): messages, proposals, live status/level, page context, screen info, offer, travel, voice on/off |
| `components/assistant/live.ts` | The Gemini Live session (mic, playback, turn-taking, tools, nudge) |
| `components/assistant/screen.ts` | Browser executor: `runScreenTool`, `contextNow()`, `go(path,label)`, `runActions()` |
| `components/assistant/apply.ts` | Executes an accepted proposal through the app's normal API routes, then tells the page to refresh |
| `components/assistant/voice.tsx`, `voice-control.ts` | The bottom-centre mark, voice bar, edge glow, cards; start/stop/openChat (lazy-loads the Live library) |
| `components/assistant/assistant.tsx`, `cards.tsx`, `orb.tsx`, `travel.tsx` | Chat/scribe panel, proposal/offer cards, the mark, travel animation |
| `public/assistant/mic-worklet.js` | AudioWorklet that posts 2,048-sample Float32 frames |

---

## 3. Voice (Gemini Live) — how we did it

- **Token.** The browser POSTs `/api/assistant/token` with the current context and mode. The server:
  - calls `ai.authTokens.create({ config: { uses: 1, expireTime: +30 min, newSessionExpireTime: +2 min, httpOptions: { apiVersion: "v1alpha" } } })` (`@google/genai`);
  - builds the system instruction with the screen context and a **names list** (insurers, doctors *with their ids*, patients in today's clinic) so misheard names resolve;
  - returns the tools as `[...ALL_TOOLS, ...LIVE_TOOLS]`. `LIVE_TOOLS` is `show_details`: put the full written answer on screen while only a short summary is spoken.
- **Connect.**
  - `new GoogleGenAI({ apiKey: token, httpOptions: { apiVersion: "v1alpha" } }).live.connect` with:
    - `responseModalities: [AUDIO]`, `inputAudioTranscription: {}`, `outputAudioTranscription: {}`
    - a prebuilt voice
    - `systemInstruction`, and `tools: [{ functionDeclarations }]`
  - Try the models in order, with a fresh token per attempt.
  - **Model choice is measured, not assumed.** Ours was `gemini-3.8-live` first, with `gemini-2.5-flash-native-audio-preview-09-2025` as backup:
    - With spoken test audio (clean and noisy), 3.8 handled 6 of 6, used the right tools including the offer, and answered in about 12 s.
    - 2.5 was slower, skipped the offer button, and once replied in Hindi.
    - Re-test with your own audio; see §8.
- **Microphone.**
  - `getUserMedia` with echo cancellation, noise suppression and auto gain.
  - AudioWorklet frames are downsampled to **16 kHz 16-bit PCM**, base64-encoded, and sent with `sendRealtimeInput({ audio: { data, mimeType: "audio/pcm;rate=16000" } })`.
  - Audio said while the socket is still connecting is buffered (about 8 s) and flushed on connect.
- **Turn-taking (critical; this fixed "listens but never answers" and "answers twice").**
  - Calibrate the room's noise floor from the first ~15 frames. After that it drops fast to quiet moments and rises slowly with steady hum.
  - Speech means RMS above max(0.012, floor × 2.2), and that threshold is ×2.4 while the assistant is playing, so its own voice doesn't interrupt it.
  - After **at least 500 ms of speech and then 1,000 ms of quiet**, send `sendRealtimeInput({ audioStreamEnd: true })`. This explicit end of speech is what makes the model end its turn reliably.
  - Then **pause uploading** until the model's `turnComplete` *and* the end of playback, so a repeated question can't trigger a second answer.
  - Don't gate or cut the audio itself; that made recognition worse. Use the floor only for the "Hearing you…" UI and the turn logic.
  - Add an 8 s watchdog: if nothing came back, say "I didn't catch that" and listen again.
- **Playback.** Play 24 kHz PCM through an `AnalyserNode`, queued with `playAt`. Drive the mark's dot level from the output, or from the mic while listening. Interrupting stops the sources, drops the rest of that turn's audio and resumes listening.
- **Tool calls.** For each function call:
  - `show_details` → add a "detail" message (shown as a card).
  - WRITE → `store.propose(name, args)` → respond `{ status: "Proposed (nothing changed yet)… ask… confirm_change only on a clear yes", proposalId }`.
  - SCREEN → `runScreenTool` in the browser.
  - READ → `POST /api/assistant/tool` with `contextNow()`.
  - Then `sendToolResponse({ functionResponses })`.
- **The quiet-after-action nudge.** Live models sometimes act and then close their turn without a word. If a `turnComplete` arrives after a tool response with no audio or transcript since, send **once**: `sendRealtimeInput({ text: "(The results of your last action are in. Now tell the person, in one or two short sentences, what you did or found.)" })` and keep waiting.
- **Navigation doesn't end the session.** The voice session lives outside the page components. Only scribe ends when the page changes.
- **Lazy-load** `@google/genai` with `import("./live")` on first use; it is large.

## 4. Chat (typed) — how we did it

- `POST /api/assistant/chat { messages (last 16), context }`.
- The server runs `runAgent(db, systemInstruction(..., voice=false) + namesHint, messages, context)`, which loops up to 6 times:
  - The model calls tools.
  - READ tools are executed.
  - WRITE tools become `{ id, tool, args }` proposals, answered with `{ status: PROPOSED, proposalId }`.
  - SCREEN tools are validated (e.g. `pathFor`) and pushed into `actions[]`, answered with "Opened X…".
  - `get_screen` is answered from the context the browser sent.
- It returns `{ reply, proposals, actions }`. The browser adds the reply, adds the proposals **with the server's ids**, and runs the actions: navigate, offer, confirm or reject.
- So a typed "yes" works across turns, the browser sends `context.pending` (the waiting proposals' ids and args) with every request, and the instructions list them.
- Engines:
  - Groq `gpt-oss-120b` → `gpt-oss-20b` on a 429 (each has its own limit).
  - Then Gemini flash models in order, failing over on 429/503/504/timeout.
  - Convert Gemini declarations to JSON Schema for Groq (lower-case `type`).
- Map rate-limit and quota errors to a plain sentence ("SEAL's AI is busy right now…"); never show raw JSON.

## 5. Knowing the app and the screen

- **Sitemap** (`sitemap.ts`):
  - every screen with a key, a path, *what is on it*, and the words people use (e.g. "refused = rejected = denied = declined", "with the insurer = sent = pending");
  - every tab;
  - `pathFor({ screen, tab, doctor, claim, visit, questionSet, claims[], title, link })` returns a validated path, or an error the model can read. The model can't invent URLs.
- **Deep links on every screen.** Every screen must open already filtered from its URL. We added:
  - `/billing?tab=refused`;
  - `/billing?ids=a,b,c&title=Your last 10 claims` (a list of exactly those claims, in that order);
  - `/emr?providerId=…&e=<visit>` and `/doctor?providerId=…&q=…`.
  - Screens must **react to URL changes while mounted**: derive state from `useSearchParams`, don't copy it once into `useState`.
- **Pages report what they show:**
  - `setAssistantPage({ claimId | encounterId | questionSetId, label })` for the open record;
  - `useAssistantScreen({ title, tab, items: [{ id, label, kind }] (≤ 40, in display order), details })` for what is listed and any panel the person can see. It clears on unmount.
  - `details` is free text (≤ 3,000 chars) for things only the browser knows, e.g. the live check panel's results per order, the fix templates with `____` blanks, and which approvals are valid on the visit date.
  - `contextNow()` sends this with every request; `get_screen` returns it with item numbers.
- **`get_context` (server)** returns the open record in full, including server-side equivalents of what panels show. It re-runs the rules-only check for a visit, and returns the "win it back" plan for a refused claim. So it works even when the page hasn't reported yet.
- **A one-line context** (path, screen title, tab, item count, waiting proposals) goes at the end of the system instruction.

## 6. Names (speech gets them wrong)

- Matching rules:
  - ignore titles and punctuation;
  - squash doubled letters ("Haddad" matches "Hadad");
  - per word, take the best of exact, prefix (≥ 3 letters) or `1 − Levenshtein/length`;
  - average over the spoken words; keep scores ≥ 0.74 and within 0.06 of the best.
- Patient candidates: everyone in today's clinic, plus a database search on **each word** of the name, so one misheard word still finds them. Then rank.
- Prefer today's open visit. If several different people match and none is in clinic, the agent asks which one, naming them.
- Doctor tools return the doctor's **id**. The browser resolves a name to an id before navigating, because ids don't follow names.

## 7. The system instruction (the rules that made it good)

Write it as plain rules. Ours, in order:
1. Who it is and who uses it.
2. Voice: short and warm; for several numbers, call `show_details` first, then speak two or three sentences.
3. Which tool answers what; **use the narrowest tool**; never attribute hospital-wide figures to one insurer or doctor.
4. The sitemap text.
5. **Commands versus questions:**
   - Commands (take me, open, show me, go to, pull up, let me see) → `navigate` now. Look things up first if needed (e.g. `search_claims(sort newest, limit 10)` → `navigate(claims=[ids], title)`).
   - **"Show me X" always puts X on screen, even if empty**; never list it in words.
   - Questions (where is, how do I get to) → one sentence plus `offer_navigation`; go only on yes.
6. Worked examples for every tab synonym, including the ones the model got wrong in testing.
7. "This one / the second one / what am I looking at" → `get_screen` first.
8. Names: pass them as heard; check the screen first; **never say you can't find someone or can't go somewhere before trying the tools.**
9. Changes:
   - Call the WRITE tool (it changes nothing yet).
   - Ask "Shall I…?"; confirm only on a clear yes; reject on no.
   - **Never say it's done before `confirm_change` says so.**
10. Domain rules for resolving the app's own flags:
    - An approval counts only if it covers *that* code and is valid on the service date. An expired one doesn't count: say so plainly.
    - Template blanks come from the person; never invent values.
    - Codes come only from documented, qualifying options the person confirms.
11. Never invent codes, rules, amounts or clinical facts.
12. Language: English unless the person speaks Arabic.
13. The current context line and the pending proposals.

## 8. Test it like a product (we found most bugs this way)

- **Typed test set** (`npm run assistant:eval`): about 50 phrasings, each with an expected action:
  - commands, "where is…", follow-ups ("yes please" or "no thanks" after an offer);
  - on-screen references with a fake screen context;
  - changes with a pending proposal ("yes, send it" → `confirm_change p1`);
  - data questions (must not navigate);
  - Arabic.
  - It runs `runAgent` directly, prints PASS/FAIL with what it did, and retries on 429.
- **Live probe, text in** (`scripts/assistant/live-probe.ts`):
  - gets a token from the running dev server, opens the real Live model, sends sentences as text;
  - multi-turn with `"a | b | c"`; prints every tool call and the spoken transcript;
  - takes `VISIT=…` / `CLAIM=…` for a specific screen and `MODEL=…` to compare models.
- **Live probe, real speech** (`scripts/assistant/live-audio-probe.ts`):
  - one Live session *speaks* each test sentence; the recording is resampled to 16 kHz and streamed into the assistant exactly like the mic (100 ms chunks in real time, 1 s of quiet, `audioStreamEnd`);
  - `NOISE=1` mixes in hiss and a 100 Hz hum;
  - prints what it heard, did and said, and whether the turn ended. This is how we chose the voice model.
- **Browser checks** with Playwright and Chrome:
  - a fake mic (`--use-fake-ui-for-media-stream --use-fake-device-for-media-stream`) shows the bar connects;
  - a dev-only `window.__sealGo(path, label)` hook tests navigation and the travel animation without spending AI quota.

## 9. Pitfalls we hit (save yourself the time)

- **Quotas:**
  - Free-tier Gemini text is about **20 requests per model per day**; a test-set run burns it.
  - Groq free is **8,000 tokens per minute**, and our instructions plus tools are about 6,100 tokens per step, so a two-step question hits the limit.
  - Use paid tiers for demos, a separate assistant key, and failover across models.
  - Voice (Live) has separate limits.
- **Live silence after a tool call** → the nudge (§3). Holding the tool reply until the turn closes did **not** help.
- **Turn ends:** without an explicit `audioStreamEnd`, some Live models never end the turn in noise.
- **Streamed server data in Next.js:** a promise passed from a server component arrives as React's own thenable, whose `.then` returns `undefined`. Wrap it in `Promise.resolve(x)` before using `.then` or `.catch`.
- **Stale context on long sessions:** the instructions are fixed when the session opens, so make the model call `get_screen` instead of trusting them.
- **Facts hidden in the UI:** if a panel shows something (the check results, an approval's expiry), it must also go to the agent through `details` or `get_context`; otherwise the agent confidently says the opposite.
- **Proposal wording:** tell the model in the tool response that nothing has changed yet and that it must ask; models still sometimes say "I've added it" early, so the card status is the source of truth.
- **Don't open the chat panel when a proposal arrives during voice;** show the card above the bar instead.
- **One entry point.** Two floating assistant buttons confused people.

## 10. Build order

1. Sitemap and deep links on every screen (the agent can only go where links exist).
2. Tool catalogue (READ, WRITE, SCREEN), `systemInstruction`, `ContextSchema`, the READ tools, and fuzzy names.
3. The store, `contextNow`, `setAssistantPage`, `useAssistantScreen` on every page (with `details` for panels).
4. The typed agent loop with Groq/Gemini failover, proposals with ids, screen actions, and the chat panel.
5. The token route, `live.ts` (mic, playback, turn-taking, tools, nudge), and the voice bar, edge glow, cards and travel animation.
6. Domain "resolve it" tools (each one also a real button on its screen).
7. The test set, the live probes and real-speech tests; tune the instructions until all pass.
