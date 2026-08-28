import { useEffect, useRef, useState, createContext, useContext, type ReactNode } from "react";
import { loadGoogleMaps } from "./mapLoader";
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
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        await loadGoogleMaps();

        if (cancelled || !containerRef.current) return;
        if (!(window as any).google?.maps) {
          setError("Google Maps API not available");
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
          setError(caught instanceof Error ? caught.message : "Failed to load map");
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
        <div style={{
          position: "absolute",
          inset: 0,
          display: "grid",
          placeItems: "center",
          background: "#f5f0eb",
          fontSize: 14,
          color: "#C23D2B",
          textAlign: "center",
          padding: 16,
        }}>
          {error}
        </div>
      )}
      <GoogleMapContext.Provider value={mapRef.current}>
        {children}
      </GoogleMapContext.Provider>
    </div>
  );
}
