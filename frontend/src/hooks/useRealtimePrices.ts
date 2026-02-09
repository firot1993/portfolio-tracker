import { useState, useEffect, useRef, useCallback } from 'react';

export interface RealtimePrice {
  assetId: number;
  symbol: string;
  price: number;
  timestamp: number;
}

interface TrackedAsset {
  id: number;
  symbol: string;
  type: 'crypto' | 'stock_us' | 'stock_cn' | 'gold';
}

interface RealtimeStats {
  clients: number;
  trackedAssets: number;
  cryptoCount: number;
  stockUsCount: number;
  binanceConnected: boolean;
  tiingoConnected: boolean;
}

interface UseRealtimePricesReturn {
  prices: Map<number, RealtimePrice>;
  trackedAssets: TrackedAsset[];
  stats: RealtimeStats | null;
  connected: boolean;
  lastMessageAt: number | null;
  refreshAssets: () => void;
}

const WS_URL = `ws://${window.location.hostname}:3001/ws/prices`;
const RECONNECT_DELAY = 3000;
const PING_INTERVAL = 30000;


export function useRealtimePrices(): UseRealtimePricesReturn {
  const [prices, setPrices] = useState<Map<number, RealtimePrice>>(new Map());
  const [trackedAssets, setTrackedAssets] = useState<TrackedAsset[]>([]);
  const [stats, setStats] = useState<RealtimeStats | null>(null);
  const [connected, setConnected] = useState(false);
  const [lastMessageAt, setLastMessageAt] = useState<number | null>(null);
  
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    console.log('[RealtimePrices] Connecting to', WS_URL);
    
    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[RealtimePrices] Connected');
        setConnected(true);
        
        // Start ping interval
        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current);
        }
        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, PING_INTERVAL);
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          setLastMessageAt(Date.now());
          
          switch (message.type) {
            case 'init':
              // Initial data with current prices and tracked assets
              const initialPrices = new Map<number, RealtimePrice>();
              message.prices?.forEach((p: RealtimePrice) => {
                initialPrices.set(p.assetId, p);
              });
              setPrices(initialPrices);
              setTrackedAssets(message.trackedAssets || []);
              break;
              
            case 'price_update':
              // Apply price update - consumers decide how to use it
              setPrices(prev => {
                const next = new Map(prev);
                next.set(message.assetId, {
                  assetId: message.assetId,
                  symbol: message.symbol,
                  price: message.price,
                  timestamp: message.timestamp,
                });
                return next;
              });
              break;
              
            case 'stats':
              setStats(message.data);
              break;
              
            case 'pong':
              // Heartbeat response, connection is alive
              break;
              
            default:
              console.log('[RealtimePrices] Unknown message type:', message.type);
          }
        } catch (error) {
          console.error('[RealtimePrices] Failed to parse message:', error);
        }
      };

      ws.onclose = () => {
        console.log('[RealtimePrices] Disconnected');
        setConnected(false);
        
        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current);
          pingIntervalRef.current = null;
        }
        
        // Schedule reconnect
        if (!reconnectTimerRef.current) {
          reconnectTimerRef.current = setTimeout(() => {
            reconnectTimerRef.current = null;
            connect();
          }, RECONNECT_DELAY);
        }
      };

      ws.onerror = (error) => {
        console.error('[RealtimePrices] WebSocket error:', error);
        ws.close();
      };
    } catch (error) {
      console.error('[RealtimePrices] Failed to connect:', error);
      setConnected(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const refreshAssets = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'refresh_assets' }));
    }
  }, []);

  // Connect on mount
  useEffect(() => {
    connect();
    
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  // Reconnect when window becomes visible (user came back to tab)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !connected) {
        connect();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [connected, connect]);

  return {
    prices,
    trackedAssets,
    stats,
    connected,
    lastMessageAt,
    refreshAssets,
  };
}

// Helper hook to get price for a specific asset
export function useRealtimePrice(assetId: number): RealtimePrice | undefined {
  const { prices } = useRealtimePrices();
  return prices.get(assetId);
}
