import { createContext, useContext, useState, type ReactNode } from "react";
import { api } from "../lib/api";
import type { Place } from "../lib/types";

export interface Serviceability {
  serviceable: boolean;
  distanceKm: number;
  radiusKm: number;
  message: string;
}

interface LocationState {
  place: Place | null;
  setPlace: (place: Place) => void;
  clearPlace: () => void;
  checkServiceability: (lat: number, lng: number) => Promise<Serviceability>;
}

const STORAGE_KEY = "customer-place";
const LocationContext = createContext<LocationState | null>(null);

function loadPlace(): Place | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Place) : null;
  } catch {
    return null;
  }
}

export function LocationProvider({ children }: { children: ReactNode }) {
  const [place, setPlaceState] = useState<Place | null>(loadPlace);

  const setPlace = (value: Place) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    setPlaceState(value);
  };

  const clearPlace = () => {
    localStorage.removeItem(STORAGE_KEY);
    setPlaceState(null);
  };

  const checkServiceability = async (lat: number, lng: number) => {
    const data = await api.get<Serviceability>(`/locations/serviceability?lat=${lat}&lng=${lng}`);
    return data;
  };

  return <LocationContext.Provider value={{ place, setPlace, clearPlace, checkServiceability }}>{children}</LocationContext.Provider>;
}

export function useLocation(): LocationState {
  const value = useContext(LocationContext);
  if (!value) throw new Error("useLocation must be used inside LocationProvider");
  return value;
}
