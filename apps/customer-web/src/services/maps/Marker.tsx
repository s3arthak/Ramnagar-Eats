import { useEffect, useRef } from "react";
import { useGoogleMap } from "./GoogleMap";
import type { Coordinates } from "./types";

interface MarkerProps {
  position: Coordinates;
  emoji: string;
  size?: number;
  draggable?: boolean;
  onDragEnd?: (position: Coordinates) => void;
}

/**
 * Emoji marker component for Google Maps.
 * Renders a circular div with an emoji inside, matching the existing app style.
 */
export function Marker({ position, emoji, size = 36, draggable = false, onDragEnd }: MarkerProps) {
  const map = useGoogleMap();
  const overlayRef = useRef<any>(null);

  useEffect(() => {
    if (!map || !(window as any).google?.maps) return;

    const gmaps = (window as any).google.maps;
    let isDragging = false;

    // Create a custom overlay for the emoji marker
    class EmojiOverlay extends gmaps.OverlayView {
      private div_: HTMLDivElement | null = null;
      private position_: any;
      private emoji_: string;
      private size_: number;
      private draggable_: boolean;

      constructor(
        position: any,
        emoji: string,
        size: number,
        draggable: boolean,
      ) {
        super();
        this.position_ = position;
        this.emoji_ = emoji;
        this.size_ = size;
        this.draggable_ = draggable;
        this.setMap(map);
      }

      onAdd() {
        this.div_ = document.createElement("div");
        this.div_.style.cssText = `
          position: absolute;
          display: flex;
          align-items: center;
          justify-content: center;
          width: ${this.size_}px;
          height: ${this.size_}px;
          background: #fff;
          border-radius: 50%;
          box-shadow: 0 2px 8px rgba(0,0,0,.35), 0 0 0 2px rgba(0,0,0,.1);
          cursor: ${this.draggable_ ? "grab" : "default"};
          user-select: none;
          transform: translate(-50%, -50%);
          font-size: ${Math.round(this.size_ * 0.55)}px;
          line-height: 1;
          z-index: 10;
        `;
        this.div_.textContent = this.emoji_;

        const panes = this.getPanes();
        if (panes) {
          panes.overlayMouseTarget.appendChild(this.div_);
        }
      }

      draw() {
        const projection = this.getProjection();
        if (!projection || !this.div_) return;
        const pos = projection.fromLatLngToDivPixel(this.position_);
        if (pos) {
          this.div_.style.left = `${pos.x}px`;
          this.div_.style.top = `${pos.y}px`;
        }
      }

      onRemove() {
        if (this.div_ && this.div_.parentNode) {
          this.div_.parentNode.removeChild(this.div_);
          this.div_ = null;
        }
      }

      updatePosition(position: any) {
        this.position_ = position;
        this.draw();
      }

      updateEmoji(emoji: string) {
        this.emoji_ = emoji;
        if (this.div_) this.div_.textContent = emoji;
      }
    }

    const latLng = new gmaps.LatLng(position.lat, position.lng);
    const overlay = new EmojiOverlay(latLng, emoji, size, draggable);
    overlayRef.current = overlay;

    // Setup drag handling for draggable markers
    if (draggable && onDragEnd) {
      const mapDiv = map.getDiv();

      const onMouseMove = (e: MouseEvent) => {
        if (!isDragging) return;
        const point = new gmaps.Point(e.clientX, e.clientY);
        const projection = overlay.getProjection();
        if (projection) {
          const ll = projection.fromDivPixelToLatLng(point);
          overlay.updatePosition(ll);
        }
      };

      const onMouseUp = (e: MouseEvent) => {
        if (!isDragging) return;
        isDragging = false;
        mapDiv.style.cursor = "";
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);

        const point = new gmaps.Point(e.clientX, e.clientY);
        const projection = overlay.getProjection();
        if (projection) {
          const ll = projection.fromDivPixelToLatLng(point);
          onDragEnd({ lat: ll.lat(), lng: ll.lng() });
        }
      };

      mapDiv.addEventListener("mousedown", (e: MouseEvent) => {
        if ((e.target as HTMLElement).closest("div[style*='grab']")) {
          isDragging = true;
          mapDiv.style.cursor = "grabbing";
          document.addEventListener("mousemove", onMouseMove);
          document.addEventListener("mouseup", onMouseUp);
        }
      });
    }

    return () => {
      overlay.setMap(null);
      overlayRef.current = null;
    };
  }, [map]); // Re-create when map changes

  // Update position when it changes
  useEffect(() => {
    if (overlayRef.current && (window as any).google?.maps) {
      const gmaps = (window as any).google.maps;
      overlayRef.current.updatePosition(new gmaps.LatLng(position.lat, position.lng));
    }
  }, [position.lat, position.lng]);

  // Update emoji when it changes
  useEffect(() => {
    if (overlayRef.current) {
      overlayRef.current.updateEmoji(emoji);
    }
  }, [emoji]);

  return null;
}
