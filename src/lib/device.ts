/**
 * Device / capability detection.
 * Safe to call in 'use client' code; always returns sensible defaults during SSR.
 */
export interface DeviceInfo {
  isMobile: boolean;
  isIOS: boolean;
  isStandalone: boolean;
  hasTouch: boolean;
  viewportWidth: number;
}

export function getDeviceInfo(): DeviceInfo {
  if (typeof window === 'undefined') {
    return { isMobile: false, isIOS: false, isStandalone: false, hasTouch: false, viewportWidth: 1280 };
  }
  const ua = navigator.userAgent;
  const isMobile = /iPhone|iPad|Android/i.test(ua);
  const isIOS = /iPhone|iPad/.test(ua);
  const isStandalone =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (navigator as any).standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches;
  const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  return {
    isMobile,
    isIOS,
    isStandalone,
    hasTouch,
    viewportWidth: window.innerWidth,
  };
}
