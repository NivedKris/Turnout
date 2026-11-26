// Live probe (text in): token → Live session → tool call → spoken transcript.
//   MODEL=gemini-3.8-live Q="are we on track?" node --env-file=.env --import tsx scripts/assistant/live-probe.mts
import { GoogleGenAI, Modality, type LiveServerMessage, type Session } from "@google/genai";

const key = process.env.ASSISTANT_GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY_2!;
const model = process.env.MODEL ?? "gemini-3.8-live";
const q = process.env.Q ?? "Are we on track for the visitor goal?";

const t0 = Date.now();
const ms = () => `${Date.now() - t0}ms`;
const server = new GoogleGenAI({ apiKey: key, httpOptions: { apiVersion: "v1alpha" } });
const token = await server.authTokens.create({
  config: { uses: 1, expireTime: new Date(Date.now() + 30 * 60e3).toISOString(), newSessionExpireTime: new Date(Date.now() + 2 * 60e3).toISOString(), httpOptions: { apiVersion: "v1alpha" } },
});
console.log("token", token.name ? "ok" : "MISSING", ms());

const ai = new GoogleGenAI({ apiKey: token.name!, httpOptions: { apiVersion: "v1alpha" } });
let said = "";
let audio = 0;
let session: Session | null = null;
let finish: () => void = () => {};
const done = new Promise<void>((r) => (finish = r));

session = await ai.live.connect({
  model,
  config: {
    responseModalities: [Modality.AUDIO],
    outputAudioTranscription: {},
    systemInstruction: "You are the growth analyst for a college festival. Use tools for every number. Answer in English, two short sentences.",
    tools: [{ functionDeclarations: [{ name: "get_overview", description: "Headline status: goals and projections.", parametersJsonSchema: { type: "object", properties: { as_of: { type: "string" } } } }] }],
  },
  callbacks: {
    onopen: () => console.log("open", ms()),
    onmessage: (m: LiveServerMessage) => {
      if (m.toolCall?.functionCalls?.length) {
        for (const fc of m.toolCall.functionCalls) console.log("TOOL", fc.name, JSON.stringify(fc.args), ms());
        session?.sendToolResponse({
          functionResponses: m.toolCall.functionCalls.map((fc) => ({
            id: fc.id,
            name: fc.name,
            response: { visitors: { actual: 0, goal: 2200, projected: 1837, status: "off_track" }, registrations: { actual: 2337, goal: 3200, projected: 2887, status: "at_risk" } },
          })),
        });
      }
      const sc = m.serverContent;
      if (sc?.outputTranscription?.text) said += sc.outputTranscription.text;
      for (const p of sc?.modelTurn?.parts ?? []) if (p.inlineData?.data) audio += p.inlineData.data.length;
      if (sc?.turnComplete && said) finish();
    },
    onerror: (e) => console.log("ERROR", e.message),
    onclose: (e) => console.log("close", e.code, e.reason || ""),
  },
});
session.sendRealtimeInput({ text: q });
await Promise.race([done, new Promise((r) => setTimeout(r, 40_000))]);
console.log(`SAID (${ms()}, ${Math.round((audio * 3) / 4 / 1024)} KB audio):`, said.trim() || "(nothing)");
session.close();
process.exit(0);
