import { WebSocketServer, WebSocket } from 'ws';
import { realtimePriceService } from '../services/realtimePriceService.js';

// Store the WebSocket server instance
let wss: WebSocketServer | null = null;

/**
 * Initialize WebSocket server
 * This should be called after HTTP server is created
 */
export function initWebSocketServer(server: any): WebSocketServer {
  console.log('[WebSocket] Initializing WebSocket server on path: /ws/prices');
  
  wss = new WebSocketServer({ 
    server,
    path: '/ws/prices',
  });

  console.log('[WebSocket] Server initialized, waiting for connections...');

  wss.on('connection', (ws: WebSocket, req) => {
    console.log('[WebSocket] ✅ Client connected from:', req.socket.remoteAddress, req.socket.remotePort);
    console.log('[WebSocket] Total clients:', wss?.clients.size);
    
    // Add client to price service
    realtimePriceService.addClient(ws);

    // Handle client messages (for subscription control)
    ws.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        handleClientMessage(ws, message);
      } catch (error) {
        console.error('[WebSocket] Invalid message from client:', error);
      }
    });

    ws.on('close', (code, reason) => {
      console.log('[WebSocket] ❌ Client disconnected, code:', code, 'reason:', reason?.toString());
      realtimePriceService.removeClient(ws);
    });

    ws.on('error', (error) => {
      console.error('[WebSocket] Client error:', error);
      realtimePriceService.removeClient(ws);
    });
  });

  wss.on('error', (error) => {
    console.error('[WebSocket] ❌ Server error:', error);
  });
  
  wss.on('listening', () => {
    console.log('[WebSocket] Server is listening for connections');
  });
  
  wss.on('headers', (headers, req) => {
    console.log('[WebSocket] Headers received from:', req.socket.remoteAddress);
  });

  return wss;
}

/**
 * Handle messages from WebSocket clients
 */
function handleClientMessage(ws: WebSocket, message: any): void {
  switch (message.type) {
    case 'ping':
      ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
      break;
      
    case 'get_stats':
      ws.send(JSON.stringify({
        type: 'stats',
        data: realtimePriceService.getStats(),
      }));
      break;
      
    case 'refresh_assets':
      // Client requests to refresh tracked assets (e.g., after adding/removing holdings)
      realtimePriceService.refreshAssets();
      ws.send(JSON.stringify({
        type: 'assets_refreshed',
        data: realtimePriceService.getStats(),
      }));
      break;
      
    default:
      console.log('[WebSocket] Unknown message type:', message.type);
  }
}

/**
 * Get WebSocket server instance
 */
export function getWebSocketServer(): WebSocketServer | null {
  return wss;
}

/**
 * Broadcast message to all connected clients
 */
export function broadcastToClients(message: any): void {
  if (!wss) return;
  
  const data = JSON.stringify(message);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}
