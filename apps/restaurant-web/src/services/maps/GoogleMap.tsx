import { useEffect, useRef, useState, createContext, useContext, type ReactNode } from "react";
import { loadGoogleMaps, type MapsLoadError } from "./mapLoader";
import type { Coordinates } from "./types";

/**
 * Context to provide the Google Maps instance to child components.
 */
const GoogleMapContext = createContext<any>(null);

export function useGoogleMap() {
  return useContext(GoogleMapContext);
}

interface GoogleMapProps {
  center: Coordinates;
  zoom?: number;
  minZoom?: number;
  maxZoom?: number;
  scrollWheelZoom?: boolean;
  zoomControl?: boolean;
  className?: string;
  style?: React.CSSProperties;
  children?: ReactNode;
  onMapReady?: (map: any) => void;
  onClick?: (coordinates: Coordinates) => void;
}

/**
 * Google Maps container component.
 * Manages map lifecycle, prevents duplicate initialization,
 * cleans up on unmount, and handles loading/error states.
 */
export function GoogleMap({
  center,
  zoom = 15,
  minZoom = 5,
  maxZoom = 19,
  scrollWheelZoom = false,
  zoomControl = true,
  className = "",
  style = {},
  children,
  onMapReady,
  onClick,
}: GoogleMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<MapsLoadError | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        await loadGoogleMaps();

        if (cancelled || !containerRef.current) return;
        if (!(window as any).google?.maps) {
          setError({ kind: "unknown", detail: "google.maps is not available after script loaded" });
          setLoading(false);
          return;
        }

        if (mapRef.current) {
          mapRef.current = null;
        }

        const gmaps = (window as any).google.maps;
        const map = new gmaps.Map(containerRef.current, {
          center: { lat: center.lat, lng: center.lng },
          zoom,
          minZoom,
          maxZoom,
          scrollWheelZoom,
          zoomControl,
          disableDefaultUI: !zoomControl,
          mapTypeId: "roadmap",
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          styles: [
            { featureType: "poi", stylers: [{ visibility: "off" }] },
          ],
        });

        if (cancelled) return;

        mapRef.current = map;
        setLoading(false);

        if (onClick) {
          map.addListener("click", (event: any) => {
            if (event.latLng) {
              onClick({ lat: event.latLng.lat(), lng: event.latLng.lng() });
            }
          });
        }

        if (onMapReady) onMapReady(map);
      } catch (caught) {
        if (!cancelled) {
          if (caught && typeof caught === "object" && "kind" in caught) {
            setError(caught as MapsLoadError);
          } else {
            setError({ kind: "unknown", detail: caught instanceof Error ? caught.message : "Failed to load map" });
          }
          setLoading(false);
        }
      }
    }

    void init();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        (window as any).google?.maps?.event?.clearInstanceListeners?.(mapRef.current);
        mapRef.current = null;
      }
    };
  }, []); // Initialize only once

  useEffect(() => {
    if (mapRef.current && (window as any).google?.maps) {
      mapRef.current.panTo({ lat: center.lat, lng: center.lng });
    }
  }, [center.lat, center.lng]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", ...style }}>
      <div
        ref={containerRef}
        className={className}
        style={{ width: "100%", height: "100%" }}
      />
      {loading && (
        <div style={{
          position: "absolute",
          inset: 0,
          display: "grid",
          placeItems: "center",
          background: "#e8e4df",
          fontSize: 14,
          color: "#7A5C4A",
        }}>
          Loading map…
        </div>
      )}
      {error && (
        <MapErrorOverlay error={error} />
      )}
      <GoogleMapContext.Provider value={mapRef.current}>
        {children}
      </GoogleMapContext.Provider>
    </div>
  );
}

/**
 * Overlays a diagnostic error message when the map fails to load.
 * Shows a specific title and actionable guidance based on error kind.
 */
function MapErrorOverlay({ error }: { error: MapsLoadError }) {
  const [title, guidance] = describeError(error);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "#f5f0eb",
        padding: 20,
        textAlign: "center",
      }}>
      <span style={{ fontSize: 28, marginBottom: 8 }}>⚠️</span>
      <p style={{ fontSize: 15, fontWeight: 600, color: "#C23D2B", margin: 0 }}>
        {title}
      </p>
      <p style={{ fontSize: 13, color: "#7A5C4A", margin: "8px 0 0", maxWidth: 320, lineHeight: 1.5 }}>
        {guidance}
      </p>
      <code
        style={{
          marginTop: 12,
          padding: "4px 10px",
          fontSize: 11,
          color: "#7A5C4A",
          background: "#ede8e3",
          borderRadius: 4,
          wordBreak: "break-all",
          maxWidth: 360,
        }}>
        {error.kind}: {"detail" in error ? error.detail : error.kind}
      </code>
    </div>
  );
}

function describeError(error: MapsLoadError): [string, string] {
  switch (error.kind) {
    case "missing_key":
      return [
        "Maps API key not configured",
        "Set VITE_GOOGLE_MAPS_BROWSER_KEY in your .env file and restart the dev server.",
      ];
    case "auth_error":
      return [
        "Maps API authentication failed",
        "The API key may be invalid, billing may not be enabled, " +
          "or the Maps JavaScript API is not enabled in Google Cloud Console. " +
          "Check the JavaScript console for details."
      ];
    case "init_timeout":
      return [
        "Map failed to load",
        "The Google Maps API took too long to initialise. " +
          "This can happen if billing is disabled or the API key has domain restrictions " +
          "that don't match this page's origin.",
      ];
    case "script_error":
      return [
        "Could not download Maps script",
        "The Google Maps script failed to download. " +
          "Check your network connection and ad-blocker settings.",
      ];
    case "unknown":
    default:
      return [
        "Map failed to load",
        error.detail || "An unexpected error occurred.",
      ];
  }
}
