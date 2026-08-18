import { useCallback, useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { useToast } from "../../context/ToastContext";
import { isPushSupported, subscribeToPush, unsubscribeFromPush, isSubscribed } from "../../lib/push";

/**
 * Push notification toggle button.
 * Checks support, shows current state, and toggles subscription on click.
 */
export function PushBell({ className = "" }: { className?: string }) {
  const { push: toast } = useToast();
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ok = await isPushSupported();
      if (cancelled) return;
      setSupported(ok);
      if (ok) {
        setSubscribed(await isSubscribed());
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const toggle = useCallback(async () => {
    setLoading(true);
    try {
      if (subscribed) {
        await unsubscribeFromPush();
        setSubscribed(false);
        toast("Notifications off", { tone: "info" });
      } else {
        const ok = await subscribeToPush();
        if (ok) {
          setSubscribed(true);
          toast("You'll get order updates", { tone: "success" });
        } else {
          toast("Notifications blocked by browser", { tone: "danger" });
        }
      }
    } catch {
      toast("Could not update notification settings", { tone: "danger" });
    } finally {
      setLoading(false);
    }
  }, [subscribed, toast]);

  if (!supported || loading) return null;

  return (
    <button
      className={`push-bell ${className}`}
      onClick={() => void toggle()}
      title={subscribed ? "Disable notifications" : "Enable notifications"}
      aria-label={subscribed ? "Disable push notifications" : "Enable push notifications"}
    >
      {subscribed ? <Bell size={18} /> : <BellOff size={18} />}
      <span>{subscribed ? "Notifications on" : "Enable notifications"}</span>
    </button>
  );
}
