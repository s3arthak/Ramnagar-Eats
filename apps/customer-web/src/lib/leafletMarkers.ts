import L from "leaflet";

/**
 * Emoji pin as a Leaflet `divIcon`: no image assets to ship, sized in px and
 * anchored on the exact point it marks. Shared by every map chunk (location
 * sheet, restaurant card, live order tracking) so all pins render identically.
 */
export function emojiIcon(emoji: string, size = 30) {
  return L.divIcon({
    html: `<span style="font-size:${Math.round(size * 0.87)}px;line-height:1;filter:drop-shadow(0 1px 2px rgba(0,0,0,.35))">${emoji}</span>`,
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}
