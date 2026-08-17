import { lazy, Suspense, useState } from "react";
import { LocateFixed } from "lucide-react";

// Leaflet loads only when the picker mounts.
const LocationPickerMap = lazy(() => import("./LocationPickerMap"));

/** Distinct, actionable GPS errors (plan §30) instead of a generic message. */
function gpsErrorMessage(code: number): string {
  switch (code) {
    case 1:
      return "Location permission is blocked. Please enable location permission in browser settings.";
    case 2:
      return "We couldn't determine your location. Please try again.";
    case 3:
      return "Location request timed out. Please try again.";
    default:
      return "We couldn't determine your location. Please try again.";
  }
}

/**
 * Restaurant kitchen-location picker: high-accuracy GPS with accuracy display,
 * a draggable map marker as the manual fallback, and clear error states.
 */
export default function LocationPicker({ lat, lng, onChange }: { lat?: number; lng?: number; onChange: (lat: number, lng: number) => void }) {
  const [position, setPosition] = useState<[number, number]>([lat ?? 32.80674, lng ?? 75.314854]);
  const [locating, setLocating] = useState(false);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [error, setError] = useState("");

  function useCurrentLocation() {
    if (!("geolocation" in navigator)) {
      setError("Your browser does not support current location. Drag the marker or tap the map instead.");
      return;
    }
    if (!window.isSecureContext) {
      setError("Current location requires a secure HTTPS connection. Drag the marker or tap the map instead.");
      return;
    }
    setError("");
    setAccuracy(null);
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (value) => {
        const { latitude, longitude, accuracy: rawAccuracy } = value.coords;
        setPosition([latitude, longitude]);
        setAccuracy(Math.round(rawAccuracy));
        setLocating(false);
        onChange(latitude, longitude);
      },
      (gpsError) => {
        setLocating(false);
        setError(gpsErrorMessage(gpsError.code));
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }

  function move(value: [number, number]) {
    setPosition(value);
    setAccuracy(null); // manual position — GPS accuracy no longer applies
    onChange(value[0], value[1]);
  }

  const poorAccuracy = accuracy !== null && accuracy > 150;

  return (
    <div className="location-picker">
      <button type="button" className="gps" onClick={useCurrentLocation} disabled={locating}>
        <LocateFixed size={18} /> {locating ? "Finding your location…" : "Use my current location"}
      </button>
      {accuracy !== null && (
        <p className={`notice ${poorAccuracy ? "notice--error" : "notice--success"}`} role="status">
          📍 Location detected · Accuracy: approximately {accuracy} m
          {poorAccuracy && " — position may not be exact, adjust the marker if needed."}
        </p>
      )}
      {error && (
        <p className="notice notice--error" role="alert">
          {error}
        </p>
      )}
      <Suspense
        fallback={
          <div className="map" style={{ display: "grid", placeItems: "center", color: "#657a72", fontSize: 14 }}>
            Loading map…
          </div>
        }
      >
        <div className="map">
          <LocationPickerMap position={position} onMove={move} />
        </div>
      </Suspense>
      <p className="hint">Drag the 📍 marker or tap the map to set the exact kitchen location. Customers see this on your profile and use it to calculate delivery.</p>
    </div>
  );
}
