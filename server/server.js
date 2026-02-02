import WebSocket, { WebSocketServer } from 'ws';
import http from 'http';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';

const PORT = process.env.PORT || 3001;

const EXCHANGES = {
  lighter: {
    url: 'wss://mainnet.zklighter.elliot.ai/stream',
    name: 'Lighter',
    proxyEnv: 'Proxy_lighter_public',
  },
  extended: {
    url: 'wss://api.starknet.extended.exchange/stream.extended.exchange/v1/prices/mark',
    name: 'Extended',
    proxyEnv: 'Proxy_extended_public',
  },
  paradex: {
    url: 'wss://ws.api.prod.paradex.trade/v1',
    marketsUrl: 'https://api.prod.paradex.trade/v1/markets',
    name: 'Paradex',
    proxyEnv: 'Proxy_paradex_public',
  },
  grvt: {
    url: 'wss://market-data.grvt.io/ws/full',
    name: 'GRVT',
    proxyEnv: 'Proxy_GRVT_public',
  },
  reya: {
    url: 'wss://ws.reya.xyz',
    name: 'Reya',
    proxyEnv: 'Proxy_reya_public',
  },
  pacifica: {
    url: 'wss://ws.pacifica.fi/ws',
    name: 'Pacifica',
    proxyEnv: 'Proxy_pacifica_public',
    allowNoProxy: true,
  },
};

const LIGHTER_MARKETS = [
  'ETH', 'BTC', 'SOL', 'DOGE', '1000PEPE', 'WIF', 'WLD', 'XRP', 'LINK', 'AVAX',
  'NEAR', 'DOT', 'TON', 'TAO', 'POL', 'TRUMP', 'SUI', '1000SHIB', '1000BONK', '1000FLOKI',
  'BERA', 'FARTCOIN', 'AI16Z', 'POPCAT', 'HYPE', 'BNB', 'JUP', 'AAVE', 'MKR', 'ENA',
  'UNI', 'APT', 'SEI', 'KAITO', 'IP', 'LTC', 'CRV', 'PENDLE', 'ONDO', 'ADA',
  'S', 'VIRTUAL', 'SPX', 'TRX', 'SYRUP', 'PUMP', 'LDO', 'PENGU', 'PAXG', 'EIGEN',
  'ARB', 'RESOLV', 'GRASS', 'ZORA', 'LAUNCHCOIN', 'OP', 'ZK', 'PROVE', 'BCH', 'HBAR',
  'ZRO', 'GMX', 'DYDX', 'MNT', 'ETHFI', 'AERO', 'USELESS', 'TIA', 'MORPHO', 'VVV',
  'YZY', 'XPL', 'WLFI', 'CRO', 'NMR', 'DOLO', 'LINEA', 'XMR', 'PYTH', 'SKY',
  'MYX', '1000TOSHI', 'AVNT', 'ASTER', '0G', 'STBL', 'APEX', 'FF', '2Z', 'EDEN',
  'ZEC', 'MON', 'XAU', 'XAG', 'MEGA', 'MET', 'EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF',
  'USDCAD', 'CC', 'ICP', 'FIL', 'STRK'
];

const GRVT_MARKETS = [
  'BTC_USDT_Perp', 'ETH_USDT_Perp', 'SOL_USDT_Perp', 'DOGE_USDT_Perp', 
  'XRP_USDT_Perp', 'LINK_USDT_Perp', 'AVAX_USDT_Perp', 'SUI_USDT_Perp',
  'ARB_USDT_Perp', 'OP_USDT_Perp', 'NEAR_USDT_Perp', 'APT_USDT_Perp'
];

const REYA_MARKETS = [
  'BTCRUSDPERP', 'ETHRUSDPERP', 'SOLRUSDPERP', 'BNBRUSDPERP', 
  'XRPRUSDPERP', 'DOGERUSDPERP', 'SUIRUSDPERP', 'LINKRUSDPERP'
];

const PACIFICA_MARKETS = ['BTC', 'ETH', 'SOL', 'AVAX', 'SUI', 'ARB', 'OP', 'LINK'];

// Extended markets for orderbook subscription
const EXTENDED_MARKETS = [
  'BTC-USD-PERP', 'ETH-USD-PERP', 'SOL-USD-PERP', 'DOGE-USD-PERP', 
  'XRP-USD-PERP', 'LINK-USD-PERP', 'AVAX-USD-PERP', 'SUI-USD-PERP',
  'ARB-USD-PERP', 'OP-USD-PERP', 'NEAR-USD-PERP', 'APT-USD-PERP'
];

function parseProxyString(proxyString) {
  if (!proxyString) return null;
  
  if (proxyString.startsWith('http://') || proxyString.startsWith('https://') || proxyString.startsWith('socks')) {
    return proxyString;
  }
  
  const parts = proxyString.split(':');
  if (parts.length === 4) {
    const [host, port, user, pass] = parts;
    return `http://${user}:${pass}@${host}:${port}`;
  }
  if (parts.length === 2) {
    const [host, port] = parts;
    return `http://${host}:${port}`;
  }
  
  return null;
}

function getProxyAgent(exchangeKey, skipProxy = false) {
  const exchange = EXCHANGES[exchangeKey];
  
  if (skipProxy && exchange?.allowNoProxy) {
    console.log(`${exchange?.name || exchangeKey}: Connecting without proxy (fallback)`);
    return null;
  }
  
  let proxyUrl = null;
  
  if (exchange && exchange.proxyEnv) {
    const rawProxy = process.env[exchange.proxyEnv];
    proxyUrl = parseProxyString(rawProxy);
  }
  
  if (!proxyUrl) {
    const fallback = process.env.PROXY_URL || process.env.HTTP_PROXY || process.env.HTTPS_PROXY;
    proxyUrl = parseProxyString(fallback) || fallback;
  }
  
  if (!proxyUrl) {
    return null;
  }
  
  console.log(`${exchange?.name || exchangeKey}: Using proxy ${proxyUrl.replace(/:[^:@]+@/, ':****@')}`);
  
  if (proxyUrl.startsWith('socks')) {
    return new SocksProxyAgent(proxyUrl);
  }
  
  return new HttpsProxyAgent(proxyUrl);
}

function normalizeSymbol(symbol) {
  if (!symbol) return '';
  return symbol
    .replace(/-USD-PERP$/i, '')
    .replace(/-PERP$/i, '')
    .replace(/RUSDPERP$/i, '')
    .replace(/_USDT_Perp$/i, '')
    .replace(/-USD$/i, '')
    .toUpperCase();
}

function extractVolumeNumber(source, prefer24h = false) {
  if (!source || typeof source !== 'object') return undefined;
  
  const entries = Object.entries(source);
  let candidates = entries.filter(([key, value]) => {
    const k = key.toLowerCase();
    if (!k.includes('vol')) return false;
    if (k.includes('change')) return false;
    if (value === null || value === undefined) return false;
    return true;
  });
  
  if (prefer24h) {
    candidates = candidates.sort((a, b) => {
      const aKey = a[0].toLowerCase();
      const bKey = b[0].toLowerCase();
      const aIs24h = aKey.includes('24h') || aKey.includes('24_h');
      const bIs24h = bKey.includes('24h') || bKey.includes('24_h');
      if (aIs24h === bIs24h) return 0;
      return aIs24h ? -1 : 1;
    });
  }
  
  for (const [, value] of candidates) {
    const num = parseFloat(String(value));
    if (!Number.isNaN(num) && num > 0) {
      return num;
    }
  }
  
  return undefined;
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      exchanges: Object.keys(EXCHANGES)
    }));
  } else {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Crypto Data Stream Aggregator Server - 6 Exchanges');
  }
});

const wss = new WebSocketServer({ server });
const clients = new Set();
const exchangeSockets = new Map();
const priceCache = new Map();
const orderbookCache = new Map();
const previousPrices = new Map();
let paradexMarkets = [];

function broadcast(data) {
  const message = JSON.stringify(data);
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

function broadcastOrderbook(data) {
  const message = JSON.stringify({ type: 'orderbook', ...data });
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

async function fetchParadexMarkets() {
  try {
    console.log('Paradex: Fetching markets...');
    const response = await fetch(EXCHANGES.paradex.marketsUrl);
    if (!response.ok) {
      console.error(`Paradex: API returned ${response.status}`);
      return [];
    }
    const data = await response.json();
    if (data && data.results && Array.isArray(data.results)) {
      const perpMarkets = data.results
        .filter((m) => m.symbol && m.symbol.includes('-PERP'))
        .map((m) => m.symbol);
      console.log(`Paradex: Loaded ${perpMarkets.length} PERP markets`);
      return perpMarkets;
    }
    return [];
  } catch (error) {
    console.error('Paradex: Error fetching markets:', error.message);
    return [];
  }
}

function connectLighter() {
  const agent = getProxyAgent('lighter');
  const options = {
    headers: {
      'Origin': 'https://lighter.xyz',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
  };
  if (agent) options.agent = agent;
  
  console.log('Lighter: Connecting...');
  const ws = new WebSocket(EXCHANGES.lighter.url, options);
  
  ws.on('open', () => {
    console.log('Lighter: Connected');
    
    LIGHTER_MARKETS.forEach((_, index) => {
      ws.send(JSON.stringify({
        type: 'subscribe',
        channel: `market_stats/${index}`
      }));
      ws.send(JSON.stringify({
        type: 'subscribe',
        channel: `order_book/${index}`
      }));
    });
    console.log(`Lighter: Subscribed to ${LIGHTER_MARKETS.length} markets (stats + orderbook)`);
  });
  
  ws.on('message', (rawData) => {
    try {
      const data = JSON.parse(rawData.toString());
      
      if (data.type === 'update/market_stats' && data.market_stats) {
        const stats = data.market_stats;
        const marketId = String(stats.market_id);
        const symbol = LIGHTER_MARKETS[parseInt(marketId)];
        
        if (!symbol) return;
        
        const price = parseFloat(stats.last_trade_price || stats.mark_price || 0);
        if (!price || price <= 0) return;
        
        const normalizedSymbol = normalizeSymbol(symbol);
        const cacheKey = `lighter_${normalizedSymbol}`;
        const prevPrice = previousPrices.get(cacheKey);
        let priceChange;
        if (prevPrice && prevPrice > 0) {
          const change = ((price - prevPrice) / prevPrice) * 100;
          priceChange = change >= 0 ? `+${change.toFixed(2)}` : change.toFixed(2);
        }
        previousPrices.set(cacheKey, price);
        
        const volumeTokens = extractVolumeNumber(stats, true);
        const volumeUsd = volumeTokens !== undefined ? volumeTokens * price : undefined;
        
        const existingOrderbook = orderbookCache.get(cacheKey) || {};
        
        const priceData = {
          exchange: 'Lighter',
          symbol: normalizedSymbol,
          price: price.toString(),
          timestamp: Date.now(),
          volume: volumeUsd !== undefined ? volumeUsd.toString() : undefined,
          priceChange,
          bestBid: existingOrderbook.bestBid,
          bestAsk: existingOrderbook.bestAsk,
          bidSize: existingOrderbook.bidSize,
          askSize: existingOrderbook.askSize,
          spread: existingOrderbook.spread
        };
        
        priceCache.set(cacheKey, priceData);
        broadcast(priceData);
      }
      
      if (data.type === 'update/order_book' && data.order_book) {
        const channelParts = data.channel.split(':');
        const marketId = channelParts[1];
        const symbol = LIGHTER_MARKETS[parseInt(marketId)];
        
        if (!symbol) return;
        
        const normalizedSymbol = normalizeSymbol(symbol);
        const cacheKey = `lighter_${normalizedSymbol}`;
        
        const bids = data.order_book.bids || [];
        const asks = data.order_book.asks || [];
        
        // Sort bids descending and asks ascending to get true best prices
        const sortedBids = [...bids].sort((a, b) => parseFloat(b.price) - parseFloat(a.price));
        const sortedAsks = [...asks].sort((a, b) => parseFloat(a.price) - parseFloat(b.price));
        
        const bestBid = sortedBids.length > 0 ? parseFloat(sortedBids[0].price) : null;
        const bestAsk = sortedAsks.length > 0 ? parseFloat(sortedAsks[0].price) : null;
        const bidSize = sortedBids.length > 0 ? sortedBids[0].size : null;
        const askSize = sortedAsks.length > 0 ? sortedAsks[0].size : null;
        const spread = bestBid && bestAsk ? (bestAsk - bestBid).toFixed(4) : null;
        
        // Only update if values actually changed to prevent flickering
        const existingOB = orderbookCache.get(cacheKey);
        if (existingOB && 
            existingOB.bestBid === bestBid?.toString() && 
            existingOB.bestAsk === bestAsk?.toString()) {
          return; // No change, skip broadcast
        }
        
        const orderbookData = {
          bestBid: bestBid?.toString(),
          bestAsk: bestAsk?.toString(),
          bidSize,
          askSize,
          spread
        };
        
        orderbookCache.set(cacheKey, orderbookData);
        
        const existingPrice = priceCache.get(cacheKey);
        if (existingPrice) {
          const updatedData = { ...existingPrice, ...orderbookData };
          priceCache.set(cacheKey, updatedData);
          broadcast(updatedData);
        } else {
          broadcastOrderbook({
            exchange: 'Lighter',
            symbol: normalizedSymbol,
            ...orderbookData,
            timestamp: Date.now()
          });
        }
      }
    } catch (error) {
      console.error('Lighter: Parse error', error.message);
    }
  });
  
  ws.on('error', (error) => {
    console.error('Lighter: Error', error.message);
  });
  
  ws.on('close', () => {
    console.log('Lighter: Disconnected, reconnecting in 5s...');
    exchangeSockets.delete('lighter');
    setTimeout(connectLighter, 5000);
  });
  
  exchangeSockets.set('lighter', ws);
}

function connectExtended() {
  const agent = getProxyAgent('extended');
  const options = {
    headers: {
      'Origin': 'https://app.extended.exchange',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  };
  if (agent) options.agent = agent;
  
  console.log('Extended: Connecting...');
  const ws = new WebSocket(EXCHANGES.extended.url, options);
  
  ws.on('open', () => {
    console.log('Extended: Connected');
  });
  
  ws.on('message', (rawData) => {
    try {
      const lines = rawData.toString().split('\n');
      
      for (const line of lines) {
        if (!line.trim()) continue;
        
        const data = JSON.parse(line);
        
        if ((data.type === 'MP' || data.type === 'P') && data.data) {
          const market = data.data.m || data.data.market;
          const price = parseFloat(data.data.p || data.data.price || data.data.mark_price || 0);
          
          if (!market || !price || price <= 0) continue;
          
          const normalizedSymbol = normalizeSymbol(market);
          const cacheKey = `extended_${normalizedSymbol}`;
          const prevPrice = previousPrices.get(cacheKey);
          let priceChange;
          if (prevPrice && prevPrice > 0) {
            const change = ((price - prevPrice) / prevPrice) * 100;
            priceChange = change >= 0 ? `+${change.toFixed(2)}` : change.toFixed(2);
          }
          previousPrices.set(cacheKey, price);
          
          const volumeTokens = extractVolumeNumber(data.data, true);
          const volumeUsd = volumeTokens !== undefined ? volumeTokens * price : undefined;
          
          const bestBid = data.data.bid ? parseFloat(data.data.bid) : null;
          const bestAsk = data.data.ask ? parseFloat(data.data.ask) : null;
          const spread = bestBid && bestAsk ? (bestAsk - bestBid).toFixed(2) : null;
          
          const priceData = {
            exchange: 'Extended',
            symbol: normalizedSymbol,
            price: price.toString(),
            timestamp: Date.now(),
            volume: volumeUsd !== undefined ? volumeUsd.toString() : undefined,
            priceChange,
            bestBid: bestBid?.toString(),
            bestAsk: bestAsk?.toString(),
            spread
          };
          
          priceCache.set(cacheKey, priceData);
          broadcast(priceData);
        }
      }
    } catch (error) {
      console.error('Extended: Parse error', error.message);
    }
  });
  
  ws.on('error', (error) => {
    console.error('Extended: Error', error.message);
  });
  
  ws.on('close', () => {
    console.log('Extended: Disconnected, reconnecting in 5s...');
    exchangeSockets.delete('extended');
    setTimeout(connectExtended, 5000);
  });
  
  exchangeSockets.set('extended', ws);
}

// Connect to Extended orderbook stream for each market
function connectExtendedOrderbook() {
  const agent = getProxyAgent('extended');
  const baseOptions = {
    headers: {
      'Origin': 'https://app.extended.exchange',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  };
  if (agent) baseOptions.agent = agent;
  
  // Use single orderbooks endpoint (plural) as per attached code reference
  const orderbookUrl = 'wss://api.starknet.extended.exchange/stream.extended.exchange/v1/orderbooks';
  console.log(`Extended Orderbook: Connecting to ${orderbookUrl}...`);
  
  const ws = new WebSocket(orderbookUrl, { ...baseOptions });
  let extMsgCount = 0;
  
  // Maintain orderbook state per market (for delta updates)
  const extendedOrderbooks = new Map();
  
  ws.on('open', () => {
    console.log('Extended Orderbook: Connected');
  });
  
  ws.on('message', (rawData) => {
    try {
      const msg = JSON.parse(rawData.toString());
      const data = msg.data || msg;
      const symbol = data.m || msg.market || msg.symbol || data.market;
      const msgType = msg.type || data.t; // SNAPSHOT or DELTA
      
      
      if (!symbol) return;
      
      const normalizedSymbol = normalizeSymbol(symbol);
      const cacheKey = `extended_${normalizedSymbol}`;
      
      // Get or create orderbook state for this market
      if (!extendedOrderbooks.has(symbol)) {
        extendedOrderbooks.set(symbol, { bids: new Map(), asks: new Map() });
      }
      const obState = extendedOrderbooks.get(symbol);
      
      const bidsArray = data.b || data.bids || [];
      const asksArray = data.a || data.asks || [];
      
      // Process updates: format is [{p: "price", q: "quantity"}, ...]
      // Negative quantity means remove, positive means add/update
      if (msgType === 'SNAPSHOT') {
        obState.bids.clear();
        obState.asks.clear();
      }
      
      for (const bid of bidsArray) {
        const price = bid.p || bid.price;
        const qty = parseFloat(bid.q || bid.size || 0);
        if (qty <= 0) {
          obState.bids.delete(price);
        } else {
          obState.bids.set(price, qty);
        }
      }
      
      for (const ask of asksArray) {
        const price = ask.p || ask.price;
        const qty = parseFloat(ask.q || ask.size || 0);
        if (qty <= 0) {
          obState.asks.delete(price);
        } else {
          obState.asks.set(price, qty);
        }
      }
      
      // Get best bid (highest price) and best ask (lowest price)
      const sortedBids = [...obState.bids.entries()]
        .sort((a, b) => parseFloat(b[0]) - parseFloat(a[0]));
      const sortedAsks = [...obState.asks.entries()]
        .sort((a, b) => parseFloat(a[0]) - parseFloat(b[0]));
      
      const bestBid = sortedBids.length > 0 ? parseFloat(sortedBids[0][0]) : null;
      const bestAsk = sortedAsks.length > 0 ? parseFloat(sortedAsks[0][0]) : null;
      const bidSize = sortedBids.length > 0 ? sortedBids[0][1] : null;
      const askSize = sortedAsks.length > 0 ? sortedAsks[0][1] : null;
      
      if (!bestBid && !bestAsk) return;
      
      const spread = bestBid && bestAsk ? (bestAsk - bestBid).toFixed(4) : null;
      
      // Only broadcast if values changed
      const existingOB = orderbookCache.get(cacheKey);
      if (existingOB && 
          existingOB.bestBid === bestBid?.toString() && 
          existingOB.bestAsk === bestAsk?.toString()) {
        return;
      }
      
      const orderbookData = {
        bestBid: bestBid?.toString(),
        bestAsk: bestAsk?.toString(),
        bidSize: bidSize?.toString(),
        askSize: askSize?.toString(),
        spread
      };
      
      orderbookCache.set(cacheKey, orderbookData);
      
      const existingPrice = priceCache.get(cacheKey);
      if (existingPrice) {
        const updatedData = { ...existingPrice, ...orderbookData };
        priceCache.set(cacheKey, updatedData);
        broadcast(updatedData);
      } else {
        broadcastOrderbook({
          exchange: 'Extended',
          symbol: normalizedSymbol,
          ...orderbookData,
          timestamp: Date.now()
        });
      }
    } catch (error) {
      // Silently ignore parse errors
    }
  });
  
  ws.on('error', (err) => {
    console.error('Extended Orderbook: Error', err.message);
  });
  
  ws.on('close', () => {
    console.log('Extended Orderbook: Disconnected, reconnecting in 5s...');
    setTimeout(() => connectExtendedOrderbook(), 5000);
  });
  
  exchangeSockets.set('extended_orderbook', ws);
}

function connectExtendedOrderbookMarket(market, baseOptions) {
  // This function is no longer used - single orderbooks endpoint handles all markets
  const orderbookUrl = 'wss://api.starknet.extended.exchange/stream.extended.exchange/v1/orderbooks';
  const ws = new WebSocket(orderbookUrl, { ...baseOptions });
  
  ws.on('message', (rawData) => {
    try {
      const lines = rawData.toString().split('\n');
      
      for (const line of lines) {
        if (!line.trim()) continue;
        
        const data = JSON.parse(line);
        
        if (data.type === 'OB' && data.data) {
          const normalizedSymbol = normalizeSymbol(market);
          const cacheKey = `extended_${normalizedSymbol}`;
          
          const bids = data.data.bids || data.data.b || [];
          const asks = data.data.asks || data.data.a || [];
          
          const getPrice = (levels) => {
            if (!levels || levels.length === 0) return null;
            const first = levels[0];
            if (Array.isArray(first)) return parseFloat(first[0]);
            return parseFloat(first.p || first.price || 0);
          };
          
          const getSize = (levels) => {
            if (!levels || levels.length === 0) return null;
            const first = levels[0];
            if (Array.isArray(first)) return first[1];
            return first.s || first.size;
          };
          
          const bestBid = getPrice(bids);
          const bestAsk = getPrice(asks);
          const spread = bestBid && bestAsk ? (bestAsk - bestBid).toFixed(2) : null;
          
          const orderbookData = {
            bestBid: bestBid?.toString(),
            bestAsk: bestAsk?.toString(),
            bidSize: getSize(bids)?.toString(),
            askSize: getSize(asks)?.toString(),
            spread
          };
          
          orderbookCache.set(cacheKey, orderbookData);
          
          const existingPrice = priceCache.get(cacheKey);
          if (existingPrice) {
            const updatedData = { ...existingPrice, ...orderbookData };
            priceCache.set(cacheKey, updatedData);
            broadcast(updatedData);
          } else {
            broadcastOrderbook({
              exchange: 'Extended',
              symbol: normalizedSymbol,
              ...orderbookData,
              timestamp: Date.now()
            });
          }
        }
      }
    } catch (error) {}
  });
  
  ws.on('error', () => {});
  ws.on('close', () => {
    setTimeout(() => connectExtendedOrderbookMarket(market, baseOptions), 5000);
  });
  
  exchangeSockets.set(`extended_orderbook_${market}`, ws);
}

function connectParadex() {
  const agent = getProxyAgent('paradex');
  const options = {
    headers: {
      'Origin': 'https://app.paradex.trade',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  };
  if (agent) options.agent = agent;
  
  console.log('Paradex: Connecting...');
  const ws = new WebSocket(EXCHANGES.paradex.url, options);
  
  ws.on('open', () => {
    console.log('Paradex: Connected');
    
    const summaryMsg = {
      jsonrpc: '2.0',
      method: 'subscribe',
      params: { channel: 'markets_summary' },
      id: 1
    };
    ws.send(JSON.stringify(summaryMsg));
    
    // Subscribe to orderbook snapshots with proper channel format per docs:
    // order_book.:market_symbol.:feed_type@15@:refresh_rate
    paradexMarkets.forEach((market, index) => {
      ws.send(JSON.stringify({
        jsonrpc: '2.0',
        method: 'subscribe',
        params: { channel: `trades.${market}` },
        id: index + 2,
      }));
      // Use snapshot feed type with 100ms refresh rate per documentation
      ws.send(JSON.stringify({
        jsonrpc: '2.0',
        method: 'subscribe',
        params: { channel: `order_book.${market}.snapshot@15@100ms` },
        id: index + 1000,
      }));
    });
    
    console.log(`Paradex: Subscribed to ${paradexMarkets.length} markets (trades + orderbook snapshot)`);
  });
  
  ws.on('message', (rawData) => {
    try {
      const data = JSON.parse(rawData.toString());
      
      if (data.result === 'subscribed' || data.method === 'ping') return;
      
      if (data.params && data.params.data) {
        const marketData = data.params.data;
        const channel = data.params.channel;
        
        if (channel === 'markets_summary' && Array.isArray(marketData)) {
          marketData.forEach((item) => {
            if (!item.symbol || !item.mark_price) return;
            
            const price = parseFloat(item.mark_price);
            if (!price || price <= 0) return;
            
            const normalizedSymbol = normalizeSymbol(item.symbol);
            const cacheKey = `paradex_${normalizedSymbol}`;
            const prevPrice = previousPrices.get(cacheKey);
            let priceChange;
            if (prevPrice && prevPrice > 0) {
              const change = ((price - prevPrice) / prevPrice) * 100;
              priceChange = change >= 0 ? `+${change.toFixed(2)}` : change.toFixed(2);
            }
            previousPrices.set(cacheKey, price);
            
            const volume = item.total_volume ? parseFloat(item.total_volume) * price : undefined;
            
            const existingOrderbook = orderbookCache.get(cacheKey) || {};
            
            const priceData = {
              exchange: 'Paradex',
              symbol: normalizedSymbol,
              price: price.toString(),
              timestamp: Date.now(),
              volume: volume !== undefined ? volume.toString() : undefined,
              priceChange,
              bestBid: existingOrderbook.bestBid,
              bestAsk: existingOrderbook.bestAsk,
              bidSize: existingOrderbook.bidSize,
              askSize: existingOrderbook.askSize,
              spread: existingOrderbook.spread
            };
            
            priceCache.set(cacheKey, priceData);
            broadcast(priceData);
          });
        }
        
        // Handle orderbook: channel format is "order_book.{market}.snapshot@15@100ms"
        if (channel && channel.startsWith('order_book.')) {
          
          // Extract symbol: "order_book.BTC-PERP.snapshot@15@100ms" -> "BTC-PERP"
          const parts = channel.split('.');
          const symbol = parts[1]; // BTC-PERP
          if (!symbol) return;
          
          const normalizedSymbol = normalizeSymbol(symbol);
          const cacheKey = `paradex_${normalizedSymbol}`;
          
          // Format can be: bids/asks arrays OR inserts with side: BUY/SELL
          let bids = marketData.bids || [];
          let asks = marketData.asks || [];
          
          // Handle new format: inserts array with side field
          if (marketData.inserts && Array.isArray(marketData.inserts)) {
            bids = marketData.inserts
              .filter(o => o.side === 'BUY')
              .sort((a, b) => parseFloat(b.price) - parseFloat(a.price));
            asks = marketData.inserts
              .filter(o => o.side === 'SELL')
              .sort((a, b) => parseFloat(a.price) - parseFloat(b.price));
          }
          
          // Extract best prices based on format
          let bestBid, bestAsk, bidSize, askSize;
          
          if (bids.length > 0) {
            const first = bids[0];
            if (Array.isArray(first)) {
              bestBid = parseFloat(first[0]);
              bidSize = first[1];
            } else {
              bestBid = parseFloat(first.price);
              bidSize = first.size;
            }
          }
          
          if (asks.length > 0) {
            const first = asks[0];
            if (Array.isArray(first)) {
              bestAsk = parseFloat(first[0]);
              askSize = first[1];
            } else {
              bestAsk = parseFloat(first.price);
              askSize = first.size;
            }
          }
          
          if (!bestBid && !bestAsk) return;
          
          const spread = bestBid && bestAsk ? (bestAsk - bestBid).toFixed(4) : null;
          
          const orderbookData = {
            bestBid: bestBid?.toString(),
            bestAsk: bestAsk?.toString(),
            bidSize: bidSize?.toString(),
            askSize: askSize?.toString(),
            spread
          };
          
          orderbookCache.set(cacheKey, orderbookData);
          
          const existingPrice = priceCache.get(cacheKey);
          if (existingPrice) {
            const updatedData = { ...existingPrice, ...orderbookData };
            priceCache.set(cacheKey, updatedData);
            broadcast(updatedData);
          } else {
            broadcastOrderbook({
              exchange: 'Paradex',
              symbol: normalizedSymbol,
              ...orderbookData,
              timestamp: Date.now()
            });
          }
        }
        
        if (channel && channel.startsWith('trades.') && marketData.price) {
          const symbol = channel.replace('trades.', '');
          const price = parseFloat(marketData.price);
          
          if (price && price > 0) {
            const normalizedSymbol = normalizeSymbol(symbol);
            const cacheKey = `paradex_${normalizedSymbol}`;
            
            const existingOrderbook = orderbookCache.get(cacheKey) || {};
            
            const priceData = {
              exchange: 'Paradex',
              symbol: normalizedSymbol,
              price: price.toString(),
              timestamp: Date.now(),
              ...existingOrderbook
            };
            
            priceCache.set(cacheKey, priceData);
            broadcast(priceData);
          }
        }
      }
    } catch (error) {
      console.error('Paradex: Parse error', error.message);
    }
  });
  
  ws.on('error', (error) => {
    console.error('Paradex: Error', error.message);
  });
  
  ws.on('close', () => {
    console.log('Paradex: Disconnected, reconnecting in 5s...');
    exchangeSockets.delete('paradex');
    setTimeout(connectParadex, 5000);
  });
  
  exchangeSockets.set('paradex', ws);
}

function connectGrvt() {
  const agent = getProxyAgent('grvt');
  const options = {
    headers: {
      'Origin': 'https://grvt.io',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  };
  if (agent) options.agent = agent;
  
  console.log('GRVT: Connecting...');
  const ws = new WebSocket(EXCHANGES.grvt.url, options);
  
  ws.on('open', () => {
    console.log('GRVT: Connected');
    
    // Try exact doc format with only required fields
    ws.send(JSON.stringify({
      stream: 'v1.mini.s',
      feed: ['BTC_USDT_Perp@500', 'ETH_USDT_Perp@500', 'SOL_USDT_Perp@500'],
      method: 'subscribe',
      is_full: true
    }));
    
    console.log(`GRVT: Subscribed to 3 markets (mini ticker)`);
  });
  
  ws.on('message', (rawData) => {
    try {
      const data = JSON.parse(rawData.toString());
      
      // Log subscription responses for debugging
      if (data.subs || data.unsubs) {
        console.log('GRVT: Subscription response:', JSON.stringify(data));
        return;
      }
      
      if (data.code && data.message) {
        console.error('GRVT: Error', data.code, data.message);
        return;
      }
      
      if (data.error) {
        console.error('GRVT: Error', data.error.code, data.error.message);
        return;
      }
      
      // Handle mini ticker stream
      if (data.stream === 'v1.mini.s' && data.feed) {
        const feed = data.feed;
        const selector = data.selector;
        const instrument = selector ? selector.split('@')[0] : (feed.instrument || feed.i);
        if (!instrument) return;
        
        const markPrice = feed.mark_price || feed.mp;
        const lastPrice = feed.last_price || feed.lp;
        const price = parseFloat(markPrice || lastPrice || 0);
        
        if (!price || price <= 0) return;
        
        const normalizedSymbol = normalizeSymbol(instrument);
        const cacheKey = `grvt_${normalizedSymbol}`;
        const prevPrice = previousPrices.get(cacheKey);
        let priceChange;
        if (prevPrice && prevPrice > 0) {
          const change = ((price - prevPrice) / prevPrice) * 100;
          priceChange = change >= 0 ? `+${change.toFixed(2)}` : change.toFixed(2);
        }
        previousPrices.set(cacheKey, price);
        
        const existingOrderbook = orderbookCache.get(cacheKey) || {};
        
        const priceData = {
          exchange: 'GRVT',
          symbol: normalizedSymbol,
          price: price.toString(),
          timestamp: Date.now(),
          priceChange,
          bestBid: existingOrderbook.bestBid,
          bestAsk: existingOrderbook.bestAsk,
          bidSize: existingOrderbook.bidSize,
          askSize: existingOrderbook.askSize,
          spread: existingOrderbook.spread
        };
        
        priceCache.set(cacheKey, priceData);
        broadcast(priceData);
      }
      
      // Handle orderbook stream
      if (data.stream === 'v1.book.s' && data.feed) {
        const feed = data.feed;
        const selector = data.selector;
        const instrument = selector ? selector.split('@')[0] : (feed.instrument || feed.i);
        if (!instrument) return;
        
        const normalizedSymbol = normalizeSymbol(instrument);
        const cacheKey = `grvt_${normalizedSymbol}`;
        
        const bids = feed.bids || feed.b || [];
        const asks = feed.asks || feed.a || [];
        
        // Handle both object format {p, s} and array format [price, size]
        const getBestPrice = (levels) => {
          if (!levels || levels.length === 0) return null;
          const first = levels[0];
          if (typeof first === 'object' && !Array.isArray(first)) {
            return parseFloat(first.price || first.p || 0);
          }
          return parseFloat(first[0] || 0);
        };
        
        const getBestSize = (levels) => {
          if (!levels || levels.length === 0) return null;
          const first = levels[0];
          if (typeof first === 'object' && !Array.isArray(first)) {
            return first.size || first.s;
          }
          return first[1];
        };
        
        const bestBid = getBestPrice(bids);
        const bestAsk = getBestPrice(asks);
        const bidSize = getBestSize(bids);
        const askSize = getBestSize(asks);
        const spread = bestBid && bestAsk ? (bestAsk - bestBid).toFixed(2) : null;
        
        const orderbookData = {
          bestBid: bestBid?.toString(),
          bestAsk: bestAsk?.toString(),
          bidSize: bidSize?.toString(),
          askSize: askSize?.toString(),
          spread
        };
        
        orderbookCache.set(cacheKey, orderbookData);
        
        const existingPrice = priceCache.get(cacheKey);
        if (existingPrice) {
          const updatedData = { ...existingPrice, ...orderbookData };
          priceCache.set(cacheKey, updatedData);
          broadcast(updatedData);
        }
      }
    } catch (error) {
      console.error('GRVT: Parse error', error.message);
    }
  });
  
  ws.on('error', (error) => {
    console.error('GRVT: Error', error.message);
  });
  
  ws.on('close', () => {
    console.log('GRVT: Disconnected, reconnecting in 5s...');
    exchangeSockets.delete('grvt');
    setTimeout(connectGrvt, 5000);
  });
  
  exchangeSockets.set('grvt', ws);
}

function connectReya() {
  const agent = getProxyAgent('reya');
  const options = {
    headers: {
      'Origin': 'https://reya.xyz',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  };
  if (agent) options.agent = agent;
  
  console.log('Reya: Connecting...');
  const ws = new WebSocket(EXCHANGES.reya.url, options);
  
  ws.on('open', () => {
    console.log('Reya: Connected');
    
    ws.send(JSON.stringify({
      type: 'subscribe',
      channel: '/v2/prices'
    }));
    
    ws.send(JSON.stringify({
      type: 'subscribe',
      channel: '/v2/markets/summary'
    }));
    
    // Subscribe to orderbook depth for each market
    REYA_MARKETS.forEach((symbol) => {
      ws.send(JSON.stringify({
        type: 'subscribe',
        channel: `/v2/market/${symbol}/depth`
      }));
    });
    
    console.log(`Reya: Subscribed to prices, markets summary, and ${REYA_MARKETS.length} orderbook depths`);
  });
  
  ws.on('message', (rawData) => {
    try {
      const data = JSON.parse(rawData.toString());
      
      if (data.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
        return;
      }
      
      if (data.type === 'channel_data' && data.channel === '/v2/prices') {
        const prices = Array.isArray(data.data) ? data.data : [data.data];
        
        prices.forEach((item) => {
          if (!item.symbol) return;
          
          const oraclePrice = parseFloat(item.oraclePrice || item.poolPrice || 0);
          if (!oraclePrice || oraclePrice <= 0) return;
          
          const normalizedSymbol = normalizeSymbol(item.symbol);
          const cacheKey = `reya_${normalizedSymbol}`;
          const prevPrice = previousPrices.get(cacheKey);
          let priceChange;
          if (prevPrice && prevPrice > 0) {
            const change = ((oraclePrice - prevPrice) / prevPrice) * 100;
            priceChange = change >= 0 ? `+${change.toFixed(2)}` : change.toFixed(2);
          }
          previousPrices.set(cacheKey, oraclePrice);
          
          const existingOrderbook = orderbookCache.get(cacheKey) || {};
          
          const priceData = {
            exchange: 'Reya',
            symbol: normalizedSymbol,
            price: oraclePrice.toString(),
            timestamp: Date.now(),
            priceChange,
            bestBid: existingOrderbook.bestBid,
            bestAsk: existingOrderbook.bestAsk,
            spread: existingOrderbook.spread
          };
          
          priceCache.set(cacheKey, priceData);
          broadcast(priceData);
        });
      }
      
      if (data.type === 'channel_data' && data.channel === '/v2/markets/summary') {
        const summaries = Array.isArray(data.data) ? data.data : [data.data];
        
        summaries.forEach((item) => {
          if (!item.symbol) return;
          
          const normalizedSymbol = normalizeSymbol(item.symbol);
          const cacheKey = `reya_${normalizedSymbol}`;
          
          const volume = item.volume24h ? parseFloat(item.volume24h) : undefined;
          
          const existingPrice = priceCache.get(cacheKey);
          if (existingPrice && volume) {
            existingPrice.volume = volume.toString();
            priceCache.set(cacheKey, existingPrice);
            broadcast(existingPrice);
          }
        });
      }
      
      // Handle depth (orderbook) channel
      if (data.type === 'channel_data' && data.channel && data.channel.includes('/depth')) {
        const item = data.data;
        
        
        if (!item) return;
        
        // Symbol might be in item or in channel
        const symbol = item.symbol || data.channel.split('/')[3]?.split('/')[0];
        if (!symbol) return;
        
        const normalizedSymbol = normalizeSymbol(symbol);
        const cacheKey = `reya_${normalizedSymbol}`;
        
        const bids = item.bids || [];
        const asks = item.asks || [];
        
        const bestBid = bids.length > 0 ? parseFloat(bids[0].px) : null;
        const bestAsk = asks.length > 0 ? parseFloat(asks[0].px) : null;
        const bidSize = bids.length > 0 ? bids[0].qty : null;
        const askSize = asks.length > 0 ? asks[0].qty : null;
        const spread = bestBid && bestAsk ? (bestAsk - bestBid).toFixed(2) : null;
        
        const orderbookData = {
          bestBid: bestBid?.toString(),
          bestAsk: bestAsk?.toString(),
          bidSize,
          askSize,
          spread
        };
        
        orderbookCache.set(cacheKey, orderbookData);
        
        const existingPrice = priceCache.get(cacheKey);
        if (existingPrice) {
          const updatedData = { ...existingPrice, ...orderbookData };
          priceCache.set(cacheKey, updatedData);
          broadcast(updatedData);
        } else {
          // Broadcast orderbook-only update if no price exists yet
          broadcastOrderbook({
            exchange: 'Reya',
            symbol: normalizedSymbol,
            ...orderbookData,
            timestamp: Date.now()
          });
        }
      }
    } catch (error) {
      console.error('Reya: Parse error', error.message);
    }
  });
  
  ws.on('error', (error) => {
    console.error('Reya: Error', error.message);
  });
  
  ws.on('close', () => {
    console.log('Reya: Disconnected, reconnecting in 5s...');
    exchangeSockets.delete('reya');
    setTimeout(connectReya, 5000);
  });
  
  exchangeSockets.set('reya', ws);
}

let pacificaProxyFailed = false;

function connectPacifica() {
  const agent = getProxyAgent('pacifica', pacificaProxyFailed);
  const options = {
    headers: {
      'Origin': 'https://pacifica.fi',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  };
  if (agent) options.agent = agent;
  
  console.log('Pacifica: Connecting...');
  const ws = new WebSocket(EXCHANGES.pacifica.url, options);
  
  let pingInterval;
  
  ws.on('open', () => {
    console.log('Pacifica: Connected');
    
    PACIFICA_MARKETS.forEach((symbol) => {
      ws.send(JSON.stringify({
        method: 'subscribe',
        params: {
          source: 'prices',
          symbol: symbol
        }
      }));
      
      // Use 'book' source as per documentation with agg_level
      ws.send(JSON.stringify({
        method: 'subscribe',
        params: {
          source: 'book',
          symbol: symbol,
          agg_level: 1
        }
      }));
    });
    
    console.log(`Pacifica: Subscribed to ${PACIFICA_MARKETS.length} markets (prices + book)`);
    
    pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ method: 'ping' }));
      }
    }, 30000);
  });
  
  ws.on('message', (rawData) => {
    try {
      const data = JSON.parse(rawData.toString());
      
      if (data.channel === 'prices' && data.data) {
        const items = Array.isArray(data.data) ? data.data : [data.data];
        
        items.forEach(item => {
          const symbol = item.symbol || item.s;
          if (!symbol) return;
          
          const price = parseFloat(item.mark || item.mid || item.mp || item.lp || 0);
          if (!price || price <= 0) return;
          
          const normalizedSymbol = normalizeSymbol(symbol);
          const cacheKey = `pacifica_${normalizedSymbol}`;
          const prevPrice = previousPrices.get(cacheKey);
          let priceChange;
          if (prevPrice && prevPrice > 0) {
            const change = ((price - prevPrice) / prevPrice) * 100;
            priceChange = change >= 0 ? `+${change.toFixed(2)}` : change.toFixed(2);
          }
          previousPrices.set(cacheKey, price);
          
          const existingOrderbook = orderbookCache.get(cacheKey) || {};
          const volume = parseFloat(item.volume_24h || 0);
          
          const priceData = {
            exchange: 'Pacifica',
            symbol: normalizedSymbol,
            price: price.toString(),
            timestamp: Date.now(),
            priceChange,
            volume: volume > 0 ? volume.toString() : undefined,
            bestBid: existingOrderbook.bestBid,
            bestAsk: existingOrderbook.bestAsk,
            bidSize: existingOrderbook.bidSize,
            askSize: existingOrderbook.askSize,
            spread: existingOrderbook.spread
          };
          
          priceCache.set(cacheKey, priceData);
          broadcast(priceData);
        });
      }
      
      // Handle both 'book' and 'orderbook' channel names
      if ((data.channel === 'book' || data.channel === 'orderbook') && data.data) {
        const item = data.data;
        const symbol = item.symbol || item.s;
        if (!symbol) return;
        
        const normalizedSymbol = normalizeSymbol(symbol);
        const cacheKey = `pacifica_${normalizedSymbol}`;
        
        const levels = item.l || [];
        const bids = levels[0] || [];
        const asks = levels[1] || [];
        
        const bestBid = bids.length > 0 ? parseFloat(bids[0].p) : null;
        const bestAsk = asks.length > 0 ? parseFloat(asks[0].p) : null;
        const bidSize = bids.length > 0 ? bids[0].a : null;
        const askSize = asks.length > 0 ? asks[0].a : null;
        const spread = bestBid && bestAsk ? (bestAsk - bestBid).toFixed(2) : null;
        
        const orderbookData = {
          bestBid: bestBid?.toString(),
          bestAsk: bestAsk?.toString(),
          bidSize,
          askSize,
          spread
        };
        
        orderbookCache.set(cacheKey, orderbookData);
        
        const existingPrice = priceCache.get(cacheKey);
        if (existingPrice) {
          const updatedData = { ...existingPrice, ...orderbookData };
          priceCache.set(cacheKey, updatedData);
          broadcast(updatedData);
        } else {
          const midPrice = bestBid && bestAsk ? ((bestBid + bestAsk) / 2) : bestBid || bestAsk;
          if (midPrice) {
            const priceData = {
              exchange: 'Pacifica',
              symbol: normalizedSymbol,
              price: midPrice.toString(),
              timestamp: Date.now(),
              ...orderbookData
            };
            priceCache.set(cacheKey, priceData);
            broadcast(priceData);
          }
        }
      }
    } catch (error) {
      console.error('Pacifica: Parse error', error.message);
    }
  });
  
  ws.on('error', (error) => {
    console.error('Pacifica: Error', error.message);
    if (error.message.includes('502') && !pacificaProxyFailed) {
      console.log('Pacifica: Proxy failed with 502, will try without proxy next');
      pacificaProxyFailed = true;
    }
  });
  
  ws.on('close', () => {
    console.log('Pacifica: Disconnected, reconnecting in 5s...');
    if (pingInterval) clearInterval(pingInterval);
    exchangeSockets.delete('pacifica');
    setTimeout(connectPacifica, 5000);
  });
  
  exchangeSockets.set('pacifica', ws);
}

wss.on('connection', (ws) => {
  console.log(`Client connected. Total: ${clients.size + 1}`);
  clients.add(ws);
  
  priceCache.forEach((priceData) => {
    ws.send(JSON.stringify(priceData));
  });
  
  ws.on('close', () => {
    console.log(`Client disconnected. Total: ${clients.size - 1}`);
    clients.delete(ws);
  });
  
  ws.on('error', (error) => {
    console.error('Client error:', error.message);
    clients.delete(ws);
  });
});

async function start() {
  paradexMarkets = await fetchParadexMarkets();
  
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Exchanges: ${Object.keys(EXCHANGES).join(', ')}`);
    
    connectLighter();
    connectExtended();
    connectExtendedOrderbook();
    connectParadex();
    connectGrvt();
    connectReya();
    connectPacifica();
  });
}

process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing...');
  wss.close();
  exchangeSockets.forEach((ws) => ws.close());
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

start();
