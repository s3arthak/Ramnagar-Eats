/**
 * OSM-compatible map tile configuration.
 *
 * The tile source is build-time configurable (`VITE_MAP_TILE_URL`) and defaults
 * to OpenStreetMap, so the app renders with zero map credentials. Tiles are only
 * the base map — the restaurant pin drawn on top is application-owned data
 * (our own database) served by our own backend.
 */

const DEFAULT_TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const DEFAULT_ATTRIBUTION =
  '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/** Grey placeholder tile shown when a tile fails to download (Leaflet `errorTileUrl`). */
export const TILE_ERROR_URL =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='256' height='256' fill='%23e8e4df'%3E%3Crect width='256' height='256'/%3E%3C/svg%3E";

export const MAP_TILE_URL = import.meta.env.VITE_MAP_TILE_URL?.trim() || DEFAULT_TILE_URL;
export const MAP_TILE_ATTRIBUTION = import.meta.env.VITE_MAP_ATTRIBUTION?.trim() || DEFAULT_ATTRIBUTION;
export const MAP_MIN_ZOOM = 5;
export const MAP_MAX_ZOOM = 19;
