/**
 * Asynchronous Google Maps JavaScript API loader.
 *
 * Uses the Maps JS API `callback` parameter for reliable readiness detection
 * instead of polling, listens for `gm_authFailure` to catch API key issues,
 * and surfaces specific error messages for common failure modes.
 *
 * Usage:
 *   await loadGoogleMaps();
 *   // Now window.google.maps is available
 */

/** Specific error types surfaced by this loader. */
export type MapsLoadError =
  | { kind: "missing_key" }
  | { kind: "auth_error"; detail: string }
  | { kind: "script_error"; detail: string }
  | { kind: "init_timeout" }
  | { kind: "unknown"; detail: string };

let loadPromise: Promise<void> | null = null;
let authFailureHandler: (() => void) | null = null;

function cleanupAuthListener() {
  if (authFailureHandler) {
    window.removeEventListener("gm_authFailure", authFailureHandler);
    authFailureHandler = null;
  }
}

/**
 * Load the Google Maps JavaScript API asynchronously.
 * Returns a promise that resolves when the API is ready.
 * Rejects with a `MapsLoadError` on failure.
 */
export async function loadGoogleMaps(): Promise<void> {
  // Already loaded
  if (window.google?.maps) return;

  // Already loading — reuse the same promise
  if (loadPromise) return loadPromise;

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY?.trim();
  if (!apiKey) {
    const err: MapsLoadError = { kind: "missing_key" };
    console.warn(
      "[Maps] VITE_GOOGLE_MAPS_BROWSER_KEY is not set. " +
        "Add it to your .env file or environment variables.",
    );
    throw err;
  }

  loadPromise = new Promise<void>((resolve, reject) => {
    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      cleanupAuthListener();
      fn();
    };

    // Listen for Google Maps authentication failures (invalid key, billing off, API disabled)
    const onAuthFailure = (event?: Event) => {
      const detail =
        (event as any)?.detail?.message ??
        (event as any)?.message ??
        "Authentication failed";
      settle(() => {
        loadPromise = null;
        reject({ kind: "auth_error", detail } as MapsLoadError);
      });
    };
    authFailureHandler = onAuthFailure;
    window.addEventListener("gm_authFailure", onAuthFailure);

    // If a script tag already exists, wait for callback instead of polling
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src*="maps.googleapis.com/maps/api"]',
    );
    const script: HTMLScriptElement =
      existing ?? document.createElement("script");

    // Use `callback` param so the API calls us back when ready — no polling needed
    const callbackName = `__gmcb_${Date.now()}`;
    (window as any)[callbackName] = () => {
      settle(() => resolve());
      delete (window as any)[callbackName];
    };

    if (!existing) {
      script.src =
        `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}` +
        `&libraries=places&v=weekly&callback=${callbackName}`;
      script.async = true;
      script.defer = true;

      script.onerror = () =>
        settle(() => {
          loadPromise = null;
          reject({
            kind: "script_error",
            detail:
              "The Google Maps script failed to download. " +
              "Check your network connection and that the API key is valid.",
          } as MapsLoadError);
        });

      document.head.appendChild(script);
    } else {
      // Script tag already in DOM — the callback may have been set by a previous load
      // that hasn't resolved yet. Poll as a fallback for that edge case.
      const check = setInterval(() => {
        if (window.google?.maps) {
          clearInterval(check);
          settle(() => resolve());
        }
      }, 100);
      setTimeout(() => {
        clearInterval(check);
        settle(() => {
          loadPromise = null;
          reject({ kind: "init_timeout" } as MapsLoadError);
        });
      }, 15000);
    }

    // Global timeout — covers both the callback and any edge cases
    setTimeout(() => {
      settle(() => {
        loadPromise = null;
        reject({ kind: "init_timeout" } as MapsLoadError);
      });
    }, 20000);
  });

  return loadPromise;
}

/** Check if the Google Maps API is loaded. */
export function isGoogleMapsLoaded(): boolean {
  return Boolean(window.google?.maps);
}
