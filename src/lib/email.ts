import nodemailer from "nodemailer";

interface SendOtpOptions {
  toEmail: string;
  otpCode: string;
  type: "PASSWORD_UPDATE" | "PASSWORD_RESET" | "ACCOUNT_CREATION";
  companyName?: string;
}

/**
 * Generate a cryptographically secure 6-digit numerical OTP
 */
export function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Configure Nodemailer transport from environment variables
 */
function getMailTransport() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const user = process.env.SMTP_USER || process.env.GMAIL_USER;
  const pass = process.env.SMTP_PASSWORD || process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD;

  if (user && pass) {
    if (host) {
      return nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
      });
    }

    // Gmail service preset fallback
    return nodemailer.createTransport({
      service: "gmail",
      auth: { user, pass },
    });
  }

  return null;
}

/**
 * Send an OTP verification email to user
 */
export async function sendOtpEmail({
  toEmail,
  otpCode,
  type,
  companyName = "Allota AI",
}: SendOtpOptions): Promise<{ success: boolean; simulated?: boolean; error?: string }> {
  const actionText =
    type === "PASSWORD_UPDATE"
      ? "updating your password"
      : type === "PASSWORD_RESET"
      ? "resetting your account password"
      : "verifying your email address";

  const subject = `[${companyName}] Your Verification OTP is ${otpCode}`;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #0f172a; }
          .container { max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
          .header { background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 24px; text-align: center; color: #ffffff; }
          .header h1 { margin: 0; font-size: 20px; font-weight: 800; letter-spacing: -0.5px; }
          .body { padding: 32px 24px; text-align: center; }
          .title { font-size: 16px; font-weight: 700; margin-bottom: 8px; color: #1e293b; }
          .desc { font-size: 13px; line-height: 1.5; color: #64748b; margin-bottom: 24px; }
          .otp-box { display: inline-block; background: #f1f5f9; border: 2px dashed #0d9488; border-radius: 12px; padding: 14px 28px; margin: 0 auto 24px auto; letter-spacing: 6px; font-size: 28px; font-weight: 800; color: #0f766e; font-family: monospace; }
          .validity { font-size: 12px; color: #94a3b8; margin-bottom: 24px; }
          .warning { font-size: 11px; line-height: 1.5; color: #ef4444; background: #fef2f2; border: 1px solid #fee2e2; border-radius: 8px; padding: 12px; text-align: left; }
          .footer { background: #f8fafc; padding: 16px 24px; text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${companyName} Security</h1>
          </div>
          <div class="body">
            <div class="title">Verification Code</div>
            <div class="desc">
              You are currently ${actionText}. Use the One-Time Password (OTP) below to verify your email.
            </div>
            <div class="otp-box">${otpCode}</div>
            <div class="validity">This OTP is strictly confidential and expires in <strong>10 minutes</strong>.</div>
            <div class="warning">
              <strong>Security Notice:</strong> Never share this OTP with anyone, including support staff. If you did not initiate this request, your account may be compromised. Please secure your account immediately.
            </div>
          </div>
          <div class="footer">
            &copy; ${new Date().getFullYear()} ${companyName} &bull; Enterprise Multi-Tenant Pharma CRM
          </div>
        </div>
      </body>
    </html>
  `;

  const text = `Your verification code for ${actionText} at ${companyName} is: ${otpCode}. This code is valid for 10 minutes.`;

  const transport = getMailTransport();

  if (!transport) {
    console.log(`\n======================================================`);
    console.log(`[EMAIL OTP SIMULATION]`);
    console.log(`To: ${toEmail}`);
    console.log(`OTP Code: ${otpCode}`);
    console.log(`Type: ${type}`);
    console.log(`Validity: 10 minutes`);
    console.log(`Configure SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD in .env for live email delivery.`);
    console.log(`======================================================\n`);
    return { success: true, simulated: true };
  }

  try {
    const fromAddress =
      process.env.SMTP_FROM ||
      `"${companyName} Security" <${process.env.SMTP_USER || process.env.GMAIL_USER}>`;

    await transport.sendMail({
      from: fromAddress,
      to: toEmail,
      subject,
      text,
      html,
    });

    console.log(`[Email Delivered] OTP successfully sent to ${toEmail}`);
    return { success: true, simulated: false };
  } catch (err: any) {
    console.error(`[Email Send Error] Failed to send to ${toEmail}:`, err);
    return { success: false, error: err?.message || "Failed to send verification email" };
  }
}
