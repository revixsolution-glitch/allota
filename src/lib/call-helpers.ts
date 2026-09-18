export function craftAiWhatsAppMissedMessage({
  leadName,
  repName,
  companyName,
  division,
  territory,
}: {
  leadName?: string | null;
  repName?: string | null;
  companyName?: string | null;
  division?: string | null;
  territory?: string | null;
}) {
  const name = leadName?.trim() || "Sir/Madam";
  const rep = repName?.trim() || "Our Sales Team";
  const company = companyName?.trim() || "Pharma Desk";
  const div = division === "THIRD_PARTY" ? "Third-Party Pharma Manufacturing" : "PCD Pharma Franchise";
  const area = territory?.trim() ? ` for ${territory}` : "";

  return `Hello ${name},\n\nThis is ${rep} from ${company}.\n\nWe just tried reaching you regarding your inquiry for ${div}${area}. Sorry we missed you!\n\nPlease let us know a convenient time to speak, or feel free to reply here with your product requirements and district details.\n\nLooking forward to collaborating with you.\n\nBest regards,\n${rep}\n${company}`;
}
