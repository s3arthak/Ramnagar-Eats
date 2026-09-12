/*
 * Service Worker for Ramnagar Eats web push notifications.
 * Handles push events and notification clicks to deep-link to the relevant page.
 */

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Ramnagar Eats", body: event.data.text() };
  }

  const options = {
    body: payload.body || "",
    icon: payload.icon || "/logo-mark.svg",
    badge: payload.badge || "/logo-mark.svg",
    tag: payload.tag || "ramnagar-eats",
    renotify: true,
    data: { url: payload.url || "/" },
  };

  event.waitUntil(self.registration.showNotification(payload.title || "Ramnagar Eats", options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      // If a window is already open with this URL, focus it.
      for (const client of windowClients) {
        if (client.url.includes(url) && "focus" in client) {
          return client.focus();
        }
      }
      // Otherwise open a new window.
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    }),
  );
});
