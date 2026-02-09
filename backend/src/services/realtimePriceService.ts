import { WebSocket } from 'ws';
import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { query, run, saveDB } from '../db/index.js';
import { recordAssetPriceAt } from './priceHistoryService.js';

// Configuration
const MAX_CRYPTO_TICKS = 10;
const MAX_STOCK_US_TICKS = 20;
const HISTORY_BUCKET_MS = 15 * 60 * 1000;

// Tiingo API key (should be loaded from env/config)
const TIINGO_API_KEY = process.env.TIINGO_API_KEY || '';
console.log('[RealtimePrice] Tiingo API Key configured:', TIINGO_API_KEY ? 'YES (length: ' + TIINGO_API_KEY.length + ')' : 'NO');

// Asset types we support
interface TrackedAsset {
  id: number;
  symbol: string;
  name: string;
  type: 'crypto' | 'stock_us' | 'stock_cn' | 'gold';
  currency: string;
  normalizedSymbol: string; // For API calls (e.g., BTC -> btcusdt)
}

// Price update callback type
export type PriceUpdateCallback = (assetId: number, symbol: string, price: number, timestamp: number) => void;

// Client connection type
interface ClientConnection {
  ws: WebSocket;
  subscribedAssets: Set<number>; // asset IDs this client is interested in
}

class RealtimePriceService {
  private clients: Map<WebSocket, ClientConnection> = new Map();
  private trackedAssets: Map<number, TrackedAsset> = new Map();
  private currentPrices: Map<number, { price: number; timestamp: number }> = new Map();
  private historyBuckets: Map<number, { bucketStartMs: number; lastPrice: number; lastTimestamp: number; started: boolean }> = new Map();
  
  // External data source connections
  private binanceWs: WebSocket | null = null;
  private tiingoWs: WebSocket | null = null;
  
  // Price update callbacks (for broadcasting to clients)
  private priceCallbacks: PriceUpdateCallback[] = [];
  
  // Reconnection timers
  private binanceReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private tiingoReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private httpFallbackTimer: ReturnType<typeof setInterval> | null = null;
  
  // Track which symbols are subscribed to which data source
  private binanceSymbols: Set<string> = new Set();
  private tiingoSymbols: Set<string> = new Set();
  
  // Connection state
  private binanceConnected = false;
  private tiingoConnected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;

  constructor() {
    // Don't load assets here - DB not initialized yet
    // loadTrackedAssets() will be called in start()
  }

  // Load assets that have holdings (user's positions)
  private loadTrackedAssets(): void {
    try {
      // Get all assets that have non-zero holdings
      const holdings = query<{ asset_id: number; symbol: string; name: string; type: string; currency: string }>(`
        SELECT DISTINCT a.id as asset_id, a.symbol, a.name, a.type, a.currency
        FROM assets a
        JOIN holdings h ON a.id = h.asset_id
        WHERE h.quantity > 0
        ORDER BY a.type, a.symbol
      `);
      
      console.log('[RealtimePrice] Loaded holdings from DB:', holdings.length, 'assets');
      console.log('[RealtimePrice] Holdings details:', holdings.map(h => `${h.symbol}(${h.type})`).join(', '));

      // Separate by type and apply limits
      const cryptoAssets = holdings.filter(h => h.type === 'crypto').slice(0, MAX_CRYPTO_TICKS);
      const usStockAssets = holdings.filter(h => h.type === 'stock_us').slice(0, MAX_STOCK_US_TICKS);
      
      // Clear existing tracked assets
      this.trackedAssets.clear();
      
      // Add crypto assets with normalized symbols
      for (const asset of cryptoAssets) {
        this.trackedAssets.set(asset.asset_id, {
          id: asset.asset_id,
          symbol: asset.symbol,
          name: asset.name,
          type: 'crypto',
          currency: asset.currency,
          normalizedSymbol: this.normalizeBinanceSymbol(asset.symbol),
        });
      }
      
      // Add US stock assets
      for (const asset of usStockAssets) {
        this.trackedAssets.set(asset.asset_id, {
          id: asset.asset_id,
          symbol: asset.symbol,
          name: asset.name,
          type: 'stock_us',
          currency: asset.currency,
          normalizedSymbol: asset.symbol.toUpperCase(),
        });
      }

      console.log(`[RealtimePrice] Tracking ${cryptoAssets.length} crypto, ${usStockAssets.length} US stocks`);
      console.log('[RealtimePrice] Tracked assets:', Array.from(this.trackedAssets.values()).map(a => `${a.symbol}(${a.type})`).join(', '));
    } catch (error) {
      console.error('[RealtimePrice] Failed to load tracked assets:', error);
    }
  }

  // Normalize crypto symbol for Binance (BTC -> btcusdt)
  private normalizeBinanceSymbol(symbol: string): string {
    const upper = symbol.toUpperCase();
    // Already in USDT format
    if (upper.endsWith('USDT') || upper.endsWith('USD')) {
      return upper.toLowerCase();
    }
    // Default to USDT pair
    return `${upper.toLowerCase()}usdt`;
  }

  // Start all data source connections
  public start(): void {
    this.loadTrackedAssets();
    this.connectBinance();
    this.connectTiingo();
    
    // Start HTTP fallback polling (every 10 seconds)
    this.startHttpFallback();
    
    // Refresh asset list periodically (every 5 minutes)
    setInterval(() => {
      this.loadTrackedAssets();
      this.reconnectIfNeeded();
    }, 5 * 60 * 1000);
  }

  // Stop all connections
  public stop(): void {
    this.disconnectBinance();
    this.disconnectTiingo();
    this.stopHttpFallback();
    this.clients.forEach((client) => {
      client.ws.close();
    });
    this.clients.clear();
  }

  // Reconnect if asset list changed
  private reconnectIfNeeded(): void {
    const currentBinanceSymbols = new Set(
      Array.from(this.trackedAssets.values())
        .filter(a => a.type === 'crypto')
        .map(a => a.normalizedSymbol)
    );
    
    const currentTiingoSymbols = new Set(
      Array.from(this.trackedAssets.values())
        .filter(a => a.type === 'stock_us')
        .map(a => a.normalizedSymbol)
    );

    // Check if crypto symbols changed
    const binanceChanged = 
      currentBinanceSymbols.size !== this.binanceSymbols.size ||
      Array.from(currentBinanceSymbols).some(s => !this.binanceSymbols.has(s));
    
    if (binanceChanged) {
      console.log('[RealtimePrice] Crypto holdings changed, reconnecting Binance...');
      this.disconnectBinance();
      this.connectBinance();
    }

    // Check if stock symbols changed
    const tiingoChanged = 
      currentTiingoSymbols.size !== this.tiingoSymbols.size ||
      Array.from(currentTiingoSymbols).some(s => !this.tiingoSymbols.has(s));
    
    if (tiingoChanged) {
      console.log('[RealtimePrice] Stock holdings changed, reconnecting Tiingo...');
      this.disconnectTiingo();
      this.connectTiingo();
    }
  }

  // ==================== HTTP Fallback ====================
  private startHttpFallback(): void {
    console.log('[RealtimePrice] Starting HTTP fallback polling');
    // Fetch prices via HTTP every 10 seconds as fallback
    this.httpFallbackTimer = setInterval(async () => {
      await this.fetchHttpPrices();
      await this.fetchHttpStockPrices();
    }, 10000);
  }

  private stopHttpFallback(): void {
    if (this.httpFallbackTimer) {
      clearInterval(this.httpFallbackTimer);
      this.httpFallbackTimer = null;
    }
  }

  private async fetchHttpPrices(): Promise<void> {
    // Only fetch if WebSocket is not connected
    if (this.binanceConnected) {
      // Skip logging to reduce noise
      return;
    }
    
    const cryptoAssets = Array.from(this.trackedAssets.values()).filter(a => a.type === 'crypto');
    if (cryptoAssets.length === 0) {
      console.log('[RealtimePrice] HTTP fallback: No crypto assets to fetch');
      return;
    }
    console.log('[RealtimePrice] HTTP fallback: Fetching prices for', cryptoAssets.length, 'crypto assets');

    try {
      // Fetch from Binance HTTP API
      const symbols = cryptoAssets.map(a => a.normalizedSymbol.toUpperCase());
      const agent = this.getProxyAgent();
      const response = await axios.get(
        `https://api.binance.com/api/v3/ticker/price?symbols=${encodeURIComponent(JSON.stringify(symbols))}`,
        { 
          timeout: 5000,
          httpsAgent: agent,
        }
      );

      if (Array.isArray(response.data)) {
        for (const item of response.data) {
          const symbol = item.symbol.toLowerCase();
          const price = parseFloat(item.price);
          
          if (isNaN(price)) continue;
          
          const asset = cryptoAssets.find(a => a.normalizedSymbol.toLowerCase() === symbol);
          if (asset) {
            this.updatePrice(asset.id, asset.symbol, price, Date.now());
          }
        }
        console.log(`[RealtimePrice] HTTP fallback: fetched ${response.data.length} crypto prices`);
      }
    } catch (error) {
      // Silent fail for HTTP fallback
      console.log('[RealtimePrice] HTTP fallback fetch failed for crypto:', (error as Error).message);
    }
  }

  // HTTP fallback for US stocks (using Tiingo REST API)
  private async fetchHttpStockPrices(): Promise<void> {
    // Only fetch if WebSocket is not connected
    if (this.tiingoConnected) {
      // Skip logging to reduce noise
      return;
    }
    
    if (!TIINGO_API_KEY) {
      console.log('[RealtimePrice] HTTP fallback: No Tiingo API key, cannot fetch stock prices');
      return;
    }
    
    const stockAssets = Array.from(this.trackedAssets.values()).filter(a => a.type === 'stock_us');
    if (stockAssets.length === 0) {
      console.log('[RealtimePrice] HTTP fallback: No stock assets to fetch');
      return;
    }
    
    console.log('[RealtimePrice] HTTP fallback: Fetching prices for', stockAssets.length, 'stock assets:', stockAssets.map(a => a.symbol).join(', '));

    try {
      // Fetch from Tiingo HTTP API (using end-of-day prices as fallback)
      const tickers = stockAssets.map(a => a.symbol).join(',');
      const agent = this.getProxyAgent();
      const response = await axios.get(
        `https://api.tiingo.com/tiingo/daily/prices?tickers=${encodeURIComponent(tickers)}&token=${TIINGO_API_KEY}`,
        { 
          timeout: 10000,
          httpsAgent: agent,
        }
      );

      if (Array.isArray(response.data)) {
        for (const item of response.data) {
          const symbol = item.ticker as string;
          const price = item.close || item.adjClose || item.last;
          
          if (!price || isNaN(price)) continue;
          
          const asset = stockAssets.find(a => a.symbol.toUpperCase() === symbol.toUpperCase());
          if (asset) {
            console.log(`[RealtimePrice] HTTP fallback: Got price for ${symbol}: ${price}`);
            this.updatePrice(asset.id, asset.symbol, price, Date.now());
          }
        }
        console.log(`[RealtimePrice] HTTP fallback: fetched ${response.data.length} stock prices`);
      }
    } catch (error) {
      console.log('[RealtimePrice] HTTP fallback fetch failed for stocks:', (error as Error).message);
      if ((error as any).response?.data) {
        console.log('[RealtimePrice] Tiingo error response:', (error as any).response.data);
      }
    }
  }

  // ==================== Proxy Configuration ====================
  private getProxyAgent(): HttpsProxyAgent<string> | undefined {
    const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy || 
                     process.env.HTTP_PROXY || process.env.http_proxy;
    if (proxyUrl) {
      return new HttpsProxyAgent(proxyUrl);
    }
    return undefined;
  }

  // ==================== Binance WebSocket ====================
  private connectBinance(): void {
    const cryptoAssets = Array.from(this.trackedAssets.values()).filter(a => a.type === 'crypto');
    
    if (cryptoAssets.length === 0) {
      console.log('[RealtimePrice] No crypto holdings to track');
      return;
    }

    // Build combined stream URL
    const streams = cryptoAssets.map(a => `${a.normalizedSymbol}@ticker`).join('/');
    const url = `wss://stream.binance.com:9443/stream?streams=${streams}`;
    
    console.log(`[RealtimePrice] Connecting to Binance: ${cryptoAssets.length} streams`);
    
    this.binanceSymbols = new Set(cryptoAssets.map(a => a.normalizedSymbol));

    try {
      // Use proxy if configured
      const agent = this.getProxyAgent();
      this.binanceWs = new WebSocket(url, { agent });
      
      this.binanceWs.on('open', () => {
        console.log('[RealtimePrice] Binance WebSocket connected');
        this.binanceConnected = true;
        this.reconnectAttempts = 0;
        if (this.binanceReconnectTimer) {
          clearTimeout(this.binanceReconnectTimer);
          this.binanceReconnectTimer = null;
        }
      });

      this.binanceWs.on('message', (data: Buffer) => {
        try {
          const parsed = JSON.parse(data.toString());
          this.handleBinanceMessage(parsed);
        } catch (error) {
          console.error('[RealtimePrice] Failed to parse Binance message:', error);
        }
      });

      this.binanceWs.on('error', (error) => {
        console.error('[RealtimePrice] Binance WebSocket error:', error.message);
        this.binanceConnected = false;
      });

      this.binanceWs.on('close', () => {
        console.log('[RealtimePrice] Binance WebSocket closed');
        this.binanceConnected = false;
        this.scheduleBinanceReconnect();
      });
    } catch (error) {
      console.error('[RealtimePrice] Failed to connect Binance:', error);
      this.binanceConnected = false;
      this.scheduleBinanceReconnect();
    }
  }

  private disconnectBinance(): void {
    this.binanceConnected = false;
    if (this.binanceWs) {
      this.binanceWs.close();
      this.binanceWs = null;
    }
    if (this.binanceReconnectTimer) {
      clearTimeout(this.binanceReconnectTimer);
      this.binanceReconnectTimer = null;
    }
    this.binanceSymbols.clear();
  }

  private scheduleBinanceReconnect(): void {
    if (this.binanceReconnectTimer) return;
    
    this.reconnectAttempts++;
    const delay = Math.min(5000 * Math.pow(1.5, this.reconnectAttempts - 1), 60000); // Exponential backoff, max 60s
    
    console.log(`[RealtimePrice] Reconnecting to Binance in ${delay}ms (attempt ${this.reconnectAttempts})`);
    
    this.binanceReconnectTimer = setTimeout(() => {
      this.binanceReconnectTimer = null;
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.connectBinance();
      } else {
        console.log('[RealtimePrice] Max reconnect attempts reached, using HTTP fallback only');
      }
    }, delay);
  }

  private handleBinanceMessage(message: any): void {
    // Combined stream format: { stream: 'btcusdt@ticker', data: {...} }
    const stream = message.stream as string;
    const data = message.data;
    
    if (!stream || !data) return;
    
    // Extract symbol from stream name (btcusdt@ticker -> btcusdt)
    const symbol = stream.split('@')[0];
    const price = parseFloat(data.c); // Current price
    
    if (isNaN(price)) return;
    
    // Find the asset by normalized symbol
    const asset = Array.from(this.trackedAssets.values()).find(
      a => a.type === 'crypto' && a.normalizedSymbol === symbol
    );
    
    if (asset) {
      const timestamp = Date.now();
      this.updatePrice(asset.id, asset.symbol, price, timestamp);
    }
  }

  // ==================== Tiingo WebSocket ====================
  private connectTiingo(): void {
    if (!TIINGO_API_KEY) {
      console.log('[RealtimePrice] Tiingo API key not configured, skipping stock WebSocket feed (will use HTTP fallback)');
      return;
    }

    const stockAssets = Array.from(this.trackedAssets.values()).filter(a => a.type === 'stock_us');
    
    if (stockAssets.length === 0) {
      console.log('[RealtimePrice] No US stock holdings to track');
      return;
    }

    console.log(`[RealtimePrice] Connecting to Tiingo: ${stockAssets.length} stocks`);
    
    this.tiingoSymbols = new Set(stockAssets.map(a => a.normalizedSymbol));

    try {
      // Use proxy if configured
      const agent = this.getProxyAgent();
      this.tiingoWs = new WebSocket('wss://api.tiingo.com/iex', { agent });
      
      this.tiingoWs.on('open', () => {
        console.log('[RealtimePrice] Tiingo WebSocket connected');
        this.tiingoConnected = true;
        
        // Subscribe to tickers
        const tickers = stockAssets.map(a => a.normalizedSymbol);
        const subscribeMsg = {
          eventName: 'subscribe',
          authorization: TIINGO_API_KEY,
          eventData: {
            tickers: tickers
          },
        };
        
        this.tiingoWs?.send(JSON.stringify(subscribeMsg));
        
        if (this.tiingoReconnectTimer) {
          clearTimeout(this.tiingoReconnectTimer);
          this.tiingoReconnectTimer = null;
        }
      });

      this.tiingoWs.on('message', (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleTiingoMessage(message);
        } catch (error) {
          console.error('[RealtimePrice] Failed to parse Tiingo message:', error);
        }
      });

      this.tiingoWs.on('error', (error) => {
        console.error('[RealtimePrice] Tiingo WebSocket error:', error.message);
        this.tiingoConnected = false;
      });

      this.tiingoWs.on('close', () => {
        console.log('[RealtimePrice] Tiingo WebSocket closed');
        this.tiingoConnected = false;
        this.scheduleTiingoReconnect();
      });
    } catch (error) {
      console.error('[RealtimePrice] Failed to connect Tiingo:', error);
      this.tiingoConnected = false;
      this.scheduleTiingoReconnect();
    }
  }

  private disconnectTiingo(): void {
    this.tiingoConnected = false;
    if (this.tiingoWs) {
      this.tiingoWs.close();
      this.tiingoWs = null;
    }
    if (this.tiingoReconnectTimer) {
      clearTimeout(this.tiingoReconnectTimer);
      this.tiingoReconnectTimer = null;
    }
    this.tiingoSymbols.clear();
  }

  private scheduleTiingoReconnect(): void {
    if (this.tiingoReconnectTimer) return;
    
    this.tiingoReconnectTimer = setTimeout(() => {
      console.log('[RealtimePrice] Reconnecting to Tiingo...');
      this.tiingoReconnectTimer = null;
      this.connectTiingo();
    }, 10000);
  }

  private handleTiingoMessage(message: any): void {
    // Tiingo message formats:
    // 1) IEX stream array: { messageType: 'A', data: [timestamp, ticker, price, ...] }
    // 2) IEX stream batch: { messageType: 'A', data: [[timestamp, ticker, price, ...], ...] }
    // 3) Object payload: { messageType: 'A', data: { ticker, lastPrice, bidPrice, askPrice, ... } }
    // sample 1% message
    if (!message || !message.messageType || !message.data) return;
    if (message.messageType === 'H') return;
    if (message.messageType !== 'A') return;

    const processTick = (ts: unknown, ticker: unknown, lastPrice: unknown) => {
      const symbol = typeof ticker === 'string' ? ticker : undefined;
      const price = typeof lastPrice === 'number' ? lastPrice : undefined;
      if (!symbol || typeof price !== 'number' || isNaN(price)) return;

      const asset = Array.from(this.trackedAssets.values()).find(
        a => a.type === 'stock_us' && a.normalizedSymbol === symbol.toUpperCase()
      );
      if (!asset) return;

      let timestampMs = Date.now();
      if (typeof ts === 'string') {
        const parsed = Date.parse(ts);
        if (!Number.isNaN(parsed)) timestampMs = parsed;
      }

      this.updatePrice(asset.id, asset.symbol, price, timestampMs);
    };

    if (Array.isArray(message.data)) {
      if (Array.isArray(message.data[0])) {
        for (const row of message.data) {
          if (!Array.isArray(row)) continue;
          processTick(row[0], row[1], row[2]);
        }
        return;
      }
      processTick(message.data[0], message.data[1], message.data[2]);
      return;
    }

    const data = message.data;
    const symbol = typeof data.ticker === 'string' ? data.ticker : undefined;
    let p = data.lastPrice || data.bidPrice;
    if (!p && data.bidPrice && data.askPrice) {
      p = (data.bidPrice + data.askPrice) / 2;
    }
    if (!symbol || typeof p !== 'number' || isNaN(p)) return;
    processTick(data.timestamp, symbol, p);
  }

  // ==================== Price Update Logic ====================
  private updatePrice(assetId: number, symbol: string, price: number, timestamp: number): void {
    // Store current price
    this.currentPrices.set(assetId, { price, timestamp });
    
    // Persist to database (throttled to avoid too many writes)
    this.persistPrice(assetId, price, timestamp);

    // Record history for crypto and US stocks at 15-minute bucket boundaries
    this.recordBucketedHistory(assetId, price, timestamp);
    
    // Notify all callbacks (broadcast to clients)
    this.priceCallbacks.forEach(cb => cb(assetId, symbol, price, timestamp));
    
    // Broadcast to all connected WebSocket clients
    this.broadcastToClients({
      type: 'price_update',
      assetId,
      symbol,
      price,
      timestamp,
    });
  }

  private priceUpdateThrottle: Map<number, number> = new Map();
  
  private persistPrice(assetId: number, price: number, timestamp: number): void {
    // Throttle: max 1 write per 5 seconds per asset
    const lastUpdate = this.priceUpdateThrottle.get(assetId) || 0;
    if (timestamp - lastUpdate < 5000) return;
    
    this.priceUpdateThrottle.set(assetId, timestamp);
    
    try {
      run(
        'UPDATE assets SET current_price = ?, price_updated_at = ? WHERE id = ?',
        [price, new Date(timestamp).toISOString(), assetId]
      );
      saveDB();
    } catch (error) {
      console.error('[RealtimePrice] Failed to persist price:', error);
    }
  }

  private recordBucketedHistory(assetId: number, price: number, timestamp: number): void {
    const asset = this.trackedAssets.get(assetId);
    if (!asset || (asset.type !== 'crypto' && asset.type !== 'stock_us')) return;
    if (!Number.isFinite(price) || price <= 0) return;

    const bucketStart = Math.floor(timestamp / HISTORY_BUCKET_MS) * HISTORY_BUCKET_MS;
    const state = this.historyBuckets.get(assetId);

    if (!state) {
      this.historyBuckets.set(assetId, {
        bucketStartMs: bucketStart,
        lastPrice: price,
        lastTimestamp: timestamp,
        started: true,
      });
      // Record start of bucket
      recordAssetPriceAt(assetId, price, bucketStart);
      return;
    }

    if (timestamp < state.lastTimestamp) {
      return;
    }

    if (bucketStart === state.bucketStartMs) {
      state.lastPrice = price;
      state.lastTimestamp = timestamp;
      if (!state.started) {
        recordAssetPriceAt(assetId, price, bucketStart);
        state.started = true;
      }
      return;
    }

    // Bucket advanced: record end of previous bucket, then start of new bucket
    const prevBucketEnd = state.bucketStartMs + HISTORY_BUCKET_MS - 1;
    recordAssetPriceAt(assetId, state.lastPrice, prevBucketEnd);

    state.bucketStartMs = bucketStart;
    state.lastPrice = price;
    state.lastTimestamp = timestamp;
    state.started = true;
    recordAssetPriceAt(assetId, price, bucketStart);
  }

  // ==================== Client Management ====================
  public addClient(ws: WebSocket): void {
    console.log('[RealtimePrice] addClient called, current clients:', this.clients.size);
    
    const client: ClientConnection = {
      ws,
      subscribedAssets: new Set(),
    };
    
    this.clients.set(ws, client);
    console.log('[RealtimePrice] Client added, new count:', this.clients.size);
    
    // Send current prices to new client
    const initialPrices = Array.from(this.currentPrices.entries()).map(([assetId, data]) => {
      const asset = this.trackedAssets.get(assetId);
      return {
        assetId,
        symbol: asset?.symbol || '',
        price: data.price,
        timestamp: data.timestamp,
      };
    });
    
    console.log('[RealtimePrice] Sending init to client with', initialPrices.length, 'prices,', this.trackedAssets.size, 'assets');
    
    try {
      this.sendToClient(ws, {
        type: 'init',
        prices: initialPrices,
        trackedAssets: Array.from(this.trackedAssets.values()).map(a => ({
          id: a.id,
          symbol: a.symbol,
          type: a.type,
        })),
      });
      console.log('[RealtimePrice] Init message sent successfully');
    } catch (error) {
      console.error('[RealtimePrice] Failed to send init message:', error);
    }

    ws.on('close', () => {
      this.removeClient(ws);
    });

    ws.on('error', (error) => {
      console.error('[RealtimePrice] Client WebSocket error:', error);
      this.removeClient(ws);
    });
  }

  public removeClient(ws: WebSocket): void {
    this.clients.delete(ws);
  }

  private sendToClient(ws: WebSocket, message: any): void {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(message));
      } catch (error) {
        console.error('[RealtimePrice] sendToClient error:', error);
      }
    } else {
      console.log('[RealtimePrice] Cannot send, ws not open. State:', ws.readyState);
    }
  }

  private broadcastToClients(message: any): void {
    const data = JSON.stringify(message);
    this.clients.forEach((client) => {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(data);
      }
    });
  }

  // ==================== Public API ====================
  public onPriceUpdate(callback: PriceUpdateCallback): void {
    this.priceCallbacks.push(callback);
  }

  public offPriceUpdate(callback: PriceUpdateCallback): void {
    const index = this.priceCallbacks.indexOf(callback);
    if (index > -1) {
      this.priceCallbacks.splice(index, 1);
    }
  }

  public getCurrentPrice(assetId: number): { price: number; timestamp: number } | null {
    return this.currentPrices.get(assetId) || null;
  }

  public getTrackedAssets(): TrackedAsset[] {
    return Array.from(this.trackedAssets.values());
  }

  public getStats(): {
    clients: number;
    trackedAssets: number;
    cryptoCount: number;
    stockUsCount: number;
    binanceConnected: boolean;
    tiingoConnected: boolean;
  } {
    return {
      clients: this.clients.size,
      trackedAssets: this.trackedAssets.size,
      cryptoCount: Array.from(this.trackedAssets.values()).filter(a => a.type === 'crypto').length,
      stockUsCount: Array.from(this.trackedAssets.values()).filter(a => a.type === 'stock_us').length,
      binanceConnected: this.binanceConnected,
      tiingoConnected: this.tiingoConnected,
    };
  }

  // Force refresh tracked assets (e.g., after holdings change)
  public refreshAssets(): void {
    this.loadTrackedAssets();
    this.reconnectIfNeeded();
  }
}

// Singleton instance
export const realtimePriceService = new RealtimePriceService();
