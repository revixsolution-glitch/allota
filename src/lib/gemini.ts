/**
 * Google Gemini AI Integration for Telephony & Call Summaries
 * Uses native Gemini 2.5 Flash multimodal capabilities for direct audio transcription,
 * speaker diarization, and Hinglish PCD pharma sales insights.
 */

export interface GeminiCallAnalysis {
  transcript: string;
  aiSummary: string;
  behaviorTags: string[];
  sentiment: "HOT" | "WARM" | "COLD" | "SKEPTICAL" | "PRICE_SENSITIVE" | "NEUTRAL";
  monopolyTerritory?: string;
  productsInquired: string[];
  recommendedNextAction: string;
  durationSec?: number;
}

const DEFAULT_GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash";

/**
 * Analyzes audio recording directly with Gemini Flash
 * @param audioBase64 - Base64 encoded audio string
 * @param mimeType - e.g. "audio/mp3", "audio/m4a", "audio/wav", "audio/aac"
 */
export async function analyzeAudioRecordingWithGemini({
  audioBase64,
  mimeType = "audio/mp3",
  employeeName = "Sales Representative",
  customerName = "Prospective Chemist / Distributor",
}: {
  audioBase64: string;
  mimeType?: string;
  employeeName?: string;
  customerName?: string;
}): Promise<GeminiCallAnalysis> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured in environment variables.");
  }

  const model = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const systemPrompt = `
You are a senior pharma commercial intelligence analyst for an Indian PCD Pharma franchise & third-party manufacturing company.
You are analyzing a recorded phone call between an employee (${employeeName}) and a customer/chemist/distributor (${customerName}). The conversation is predominantly in Hindi/Hinglish.

Carefully listen to the entire audio and perform:
1. Verbatim speaker-diarized transcript in conversational Hinglish:
   Employee: [words spoken]
   Customer: [words spoken]
2. Professional 2-3 sentence executive summary in natural Hinglish for Admin review. Highlight key pain points, commercial interest, and budget.
3. Extract PCD monopoly territory/district requested (if any).
4. Extract key products, molecules, or segments inquired (e.g., Antibiotics, Syrups, Injectables, Derma, Cardiac-Diabetic).
5. Detect customer mood/lead status: HOT, WARM, COLD, SKEPTICAL, PRICE_SENSITIVE, or NEUTRAL.
6. Provide specific next action for the sales rep (e.g., "Send visual aid PDF and price list on WhatsApp for Gorakhpur district").
7. Generate 2 to 4 concise behavioral tags (e.g. ["Hot Lead", "PCD Monopoly - Gorakhpur", "Antibiotics Inquired"]).
8. Approximate duration of the call conversation in seconds (durationSec).

You MUST reply ONLY with a valid JSON object with this exact structure (no markdown fences, no code blocks):
{
  "transcript": "Employee: ...\\nCustomer: ...",
  "aiSummary": "Summary in natural Hinglish for management",
  "sentiment": "HOT",
  "monopolyTerritory": "Gorakhpur",
  "productsInquired": ["Cefixime 200mg", "Amoxiclav Dry Syrup"],
  "recommendedNextAction": "Send product catalog & rate list on WhatsApp",
  "behaviorTags": ["Hot Lead", "PCD Monopoly - Gorakhpur", "Antibiotics"],
  "durationSec": 180
}
`;

  const requestBody = {
    contents: [
      {
        role: "user",
        parts: [
          { text: systemPrompt },
          {
            inlineData: {
              mimeType,
              data: audioBase64,
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json",
    },
  };

  const modelsToTry = [
    model,
    "gemini-3.5-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
    "gemini-flash-lite-latest",
    "gemini-2.5-flash",
  ].filter((v, i, a) => a.indexOf(v) === i);

  let lastErrorText = "";
  let result = null;

  for (const currentModel of modelsToTry) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent?key=${apiKey}`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (response.ok) {
        result = await response.json();
        break;
      } else {
        lastErrorText = await response.text();
        console.warn(`Gemini model ${currentModel} returned ${response.status}: ${lastErrorText}`);
        // If high demand 503, brief pause before trying next model
        if (response.status === 503 || response.status === 429) {
          await new Promise((r) => setTimeout(r, 1200));
        }
      }
    } catch (e: any) {
      lastErrorText = e?.message || "Network error";
    }
  }

  if (!result) {
    throw new Error(`Gemini API error across all models: ${lastErrorText}`);
  }
  const rawText = result?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";

  try {
    const cleanJson = rawText.replace(/^```json\s*/, "").replace(/```$/, "").trim();
    return JSON.parse(cleanJson) as GeminiCallAnalysis;
  } catch (err) {
    console.error("Failed to parse Gemini JSON output:", rawText, err);
    return {
      transcript: rawText,
      aiSummary: "Call recorded and analyzed via Gemini.",
      sentiment: "NEUTRAL",
      productsInquired: [],
      recommendedNextAction: "Follow up with customer.",
      behaviorTags: ["Analyzed by Gemini"],
    };
  }
}

/**
 * Fallback / Text analysis with Gemini Flash when transcript is already available
 */
export async function analyzeTranscriptWithGemini({
  transcriptText,
  employeeName = "Sales Representative",
  customerName = "Prospective Chemist / Distributor",
}: {
  transcriptText: string;
  employeeName?: string;
  customerName?: string;
}): Promise<GeminiCallAnalysis> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured in environment variables.");
  }

  const model = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const prompt = `
Analyze this call transcript between employee (${employeeName}) and customer (${customerName}) for an Indian PCD Pharma company.
Transcript:
${transcriptText}

You MUST reply ONLY with a valid JSON object matching:
{
  "transcript": "${transcriptText.replace(/"/g, '\\"')}",
  "aiSummary": "Summary in natural Hinglish for management",
  "sentiment": "HOT" | "WARM" | "COLD" | "SKEPTICAL" | "PRICE_SENSITIVE" | "NEUTRAL",
  "monopolyTerritory": "string or null",
  "productsInquired": ["array", "of", "products"],
  "recommendedNextAction": "clear actionable next step",
  "behaviorTags": ["tag1", "tag2"]
}
`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json",
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${errorText}`);
  }

  const result = await response.json();
  const rawText = result?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
  const cleanJson = rawText.replace(/^```json\s*/, "").replace(/```$/, "").trim();
  return JSON.parse(cleanJson) as GeminiCallAnalysis;
}
