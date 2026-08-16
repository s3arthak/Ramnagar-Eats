import { api } from "./api";

export interface AppConfig {
  brandName: string;
  currency: string;
}

export const DEFAULT_CONFIG: AppConfig = {
  brandName: "Ramnagar Eats",
  currency: "₹",
};

let cached: AppConfig | null = null;
let inflight: Promise<AppConfig> | null = null;

/** Fetch the server config once and cache it. Safe to call from anywhere. */
export function loadConfig(): Promise<AppConfig> {
  if (cached) return Promise.resolve(cached);
  if (!inflight) {
    inflight = api
      .get<{ config: AppConfig }>("/config")
      .then((data) => {
        cached = { ...DEFAULT_CONFIG, ...data.config };
        return cached;
      })
      .catch(() => DEFAULT_CONFIG)
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** Current config — defaults until loadConfig() resolves. */
export function getConfig(): AppConfig {
  return cached ?? DEFAULT_CONFIG;
}
