import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** E.164-ish normalization; a real implementation should use libphonenumber-js. */
export function normalizePhone(raw: string, defaultCountry = "US"): string | null {
  const digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (defaultCountry === "US" && digits.length === 10) return `+1${digits}`;
  return digits.length > 6 ? `+${digits}` : null;
}

/** Pulls a bare registrable domain out of any website URL shape. */
export function normalizeDomain(url: string): string | null {
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}
