import { NextResponse } from "next/server";
import { createChallenge, verifyChallenge } from "@/lib/captcha";

// Simple IP-based rate limiting
const ipAttempts = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const rec = ipAttempts.get(ip);
  if (!rec || now > rec.resetAt) {
    ipAttempts.set(ip, { count: 1, resetAt: now + 60 * 1000 });
    return true;
  }
  if (rec.count >= 20) {
    return false; // Rate limit exceeded (more than 20 captcha attempts in 1 min)
  }
  rec.count++;
  return true;
}

// GET: Generate a new human verification challenge
export async function GET(request: Request) {
  const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0] || "127.0.0.1";
  if (!checkRateLimit(clientIp)) {
    return NextResponse.json(
      { error: "Too many verification attempts. Please wait 1 minute." },
      { status: 429 }
    );
  }

  const challenge = createChallenge();
  return NextResponse.json({
    challengeToken: challenge.challengeToken,
    width: 280,
  });
}

// POST: Verify the slider completion and human trajectory
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || !body.challengeToken || typeof body.finalX !== "number") {
      return NextResponse.json({ error: "Missing verification parameters." }, { status: 400 });
    }

    const { challengeToken, finalX, trajectory } = body;
    const result = verifyChallenge(challengeToken, finalX, trajectory || []);

    if (!result.success) {
      return NextResponse.json({ error: result.error || "Verification failed." }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      humanToken: result.humanToken,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}
