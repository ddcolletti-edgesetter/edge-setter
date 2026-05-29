/**
 * Edge Setter — Service Worker
 * Handles Web Push notifications for Pro alert subscribers.
 */

self.addEventListener("push", function (event) {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { /**/ }

  const title   = data.title  ?? "EdgeSetter";
  const options = {
    body:               data.body ?? "New signal alert",
    icon:               "/brand/edgesetter-emblem.png",
    badge:              "/brand/edgesetter-emblem.png",
    data:               data.data ?? {},
    vibrate:            [100, 50, 100],
    requireInteraction: false,
    tag:                data.data?.signalId ?? "es-alert",
    renotify:           true,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  const data   = event.notification.data ?? {};
  const league = (data.league ?? "nba").toLowerCase();
  const url    = `${self.location.origin}/#/v2/${league}`;

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(function (windowClients) {
        for (const client of windowClients) {
          if (client.url.includes(self.location.origin) && "focus" in client) {
            return client.focus();
          }
        }
        return clients.openWindow(url);
      })
  );
});
