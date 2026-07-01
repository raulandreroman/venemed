"use client";

import { useEffect, useState } from "react";

/**
 * Offline banner (Figma "Offline" 210:13152): full-width warning strip above
 * the dashboard content, shown while `navigator.onLine` is false. The initial
 * read + the online/offline listeners only ever set state from an event
 * handler or an effect that DEFERS via requestAnimationFrame — never a
 * synchronous setState in the effect body (react-hooks/set-state-in-effect is
 * a hard eslint error).
 */
export function ConnectionBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      setOffline(!navigator.onLine);
    });
    const onOnline = () => setOffline(false);
    const onOffline = () => setOffline(true);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div className="bg-warning-tint px-4 py-2 text-center text-sm font-medium text-warning">
      Sin conexión · los cambios se guardan y sincronizan al reconectar
    </div>
  );
}
