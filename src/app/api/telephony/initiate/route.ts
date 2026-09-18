import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { startBridgeCall } from "@/lib/telephony";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { leadId, clientId, customPhone } = body;

    let targetPhone = customPhone;
    let employeeId: string | undefined = session.employeeId ?? undefined;

    // If employee profile isn't in session (e.g. admin calling), find first employee or company default
    if (!employeeId) {
      const firstEmp = await prisma.employee.findFirst();
      employeeId = firstEmp?.id;
    }

    if (!employeeId) {
      return NextResponse.json({ error: "No employee profile found to initiate call" }, { status: 400 });
    }

    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { phoneNumber: true, name: true },
    });

    if (!employee?.phoneNumber) {
      return NextResponse.json(
        { error: "Employee profile does not have a registered phone number. Please update phone in Employee management." },
        { status: 400 }
      );
    }

    if (leadId) {
      const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { phoneNumber: true } });
      targetPhone = lead?.phoneNumber;
    } else if (clientId) {
      const client = await prisma.client.findUnique({ where: { id: clientId }, select: { phoneNumber: true } });
      targetPhone = client?.phoneNumber;
    }

    if (!targetPhone) {
      return NextResponse.json({ error: "Prospect phone number not found" }, { status: 400 });
    }

    const appBaseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      (req.headers.get("x-forwarded-host")
        ? `https://${req.headers.get("x-forwarded-host")}`
        : "https://allota.vercel.app");

    const result = await startBridgeCall({
      employeePhone: employee.phoneNumber,
      clientPhone: targetPhone,
      leadId,
      clientId,
      employeeId,
      appBaseUrl,
    });

    return NextResponse.json({
      success: true,
      message: `Calling ${employee.name} (${employee.phoneNumber}). Answer your phone to be connected to the prospect.`,
      callSid: result.callSid,
      callId: result.callId,
    });
  } catch (err: any) {
    console.error("Initiate call error:", err);
    return NextResponse.json({ error: err.message || "Failed to start call" }, { status: 500 });
  }
}
