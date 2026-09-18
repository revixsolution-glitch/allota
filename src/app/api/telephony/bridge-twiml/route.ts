import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const target = searchParams.get("target");
  const callId = searchParams.get("callId");

  const response = new twilio.twiml.VoiceResponse();

  if (!target) {
    response.say("Sorry, no target phone number was provided for this call.");
    return new NextResponse(response.toString(), {
      headers: { "Content-Type": "text/xml" },
    });
  }

  response.say({ voice: "Polly.Aditi" }, "Connecting you to the prospect now. This call is recorded for quality assurance.");
  
  const dial = response.dial({
    callerId: process.env.TWILIO_PHONE_NUMBER,
    record: "record-from-answer-dual",
  });
  dial.number(target);

  return new NextResponse(response.toString(), {
    headers: { "Content-Type": "text/xml" },
  });
}
