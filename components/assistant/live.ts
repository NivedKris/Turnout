"use client";

import { GoogleGenAI, Modality, type FunctionResponse, type LiveServerMessage, type Session } from "@google/genai";
import { proposalFromDraft } from "./apply";
import { contextNow, currentAsOf, runScreenTool } from "./screen";
import { assistant } from "./store";

/**
 * Gemini Live voice session: microphone → 16 kHz PCM → Live websocket (ephemeral
 * token) → 24 kHz audio back. Turn-taking is explicit (audioStreamEnd after speech
 * + quiet), tools are routed READ/WRITE → server, SCREEN → browser.
 */
type Nav = { push: (p: string) => void; back: () => void; refresh: () => void };
type TokenResp = { token: string; models: string[]; voice: string; systemInstruction: string; tools: { name: string; description: string; parametersJsonSchema: unknown }[]; entities: never; error?: string };

const SCREEN = new Set(["navigate", "offer_navigation", "get_screen", "go_back", "confirm_change", "reject_change", "show_details"]);
const WRITE = new Set(["propose_task", "propose_campaign_update", "propose_decision"]);
const NUDGE = "(The results of your last action are in. Now tell the person, in one or two short sentences, what you did or found.)";

function b64FromPcm16(f32: Float32Array): string {
  const i16 = new Int16Array(f32.length);
  for (let i = 0; i < f32.length; i++) i16[i] = Math.max(-1, Math.min(1, f32[i]!)) * 0x7fff;
  const bytes = new Uint8Array(i16.buffer);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function downsample(input: Float32Array, from: number, to = 16000): Float32Array {
  if (from === to) return input;
  const ratio = from / to;
  const out = new Float32Array(Math.floor(input.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j++) sum += input[j]!;
    out[i] = sum / Math.max(1, end - start);
  }
  return out;
}

export class LiveVoice {
  private session: Session | null = null;
  private stream: MediaStream | null = null;
  private inCtx: AudioContext | null = null;
  private outCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private sources = new Set<AudioBufferSourceNode>();
  private playAt = 0;
  private open = false;
  private preBuffer: string[] = [];
  // turn-taking
  private frames = 0;
  private floor = 0.01;
  private speechMs = 0;
  private quietMs = 0;
  private paused = false;
  private turnDone = false;
  private dropAudio = false;
  private afterTool = false;
  private gotOutput = false;
  private nudged = false;
  private toolsPending = 0;
  private watchdog: ReturnType<typeof setTimeout> | null = null;
  private raf = 0;
  private stopped = false;

  constructor(private nav: Nav) {}

  async start() {
    this.stopped = false;
    assistant.set({ voiceOn: true, status: "connecting", error: null, heard: "", caption: "" });
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch {
      this.fail("Microphone permission is needed for voice. You can still type in chat.");
      return;
    }
    this.inCtx = new AudioContext();
    await this.inCtx.audioWorklet.addModule("/assistant/mic-worklet.js");
    const src = this.inCtx.createMediaStreamSource(this.stream);
    const node = new AudioWorkletNode(this.inCtx, "mic-frames");
    node.port.onmessage = (e: MessageEvent<Float32Array>) => this.onFrame(e.data);
    src.connect(node);
    this.outCtx = new AudioContext({ sampleRate: 24000 });
    this.analyser = this.outCtx.createAnalyser();
    this.analyser.fftSize = 512;
    this.analyser.connect(this.outCtx.destination);
    this.meter();
    await this.connect();
  }

  private async connect() {
    for (let attempt = 0; attempt < 4 && !this.stopped; attempt++) {
      let t: TokenResp;
      try {
        const r = await fetch("/api/assistant/token", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ context: contextNow(), attempt }) });
        t = (await r.json()) as TokenResp;
        if (!r.ok || !t.token) throw new Error(t.error ?? "no token");
      } catch (e) {
        if (attempt === 3) this.fail((e as Error).message || "Couldn't start voice.");
        continue;
      }
      assistant.set({ entities: t.entities });
      const model = t.models[attempt % t.models.length]!;
      try {
        const ai = new GoogleGenAI({ apiKey: t.token, httpOptions: { apiVersion: "v1alpha" } });
        this.session = await ai.live.connect({
          model,
          config: {
            responseModalities: [Modality.AUDIO],
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: t.voice } } },
            systemInstruction: t.systemInstruction,
            tools: [{ functionDeclarations: t.tools }],
          },
          callbacks: {
            onopen: () => {
              this.open = true;
            },
            onmessage: (m) => void this.onMessage(m),
            onerror: () => {},
            onclose: () => {
              this.open = false;
              if (!this.stopped && assistant.get().voiceOn) this.fail("Voice disconnected. Tap to reconnect.");
            },
          },
        });
        this.open = true;
        assistant.set({ status: "listening" });
        for (const b of this.preBuffer.splice(0)) this.session.sendRealtimeInput({ audio: { data: b, mimeType: "audio/pcm;rate=16000" } });
        return;
      } catch {
        // try the next model with a fresh token
      }
    }
    if (!this.session) this.fail("Couldn't reach the voice model. Try chat instead.");
  }

  private onFrame(f: Float32Array) {
    if (!this.inCtx || this.stopped) return;
    const frameMs = (f.length / this.inCtx.sampleRate) * 1000;
    let sum = 0;
    for (let i = 0; i < f.length; i++) sum += f[i]! * f[i]!;
    const rms = Math.sqrt(sum / f.length);
    // Noise floor: calibrate, then fall fast to quiet moments and rise slowly with steady hum.
    this.frames++;
    if (this.frames <= 15) this.floor = this.frames === 1 ? rms : this.floor * 0.8 + rms * 0.2;
    else this.floor = rms < this.floor ? this.floor * 0.7 + rms * 0.3 : this.floor * 0.995 + rms * 0.005;
    const playing = this.sources.size > 0;
    const threshold = Math.max(0.012, this.floor * 2.2) * (playing ? 2.4 : 1);
    const speaking = rms > threshold;
    if (!playing) assistant.set({ level: Math.min(1, rms * 12) });

    const b64 = b64FromPcm16(downsample(f, this.inCtx.sampleRate));
    if (!this.open || !this.session) {
      this.preBuffer.push(b64);
      if (this.preBuffer.length > 64) this.preBuffer.shift(); // ≈ 8 s
      return;
    }
    if (this.paused) return;
    this.session.sendRealtimeInput({ audio: { data: b64, mimeType: "audio/pcm;rate=16000" } });
    if (speaking) {
      this.speechMs += frameMs;
      this.quietMs = 0;
      if (assistant.get().status !== "listening") assistant.set({ status: "listening" });
    } else if (this.speechMs > 0) {
      this.quietMs += frameMs;
      if (this.speechMs >= 500 && this.quietMs >= 1000) this.endOfSpeech();
    }
  }

  /** Typed turn into the live session (used by tests and the dev console). */
  say(text: string) {
    if (!this.session) return;
    this.session.sendRealtimeInput({ text });
    this.beginReply();
  }

  /** Explicit end of speech, then pause uploading until the reply is done. */
  private endOfSpeech() {
    this.session?.sendRealtimeInput({ audioStreamEnd: true });
    this.beginReply();
  }

  private beginReply() {
    this.paused = true;
    this.speechMs = 0;
    this.quietMs = 0;
    this.turnDone = false;
    this.afterTool = false;
    this.gotOutput = false;
    this.nudged = false;
    this.dropAudio = false;
    assistant.set({ status: "thinking", caption: "" });
    this.arm();
  }

  private arm() {
    if (this.watchdog) clearTimeout(this.watchdog);
    this.watchdog = setTimeout(() => {
      if (!this.gotOutput) {
        assistant.set({ caption: "I didn't catch that. Try again?" });
        this.resume();
      }
    }, 8000);
  }

  private resume() {
    if (this.watchdog) clearTimeout(this.watchdog);
    this.paused = false;
    this.speechMs = 0;
    this.quietMs = 0;
    if (assistant.get().voiceOn) assistant.set({ status: "listening", heard: "" });
  }

  private async onMessage(m: LiveServerMessage) {
    const sc = m.serverContent;
    if (process.env.NODE_ENV !== "production") {
      const w = window as unknown as { __liveLog?: string[] };
      (w.__liveLog ??= []).push([sc?.turnComplete && "turnComplete", sc?.interrupted && "interrupted", sc?.generationComplete && "genComplete", m.toolCall && `tool:${m.toolCall.functionCalls?.map((f) => f.name).join(",")}`, sc?.outputTranscription?.text && "out", sc?.inputTranscription?.text && "in", sc?.modelTurn?.parts?.some((p) => p.inlineData) && "audio", m.goAway && "goAway"].filter(Boolean).join("+") || Object.keys(m).join(","));
    }
    if (sc?.inputTranscription?.text) assistant.set({ heard: (assistant.get().heard + sc.inputTranscription.text).slice(-300) });
    if (sc?.outputTranscription?.text) {
      this.gotOutput = true;
      assistant.set({ caption: (assistant.get().caption + sc.outputTranscription.text).slice(-600) });
    }
    for (const p of sc?.modelTurn?.parts ?? []) {
      if (p.inlineData?.data && !this.dropAudio) {
        this.gotOutput = true;
        this.play(p.inlineData.data);
      }
    }
    if (sc?.interrupted) this.stopAudio();
    if (m.toolCall?.functionCalls?.length) {
      if (this.watchdog) clearTimeout(this.watchdog);
      assistant.set({ status: "thinking" });
      this.toolsPending++;
      this.afterTool = true;
      const responses: FunctionResponse[] = [];
      for (const fc of m.toolCall.functionCalls) {
        const name = fc.name ?? "";
        const args = (fc.args ?? {}) as Record<string, unknown>;
        let response: Record<string, unknown>;
        try {
          if (SCREEN.has(name)) response = await runScreenTool(name, args, this.nav);
          else {
            const r = await fetch("/api/assistant/tool", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, args, asOf: currentAsOf() }) });
            const out = ((await r.json()) as { result?: Record<string, unknown>; error?: string }).result ?? { error: "Lookup failed" };
            if (WRITE.has(name) && !out.error) {
              const p = proposalFromDraft(name, out);
              if (p) {
                assistant.propose(p);
                response = { status: "Proposed (nothing changed yet). Ask the person in one sentence whether to go ahead. Call confirm_change with this proposal_id ONLY on a clear yes, reject_change on no.", proposal_id: p.id, summary: p.summary };
              } else response = out;
            } else response = out;
          }
        } catch {
          response = { error: "That step failed." };
        }
        responses.push({ id: fc.id, name, response });
      }
      this.toolsPending--;
      this.gotOutput = false;
      this.session?.sendToolResponse({ functionResponses: responses });
      this.arm();
    }
    // A turn that closes while our tool is still running is not the end of the reply.
    if (sc?.turnComplete && this.toolsPending > 0) return;
    if (sc?.turnComplete) {
      // Live models sometimes act and close the turn silently: nudge once.
      if (this.afterTool && !this.gotOutput && !this.nudged) {
        this.nudged = true;
        this.session?.sendRealtimeInput({ text: NUDGE });
        this.arm();
        return;
      }
      if (this.watchdog) clearTimeout(this.watchdog);
      this.turnDone = true;
      this.dropAudio = false;
      if (this.sources.size === 0) this.resume();
    }
  }

  private play(b64: string) {
    if (!this.outCtx || !this.analyser) return;
    const bin = atob(b64);
    const i16 = new Int16Array(bin.length / 2);
    for (let i = 0; i < i16.length; i++) i16[i] = (bin.charCodeAt(i * 2) | (bin.charCodeAt(i * 2 + 1) << 8)) << 16 >> 16;
    const buf = this.outCtx.createBuffer(1, i16.length, 24000);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < i16.length; i++) ch[i] = i16[i]! / 0x8000;
    const src = this.outCtx.createBufferSource();
    src.buffer = buf;
    src.connect(this.analyser);
    this.playAt = Math.max(this.playAt, this.outCtx.currentTime + 0.02);
    src.start(this.playAt);
    this.playAt += buf.duration;
    this.sources.add(src);
    assistant.set({ status: "speaking" });
    src.onended = () => {
      this.sources.delete(src);
      if (this.sources.size === 0 && this.turnDone) this.resume();
    };
  }

  private stopAudio() {
    for (const s of this.sources) {
      try {
        s.stop();
      } catch {}
    }
    this.sources.clear();
    this.playAt = 0;
  }

  /** Tap while it speaks: stop talking, drop the rest of the turn, listen again. */
  interrupt() {
    this.stopAudio();
    this.dropAudio = true;
    this.turnDone = true;
    this.resume();
  }

  private meter() {
    const data = new Uint8Array(256);
    const tick = () => {
      if (this.stopped) return;
      if (this.analyser && this.sources.size > 0) {
        this.analyser.getByteTimeDomainData(data);
        let s = 0;
        for (const v of data) s += ((v - 128) / 128) ** 2;
        assistant.set({ level: Math.min(1, Math.sqrt(s / data.length) * 4) });
      }
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  private fail(msg: string) {
    assistant.set({ status: "error", error: msg, caption: msg });
    this.stop(false);
  }

  stop(clear = true) {
    this.stopped = true;
    cancelAnimationFrame(this.raf);
    if (this.watchdog) clearTimeout(this.watchdog);
    this.stopAudio();
    try {
      this.session?.close();
    } catch {}
    this.session = null;
    this.open = false;
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.inCtx?.close().catch(() => {});
    void this.outCtx?.close().catch(() => {});
    this.inCtx = this.outCtx = null;
    assistant.set({ voiceOn: false, level: 0, ...(clear ? { status: "idle" as const } : {}) });
  }
}
