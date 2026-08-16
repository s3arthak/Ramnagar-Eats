import { config } from "../config.js";

/**
 * Normalize a phone to E.164 (+<digits>). Accepts a bare local number (10 digits,
 * prefixed with the configured default country code) or "91xxxxxxxxxx" without
 * the +. Throws a friendly error for invalid input.
 */
export function normalizePhone(input: string): string {
  const digits = input.replace(/[\s\-().]/g, "");
  if (/^\d{10}$/.test(digits)) return `+${config.phoneCountryCode}${digits}`;
  if (/^\d{11,15}$/.test(digits)) return `+${digits}`; // e.g. 91xxxxxxxxxx without the +
  if (!/^\+[1-9]\d{7,14}$/.test(digits)) {
    throw new Error("Enter a valid phone number like 9876543210 or +919876543210");
  }
  return digits;
}

/** Loose check for request bodies before normalization. */
export function isValidPhone(input: string): boolean {
  const digits = input.replace(/[\s\-().]/g, "");
  return /^\d{10}$/.test(digits) || /^\d{11,15}$/.test(digits) || /^\+[1-9]\d{7,14}$/.test(digits);
}
