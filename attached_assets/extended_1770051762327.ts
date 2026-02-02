import WebSocket from "ws";
import { HttpsProxyAgent } from "https-proxy-agent";
import type { ExchangeHandler } from "./types";
import type { OrderBook, MarketInfo, Order } from "@shared/schema";

export class ExtendedExchange implements ExchangeHandler {
  exchange = "extended" as const;
  private ws: WebSocket | null = null;
  private orderBookCallback: ((ob: OrderBook) => void) | null = null;
  private statusCallback: ((status: "connecting" | "connected" | "disconnected" | "error" | "demo") => void) | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private markets: MarketInfo[] = [];
  private orderBooks: Map<string, { bids: Map<string, string>; asks: Map<string, string> }> = new Map();
  private proxyConfig: string | null = null;

  async connect(): Promise<void> {
    this.statusCallback?.("connecting");
    
    this.markets = [
      { exchange: "extended", symbol: "BTC-USD", baseAsset: "BTC", quoteAsset: "USD" },
      { exchange: "extended", symbol: "ETH-USD", baseAsset: "ETH", quoteAsset: "USD" },
      { exchange: "extended", symbol: "SOL-USD", baseAsset: "SOL", quoteAsset: "USD" },
    ];

    console.log("Extended markets:", this.markets.map(m => m.symbol));
    
    this.proxyConfig = process.env.Extended_10_PROXY_10_URL || null;
    if (!this.proxyConfig) {
      console.error("Extended: Extended_10_PROXY_10_URL not set - cannot connect");
      this.statusCallback?.("error");
      return;
    }
    
    this.connectWebSocket();
  }

  private connectWebSocket(): void {
    if (!this.proxyConfig) return;
    
    try {
      const parts = this.proxyConfig.split(':');
      if (parts.length < 4) {
        console.error("Extended: Invalid proxy format, expected IP:PORT:USER:PASS");
        this.statusCallback?.("error");
        return;
      }
      
      const [ipAddr, portNum, proxyUser, proxyPass] = parts.map(p => p.trim());
      console.log("Extended: Using proxy:", `http://${proxyUser}:***@${ipAddr}:${portNum}`);
      
      const proxyUrl = new URL(`http://${ipAddr}:${portNum}`);
      proxyUrl.username = proxyUser;
      proxyUrl.password = proxyPass;
      console.log("Extended: Proxy URL:", proxyUrl.href);
      const agent = new HttpsProxyAgent(proxyUrl);
      
      const wsUrl = "wss://api.starknet.extended.exchange/stream.extended.exchange/v1/orderbooks";
      console.log("Extended: Connecting via proxy to", wsUrl);
      
      const apiKey = process.env.Extended_10_0f08fC_API_KEY || "";
      console.log("Extended: API key present:", apiKey ? "yes" : "no");
      
      this.ws = new WebSocket(wsUrl, { 
        agent,
        headers: {
          "X-Api-Key": apiKey,
          "User-Agent": "OrderBookMonitor/1.0"
        }
      });
      
      this.ws.on("open", () => {
        console.log("Extended: WebSocket connected");
        this.statusCallback?.("connected");
      });

      this.ws.on("message", (data: WebSocket.Data) => {
        try {
          const msg = JSON.parse(data.toString());
          this.handleMessage(msg);
        } catch (e) {
          // Silently ignore parse errors to reduce log spam
        }
      });

      this.ws.on("close", () => {
        console.log("Extended: WebSocket closed");
        this.statusCallback?.("disconnected");
        this.scheduleReconnect();
      });

      this.ws.on("error", (err) => {
        console.error("Extended: WebSocket error", err.message);
        this.statusCallback?.("error");
      });
    } catch (e) {
      console.error("Extended: Failed to connect", e);
      this.statusCallback?.("error");
    }
  }

  private handleMessage(msg: any): void {
    const data = msg.data || msg;
    const symbol = data.m || msg.market || msg.symbol || data.market;
    if (!symbol) return;

    const targetSymbols = ["BTC-USD", "ETH-USD", "SOL-USD"];
    if (!targetSymbols.includes(symbol)) return;

    let orderBookData = this.orderBooks.get(symbol);
    if (!orderBookData) {
      orderBookData = { bids: new Map(), asks: new Map() };
      this.orderBooks.set(symbol, orderBookData);
    }

    const bidsArray = data.b || data.bids || [];
    const asksArray = data.a || data.asks || [];

    for (const bid of bidsArray) {
      const rawPrice = Array.isArray(bid) ? bid[0] : bid.p || bid.price;
      const size = Array.isArray(bid) ? bid[1] : bid.q || bid.size;
      const priceKey = String(rawPrice);
      if (!priceKey || priceKey === "undefined" || priceKey === "null") continue;
      const sizeNum = parseFloat(size);
      if (isNaN(sizeNum) || sizeNum <= 0) {
        orderBookData.bids.delete(priceKey);
      } else {
        orderBookData.bids.set(priceKey, String(sizeNum));
      }
    }

    for (const ask of asksArray) {
      const rawPrice = Array.isArray(ask) ? ask[0] : ask.p || ask.price;
      const size = Array.isArray(ask) ? ask[1] : ask.q || ask.size;
      const priceKey = String(rawPrice);
      if (!priceKey || priceKey === "undefined" || priceKey === "null") continue;
      const sizeNum = parseFloat(size);
      if (isNaN(sizeNum) || sizeNum <= 0) {
        orderBookData.asks.delete(priceKey);
      } else {
        orderBookData.asks.set(priceKey, String(sizeNum));
      }
    }

    this.emitOrderBook(symbol);
  }

  private emitOrderBook(symbol: string): void {
    const data = this.orderBooks.get(symbol);
    if (!data) return;

    const bids = this.processOrders(data.bids, true);
    const asks = this.processOrders(data.asks, false);

    if (bids.length === 0 && asks.length === 0) return;

    const midPrice = bids.length > 0 && asks.length > 0
      ? ((parseFloat(bids[0].price) + parseFloat(asks[0].price)) / 2).toString()
      : undefined;

    const spread = bids.length > 0 && asks.length > 0
      ? (parseFloat(asks[0].price) - parseFloat(bids[0].price)).toString()
      : undefined;

    const spreadPercent = midPrice && spread
      ? ((parseFloat(spread) / parseFloat(midPrice)) * 100).toFixed(4)
      : undefined;

    const orderBook: OrderBook = {
      exchange: "extended",
      symbol,
      bids,
      asks,
      midPrice,
      spread,
      spreadPercent,
      lastUpdate: Date.now(),
      status: "connected",
    };

    this.orderBookCallback?.(orderBook);
  }

  private processOrders(ordersMap: Map<string, string>, isBid: boolean): Order[] {
    const orders = Array.from(ordersMap.entries())
      .map(([price, size]) => ({ price, size }))
      .filter((o) => parseFloat(o.size) > 0)
      .sort((a, b) => isBid 
        ? parseFloat(b.price) - parseFloat(a.price)
        : parseFloat(a.price) - parseFloat(b.price)
      )
      .slice(0, 15);

    let cumulative = 0;
    return orders.map((order) => {
      cumulative += parseFloat(order.size);
      return {
        price: order.price,
        size: order.size,
        total: cumulative.toString(),
      };
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    this.reconnectTimeout = setTimeout(() => this.connectWebSocket(), 5000);
  }

  disconnect(): void {
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    this.ws?.close();
    this.ws = null;
  }

  async getMarkets(): Promise<MarketInfo[]> {
    return this.markets;
  }

  onOrderBook(callback: (ob: OrderBook) => void): void {
    this.orderBookCallback = callback;
  }

  onStatus(callback: (status: "connecting" | "connected" | "disconnected" | "error" | "demo") => void): void {
    this.statusCallback = callback;
  }
}
