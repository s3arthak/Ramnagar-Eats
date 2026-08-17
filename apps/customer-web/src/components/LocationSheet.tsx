import { lazy, Suspense, useState } from "react";
import { LocateFixed, X } from "lucide-react";
import { api } from "../lib/api";
import { useConfig } from "../lib/config";
import { useLocation, type Serviceability } from "../context/LocationContext";
import { useToast } from "../context/ToastContext";
import { distanceKm } from "../lib/format";

// Mapbox (via the map chunk) is pulled in only when the picker actually opens.
const LocationMap = lazy(() => import("./LocationMap"));

const PINCODE_PATTERN = /^\d{6}$/;

interface ReverseGeocodeResult {
  address: string;
  pincode: string;
  city: string;
  state: string;
  locality: string;
}

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

export function LocationSheet({ onClose }: { onClose: () => void }) {
  const { place, setPlace, checkServiceability } = useLocation();
  const { serviceCenter } = useConfig();
  const { push } = useToast();
  const [position, setPosition] = useState<[number, number]>([place?.lat ?? serviceCenter.lat, place?.lng ?? serviceCenter.lng]);
  const [pincode, setPincode] = useState(place?.pincode ?? "");
  const [label, setLabel] = useState(place?.label ?? "Home");
  const [status, setStatus] = useState<Serviceability | null>(null);
  const [checking, setChecking] = useState(false);
  const [locating, setLocating] = useState(false);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [geocoding, setGeocoding] = useState(false);
  const [detected, setDetected] = useState<ReverseGeocodeResult | null>(null);
  const [error, setError] = useState("");
  const pincodeValid = PINCODE_PATTERN.test(pincode.trim());

  function useCurrentLocation() {
    if (!("geolocation" in navigator)) {
      setError("Your browser does not support current location. Please enter your address manually.");
      return;
    }
    if (!window.isSecureContext) {
      setError("Current location requires a secure HTTPS connection. Please enter your address manually.");
      return;
    }
    setError("");
    setStatus(null);
    setAccuracy(null);
    setDetected(null);
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (value) => {
        const { latitude, longitude, accuracy: rawAccuracy } = value.coords;
        setPosition([latitude, longitude]);
        setAccuracy(Math.round(rawAccuracy));
        setLocating(false);
        // Reverse geocode through the backend so the address/pincode auto-fill.
        setGeocoding(true);
        void api
          .post<ReverseGeocodeResult>("/locations/reverse-geocode", { lat: latitude, lng: longitude })
          .then((result) => {
            setDetected(result);
            setPincode((current) => current || result.pincode);
            setLabel((current) => current || "Home");
          })
          .catch(() => {
            /* geocoder unavailable — manual entry still works */
          })
          .finally(() => setGeocoding(false));
      },
      (gpsError) => {
        setLocating(false);
        setError(gpsErrorMessage(gpsError.code));
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }

  function moveMarker(value: [number, number]) {
    setPosition(value);
    setAccuracy(null); // manual position — GPS accuracy no longer applies
  }

  async function confirm() {
    if (!pincode.trim() || !label.trim()) return;
    if (!pincodeValid) {
      setError("Enter a valid 6-digit pincode");
      return;
    }
    setError("");
    setChecking(true);
    try {
      const result = await checkServiceability(position[0], position[1]);
      if (!result.serviceable) {
        setStatus(result);
        return;
      }
      setPlace({ lat: position[0], lng: position[1], label: label.trim(), pincode: pincode.trim() });
      push("Location saved successfully", { tone: "success" });
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not verify this location");
    } finally {
      setChecking(false);
    }
  }

  const poorAccuracy = accuracy !== null && accuracy > 150;

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Set delivery location">
      <section className="location-sheet">
        <button className="close" onClick={onClose} aria-label="Close">
          <X size={20} />
        </button>
        <p className="eyebrow">YOUR DELIVERY AREA</p>
        <h2>Where should we bring your food?</h2>
        <p className="sheet-copy">Use your precise location so we show restaurants that can actually deliver to you.</p>
        <button className="gps" onClick={useCurrentLocation} disabled={locating}>
          <LocateFixed size={18} /> {locating ? "Finding your location…" : "Use my current location"}
        </button>
        {accuracy !== null && (
          <p className={`notice ${poorAccuracy ? "notice--error" : "notice--success"}`} role="status">
            📍 Location detected · Accuracy: approximately {accuracy} m
            {poorAccuracy && " — position may not be exact, adjust the marker if needed."}
          </p>
        )}
        {geocoding && (
          <p className="geocoding-hint" role="status">
            Finding your address…
          </p>
        )}
        {detected && (
          <p className="detected-address">
            📮 {detected.address}
            {detected.city && `, ${detected.city}`}
            {detected.state && `, ${detected.state}`}
          </p>
        )}
        <div className="map">
          <Suspense fallback={<div style={{ padding: 24, color: "var(--muted)", fontSize: 14 }}>Loading map…</div>}>
            <LocationMap position={position} onMove={moveMarker} />
          </Suspense>
        </div>
        <div className="location-fields">
          <label>
            Location name
            <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Home" />
          </label>
          <label>
            Pincode
            <input value={pincode} onChange={(event) => setPincode(event.target.value)} placeholder="400001" inputMode="numeric" />
          </label>
        </div>
        {status && !status.serviceable && (
          <p className="notice notice--error" role="alert">
            Sorry, we don't deliver here yet. You're {distanceKm(status.distanceKm)} from our delivery area (max {status.radiusKm} km).
          </p>
        )}
        {pincode.trim() && !pincodeValid && !error && (
          <p className="notice notice--error" role="alert">
            Enter a valid 6-digit pincode.
          </p>
        )}
        {error && (
          <p className="notice notice--error" role="alert">
            {error}
          </p>
        )}
        <button className="confirm" disabled={!pincode.trim() || !pincodeValid || !label.trim() || checking} onClick={() => void confirm()}>
          {checking ? "Checking…" : "Confirm delivery location"}
        </button>
      </section>
    </div>
  );
}
