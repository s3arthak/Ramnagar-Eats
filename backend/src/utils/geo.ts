import { getServiceArea } from "../services/service-area.js";

const toRad = (value: number) => (value * Math.PI) / 180;

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

/** Whether a point falls inside the admin-configured delivery area (DB-backed). */
export async function serviceability(lat: number, lng: number) {
  const area = await getServiceArea();
  const distanceKm = Math.round(haversineKm(lat, lng, area.lat, area.lng) * 10) / 10;
  return {
    serviceable: distanceKm <= area.radiusKm,
    distanceKm,
    radiusKm: area.radiusKm,
    center: { lat: area.lat, lng: area.lng },
  };
}
