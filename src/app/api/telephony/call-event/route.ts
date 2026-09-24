import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Call events sent from a rep's Android phone (MacroDroid / Tasker / Automate).
 * Auth: header `x-api-key: <CALL_EVENTS_API_KEY>` (or `Authorization: Bearer <key>`).
 *
 * Fields (JSON, form, or query string):
 *   employeePhone  the rep's own phone number (must match an employee's phone)
 *   customerPhone  the other party's number
 *   event          missed | rejected | incoming_ended | outgoing_ended
 *   duration       talk time in seconds (ended events); 0 / missing = never connected
 *   timestamp      optional: ISO date or epoch seconds/ms; defaults to now
 */
const MAX_DURATION_SEC = 4 * 60 * 60;
const DEDUPE_WINDOW_MS = 90 * 1000;

const digits10 = (v: unknown) => String(v ?? "").replace(/\D/g, "").slice(-10);

function authorized(req: NextRequest): boolean | "unconfigured" {
  const expected = process.env.CALL_EVENTS_API_KEY;
  if (!expected) return "unconfigured";
  const header = req.headers.get("x-api-key") || (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function parseTime(v: unknown): Date {
  const s = String(v ?? "").trim();
  if (!s) return new Date();
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    const d = new Date(n < 1e12 ? n * 1000 : n);
    if (!isNaN(d.getTime())) return d;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? new Date() : d;
}

export async function GET(req: NextRequest) {
  const ok = authorized(req);
  if (ok === "unconfigured") return NextResponse.json({ error: "Call events are not configured on the server." }, { status: 503 });
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ ok: true, service: "Allota call events" });
}

export async function POST(req: NextRequest) {
  const ok = authorized(req);
  if (ok === "unconfigured") return NextResponse.json({ error: "Call events are not configured on the server." }, { status: 503 });
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Accept JSON, form-encoded, or query-string input.
  const input: Record<string, string> = Object.fromEntries(new URL(req.url).searchParams.entries());
  try {
    const type = req.headers.get("content-type") || "";
    if (type.includes("application/json")) {
      Object.assign(input, await req.json());
    } else if (type.includes("form")) {
      const fd = await req.formData();
      fd.forEach((v, k) => (input[k] = String(v)));
    }
  } catch {
    return NextResponse.json({ error: "Could not read the request body." }, { status: 400 });
  }

  const event = String(input.event || "").toLowerCase().trim();
  if (!["missed", "rejected", "incoming_ended", "outgoing_ended"].includes(event)) {
    return NextResponse.json(
      { error: "event must be one of: missed, rejected, incoming_ended, outgoing_ended" },
      { status: 400 }
    );
  }
  const repDigits = digits10(input.employeePhone);
  const customerDigits = digits10(input.customerPhone);
  if (repDigits.length < 10 || customerDigits.length < 7) {
    return NextResponse.json({ error: "employeePhone and customerPhone are required." }, { status: 400 });
  }

  // Rep: exact match on the last 10 digits of a stored employee phone. No auto-creation.
  const employees = await prisma.employee.findMany({
    where: { phoneNumber: { contains: repDigits.slice(-5) } },
    select: { id: true, name: true, companyId: true, phoneNumber: true },
  });
  const employee = employees.find((e) => digits10(e.phoneNumber) === repDigits);
  if (!employee) {
    return NextResponse.json({ error: "No employee has that phone number." }, { status: 404 });
  }

  // Customer: lead first, then client, inside the rep's company.
  const companyScope = employee.companyId ? { companyId: employee.companyId } : {};
  const leadCandidates = await prisma.lead.findMany({
    where: { ...companyScope, phoneNumber: { contains: customerDigits.slice(-5) } },
    select: { id: true, phoneNumber: true },
  });
  const lead = leadCandidates.find((l) => digits10(l.phoneNumber) === customerDigits.slice(-10));
  let clientId: string | null = null;
  if (!lead) {
    const clientCandidates = await prisma.client.findMany({
      where: { ...companyScope, phoneNumber: { contains: customerDigits.slice(-5) } },
      select: { id: true, phoneNumber: true },
    });
    clientId = clientCandidates.find((c) => digits10(c.phoneNumber) === customerDigits.slice(-10))?.id ?? null;
  }

  // What happened?
  const talk = Math.min(Math.max(parseInt(input.duration ?? "0", 10) || 0, 0), MAX_DURATION_SEC);
  const direction = event === "outgoing_ended" ? "OUTBOUND" : "INBOUND";
  const connected = (event === "incoming_ended" || event === "outgoing_ended") && talk > 0;
  const tags =
    event === "rejected"
      ? ["Declined by rep"]
      : event === "missed"
      ? ["Missed Call"]
      : connected
      ? ["Connected"]
      : event === "outgoing_ended"
      ? ["Not answered"]
      : ["Missed Call"];
  const occurredAt = parseTime(input.timestamp);

  // Ignore retries of the same event.
  const dup = await prisma.call.findFirst({
    where: {
      employeeId: employee.id,
      direction,
      leadId: lead?.id ?? null,
      clientId,
      occurredAt: {
        gte: new Date(occurredAt.getTime() - DEDUPE_WINDOW_MS),
        lte: new Date(occurredAt.getTime() + DEDUPE_WINDOW_MS),
      },
    },
    select: { id: true },
  });
  if (dup) return NextResponse.json({ ok: true, duplicate: true, id: dup.id });

  const call = await prisma.call.create({
    data: {
      employeeId: employee.id,
      leadId: lead?.id ?? null,
      clientId,
      direction,
      missed: !connected,
      durationSec: connected ? talk : 0,
      behaviorTags: tags,
      occurredAt,
    },
    select: { id: true },
  });

  return NextResponse.json({
    ok: true,
    id: call.id,
    rep: employee.name,
    matchedLead: Boolean(lead),
    matchedClient: Boolean(clientId),
    result: connected ? "answered" : event === "rejected" ? "declined" : "not connected",
  });
}
