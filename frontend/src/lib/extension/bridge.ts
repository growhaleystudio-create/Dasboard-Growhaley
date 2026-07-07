'use client';

import { useCallback, useEffect, useState } from 'react';

export type CaptureSessionPayload = {
  sessionId: string;
  captureToken: string;
  teamId: string;
  googleMapsUrl: string;
};

const PING_TIMEOUT_MS = 800;
const PING_MESSAGE = { type: 'leadsgen:ping' } as const;

// Extension ID is set at build time via NEXT_PUBLIC_LEADGEN_EXTENSION_ID so
// we can target a specific extension (required by MV3 to disambiguate which
// externally_connectable extension receives the message). When the ID is
// unknown (different profile / fresh install), we fall back to broadcast
// mode and rely on `chrome.runtime.lastError` to detect failure.
const KNOWN_EXTENSION_ID =
  process.env.NEXT_PUBLIC_LEADGEN_EXTENSION_ID || '';

type RuntimeSendMessage = {
  (message: unknown, callback?: (response: unknown) => void): void;
  (extensionId: string, message: unknown, callback?: (response: unknown) => void): void;
};

declare global {
  interface Window {
    chrome?: {
      runtime?: {
        sendMessage?: RuntimeSendMessage;
        lastError?: { message?: string } | null;
        connect?: (info?: unknown) => unknown;
      };
    };
  }
}

function isExtensionAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(window.chrome?.runtime?.sendMessage);
}

function sendPing(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !window.chrome?.runtime?.sendMessage) {
      resolve(false);
      return;
    }
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      resolve(ok);
    };
    const timeout = window.setTimeout(() => finish(false), PING_TIMEOUT_MS);
    const callback = (response: unknown) => {
      const err = window.chrome?.runtime?.lastError;
      if (err) {
        finish(false);
        return;
      }
      finish(response !== undefined);
    };
    try {
      const send = window.chrome.runtime.sendMessage;
      // MV3: passing the extension id is required when the page might match
      // multiple externally_connectable extensions. With an unknown id we
      // broadcast and Chrome routes to any matching extension.
      if (KNOWN_EXTENSION_ID) {
        send(KNOWN_EXTENSION_ID, PING_MESSAGE, callback);
      } else {
        send(PING_MESSAGE, callback);
      }
    } catch {
      finish(false);
    }
  });
}

function sendCaptureSessionMessage(payload: CaptureSessionPayload): boolean {
  if (typeof window === 'undefined' || !window.chrome?.runtime?.sendMessage) {
    return false;
  }
  try {
    const send = window.chrome.runtime.sendMessage;
    const message = { type: 'leadsgen:capture-session', payload };
    if (KNOWN_EXTENSION_ID) {
      send(KNOWN_EXTENSION_ID, message);
    } else {
      send(message);
    }
    return true;
  } catch {
    return false;
  }
}

export function useExtensionBridge() {
  const [installed, setInstalled] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    void sendPing().then((ok) => {
      if (!cancelled) setInstalled(ok);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const sendCaptureSession = useCallback(
    (payload: CaptureSessionPayload): boolean => sendCaptureSessionMessage(payload),
    [],
  );

  return { installed, sendCaptureSession };
}