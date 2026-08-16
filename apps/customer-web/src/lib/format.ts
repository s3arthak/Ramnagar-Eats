import { getConfig } from "./config";

export function inr(value: number): string {
  return `${getConfig().currency}${Math.round(value).toLocaleString("en-IN")}`;
}

export function distanceKm(value?: number): string {
  if (value === undefined) return "";
  return value < 1 ? `${Math.round(value * 1000)} m` : `${value} km`;
}

export function deliveryTime(min: number, max: number): string {
  return `${min}–${max} min`;
}

export function timeAgo(value: string): string {
  const seconds = Math.max(1, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return `${Math.floor(hours / 24)} days ago`;
}

export function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}
