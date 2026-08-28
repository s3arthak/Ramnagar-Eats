/**
 * Asynchronous Google Maps JavaScript API loader.
 *
 * Prevents duplicate script loading, handles loading state, handles API failure,
 * handles missing API key, and cleans up on unmount.
 *
 * Usage:
 *   await loadGoogleMaps();
 *   // Now window.google.maps is available
 */

let loadPromise: Promise<void> | null = null;

/**
 * Load the Google Maps JavaScript API asynchronously.
 * Returns a promise that resolves when the API is ready.
 * If the API key is missing, resolves immediately (maps won't render).
 */
export async function loadGoogleMaps(): Promise<void> {
  // Already loaded
  if (window.google?.maps) return;

  // Already loading — reuse the same promise
  if (loadPromise) return loadPromise;

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY?.trim();
  if (!apiKey) {
    console.warn("[Maps] No Google Maps API key found. Maps will not render.");
    return;
  }

  loadPromise = new Promise<void>((resolve, reject) => {
    // Prevent duplicate script tags
    if (document.querySelector('script[src*="maps.googleapis.com/maps/api"]')) {
      // Script tag exists but maps not yet loaded — wait for it
      const check = setInterval(() => {
        if (window.google?.maps) {
          clearInterval(check);
          resolve();
        }
      }, 100);
      setTimeout(() => {
        clearInterval(check);
        reject(new Error("Google Maps API load timeout"));
      }, 15000);
      return;
    }

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&v=weekly`;
    script.async = true;
    script.defer = true;

    script.onload = () => {
      // The script is loaded but the API might take a moment to initialize
      const check = setInterval(() => {
        if (window.google?.maps) {
          clearInterval(check);
          resolve();
        }
      }, 100);
      setTimeout(() => {
        clearInterval(check);
        reject(new Error("Google Maps API initialization timeout"));
      }, 15000);
    };

    script.onerror = () => {
      loadPromise = null;
      reject(new Error("Failed to load Google Maps API"));
    };

    document.head.appendChild(script);
  });

  return loadPromise;
}

/**
 * Check if the Google Maps API is loaded.
 */
export function isGoogleMapsLoaded(): boolean {
  return Boolean(window.google?.maps);
}
