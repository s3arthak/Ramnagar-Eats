/** Canonical coordinate model — used everywhere in the app. */
export interface Coordinates {
  lat: number;
  lng: number;
}

/** Map configuration options. */
export interface MapOptions {
  center: Coordinates;
  zoom?: number;
  minZoom?: number;
  maxZoom?: number;
  scrollWheelZoom?: boolean;
  zoomControl?: boolean;
  disableDefaultUI?: boolean;
}

/** Marker options. */
export interface MarkerOptions {
  position: Coordinates;
  emoji: string;
  size?: number;
  draggable?: boolean;
  /** Whether this marker should be smoothed during updates. */
  smooth?: boolean;
}

/** Polyline options. */
export interface PolylineOptions {
  coordinates: Coordinates[];
  color?: string;
  weight?: number;
  opacity?: number;
}

/** Route result from the backend. */
export interface RouteResult {
  distanceMeters: number;
  durationSeconds: number;
  polyline: [number, number][];
}

/** Reverse geocode result from the backend. */
export interface ReverseGeocodeResult {
  address: string;
  pincode: string;
  city: string;
  state: string;
  locality: string;
}

/** The google maps global namespace. */
declare global {
  interface Window {
    google?: {
      maps?: {
        Map: any;
        LatLng: any;
        LatLngBounds: any;
        Marker: any;
        Polyline: any;
        Animation: any;
        event: any;
        OverlayView: any;
      };
    };
    __googleMapsLoaded?: boolean;
    __googleMapsCallbacks?: (() => void)[];
  }
}
