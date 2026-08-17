import { useEffect, useState } from "react";
import { api } from "./api";

export interface AppConfig {
  brandName: string;
  currency: string;
  baseDeliveryFee: number;
  deliveryFeeFreeAbove: number;
  serviceRadiusKm: number;
  serviceCenter: { lat: number; lng: number };
}

export const DEFAULT_CONFIG: AppConfig = {
  brandName: "Ramnagar Eats",
  currency: "₹",
  baseDeliveryFee: 20,
  deliveryFeeFreeAbove: 0,
  serviceRadiusKm: 15,
  serviceCenter: { lat: 32.80674, lng: 75.314854 },
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

/** Reactive config for components that need the values at render time. */
export function useConfig(): AppConfig {
  const [config, setConfig] = useState<AppConfig>(() => getConfig());
  useEffect(() => {
    let active = true;
    void loadConfig().then((value) => {
      if (active) setConfig(value);
    });
    return () => {
      active = false;
    };
  }, []);
  return config;
}
