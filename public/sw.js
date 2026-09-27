/* QureoCity service worker — push notifications only.
 *
 * Deliberately does NOT cache pages or intercept fetches: the panels are
 * live operational screens, and a stale cached page would be worse than
 * none. Its one job is to receive pushes when the app is closed and turn
 * them into notifications.
 */

self.addEventListener("install", function () {
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", function (event) {
  var data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: "QureoCity", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(handlePush(data));
});

async function handlePush(data) {
  var clientList = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  var visible = clientList.filter(function (c) {
    return c.visibilityState === "visible";
  });

  // App is open and on screen: show an in-app toast instead of a system
  // notification, so nobody gets both. (Test messages always show as a
  // real notification so "did it work?" has an obvious answer.)
  if (visible.length > 0 && !data.test) {
    visible.forEach(function (c) {
      c.postMessage({ type: "push-foreground", payload: data });
    });
    return;
  }

  var title = data.title || "QureoCity";
  var body = data.body || "";
  var count = 1;

  // Fold repeats of the same kind into one notification: the second
  // check-in in a minute becomes "2 new check-ins" rather than a stack.
  if (data.group && data.tag) {
    var existing = await self.registration.getNotifications({ tag: data.tag });
    if (existing.length > 0) {
      var previous = (existing[0].data && existing[0].data.count) || 1;
      count = previous + 1;
      title = count + " " + data.group.plural;
      body = "Tap to view";
    }
  }

  await self.registration.showNotification(title, {
    body: body,
    tag: data.tag || undefined,
    renotify: !!data.tag,
    icon: "/icons/icon-192.png",
    badge: "/icons/badge-96.png",
    data: { url: data.url || "/employee", count: count },
  });
}

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var url =
    (event.notification.data && event.notification.data.url) || "/employee";
  event.waitUntil(openTarget(url));
});

async function openTarget(url) {
  var clientList = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  for (var i = 0; i < clientList.length; i++) {
    var client = clientList[i];
    if (new URL(client.url).origin === self.location.origin) {
      try {
        await client.focus();
        if ("navigate" in client) {
          await client.navigate(url);
        }
        return;
      } catch (e) {
        // fall through to opening a fresh window
      }
    }
  }
  await self.clients.openWindow(url);
}
