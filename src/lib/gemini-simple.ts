/**
 * One-shot Gemini text generation, shared by any feature that just needs
 * "give me back a short piece of text for this prompt" (e.g. drafting a
 * social reply) — not a chat conversation. Tries the same model fallback
 * list as the AI chat assistant, so behavior stays consistent.
 */
const CANDIDATE_MODELS = [
  "gemini-3.5-flash",
  "gemini-flash-lite-latest",
  "gemini-3.1-flash-lite",
  "gemini-3.5-flash-lite",
];

export async function generateSimpleReply(apiKey: string, prompt: string): Promise<string | null> {
  for (const model of CANDIDATE_MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.4, topP: 0.8 },
        }),
      });
      if (!res.ok) continue;
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) return text.trim();
    } catch {
      // try next model
    }
  }
  return null;
}
