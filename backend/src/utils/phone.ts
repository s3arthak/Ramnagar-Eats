/** Normalize a phone to E.164 (+<digits>). Throws a friendly error for invalid input. */
export function normalizePhone(input: string): string {
  const digits = input.replace(/[\s\-().]/g, "");
  if (!/^\+[1-9]\d{7,14}$/.test(digits)) {
    throw new Error("Enter a valid phone number like +919876543210");
  }
  return digits;
}

/** Loose check for request bodies before normalization. */
export function isValidPhone(input: string): boolean {
  const digits = input.replace(/[\s\-().]/g, "");
  return /^\+[1-9]\d{7,14}$/.test(digits);
}
