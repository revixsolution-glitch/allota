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

const envModel = process.env.GEMINI_MODEL;
const DEFAULT_GEMINI_MODEL =
  envModel && !envModel.includes("2.5") ? envModel : "gemini-3.5-flash";

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
  customApiKey,
}: {
  audioBase64: string;
  mimeType?: string;
  employeeName?: string;
  customerName?: string;
  customApiKey?: string;
}): Promise<GeminiCallAnalysis> {
  const apiKey = customApiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("API key for AI use is not configured (neither for organization nor system).");
  }

  const model = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const systemPrompt = `
You are a senior pharma commercial intelligence analyst for an Indian PCD Pharma franchise & third-party manufacturing company.
You are analyzing a recorded phone call between an employee (${employeeName}) and a customer/chemist/distributor (${customerName}). The conversation is predominantly in Hindi/Hinglish.

CRITICAL EXECUTIVE CONTEXT:
- Tarun Sir is the Managing Director (MD) and executive leadership of Kesrox Healthcare. If a call or discussion involves or references Tarun Sir, treat it as an executive/internal management discussion, instruction, or approval, NOT an external prospect.

Carefully listen to the entire audio and perform:
1. Verbatim speaker-diarized transcript in conversational Hinglish:
   Employee: [words spoken]
   Customer: [words spoken]
2. Professional 2-3 sentence executive summary STRICTLY in natural, fluent business Hinglish (conversational Hindi written in English/Latin script). Highlight commercial intent, area/products requested, and next steps. Do NOT write in pure English.
   - Example: "Customer ne Bhopal district ke liye PCD franchise ki inquiry ki hai. Unhone Excel product list aur prices WhatsApp par mangi hain. High buying intent ke sath monopoly area confirm kiya hai."
3. Classify the lead status strictly into one of:
   - "HOT": High commercial interest, asked for pricing/catalog/monopoly territory, or booked order.
   - "WARM": Interested in PCD franchise or pharma products, asked for details or follow-up.
   - "COLD": Low engagement, asked to call later, or price hesitant.
   - "DEAD": No commercial business (mic testing, casual/personal call, wrong number, or unanswered).
4. Extract PCD monopoly territory/district requested (if any).
5. Extract key products, molecules, or segments inquired (e.g., Antibiotics, Syrups, Injectables, Derma, Cardiac-Diabetic).
6. Generate 2 to 4 concise tags where the FIRST tag MUST be one of: "🔥 Hot Lead", "⚡ Warm Lead", "❄️ Cold Lead", or "💀 Dead Lead". Followed by territory or product tags.
7. Approximate duration of the call conversation in seconds (durationSec).

You MUST reply ONLY with a valid JSON object with this exact structure (no markdown fences, no code blocks):
{
  "transcript": "Employee: ...\\nCustomer: ...",
  "aiSummary": "Summary strictly in natural Hinglish for management",
  "leadCategory": "HOT",
  "sentiment": "HOT",
  "monopolyTerritory": "Gorakhpur",
  "productsInquired": ["Cefixime 200mg", "Amoxiclav Dry Syrup"],
  "recommendedNextAction": "Send product catalog & rate list on WhatsApp",
  "behaviorTags": ["🔥 Hot Lead", "PCD Monopoly - Gorakhpur", "Antibiotics"],
  "durationSec": 180
}
`;

  // Google Gemini REST inlineData limit is 20MB. Keep base64 within ~14MB (approx 10MB raw audio).
  let safeAudioBase64 = audioBase64;
  if (safeAudioBase64.length > 14 * 1024 * 1024) {
    safeAudioBase64 = safeAudioBase64.slice(0, 14 * 1024 * 1024);
  }

  const requestBody = {
    contents: [
      {
        role: "user",
        parts: [
          { text: systemPrompt },
          {
            inlineData: {
              mimeType,
              data: safeAudioBase64,
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
    "gemini-flash-lite-latest",
    "gemini-3.1-flash-lite",
    "gemini-3.5-flash-lite",
  ].filter((v, i, a) => Boolean(v) && !v.includes("2.5") && a.indexOf(v) === i);

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
        signal: AbortSignal.timeout(35000),
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
    const firstBrace = rawText.indexOf("{");
    const lastBrace = rawText.lastIndexOf("}");
    let candidate = rawText;
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      candidate = rawText.substring(firstBrace, lastBrace + 1);
    } else {
      candidate = rawText.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/, "").trim();
    }
    const parsed = JSON.parse(candidate) as GeminiCallAnalysis;
    if (parsed && typeof parsed === "object") {
      if (!parsed.aiSummary || parsed.aiSummary.includes("Call recorded and analyzed")) {
        parsed.aiSummary = `${customerName} ke sath phone discussion record hua. Audio sun kar lead review ki ja sakti hai.`;
      }
      return parsed;
    }
    throw new Error("Invalid parsed object structure");
  } catch (err) {
    console.error("Failed to parse AI JSON output:", rawText, err);
    return {
      transcript: rawText,
      aiSummary: `${customerName} ke sath phone discussion record hua aur audio CRM me log kiya gaya.`,
      sentiment: "NEUTRAL",
      productsInquired: [],
      recommendedNextAction: "Follow up with customer.",
      behaviorTags: ["⚡ Warm Lead", "Google Drive Sync"],
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
