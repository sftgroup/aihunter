/**
 * WebSocket connection manager for AIHunter backend.
 *
 * Backend: ws://129.226.202.72:3100/ws
 *
 * P0 fix — passes auth token via query parameter (?token=xxx) so the
 * backend preHandler can authenticate the WebSocket upgrade.
 */

import { getAuthToken, AuthError } from './api';

const WS_URL: string =
  import.meta.env.VITE_WS_URL || (() => {
    if (typeof window !== 'undefined') {
      return window.location.origin.replace(/^http/, 'ws') + '/ws';
    }
    return 'ws://129.226.202.72:3100/ws';
  })();

type MessageHandler = (data: unknown) => void;
type StatusHandler = (status: WsStatus) => void;

export type WsStatus = 'connecting' | 'open' | 'closed' | 'error';

export class WsConnection {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectMs: number;
  private maxReconnectMs: number;
  private shouldReconnect: boolean;

  private messageHandlers: Set<MessageHandler> = new Set();
  private statusHandlers: Set<StatusHandler> = new Set();

  constructor(options?: {
    url?: string;
    reconnectMs?: number;
    maxReconnectMs?: number;
  }) {
    this.url = options?.url ?? WS_URL;
    this.reconnectMs = options?.reconnectMs ?? 1000;
    this.maxReconnectMs = options?.maxReconnectMs ?? 30000;
    this.shouldReconnect = true;
  }

  // ---- public API ----

  /** Open the WebSocket connection. */
  connect(): void {
    const token = getAuthToken();
    if (!token) {
      this.notifyStatus('error');
      throw new AuthError(
        'Cannot open WebSocket: no authentication token. Please configure AUTH_TOKEN.',
      );
    }

    // P0 fix — embed token in query param
    const separator = this.url.includes('?') ? '&' : '?';
    const authenticatedUrl = `${this.url}${separator}token=${encodeURIComponent(token)}`;

    this.notifyStatus('connecting');

    try {
      this.ws = new WebSocket(authenticatedUrl);
    } catch (err) {
      this.notifyStatus('error');
      console.error('[WsConnection] Failed to create WebSocket:', err);
      return;
    }

    this.ws.onopen = () => {
      this.notifyStatus('open');
      this.reconnectMs = 1000; // reset backoff
    };

    this.ws.onmessage = (event: MessageEvent) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(event.data as string);
      } catch {
        parsed = event.data;
      }
      for (const handler of this.messageHandlers) {
        try {
          handler(parsed);
        } catch (err) {
          console.error('[WsConnection] message handler error:', err);
        }
      }
    };

    this.ws.onclose = (event: CloseEvent) => {
      this.notifyStatus('closed');
      console.warn(`[WsConnection] closed (code=${event.code} reason=${event.reason})`);
      this.ws = null;

      if (this.shouldReconnect && event.code !== 1000) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = (_event: Event) => {
      this.notifyStatus('error');
      console.error('[WsConnection] error');
    };
  }

  /** Gracefully close the connection. */
  disconnect(): void {
    this.shouldReconnect = false;
    this.clearReconnect();
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
  }

  /** Send a JSON-serialisable message. */
  send(data: unknown): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('[WsConnection] cannot send — not connected');
      return;
    }
    const payload = typeof data === 'string' ? data : JSON.stringify(data);
    this.ws.send(payload);
  }

  /** True when the socket is open and ready. */
  get isOpen(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  // ---- event subscriptions ----

  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onStatus(handler: StatusHandler): () => void {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }

  // ---- internals ----

  private notifyStatus(status: WsStatus): void {
    for (const handler of this.statusHandlers) {
      try {
        handler(status);
      } catch (err) {
        console.error('[WsConnection] status handler error:', err);
      }
    }
  }

  private scheduleReconnect(): void {
    this.clearReconnect();
    console.log(
      `[WsConnection] reconnecting in ${this.reconnectMs}ms…`,
    );
    this.reconnectTimer = setTimeout(() => {
      this.connect();
      // Exponential backoff, capped
      this.reconnectMs = Math.min(
        this.reconnectMs * 2,
        this.maxReconnectMs,
      );
    }, this.reconnectMs);
  }

  private clearReconnect(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}

/** Singleton convenience — create and reuse a single connection. */
let defaultConnection: WsConnection | null = null;

export function getWsConnection(): WsConnection {
  if (!defaultConnection) {
    defaultConnection = new WsConnection();
  }
  return defaultConnection;
}

export function resetWsConnection(): void {
  if (defaultConnection) {
    defaultConnection.disconnect();
    defaultConnection = null;
  }
}
