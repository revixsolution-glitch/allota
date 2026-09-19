import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// In-memory daily usage tracking for Gemini Free Tier cap
// Free tier allows up to 1,500 requests/day (RPD) & 15 requests/minute (RPM)
const GEMINI_FREE_DAILY_CAP = 1500;

let currentDay = new Date().toISOString().slice(0, 10);
let dailyUsageCount = 0;
const minuteRequests: number[] = [];

function checkAndIncrementQuota(): { allowed: boolean; remaining: number; used: number; reason?: string } {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== currentDay) {
    currentDay = today;
    dailyUsageCount = 0;
  }

  // Check 15 RPM rate-limiting
  const now = Date.now();
  while (minuteRequests.length > 0 && minuteRequests[0] < now - 60000) {
    minuteRequests.shift();
  }

  if (minuteRequests.length >= 15) {
    return {
      allowed: false,
      remaining: Math.max(0, GEMINI_FREE_DAILY_CAP - dailyUsageCount),
      used: dailyUsageCount,
      reason: "Rate limit: Max 15 requests/minute on Gemini Free Tier. Please wait a moment.",
    };
  }

  // Check 1,500 Daily Requests Cap
  if (dailyUsageCount >= GEMINI_FREE_DAILY_CAP) {
    return {
      allowed: false,
      remaining: 0,
      used: dailyUsageCount,
      reason: `Daily usage cap reached (${GEMINI_FREE_DAILY_CAP} requests/day Gemini Free tier). Quota resets at 00:00 UTC.`,
    };
  }

  dailyUsageCount++;
  minuteRequests.push(now);

  return {
    allowed: true,
    remaining: GEMINI_FREE_DAILY_CAP - dailyUsageCount,
    used: dailyUsageCount,
  };
}

export async function POST(req: Request) {
  try {
    const { message, history } = await req.json().catch(() => ({ message: "", history: [] }));
    const query = (message || "").trim();

    if (!query) {
      return NextResponse.json({ error: "Empty query provided" }, { status: 400 });
    }

    // 1. Check Gemini Free Tier Usage Cap (1500 requests/day)
    const quota = checkAndIncrementQuota();
    if (!quota.allowed) {
      return NextResponse.json({
        reply: quota.reason || "Daily free Gemini AI quota reached for today.",
        usage: {
          dailyUsed: quota.used,
          dailyCap: GEMINI_FREE_DAILY_CAP,
          remaining: quota.remaining,
        },
      });
    }

    // 2. Fetch Live CRM Snapshot for context injection
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [todayCallsCount, totalLeadsCount, hotLeadsCount, recentCalls] = await Promise.all([
      prisma.call.count({ where: { occurredAt: { gte: todayStart } } }).catch(() => 0),
      prisma.lead.count().catch(() => 0),
      prisma.lead.count({ where: { status: "INTERESTED" } }).catch(() => 0),
      prisma.call.findMany({
        take: 3,
        orderBy: { occurredAt: "desc" },
        include: { employee: true, lead: true, client: true },
      }).catch(() => []),
    ]);

    const systemPrompt = `You are Allota AI, the smart AI Copilot for Allota AI CRM & Telephony Operating System (domain: allota.in).
Role & Personality:
- Professional, helpful, executive, friendly.
- Fluent in natural Hinglish and English. You naturally understand and respond in Hinglish when the user writes in Hindi/Hinglish.
- You have live access to the CRM status:
  * Today's calls recorded: ${todayCallsCount}
  * Total active leads in pipeline: ${totalLeadsCount} (High intent / Hot leads: ${hotLeadsCount})
  * Recent calls: ${recentCalls.map(c => `${c.employee?.name || "Rep"} with ${c.client?.name || c.lead?.name || "Caller"} (${c.missed ? "Missed" : Math.round(c.durationSec || 0) + "s"})`).join("; ")}
- You can recommend direct CRM navigation:
  * Telephony Hub & Call Summaries: /admin/calls
  * Leads Desk: /admin/leads
  * Repeat Orders & Cadence: /admin/reorders
  * Credit Ledger: /admin/credits
  * Main Dashboard: /admin
Keep your answers direct, crisp (2-4 sentences max), and informative. Do not generate verbose essays.`;

    const apiKey = process.env.GEMINI_API_KEY;
    let reply = "";
    let actionUrl: string | undefined = undefined;
    let actionLabel: string | undefined = undefined;

    // 3. Call Google Gemini API
    if (apiKey && apiKey.length > 10 && !apiKey.includes("[SENSITIVE]")) {
      const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
      const candidateModels = [model, "gemini-2.5-flash", "gemini-1.5-flash"];

      for (const m of candidateModels) {
        try {
          const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKey}`;
          
          // Build formatted contents including conversation history
          const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [
            { role: "user", parts: [{ text: systemPrompt }] },
            { role: "model", parts: [{ text: "Understood. I am Allota AI, ready to assist with real-time CRM intelligence and telephony operations." }] },
          ];

          if (Array.isArray(history)) {
            for (const h of history.slice(-4)) {
              if (h.sender === "user") {
                contents.push({ role: "user", parts: [{ text: h.text }] });
              } else if (h.sender === "allota") {
                contents.push({ role: "model", parts: [{ text: h.text }] });
              }
            }
          }

          contents.push({ role: "user", parts: [{ text: query }] });

          const geminiRes = await fetch(geminiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents }),
          });

          if (geminiRes.ok) {
            const data = await geminiRes.json();
            const generated = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (generated) {
              reply = generated.trim();
              break;
            }
          }
        } catch {
          // Try next model fallback
        }
      }
    }

    // 4. Fallback if Gemini key unavailable or rate-limited
    if (!reply) {
      const q = query.toLowerCase();
      if (q.includes("call") || q.includes("summary") || q.includes("telephony")) {
        reply = `Allota AI Telephony par aaj ${todayCallsCount} calls record hui hain. Call recordings Google Drive se synchronized hain aur verbatim transcripts with Hinglish summaries ready hain.`;
        actionUrl = "/admin/calls";
        actionLabel = "Open Telephony Hub →";
      } else if (q.includes("lead") || q.includes("hot") || q.includes("inquiry")) {
        reply = `Abhi CRM mein total ${totalLeadsCount} leads active hain, jisme se ${hotLeadsCount} high-priority hot leads hain Meta aur IndiaMART se.`;
        actionUrl = "/admin/leads";
        actionLabel = "View Leads Management →";
      } else if (q.includes("reorder") || q.includes("order") || q.includes("cadence")) {
        reply = "Franchise accounts ke monthly purchase cadence Marg ERP & Busy se track ho rahe hain. Due aur overdue orders par 1-click WhatsApp alerts ready hain.";
        actionUrl = "/admin/reorders";
        actionLabel = "Check Reorder Alerts →";
      } else if (q.includes("credit") || q.includes("payment")) {
        reply = "Active credit records aur overdue accounts monitored hain. Aap direct Credit Ledger se reminders dispatch kar sakte hain.";
        actionUrl = "/admin/credits";
        actionLabel = "Manage Credits →";
      } else {
        reply = `Hello! Main Allota AI hoon. Aapke CRM database par ${todayCallsCount} calls aaj record hui hain aur ${totalLeadsCount} leads active hain. Bataiye kis baare mein information chahiye?`;
        actionUrl = "/admin";
        actionLabel = "Open Allota Dashboard →";
      }
    }

    // Auto-detect module deep links if not already set
    if (!actionUrl) {
      const textLower = (reply + " " + query).toLowerCase();
      if (textLower.includes("call") || textLower.includes("telephony") || textLower.includes("summary")) {
        actionUrl = "/admin/calls";
        actionLabel = "Open Telephony Hub →";
      } else if (textLower.includes("lead")) {
        actionUrl = "/admin/leads";
        actionLabel = "View Leads Desk →";
      } else if (textLower.includes("reorder") || textLower.includes("order")) {
        actionUrl = "/admin/reorders";
        actionLabel = "Open Reorder Cadence →";
      } else if (textLower.includes("credit")) {
        actionUrl = "/admin/credits";
        actionLabel = "Credit Management →";
      }
    }

    return NextResponse.json({
      reply,
      actionUrl,
      actionLabel,
      usage: {
        dailyUsed: quota.used,
        dailyCap: GEMINI_FREE_DAILY_CAP,
        remaining: quota.remaining,
      },
    });
  } catch (error) {
    console.error("Allota AI chat error:", error);
    return NextResponse.json(
      { reply: "Allota AI system temporarily busy. Please try again.", error: "Server error" },
      { status: 500 }
    );
  }
}
