import { randomInt } from "node:crypto";
import { config, isProduction } from "../config.js";
import { Otp } from "../models/Otp.js";
import { emailService } from "./email.js";
import { hashPassword, verifyPassword } from "../utils/password.js";
import { badRequest } from "../utils/errors.js";

/** Dev/E2E record of the last code per email (never populated in production). */
class DevCodeStore {
  private readonly sent = new Map<string, string>();
  record(email: string, code: string) {
    this.sent.set(email, code);
  }
  lastCode(email: string) {
    return this.sent.get(email);
  }
}

export const devCodeStore = new DevCodeStore();

const ttlMs = () => config.otp.ttlMs;
const maxAttempts = () => config.otp.maxAttempts;
const resendCooldownMs = () => config.otp.resendCooldownMs;

export function generateOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/** Send (or resend) a one-time code to an email. Replaces any previous active code. */
export async function sendOtpEmail(email: string) {
  const latest = await Otp.findOne({ email }).sort({ createdAt: -1 });
  if (latest) {
    const waitMs = resendCooldownMs() - (Date.now() - latest.createdAt.getTime());
    if (waitMs > 0) {
      throw badRequest(`Please wait ${Math.ceil(waitMs / 1000)}s before requesting another code`, "OTP_RESEND_TOO_SOON");
    }
  }

  const code = generateOtpCode();
  await Otp.deleteMany({ email });
  await Otp.create({ email, codeHash: hashPassword(code), attempts: 0, expiresAt: new Date(Date.now() + ttlMs()) });
  await emailService.sendOtpEmail(email, code);
  if (!isProduction) devCodeStore.record(email, code);
}

export type OtpVerifyResult = "OK" | "EXPIRED" | "TOO_MANY_ATTEMPTS" | "INVALID";

/** Verify a submitted code. Consumes the record on success; increments attempts on failure. */
export async function verifyOtp(email: string, code: string): Promise<OtpVerifyResult> {
  const record = await Otp.findOne({ email, consumed: false }).sort({ createdAt: -1 });
  if (!record) return "INVALID";

  if (record.attempts >= maxAttempts()) return "TOO_MANY_ATTEMPTS";
  if (record.expiresAt.getTime() < Date.now()) return "EXPIRED";

  if (!verifyPassword(code, record.codeHash)) {
    await Otp.updateOne({ _id: record._id }, { $inc: { attempts: 1 } });
    return "INVALID";
  }

  await Otp.updateOne({ _id: record._id }, { consumed: true });
  return "OK";
}

export const otpErrors: Record<Exclude<OtpVerifyResult, "OK">, { message: string; code: string; status: number }> = {
  EXPIRED: { message: "This code has expired. Request a new one.", code: "OTP_EXPIRED", status: 400 },
  TOO_MANY_ATTEMPTS: { message: "Too many incorrect attempts. Request a new code.", code: "OTP_TOO_MANY_ATTEMPTS", status: 429 },
  INVALID: { message: "Incorrect code. Please check and try again.", code: "OTP_INVALID", status: 400 },
};
