import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, getActiveCompanyId } from "@/lib/auth";

// In-memory daily usage tracking for Gemini Free Tier cap
// Free tier allows up to 1,500 requests/day (RPD) & 15 requests/minute (RPM)
const GEMINI_FREE_DAILY_CAP = 1500;

// Usage is tracked per company, because each company brings its own Gemini key (and its own quota).
const usageByCompany = new Map<string, { day: string; count: number; minute: number[] }>();

function checkAndIncrementQuota(companyId: string): { allowed: boolean; remaining: number; used: number; reason?: string } {
  const today = new Date().toISOString().slice(0, 10);
  let u = usageByCompany.get(companyId);
  if (!u || u.day !== today) {
    u = { day: today, count: 0, minute: [] };
    usageByCompany.set(companyId, u);
  }

  // 15 requests / minute
  const now = Date.now();
  while (u.minute.length > 0 && u.minute[0] < now - 60000) u.minute.shift();
  if (u.minute.length >= 15) {
    return {
      allowed: false,
      remaining: Math.max(0, GEMINI_FREE_DAILY_CAP - u.count),
      used: u.count,
      reason: "Rate limit: Max 15 requests/minute on AI engine. Please wait a moment.",
    };
  }

  // Daily cap
  if (u.count >= GEMINI_FREE_DAILY_CAP) {
    return {
      allowed: false,
      remaining: 0,
      used: u.count,
      reason: `Daily usage cap reached (${GEMINI_FREE_DAILY_CAP} requests/day). Quota resets at 00:00 UTC.`,
    };
  }

  u.count++;
  u.minute.push(now);
  return { allowed: true, remaining: GEMINI_FREE_DAILY_CAP - u.count, used: u.count };
}

export async function POST(req: Request) {
  try {
    // Signed-in users only, and only their own company's data.
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ reply: "Please sign in to use the AI assistant.", error: "Unauthorized" }, { status: 401 });
    }
    const companyId = getActiveCompanyId(session);
    if (!companyId) {
      return NextResponse.json(
        { reply: "Open a company workspace to use the AI assistant.", error: "No company" },
        { status: 403 }
      );
    }
    const isRep = session.role === "EMPLOYEE";
    const leadScope = { companyId, ...(isRep && session.employeeId ? { assignedEmployeeId: session.employeeId } : {}) };
    const callScope = isRep && session.employeeId ? { employeeId: session.employeeId } : { employee: { companyId } };

    const { message, history } = await req.json().catch(() => ({ message: "", history: [] }));
    const query = (message || "").trim();

    if (!query) {
      return NextResponse.json({ error: "Empty query provided" }, { status: 400 });
    }

    // 1. Check AI Tier Usage Cap (1500 requests/day)
    const quota = checkAndIncrementQuota(companyId);
    if (!quota.allowed) {
      return NextResponse.json({
        reply: quota.reason || "Daily free AI quota reached for today.",
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
      prisma.call.count({ where: { occurredAt: { gte: todayStart }, ...callScope } }).catch(() => 0),
      prisma.lead.count({ where: leadScope }).catch(() => 0),
      prisma.lead.count({ where: { status: "INTERESTED", ...leadScope } }).catch(() => 0),
      prisma.call.findMany({
        where: callScope,
        take: 3,
        orderBy: { occurredAt: "desc" },
        include: { employee: true, lead: true, client: true },
      }).catch(() => []),
    ]);

    const systemPrompt = `You are Allota AI Copilot, the commercial intelligence AI for Allota AI CRM (allota.in).

CRITICAL RESPONSE FORMAT RULE:
1. Give a crisp 1-LINER DIRECT ANSWER to the user's question.
2. Followed by a 1-liner navigation direction pointing to where to get the full info in the CRM using the EXACT FEATURE NAVIGATION NAME.
3. Keep the entire response strictly 2 sentences max (1 sentence direct answer + 1 sentence navigation pointer).

EXACT CRM NAVIGATION FEATURE NAMES (ALWAYS USE THESE EXACT NAMES):
- "Dashboard" (/admin): Executive overview, top metrics, date filters.
- "Lead Center" (/admin/leads): All active leads pipeline, lead details, status tags.
- "Leads IQ" (/admin/leads-iq): AI-ranked hot leads and conversion intelligence.
- "AI Calls Summary" (/admin/calls): Recorded telephony audio, verbatim transcripts, Hinglish summaries.
- "Employees" (/admin/employees): Sales reps, calling performance, rep quotas.
- "Sources & Excel" (/admin/sources): Meta ads, IndiaMART leads, bulk Excel uploader.
- "Leads Reassign" (/admin/leads-reassign): Territory reassignments and rep lead transfers.
- "Clients" (/admin/clients): Chemist & distributor accounts directory.
- "Territories" (/admin/territories): District PCD monopoly and PIN code allocations.
- "Reorders" (/admin/reorders): Monthly repeat purchase cadence & WhatsApp alerts.
- "Credit Management" (/admin/credits): Outstanding balances, payment ledgers, recovery.
- "Stock IQ" (/admin/stock-iq): Medicine inventory and warehouse stock levels.

Live CRM Snapshot:
* Today's calls recorded: ${todayCallsCount}
* Total active leads: ${totalLeadsCount} (High intent / Hot leads: ${hotLeadsCount})
* Recent calls: ${recentCalls.map(c => `${c.employee?.name || "Rep"} with ${c.client?.name || c.lead?.name || "Caller"} (${c.missed ? "Missed" : Math.round(c.durationSec || 0) + "s"})`).join("; ")}

STRICT SCOPE & GUARDRAIL:
- If the user asks ANY question outside Allota AI CRM or PCD pharma operations:
  * REFUSE IMMEDIATELY: "Sorry, I can't help with that. I can only assist with Allota AI CRM, PCD pharma operations, telephony intelligence, leads, and orders." (or Hinglish equivalent).
  * Do NOT answer off-topic questions under any circumstances.`;

    // Each company uses the Gemini key entered for it at onboarding (Settings can change it).
    // Server env keys are the platform fallback. Nothing is hardcoded.
    const companySettings = await prisma.companySettings.findFirst({
      where: { companyId },
      select: { geminiApiKey: true },
    });
    const apiKey =
      companySettings?.geminiApiKey?.trim() || process.env.GEMINI_CHAT_API_KEY || process.env.GEMINI_API_KEY;
    let reply = "";
    let actionUrl: string | undefined = undefined;
    let actionLabel: string | undefined = undefined;

    // 3. Call Google Gemini API
    if (apiKey && apiKey.length > 10 && !apiKey.includes("[SENSITIVE]")) {
      const candidateModels = [
        "gemini-3.6-flash",
        "gemini-3.5-flash",
        "gemini-3.5-flash-lite",
        "gemini-flash-latest",
        process.env.GEMINI_MODEL || "gemini-2.5-flash",
      ];

      for (const m of candidateModels) {
        try {
          const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKey}`;
          
          // Build formatted contents including conversation history with strict few-shot boundaries & 1-liner format
          const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [
            { role: "user", parts: [{ text: systemPrompt }] },
            {
              role: "model",
              parts: [
                {
                  text: "Understood. I am Allota AI Copilot. I will strictly give a 1-liner direct answer followed by a 1-liner navigation pointer using the exact CRM feature name (e.g. 'Lead Center', 'AI Calls Summary', 'Reorders', 'Credit Management'). If asked about anything outside the CRM, I will immediately refuse.",
                },
              ],
            },
            { role: "user", parts: [{ text: "tell me a story about space and aliens" }] },
            {
              role: "model",
              parts: [
                {
                  text: "Sorry, I can't help with that. I can only assist with Allota AI CRM, PCD pharma operations, telephony intelligence, leads, and orders.",
                },
              ],
            },
            { role: "user", parts: [{ text: "aaj kitni calls hui hain?" }] },
            {
              role: "model",
              parts: [
                {
                  text: `Aaj CRM mein kul ${todayCallsCount} calls record hui hain. Full audio recordings aur verbatim transcripts ke liye **AI Calls Summary** (/admin/calls) par jayein.`,
                },
              ],
            },
            { role: "user", parts: [{ text: "how many leads are in pipeline?" }] },
            {
              role: "model",
              parts: [
                {
                  text: `There are currently ${totalLeadsCount} active leads in your sales pipeline. To view complete lead details and follow-ups, visit **Lead Center** (/admin/leads).`,
                },
              ],
            },
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
            body: JSON.stringify({
              contents,
              generationConfig: {
                temperature: 0.1,
                topP: 0.7,
              },
            }),
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
        reply = `Aaj CRM par kul ${todayCallsCount} calls record hui hain. Full audio recordings aur verbatim Hinglish transcripts ke liye **AI Calls Summary** (/admin/calls) par jayein.`;
        actionUrl = "/admin/calls";
        actionLabel = "Open AI Calls Summary →";
      } else if (q.includes("lead") || q.includes("hot") || q.includes("inquiry")) {
        reply = `Pipeline mein kul ${totalLeadsCount} active leads hain, jisme se ${hotLeadsCount} hot leads hain. Complete list aur lead details ke liye **Lead Center** (/admin/leads) par jayein.`;
        actionUrl = "/admin/leads";
        actionLabel = "Open Lead Center →";
      } else if (q.includes("reorder") || q.includes("order") || q.includes("cadence")) {
        reply = "Franchise accounts ka monthly purchase cadence Marg ERP aur Busy se sync hai. Due reorders aur WhatsApp alerts ke liye **Reorders** (/admin/reorders) par jayein.";
        actionUrl = "/admin/reorders";
        actionLabel = "Open Reorders →";
      } else if (q.includes("credit") || q.includes("payment")) {
        reply = "Active credit ledgers aur overdue balances monitored hain. Outstanding accounts aur payment reminders ke liye **Credit Management** (/admin/credits) par jayein.";
        actionUrl = "/admin/credits";
        actionLabel = "Open Credit Management →";
      } else {
        reply = `Aaj CRM mein ${todayCallsCount} calls record hui hain aur ${totalLeadsCount} leads active hain. Live executive metrics ke liye **Dashboard** (/admin) par jayein.`;
        actionUrl = "/admin";
        actionLabel = "Open Dashboard →";
      }
    }

    // Auto-detect module deep links matching exact navigation names
    if (!actionUrl) {
      const textLower = (reply + " " + query).toLowerCase();
      if (textLower.includes("call") || textLower.includes("telephony") || textLower.includes("summary")) {
        actionUrl = "/admin/calls";
        actionLabel = "Open AI Calls Summary →";
      } else if (textLower.includes("lead center") || textLower.includes("lead")) {
        actionUrl = "/admin/leads";
        actionLabel = "Open Lead Center →";
      } else if (textLower.includes("reorder")) {
        actionUrl = "/admin/reorders";
        actionLabel = "Open Reorders →";
      } else if (textLower.includes("credit")) {
        actionUrl = "/admin/credits";
        actionLabel = "Open Credit Management →";
      } else if (textLower.includes("employee") || textLower.includes("rep")) {
        actionUrl = "/admin/employees";
        actionLabel = "Open Employees →";
      } else if (textLower.includes("source") || textLower.includes("excel")) {
        actionUrl = "/admin/sources";
        actionLabel = "Open Sources & Excel →";
      } else if (textLower.includes("territor")) {
        actionUrl = "/admin/territories";
        actionLabel = "Open Territories →";
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
