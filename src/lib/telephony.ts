import twilio from "twilio";
import { prisma } from "@/lib/prisma";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;
const deepgramApiKey = process.env.DEEPGRAM_API_KEY;

export function getTwilioClient() {
  if (!accountSid || !authToken) {
    return null;
  }
  return twilio(accountSid, authToken);
}

/**
 * Normalizes an Indian or international phone number to E.164 format (+91...)
 */
export function formatToE164(phone: string): string {
  const cleaned = phone.replace(/[^0-9+]/g, "");
  if (cleaned.startsWith("+")) {
    return cleaned;
  }
  if (cleaned.length === 10) {
    return `+91${cleaned}`;
  }
  if (cleaned.startsWith("91") && cleaned.length === 12) {
    return `+${cleaned}`;
  }
  return `+${cleaned}`;
}

/**
 * Initiates a Cloud Telephony Bridge:
 * 1. Twilio dials the Employee's mobile phone first.
 * 2. When employee answers, Twilio dials the Client/Prospect.
 * 3. Both sides are bridged with dual-channel recording.
 */
export async function startBridgeCall({
  employeePhone,
  clientPhone,
  leadId,
  clientId,
  employeeId,
  appBaseUrl,
}: {
  employeePhone: string;
  clientPhone: string;
  leadId?: string;
  clientId?: string;
  employeeId: string;
  appBaseUrl: string;
}) {
  const client = getTwilioClient();
  if (!client || !twilioPhoneNumber) {
    throw new Error(
      "Twilio credentials (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER) are not configured."
    );
  }

  const formattedEmployeePhone = formatToE164(employeePhone);
  const formattedClientPhone = formatToE164(clientPhone);

  const callRecord = await prisma.call.create({
    data: {
      employeeId,
      leadId: leadId || null,
      clientId: clientId || null,
      direction: "OUTBOUND",
      occurredAt: new Date(),
      missed: false,
    },
  });

  const twimlUrl = `${appBaseUrl}/api/telephony/bridge-twiml?target=${encodeURIComponent(
    formattedClientPhone
  )}&callId=${encodeURIComponent(callRecord.id)}`;

  const statusCallbackUrl = `${appBaseUrl}/api/telephony/call-status?callId=${encodeURIComponent(
    callRecord.id
  )}`;

  const call = await client.calls.create({
    to: formattedEmployeePhone,
    from: twilioPhoneNumber,
    url: twimlUrl,
    statusCallback: statusCallbackUrl,
    statusCallbackEvent: ["completed", "failed", "busy", "no-answer"],
    statusCallbackMethod: "POST",
    record: true,
    recordingChannels: "dual",
    recordingStatusCallback: `${appBaseUrl}/api/telephony/recording-callback?callId=${encodeURIComponent(
      callRecord.id
    )}`,
    recordingStatusCallbackMethod: "POST",
  });

  return {
    success: true,
    callSid: call.sid,
    callId: callRecord.id,
  };
}

/**
 * Transcribes and summarizes call audio using Deepgram Nova-2
 */
export async function transcribeAndSummarizeCall({
  callId,
  recordingUrl,
}: {
  callId: string;
  recordingUrl: string;
}) {
  if (!deepgramApiKey) {
    console.warn("DEEPGRAM_API_KEY not configured. Skipping transcription.");
    await prisma.call.update({
      where: { id: callId },
      data: { recordingUrl },
    });
    return null;
  }

  try {
    const audioUrl = recordingUrl.endsWith(".mp3")
      ? recordingUrl
      : `${recordingUrl}.mp3`;

    const deepgramEndpoint =
      "https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&summarize=v2&sentiment=true&diarize=true";

    const response = await fetch(deepgramEndpoint, {
      method: "POST",
      headers: {
        Authorization: `Token ${deepgramApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url: audioUrl }),
    });

    if (!response.ok) {
      throw new Error(`Deepgram API returned ${response.status}`);
    }

    const data = await response.json();
    const transcript =
      data?.results?.channels?.[0]?.alternatives?.[0]?.transcript || "";
    const summary =
      data?.results?.summary?.short ||
      data?.results?.channels?.[0]?.alternatives?.[0]?.paragraphs?.transcript ||
      "";

    const sentiments =
      data?.results?.sentiments?.segments?.map((s: any) => s.sentiment) || [];
    const behaviorTags = Array.from(new Set(sentiments)) as string[];

    await prisma.call.update({
      where: { id: callId },
      data: {
        recordingUrl: audioUrl,
        transcript,
        aiSummary: summary || transcript.slice(0, 300),
        behaviorTags,
      },
    });

    return { transcript, summary, behaviorTags };
  } catch (err) {
    console.error("Failed to transcribe call:", err);
    await prisma.call.update({
      where: { id: callId },
      data: { recordingUrl },
    });
    return null;
  }
}
