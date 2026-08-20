import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";

const DISMISSED_KEY = "rider-notification-prompt-dismissed";

/**
 * Shows a one-time prompt asking the rider to enable notifications.
 * Dismissed permanently once the user clicks X or allows/denies.
 */
export function NotificationPrompt() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Don't show if not supported, already granted/denied, or previously dismissed
    if (typeof Notification === "undefined") return;
    if (Notification.permission !== "default") return;
    if (localStorage.getItem(DISMISSED_KEY)) return;

    // Delay showing the prompt so it doesn't interrupt the first impression
    const timer = setTimeout(() => setVisible(true), 4000);
    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;

  function dismiss() {
    setVisible(false);
    localStorage.setItem(DISMISSED_KEY, "1");
  }

  async function allow() {
    try {
      await Notification.requestPermission();
    } catch {
      // Ignore errors (e.g. non-secure context)
    }
    dismiss();
  }

  return (
    <div className="notification-prompt" role="alert">
      <div className="notification-prompt-icon">
        <Bell size={20} />
      </div>
      <div className="notification-prompt-text">
        <strong>Stay updated on deliveries</strong>
        <p>Get notified when a new order is assigned to you.</p>
      </div>
      <div className="notification-prompt-actions">
        <button className="notification-prompt-allow" onClick={() => void allow()}>
          Enable
        </button>
        <button className="notification-prompt-dismiss" onClick={dismiss} aria-label="Dismiss">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
