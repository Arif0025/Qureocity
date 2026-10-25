"use client";

import { useCallback, useEffect, useRef } from "react";

type ReplaceRoute = (href: string) => void;

const currentHref = () => `${window.location.pathname}${window.location.search}`;

/**
 * Keeps a small in-memory stack of in-panel views. Native browser
 * history remains the primary back/forward mechanism. If a mobile browser
 * exits the panel before traversing its tab entries, restore the previous
 * panel view instead of dropping the user at the public root page.
 */
export function useInAppBackStack(pathname: string, replaceRoute: ReplaceRoute) {
  const stackRef = useRef<string[]>([]);

  useEffect(() => {
    const current = currentHref();
    const stack = stackRef.current;
    const index = stack.lastIndexOf(current);
    if (index >= 0) stack.splice(index + 1);
    else if (!stack.length || stack.some((href) => !href.startsWith(`${pathname}?`))) {
      stackRef.current = [current];
    } else stack.push(current);

    const onPopState = (event: PopStateEvent) => {
      const destination = currentHref();
      const index = stackRef.current.lastIndexOf(destination);
      if (index >= 0) {
        stackRef.current.splice(index + 1);
        return;
      }

      if (window.location.pathname !== pathname && stackRef.current.length > 1) {
        // Let our client router restore the prior view; do not let the
        // framework process this traversal as an exit to the public root.
        event.stopImmediatePropagation();
        stackRef.current.pop();
        const previous = stackRef.current[stackRef.current.length - 1];
        if (previous) replaceRoute(previous);
      }
    };

    // Capture before the App Router's own popstate listener so the fallback
    // can prevent an unintended exit when a mobile browser skips tab entries.
    window.addEventListener("popstate", onPopState, true);
    return () => window.removeEventListener("popstate", onPopState, true);
  }, [pathname, replaceRoute]);

  return useCallback((href: string) => {
    const current = currentHref();
    const index = stackRef.current.lastIndexOf(current);
    if (index >= 0) stackRef.current.splice(index + 1);
    else if (!stackRef.current.length) stackRef.current.push(current);
    stackRef.current.push(href);
  }, []);
}
