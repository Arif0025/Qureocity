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
  if (visible.length > 0 && !data.test && !data.showWhenVisible) {
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

  var notificationOptions = {
    body: body,
    tag: data.tag || undefined,
    renotify: !!data.tag,
    icon: "/icons/icon-192.png",
    badge: "/icons/badge-96.png",
    data: {
      url: data.url || "/employee",
      count: count,
      actionUrls: data.actionUrls || {},
      actions: Array.isArray(data.actions) ? data.actions.slice(0, 2) : [],
    },
  };
  // Persistent actions are supported by many desktop/Android browsers.
  // Some platforms, notably iOS web push, omit custom actions; normal click
  // behavior remains available there.
  if (Array.isArray(data.actions) && data.actions.length > 0) {
    notificationOptions.actions = data.actions.slice(0, 2);
  }
  await self.registration.showNotification(title, notificationOptions);
}

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var actionUrl = event.action && event.notification.data && event.notification.data.actionUrls
    ? event.notification.data.actionUrls[event.action]
    : null;
  if (actionUrl) {
    event.waitUntil(openTarget(actionUrl));
    return;
  }
  var url =
    (event.notification.data && event.notification.data.url) || "/employee";
  event.waitUntil(openTarget(url));
});

async function openTarget(url) {
  var targetUrl = new URL(url, self.location.origin).href;
  var clientList = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  clientList = clientList.filter(function (client) {
    return new URL(client.url).origin === self.location.origin;
  });
  // Prefer a visible/focused app tab if there are several open.
  clientList.sort(function (a, b) {
    return Number(b.visibilityState === "visible" && b.focused) - Number(a.visibilityState === "visible" && a.focused);
  });
  for (var i = 0; i < clientList.length; i++) {
    var client = clientList[i];
    try {
      if ("navigate" in client) {
        var navigatedClient = await client.navigate(targetUrl);
        if (navigatedClient) {
          await navigatedClient.focus();
          return;
        }
      }
    } catch (e) {
      // Older browsers may not support WindowClient.navigate reliably.
    }
    try {
      await client.focus();
      client.postMessage({ type: "navigate-to", url: targetUrl });
      return;
    } catch (e) {
      // Try another already-open app tab before creating a new one.
    }
  }
  await self.clients.openWindow(targetUrl);
}
