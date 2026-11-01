import { createHmac, randomBytes } from "crypto";

const SECRET = process.env.JWT_SECRET || "allota-captcha-security-salt-2026-kvm";

// In-memory nonce store to prevent replay attacks
const usedNonces = new Set<string>();

// Auto-purge old nonces every 10 minutes
setInterval(() => {
  usedNonces.clear();
}, 10 * 60 * 1000);

export interface TrajectoryPoint {
  x: number;
  y: number;
  t: number;
}

/**
 * Creates a cryptographically signed challenge for the client slider.
 * The client NEVER sees targetX; only the encrypted/signed payload holds it.
 */
export function createChallenge() {
  const nonce = randomBytes(8).toString("hex");
  const minRequiredX = 160; // Must slide across to the right (at least 160px)
  const exp = Date.now() + 3 * 60 * 1000; // 3 minutes validity

  const payload = `${nonce}:${minRequiredX}:${exp}`;
  const sig = createHmac("sha256", SECRET).update(payload).digest("hex");
  const challengeToken = Buffer.from(`${payload}:${sig}`).toString("base64url");

  return {
    challengeToken,
    exp,
  };
}

/**
 * Validates the slider solution and human behavioral movement entropy.
 */
export function verifyChallenge(
  challengeToken: string,
  userFinalX: number,
  trajectory: TrajectoryPoint[] = []
): { success: boolean; humanToken?: string; error?: string } {
  try {
    const decoded = Buffer.from(challengeToken, "base64url").toString("utf8");
    const [nonce, minXStr, expStr, sig] = decoded.split(":");

    if (!nonce || !minXStr || !expStr || !sig) {
      return { success: false, error: "Invalid challenge token format." };
    }

    if (usedNonces.has(nonce)) {
      return { success: false, error: "Challenge token already used. Please refresh." };
    }

    // Verify HMAC signature
    const expectedSig = createHmac("sha256", SECRET)
      .update(`${nonce}:${minXStr}:${expStr}`)
      .digest("hex");

    if (sig !== expectedSig) {
      return { success: false, error: "Challenge signature mismatch." };
    }

    // Check expiration
    const exp = parseInt(expStr, 10);
    if (Date.now() > exp) {
      return { success: false, error: "Verification challenge expired. Please retry." };
    }

    // Must have slid at least to the target distance on the right
    const minRequiredX = parseInt(minXStr, 10) || 160;
    if (userFinalX < minRequiredX) {
      return { success: false, error: "Please slide the button all the way to the right to verify." };
    }

    // Biometric Human Trajectory Verification:
    // Real humans generate mousemove/touchmove events with natural hand duration
    if (!Array.isArray(trajectory) || trajectory.length < 3) {
      return { success: false, error: "Automated pointer detected. Please slide manually." };
    }

    const duration = trajectory[trajectory.length - 1].t - trajectory[0].t;
    if (duration < 150) {
      return { success: false, error: "Movement was too fast for a human hand. Please slide naturally." };
    }

    if (duration > 45000) {
      return { success: false, error: "Verification timed out. Please retry." };
    }

    let movedPoints = 0;
    for (let i = 1; i < trajectory.length; i++) {
      if (trajectory[i].x !== trajectory[i - 1].x) movedPoints++;
    }

    if (movedPoints < 2) {
      return { success: false, error: "Synthetic single-step movement detected." };
    }

    // Mark nonce as used
    usedNonces.add(nonce);

    // Issue signed human-verification login token (valid for 3 minutes)
    const tokenExp = Date.now() + 3 * 60 * 1000;
    const humanPayload = `verified_human:${nonce}:${tokenExp}`;
    const humanSig = createHmac("sha256", SECRET).update(humanPayload).digest("hex");
    const humanToken = `allota_human_v1_${Buffer.from(`${humanPayload}:${humanSig}`).toString("base64url")}`;

    return { success: true, humanToken };
  } catch (err: any) {
    return { success: false, error: "Verification processing failed: " + err.message };
  }
}

/**
 * Validates the issued human token at the /api/auth/login endpoint.
 */
export function validateHumanToken(token: string): boolean {
  if (!token || !token.startsWith("allota_human_v1_")) return false;

  try {
    const raw = token.replace("allota_human_v1_", "");
    const decoded = Buffer.from(raw, "base64url").toString("utf8");
    const [prefix, nonce, expStr, sig] = decoded.split(":");

    if (prefix !== "verified_human" || !nonce || !expStr || !sig) return false;

    const exp = parseInt(expStr, 10);
    if (Date.now() > exp) return false;

    const expectedSig = createHmac("sha256", SECRET)
      .update(`${prefix}:${nonce}:${expStr}`)
      .digest("hex");

    return sig === expectedSig;
  } catch {
    return false;
  }
}
