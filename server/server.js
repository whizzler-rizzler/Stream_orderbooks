import WebSocket, { WebSocketServer } from 'ws';
import http from 'http';
import https from 'https';
import zlib from 'zlib';
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
    marketsUrl: 'https://api.pacifica.fi/api/v1/info/markets',
    name: 'Pacifica',
    proxyEnv: 'Proxy_pacifica_public',
    allowNoProxy: true,
  },
  nado: {
    tickersUrl: 'https://archive.prod.nado.xyz/v2/tickers?market=perp',
    orderbookUrl: 'https://gateway.prod.nado.xyz/v2/orderbook',
    name: 'NADO',
  },
};

let NADO_PROXIES = [];

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

let pacificaMarkets = ['BTC', 'ETH', 'SOL', 'AVAX', 'SUI', 'ARB', 'OP', 'LINK'];

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

function initNadoProxies() {
  NADO_PROXIES = [];
  for (let i = 1; i <= 11; i++) {
    const proxyStr = process.env[`Nado_proxy${i}`];
    if (proxyStr) {
      const parsed = parseProxyString(proxyStr);
      if (parsed) NADO_PROXIES.push(parsed);
    }
  }
  console.log(`NADO: Initialized ${NADO_PROXIES.length} proxies for rotation`);
}

// Lighter proxy rotation (10 proxies)
let LIGHTER_PROXIES = [];
let currentLighterProxyIndex = 0;

function initLighterProxies() {
  LIGHTER_PROXIES = [];
  for (let i = 1; i <= 10; i++) {
    const proxyStr = process.env[`Lighter_proxy${i}`];
    if (proxyStr) {
      const parsed = parseProxyString(proxyStr);
      if (parsed) LIGHTER_PROXIES.push(parsed);
    }
  }
  console.log(`Lighter: Initialized ${LIGHTER_PROXIES.length} proxies for rotation`);
}

function getNextLighterProxy() {
  if (LIGHTER_PROXIES.length === 0) return null;
  const proxy = LIGHTER_PROXIES[currentLighterProxyIndex];
  currentLighterProxyIndex = (currentLighterProxyIndex + 1) % LIGHTER_PROXIES.length;
  return proxy;
}

// Extended proxy rotation (40 proxies: 11-50)
let EXTENDED_PROXIES = [];
let currentExtendedProxyIndex = 0;

function initExtendedProxies() {
  EXTENDED_PROXIES = [];
  for (let i = 11; i <= 50; i++) {
    const proxyStr = process.env[`Extended_proxy${i}`];
    if (proxyStr) {
      const parsed = parseProxyString(proxyStr);
      if (parsed) EXTENDED_PROXIES.push(parsed);
    }
  }
  console.log(`Extended: Initialized ${EXTENDED_PROXIES.length} proxies for rotation`);
}

function getNextExtendedProxy() {
  if (EXTENDED_PROXIES.length === 0) return null;
  const proxy = EXTENDED_PROXIES[currentExtendedProxyIndex];
  currentExtendedProxyIndex = (currentExtendedProxyIndex + 1) % EXTENDED_PROXIES.length;
  return proxy;
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

const responseCache = new Map();
const CACHE_TTL = 10;

function sendJSON(res, data, req, cacheKey = null) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Response-Time', Date.now().toString());
  
  const acceptEncoding = req.headers['accept-encoding'] || '';
  const useGzip = acceptEncoding.includes('gzip');
  
  if (cacheKey) {
    const cached = responseCache.get(cacheKey);
    if (cached && (Date.now() - cached.time) < CACHE_TTL) {
      if (useGzip && cached.gzip) {
        res.setHeader('Content-Encoding', 'gzip');
        res.writeHead(200);
        res.end(cached.gzip);
        return;
      } else if (cached.raw) {
        res.writeHead(200);
        res.end(cached.raw);
        return;
      }
    }
  }
  
  const json = JSON.stringify(data);
  
  if (useGzip) {
    res.setHeader('Content-Encoding', 'gzip');
    zlib.gzip(json, (err, compressed) => {
      if (err) {
        res.writeHead(500);
        res.end('Compression error');
        return;
      }
      if (cacheKey) {
        responseCache.set(cacheKey, { gzip: compressed, raw: json, time: Date.now() });
      }
      res.writeHead(200);
      res.end(compressed);
    });
  } else {
    if (cacheKey) {
      responseCache.set(cacheKey, { raw: json, time: Date.now() });
    }
    res.writeHead(200);
    res.end(json);
  }
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept-Encoding');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Connection', 'keep-alive');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  
  const url = req.url.split('?')[0];
  
  if (url === '/health') {
    sendJSON(res, { 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      exchanges: Object.keys(EXCHANGES),
      cacheSize: priceCache.size,
      orderbookSize: orderbookCache.size
    }, req);
  } else if (url === '/api/prices') {
    // Filter out single-exchange tokens
    const prices = {};
    priceCache.forEach((value, key) => {
      const symbol = value.symbol;
      if (symbol && isMultiExchangeSymbol(symbol)) {
        prices[key] = value;
      }
    });
    sendJSON(res, {
      timestamp: Date.now(),
      count: Object.keys(prices).length,
      data: prices
    }, req, 'prices');
  } else if (url === '/api/orderbooks') {
    const allKeys = new Set([...priceCache.keys(), ...orderbookCache.keys()]);
    const combined = {};
    allKeys.forEach(key => {
      const priceData = priceCache.get(key) || {};
      const orderbookData = orderbookCache.get(key) || {};
      const symbol = priceData.symbol || orderbookData.symbol;
      
      // Filter out single-exchange tokens
      if (symbol && isMultiExchangeSymbol(symbol)) {
        combined[key] = {
          ...priceData,
          ...orderbookData
        };
      }
    });
    sendJSON(res, {
      timestamp: Date.now(),
      count: Object.keys(combined).length,
      data: combined
    }, req, 'orderbooks');
  } else if (url === '/api/exchanges') {
    const exchangeNames = ['Lighter', 'Extended', 'Paradex', 'GRVT', 'Reya', 'Pacifica', 'NADO'];
    const stats = exchangeNames.map(name => {
      let volume = 0;
      let markets = 0;
      priceCache.forEach((data) => {
        if (data.exchange === name) {
          markets++;
          if (data.volume) volume += parseFloat(data.volume) || 0;
        }
      });
      return { name, volume, markets };
    });
    sendJSON(res, {
      timestamp: Date.now(),
      exchanges: stats
    }, req, 'exchanges');
  } else {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Crypto Aggregator API - Endpoints: /health, /api/prices, /api/orderbooks, /api/exchanges');
  }
});

const wss = new WebSocketServer({ server });
const clients = new Set();
const exchangeSockets = new Map();
const priceCache = new Map();
const orderbookCache = new Map();
const previousPrices = new Map();

// Track which exchanges have each symbol (for filtering single-exchange tokens)
// Key: normalized symbol (e.g., "BTC"), Value: Set of exchange names
// This map is rebuilt periodically from priceCache to stay accurate
let symbolExchangeMap = new Map();

function rebuildSymbolExchangeMap() {
  const newMap = new Map();
  
  // Build from priceCache (authoritative source)
  priceCache.forEach((data) => {
    const symbol = data.symbol;
    const exchange = data.exchange;
    if (symbol && exchange) {
      if (!newMap.has(symbol)) {
        newMap.set(symbol, new Set());
      }
      newMap.get(symbol).add(exchange);
    }
  });
  
  // Also include orderbookCache
  orderbookCache.forEach((data) => {
    const symbol = data.symbol;
    const exchange = data.exchange;
    if (symbol && exchange) {
      if (!newMap.has(symbol)) {
        newMap.set(symbol, new Set());
      }
      newMap.get(symbol).add(exchange);
    }
  });
  
  symbolExchangeMap = newMap;
}

function updateSymbolExchangeMap(symbol, exchangeName) {
  if (!symbol || !exchangeName) return;
  if (!symbolExchangeMap.has(symbol)) {
    symbolExchangeMap.set(symbol, new Set());
  }
  symbolExchangeMap.get(symbol).add(exchangeName);
}

function isMultiExchangeSymbol(symbol) {
  if (!symbol) return false;
  const exchanges = symbolExchangeMap.get(symbol);
  return exchanges && exchanges.size >= 2;
}

// Memory optimization: limit cache sizes to prevent OOM on Render (512MB limit)
// 500 entries needed for ~454 symbols across 7 exchanges
// Cleanup every 15s prevents accumulation between cleanups
const MAX_CACHE_SIZE = 500;
const MAX_RESPONSE_CACHE_SIZE = 50; // responseCache for REST API responses

function limitCacheSize(cache, maxSize = MAX_CACHE_SIZE) {
  if (cache.size > maxSize) {
    const keysToDelete = Array.from(cache.keys()).slice(0, cache.size - maxSize);
    keysToDelete.forEach(key => cache.delete(key));
  }
}

// Inline check before set - prevents cache explosion between cleanup intervals
function safeCacheSet(cache, key, value, maxSize = MAX_CACHE_SIZE) {
  if (cache.size >= maxSize) {
    // Delete oldest 20% when at limit
    const toDelete = Math.floor(maxSize * 0.2);
    const keys = Array.from(cache.keys()).slice(0, toDelete);
    keys.forEach(k => cache.delete(k));
  }
  cache.set(key, value);
}
let paradexMarkets = [];

const msgCounters = {
  lighter: 0,
  extended: 0,
  extended_orderbook: 0,
  paradex: 0,
  grvt: 0,
  reya: 0,
  pacifica: 0,
  nado: 0
};

setInterval(() => {
  const stats = Object.entries(msgCounters)
    .map(([k, v]) => `${k}:${v}`)
    .join(', ');
  console.log(`[STATS 10s] ${stats}`);
  Object.keys(msgCounters).forEach(k => msgCounters[k] = 0);
}, 10000);

function broadcast(data) {
  // Update symbol-exchange tracking
  if (data.symbol && data.exchange) {
    updateSymbolExchangeMap(data.symbol, data.exchange);
  }
  
  // Only broadcast symbols that are on 2+ exchanges
  if (data.symbol && !isMultiExchangeSymbol(data.symbol)) {
    return; // Skip single-exchange tokens
  }
  
  const message = JSON.stringify(data);
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

function broadcastOrderbook(data) {
  // Update symbol-exchange tracking
  if (data.symbol && data.exchange) {
    updateSymbolExchangeMap(data.symbol, data.exchange);
  }
  
  // Only broadcast symbols that are on 2+ exchanges
  if (data.symbol && !isMultiExchangeSymbol(data.symbol)) {
    return; // Skip single-exchange tokens
  }
  
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

async function fetchPacificaMarkets() {
  try {
    console.log('Pacifica: Fetching markets from prices endpoint...');
    const response = await fetch('https://api.pacifica.fi/api/v1/info/prices');
    if (!response.ok) {
      console.error(`Pacifica: API returned ${response.status}`);
      return pacificaMarkets;
    }
    const data = await response.json();
    if (data && data.success && data.data && Array.isArray(data.data)) {
      const markets = data.data.map((m) => m.symbol).filter(Boolean);
      console.log(`Pacifica: Loaded ${markets.length} markets`);
      return markets;
    }
    return pacificaMarkets;
  } catch (error) {
    console.error('Pacifica: Error fetching markets:', error.message);
    return pacificaMarkets;
  }
}

// Lighter reconnect state
let lighterReconnectAttempts = 0;
const LIGHTER_MAX_BACKOFF = 30000; // Max 30s between reconnects

function getLighterBackoff() {
  // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s max
  const backoff = Math.min(1000 * Math.pow(2, lighterReconnectAttempts), LIGHTER_MAX_BACKOFF);
  return backoff;
}

function connectLighter() {
  // Use rotating proxies for Lighter (10 proxies)
  const proxyUrl = getNextLighterProxy();
  let agent = null;
  
  // Log proxy availability status on first connect and every 10 attempts
  if (lighterReconnectAttempts === 0 || lighterReconnectAttempts % 10 === 0) {
    console.log(`Lighter: Proxy status - ${LIGHTER_PROXIES.length} proxies available (Lighter_proxy1-10)`);
  }
  
  if (proxyUrl) {
    console.log(`Lighter: Using proxy ${proxyUrl.replace(/:[^:@]+@/, ':****@')} (index ${currentLighterProxyIndex}/${LIGHTER_PROXIES.length}, attempt ${lighterReconnectAttempts})`);
    agent = new HttpsProxyAgent(proxyUrl);
  } else {
    // Fallback to single proxy if rotation not available
    agent = getProxyAgent('lighter');
    console.log('Lighter: WARNING - No Lighter_proxy1-10 found, using fallback');
  }
  
  const options = {
    headers: {
      'Origin': 'https://lighter.xyz',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
  };
  if (agent) options.agent = agent;
  
  console.log('Lighter: Connecting...');
  const ws = new WebSocket(EXCHANGES.lighter.url, options);
  
  let lighterLastMessage = Date.now();
  let lighterLastPong = Date.now();
  
  // Ping/pong keepalive for Lighter - check every 10s
  const lighterPingInterval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.ping();
      // Check if no messages AND no pong for 30s = dead connection
      const timeSinceMessage = Date.now() - lighterLastMessage;
      const timeSincePong = Date.now() - lighterLastPong;
      if (timeSinceMessage > 30000 && timeSincePong > 30000) {
        console.log(`Lighter: No activity for 30s (msg: ${timeSinceMessage}ms, pong: ${timeSincePong}ms), reconnecting...`);
        clearInterval(lighterPingInterval);
        ws.terminate();
      }
    }
  }, 10000);
  
  ws.on('pong', () => {
    lighterLastPong = Date.now();
  });
  
  ws.on('ping', (data) => {
    lighterLastMessage = Date.now();
    ws.pong(data);
  });
  
  ws.on('open', () => {
    console.log('Lighter: Connected successfully');
    lighterReconnectAttempts = 0; // Reset backoff on successful connection
    lighterLastMessage = Date.now();
    
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
      msgCounters.lighter++;
      lighterLastMessage = Date.now(); // Update activity timestamp
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
        safeCacheSet(previousPrices, cacheKey, price);
        
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
        
        safeCacheSet(priceCache, cacheKey, priceData);
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
        
        safeCacheSet(orderbookCache, cacheKey, orderbookData);
        
        const existingPrice = priceCache.get(cacheKey);
        if (existingPrice) {
          const updatedData = { ...existingPrice, ...orderbookData };
          safeCacheSet(priceCache, cacheKey, updatedData);
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
    lighterReconnectAttempts++;
    clearInterval(lighterPingInterval);
    const errorDetails = {
      message: error.message,
      code: error.code,
      errno: error.errno
    };
    console.error(`Lighter: Error (attempt ${lighterReconnectAttempts})`, JSON.stringify(errorDetails));
    
    // On 429 error, try next proxy immediately
    if (error.message.includes('429')) {
      console.log('Lighter: Rate limited (429), trying next proxy immediately...');
      exchangeSockets.delete('lighter');
      ws.terminate();
      setImmediate(connectLighter);
      return;
    }
    
    // On 402 error (Payment Required), proxy may be expired
    if (error.message.includes('402')) {
      console.log('Lighter: Payment Required (402) - proxy may be expired or blocked');
    }
    
    // For other errors, use backoff and reconnect
    const backoff = getLighterBackoff();
    console.log(`Lighter: Will retry in ${backoff}ms`);
    exchangeSockets.delete('lighter');
    ws.terminate();
    setTimeout(connectLighter, backoff);
  });
  
  ws.on('close', (code, reason) => {
    lighterReconnectAttempts++;
    clearInterval(lighterPingInterval);
    const closeCodeMeaning = {
      1000: 'Normal closure',
      1001: 'Going away',
      1006: 'Abnormal closure',
      1011: 'Internal error',
      1015: 'TLS handshake failed'
    };
    const codeMeaning = closeCodeMeaning[code] || 'Unknown';
    console.log(`Lighter: Disconnected (code=${code} [${codeMeaning}], attempt ${lighterReconnectAttempts})`);
    
    exchangeSockets.delete('lighter');
    const backoff = getLighterBackoff();
    console.log(`Lighter: Will reconnect in ${backoff}ms with next proxy...`);
    setTimeout(connectLighter, backoff);
  });
  
  exchangeSockets.set('lighter', ws);
}

function connectExtended() {
  // Use rotating proxies for Extended (40 proxies)
  const proxyUrl = getNextExtendedProxy();
  let agent = null;
  
  if (proxyUrl) {
    console.log(`Extended: Using proxy ${proxyUrl.replace(/:[^:@]+@/, ':****@')} (index ${currentExtendedProxyIndex}/${EXTENDED_PROXIES.length})`);
    agent = new HttpsProxyAgent(proxyUrl);
  } else {
    agent = getProxyAgent('extended');
  }
  
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
      msgCounters.extended++;
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
          
          // Only update volume and priceChange - price comes from orderbook mid price
          const volumeTokens = extractVolumeNumber(data.data, true);
          const volumeUsd = volumeTokens !== undefined ? volumeTokens * price : undefined;
          
          // Update existing orderbook data with volume only (don't overwrite price)
          const existing = priceCache.get(cacheKey);
          if (existing && volumeUsd !== undefined) {
            existing.volume = volumeUsd.toString();
            safeCacheSet(priceCache, cacheKey, existing);
          }
        }
      }
    } catch (error) {
      console.error('Extended: Parse error', error.message);
    }
  });
  
  ws.on('error', (error) => {
    console.error('Extended: Error', error.message);
    if (error.message.includes('429')) {
      console.log('Extended: Rate limited, trying next proxy...');
      exchangeSockets.delete('extended');
      ws.terminate();
      setImmediate(connectExtended);
      return;
    }
  });
  
  ws.on('close', () => {
    console.log('Extended: Disconnected, trying next proxy...');
    exchangeSockets.delete('extended');
    setTimeout(connectExtended, 1000);
  });
  
  exchangeSockets.set('extended', ws);
}

// Extended orderbook reconnect state
let extendedOBReconnectAttempts = 0;
const EXTENDED_OB_MAX_BACKOFF = 30000; // Max 30s between reconnects

function getExtendedOBBackoff() {
  // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s max
  const backoff = Math.min(1000 * Math.pow(2, extendedOBReconnectAttempts), EXTENDED_OB_MAX_BACKOFF);
  return backoff;
}

// Connect to Extended orderbook stream for each market
function connectExtendedOrderbook() {
  // Use rotating proxies for Extended orderbook
  const proxyUrl = getNextExtendedProxy();
  let agent = null;
  
  // Log proxy availability status on first connect and every 10 attempts
  if (extendedOBReconnectAttempts === 0 || extendedOBReconnectAttempts % 10 === 0) {
    console.log(`Extended OB: Proxy status - ${EXTENDED_PROXIES.length} proxies available (Extended_proxy11-50)`);
  }
  
  if (proxyUrl) {
    console.log(`Extended OB: Using proxy ${proxyUrl.replace(/:[^:@]+@/, ':****@')} (index ${currentExtendedProxyIndex}/${EXTENDED_PROXIES.length}, attempt ${extendedOBReconnectAttempts})`);
    agent = new HttpsProxyAgent(proxyUrl);
  } else {
    // Fallback: try same proxy as basic Extended connection
    agent = getProxyAgent('extended');
    if (agent) {
      console.log('Extended OB: Using fallback proxy from Extended config (no Extended_proxy11-50 found!)');
    } else {
      console.log('Extended OB: WARNING - No proxy available! Check Extended_proxy11-50 env vars on Render');
    }
  }
  
  const baseOptions = {
    headers: {
      'Origin': 'https://app.extended.exchange',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  };
  if (agent) baseOptions.agent = agent;
  
  // Use orderbooks with depth=1 to get ONLY SNAPSHOT (no DELTA problems)
  // This gives best bid/ask only, always as snapshot, 100ms push frequency
  const orderbookUrl = 'wss://api.starknet.extended.exchange/stream.extended.exchange/v1/orderbooks?depth=1';
  console.log(`Extended Orderbook: Connecting to ${orderbookUrl} (depth=1 = SNAPSHOT only)...`);
  
  const ws = new WebSocket(orderbookUrl, { ...baseOptions });
  let extMsgCount = 0;
  let extOBLastMessage = Date.now(); // Track last message for keepalive
  
  ws.on('open', () => {
    console.log('Extended Orderbook: Connected successfully');
    extendedOBReconnectAttempts = 0; // Reset backoff on successful connection
    extOBLastMessage = Date.now();
  });
  
  // Extended server may send ping - explicitly handle it
  ws.on('ping', (data) => {
    extOBLastMessage = Date.now();
    ws.pong(data); // Explicitly respond to server ping
  });
  
  ws.on('message', (rawData) => {
    try {
      extMsgCount++;
      msgCounters.extended_orderbook++;
      extOBLastMessage = Date.now(); // Update activity timestamp
      const msg = JSON.parse(rawData.toString());
      
      // DEBUG: Log first 3 messages to verify SNAPSHOT only (no DELTA with depth=1)
      if (extMsgCount <= 3) {
        console.log('Extended SNAPSHOT msg:', JSON.stringify(msg).substring(0, 400));
      }
      
      const data = msg.data || msg;
      const symbol = data.m || msg.market || msg.symbol || data.market;
      
      if (!symbol) return;
      
      // With depth=1, we ALWAYS get SNAPSHOT with best bid/ask only (no DELTA)
      // Just take first element directly - no accumulation needed
      const bidsArray = data.b || data.bids || [];
      const asksArray = data.a || data.asks || [];
      
      if (bidsArray.length === 0 && asksArray.length === 0) return;
      
      // Get first (best) bid and ask directly
      const bestBid = bidsArray[0];
      const bestAsk = asksArray[0];
      
      const bidPrice = bestBid ? parseFloat(bestBid.p || bestBid.price) : null;
      const askPrice = bestAsk ? parseFloat(bestAsk.p || bestAsk.price) : null;
      const bidSize = bestBid ? parseFloat(bestBid.q || bestBid.size) : null;
      const askSize = bestAsk ? parseFloat(bestAsk.q || bestAsk.size) : null;
      
      // Validate prices
      if ((!bidPrice || bidPrice <= 0) && (!askPrice || askPrice <= 0)) return;
      
      const finalBid = (bidPrice && bidPrice > 0) ? bidPrice : null;
      const finalAsk = (askPrice && askPrice > 0) ? askPrice : null;
      const finalBidSize = (finalBid && bidSize > 0) ? bidSize : null;
      const finalAskSize = (finalAsk && askSize > 0) ? askSize : null;
      
      // Skip if spread is inverted (ask < bid = bad data)
      if (finalBid && finalAsk && finalAsk < finalBid) {
        return; // Skip bad data
      }
      
      const normalizedSymbol = normalizeSymbol(symbol);
      const cacheKey = `extended_${normalizedSymbol}`;
      
      if (!finalBid && !finalAsk) return;
      
      const spread = finalBid && finalAsk ? (finalAsk - finalBid).toFixed(4) : null;
      
      // Calculate mid price from bid/ask (not from external source)
      const midPrice = (finalBid && finalAsk) ? ((finalBid + finalAsk) / 2).toString() : null;
      
      const fullData = {
        exchange: 'Extended',
        symbol: normalizedSymbol,
        price: midPrice,
        bestBid: finalBid?.toString(),
        bestAsk: finalAsk?.toString(),
        bidSize: finalBidSize?.toString(),
        askSize: finalAskSize?.toString(),
        spread,
        timestamp: Date.now()
      };
      
      safeCacheSet(orderbookCache, cacheKey, fullData);
      safeCacheSet(priceCache, cacheKey, fullData);
      broadcast(fullData);
    } catch (error) {
      if (extMsgCount <= 5) console.error('Extended OB parse error:', error.message);
    }
  });
  
  // Ping/pong keepalive for Extended orderbook
  // Send our own pings every 10s to keep connection alive
  // Note: /orderbooks endpoint may not send server pings like main endpoint
  let extOBLastPong = Date.now();
  // extOBLastMessage is defined above and updated in message handler
  const extOBPingInterval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.ping();
      // Check if no messages AND no pong for 30s = dead connection
      const timeSinceMessage = Date.now() - extOBLastMessage;
      const timeSincePong = Date.now() - extOBLastPong;
      if (timeSinceMessage > 30000 && timeSincePong > 30000) {
        console.log(`Extended OB: No activity for 30s (msg: ${timeSinceMessage}ms, pong: ${timeSincePong}ms), reconnecting...`);
        clearInterval(extOBPingInterval);
        ws.terminate();
      }
    }
  }, 10000); // Every 10s
  
  ws.on('pong', () => {
    extOBLastPong = Date.now();
  });
  
  ws.on('error', (err) => {
    extendedOBReconnectAttempts++;
    const errorDetails = {
      message: err.message,
      code: err.code,
      errno: err.errno,
      syscall: err.syscall,
      address: err.address,
      port: err.port
    };
    console.error(`Extended Orderbook: Error (attempt ${extendedOBReconnectAttempts})`, JSON.stringify(errorDetails));
    clearInterval(extOBPingInterval);
    
    if (err.message.includes('429')) {
      console.log('Extended OB: Rate limited (429), trying next proxy immediately...');
      ws.terminate();
      setImmediate(connectExtendedOrderbook);
      return;
    }
    
    // For other errors, use backoff and reconnect
    const backoff = getExtendedOBBackoff();
    console.log(`Extended OB: Will retry in ${backoff}ms`);
    ws.terminate();
    setTimeout(() => connectExtendedOrderbook(), backoff);
  });
  
  ws.on('close', (code, reason) => {
    clearInterval(extOBPingInterval);
    extendedOBReconnectAttempts++;
    
    // Decode close code
    const closeCodeMeaning = {
      1000: 'Normal closure',
      1001: 'Going away (server shutdown)',
      1002: 'Protocol error',
      1003: 'Unsupported data',
      1005: 'No status received',
      1006: 'Abnormal closure (connection lost)',
      1007: 'Invalid payload',
      1008: 'Policy violation',
      1009: 'Message too big',
      1010: 'Missing extension',
      1011: 'Internal server error',
      1012: 'Service restart',
      1013: 'Try again later',
      1015: 'TLS handshake failed'
    };
    const codeMeaning = closeCodeMeaning[code] || 'Unknown';
    const reasonStr = reason ? reason.toString() : 'none';
    
    console.log(`Extended Orderbook: Disconnected (code=${code} [${codeMeaning}], reason=${reasonStr}, attempt ${extendedOBReconnectAttempts})`);
    
    const backoff = getExtendedOBBackoff();
    console.log(`Extended OB: Will reconnect in ${backoff}ms with next proxy...`);
    setTimeout(() => connectExtendedOrderbook(), backoff);
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
          
          safeCacheSet(orderbookCache, cacheKey, orderbookData);
          
          const existingPrice = priceCache.get(cacheKey);
          if (existingPrice) {
            const updatedData = { ...existingPrice, ...orderbookData };
            safeCacheSet(priceCache, cacheKey, updatedData);
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
      // Use snapshot feed type with 50ms refresh rate (stable)
      ws.send(JSON.stringify({
        jsonrpc: '2.0',
        method: 'subscribe',
        params: { channel: `order_book.${market}.snapshot@15@50ms` },
        id: index + 1000,
      }));
    });
    
    console.log(`Paradex: Subscribed to ${paradexMarkets.length} markets (trades + orderbook snapshot)`);
  });
  
  ws.on('message', (rawData) => {
    try {
      msgCounters.paradex++;
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
            safeCacheSet(previousPrices, cacheKey, price);
            
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
            
            safeCacheSet(priceCache, cacheKey, priceData);
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
          
          safeCacheSet(orderbookCache, cacheKey, orderbookData);
          
          const existingPrice = priceCache.get(cacheKey);
          if (existingPrice) {
            const updatedData = { ...existingPrice, ...orderbookData };
            safeCacheSet(priceCache, cacheKey, updatedData);
            broadcast(updatedData);
          } else {
            // Calculate mid price from orderbook
            const midPrice = bestBid && bestAsk ? ((bestBid + bestAsk) / 2) : (bestBid || bestAsk);
            if (midPrice) {
              const priceData = {
                exchange: 'Paradex',
                symbol: normalizedSymbol,
                price: midPrice.toString(),
                timestamp: Date.now(),
                ...orderbookData
              };
              safeCacheSet(priceCache, cacheKey, priceData);
              broadcast(priceData);
            }
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
            
            safeCacheSet(priceCache, cacheKey, priceData);
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

async function grvtFetchInstruments() {
  return new Promise((resolve) => {
    const postData = JSON.stringify({});
    const agent = getProxyAgent('grvt');
    
    const options = {
      hostname: 'market-data.grvt.io',
      port: 443,
      path: '/full/v1/instruments',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };
    if (agent) options.agent = agent;
    
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const instruments = json.result?.map(i => i.instrument) || [];
          console.log(`GRVT: Fetched ${instruments.length} instruments from API`);
          resolve(instruments);
        } catch (e) {
          console.error('GRVT: Failed to parse instruments', e.message);
          resolve([]);
        }
      });
    });
    
    req.on('error', (error) => {
      console.error('GRVT: Instruments fetch error', error.message);
      resolve([]);
    });
    
    req.write(postData);
    req.end();
  });
}

async function grvtLogin() {
  const apiKey = process.env.Grvt_api_key;
  const secret = process.env.GRVT_secret;
  
  if (!apiKey) {
    console.error('GRVT: Missing API key');
    return null;
  }
  
  return new Promise((resolve) => {
    const postData = JSON.stringify({ api_key: apiKey });
    const agent = getProxyAgent('grvt');
    
    const options = {
      hostname: 'edge.grvt.io',
      port: 443,
      path: '/auth/api_key/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'Cookie': 'rm=true;'
      }
    };
    if (agent) options.agent = agent;
    
    const req = https.request(options, (res) => {
      let data = '';
      const cookies = res.headers['set-cookie'] || [];
      const gravityCookie = cookies.find(c => c.startsWith('gravity='));
      const accountId = res.headers['x-grvt-account-id'];
      
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (gravityCookie && accountId) {
          console.log(`GRVT: Logged in successfully, account: ${accountId}`);
          resolve({ cookie: gravityCookie.split(';')[0], accountId });
        } else {
          console.error('GRVT: Login failed - missing cookie or account ID');
          console.error('GRVT: Response:', data);
          resolve(null);
        }
      });
    });
    
    req.on('error', (error) => {
      console.error('GRVT: Login error', error.message);
      resolve(null);
    });
    
    req.write(postData);
    req.end();
  });
}

async function connectGrvt() {
  const instruments = await grvtFetchInstruments();
  const auth = await grvtLogin();
  
  const agent = getProxyAgent('grvt');
  const headers = {
    'Origin': 'https://grvt.io',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  };
  
  if (auth) {
    headers['Cookie'] = auth.cookie;
    headers['X-Grvt-Account-Id'] = auth.accountId;
  }
  
  const options = { headers };
  if (agent) options.agent = agent;
  
  console.log('GRVT: Connecting to WebSocket...');
  const ws = new WebSocket(EXCHANGES.grvt.url, options);
  
  ws.on('open', () => {
    console.log('GRVT: Connected');
    
    const markets = instruments.length > 0 ? instruments : [
      'BTC_USDT_Perp', 'ETH_USDT_Perp', 'SOL_USDT_Perp'
    ];
    
    const feedMini = markets.map(m => `${m}@500`); // 500ms is minimum allowed by GRVT API
    
    ws.send(JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'subscribe',
      params: {
        stream: 'v1.mini.s', // snapshot stream - stable, full data each update
        selectors: feedMini
      }
    }));
    
    console.log(`GRVT: Subscribed to ${markets.length} markets (mini ticker snapshot @500ms)`);
  });
  
  ws.on('message', (rawData) => {
    try {
      msgCounters.grvt++;
      const data = JSON.parse(rawData.toString());
      
      // Debug first few messages
      if (!global.grvtMsgCount) global.grvtMsgCount = 0;
      if (global.grvtMsgCount < 5) {
        console.log('GRVT msg:', JSON.stringify(data).substring(0, 400));
        global.grvtMsgCount++;
      }
      
      // Log subscription responses for debugging
      if (data.result?.subs || data.result?.unsubs) {
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
      
      // Handle mini ticker stream - includes bid/ask data
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
        safeCacheSet(previousPrices, cacheKey, price);
        
        // Extract bid/ask from mini ticker (already included!)
        const bestBid = parseFloat(feed.best_bid_price || 0);
        const bestAsk = parseFloat(feed.best_ask_price || 0);
        const bidSize = feed.best_bid_size;
        const askSize = feed.best_ask_size;
        const spread = bestBid && bestAsk ? (bestAsk - bestBid).toFixed(4) : null;
        
        const priceData = {
          exchange: 'GRVT',
          symbol: normalizedSymbol,
          price: price.toString(),
          timestamp: Date.now(),
          priceChange,
          bestBid: bestBid ? bestBid.toString() : null,
          bestAsk: bestAsk ? bestAsk.toString() : null,
          bidSize: bidSize?.toString(),
          askSize: askSize?.toString(),
          spread
        };
        
        safeCacheSet(priceCache, cacheKey, priceData);
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
        
        safeCacheSet(orderbookCache, cacheKey, orderbookData);
        
        const existingPrice = priceCache.get(cacheKey);
        if (existingPrice) {
          const updatedData = { ...existingPrice, ...orderbookData };
          safeCacheSet(priceCache, cacheKey, updatedData);
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
    
    console.log(`Reya: Subscribed to prices and markets summary (orderbook not available via WebSocket)`);
  });
  
  // Note: Reya WebSocket API V2 does NOT support depth/orderbook channels
  // Their orderbook is onchain and not exposed via WebSocket
  // Only price and summary data is available
  
  ws.on('message', (rawData) => {
    try {
      msgCounters.reya++;
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
          safeCacheSet(previousPrices, cacheKey, oraclePrice);
          
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
          
          safeCacheSet(priceCache, cacheKey, priceData);
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
            safeCacheSet(priceCache, cacheKey, existingPrice);
            broadcast(existingPrice);
          }
        });
      }
      
      // Note: Reya WebSocket API V2 does not support depth/orderbook channels
      // Orderbook data is not available via WebSocket - only REST API polling would work
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
    
    pacificaMarkets.forEach((symbol) => {
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
    
    console.log(`Pacifica: Subscribed to ${pacificaMarkets.length} markets (prices + book)`);
    
    pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ method: 'ping' }));
      }
    }, 30000);
  });
  
  ws.on('message', (rawData) => {
    try {
      msgCounters.pacifica++;
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
          safeCacheSet(previousPrices, cacheKey, price);
          
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
          
          safeCacheSet(priceCache, cacheKey, priceData);
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
        
        safeCacheSet(orderbookCache, cacheKey, orderbookData);
        
        const existingPrice = priceCache.get(cacheKey);
        if (existingPrice) {
          const updatedData = { ...existingPrice, ...orderbookData };
          safeCacheSet(priceCache, cacheKey, updatedData);
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
            safeCacheSet(priceCache, cacheKey, priceData);
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

const NADO_MARKETS = [
  { tickerId: 'BTC-PERP_USDT0', symbol: 'BTC' },
  { tickerId: 'ETH-PERP_USDT0', symbol: 'ETH' },
  { tickerId: 'HYPE-PERP_USDT0', symbol: 'HYPE' },
  { tickerId: 'SOL-PERP_USDT0', symbol: 'SOL' },
  { tickerId: 'BNB-PERP_USDT0', symbol: 'BNB' },
  { tickerId: 'XRP-PERP_USDT0', symbol: 'XRP' },
  { tickerId: 'PUMP-PERP_USDT0', symbol: 'PUMP' },
  { tickerId: 'ZEC-PERP_USDT0', symbol: 'ZEC' },
  { tickerId: 'FART-PERP_USDT0', symbol: 'FART' },
  { tickerId: 'SUI-PERP_USDT0', symbol: 'SUI' },
  { tickerId: 'XMR-PERP_USDT0', symbol: 'XMR' }
];

async function fetchNadoOrderbookDedicated(market, proxyUrl) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    
    const options = { 
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    };
    if (proxyUrl) {
      options.agent = new HttpsProxyAgent(proxyUrl);
    }
    
    const url = `${EXCHANGES.nado.orderbookUrl}?ticker_id=${encodeURIComponent(market.tickerId)}&depth=1`;
    const response = await fetch(url, options);
    clearTimeout(timeoutId);
    
    if (!response.ok) return null;
    
    const text = await response.text();
    if (text.startsWith('<!DOCTYPE') || text.startsWith('<html')) return null;
    
    const data = JSON.parse(text);
    const cacheKey = `nado_${market.symbol}`;
    
    const bids = data.bids || [];
    const asks = data.asks || [];
    
    const bestBid = bids.length > 0 ? bids[0][0] : null;
    const bestAsk = asks.length > 0 ? asks[0][0] : null;
    const bidSize = bids.length > 0 ? bids[0][1] : null;
    const askSize = asks.length > 0 ? asks[0][1] : null;
    const spread = bestBid && bestAsk ? (bestAsk - bestBid).toFixed(4) : null;
    
    const orderbookData = {
      bestBid: bestBid?.toString(),
      bestAsk: bestAsk?.toString(),
      bidSize: bidSize?.toString(),
      askSize: askSize?.toString(),
      spread
    };
    
    safeCacheSet(orderbookCache, cacheKey, orderbookData);
    
    const existingPrice = priceCache.get(cacheKey);
    const broadcastData = existingPrice 
      ? { ...existingPrice, ...orderbookData, timestamp: Date.now() }
      : {
          exchange: 'NADO',
          symbol: market.symbol,
          price: bestBid || bestAsk || null,
          ...orderbookData,
          timestamp: Date.now()
        };
    
    safeCacheSet(priceCache, cacheKey, broadcastData);
    broadcast(broadcastData);
    
    return data;
  } catch (error) {
    return null;
  }
}

let nadoPollingActive = false;
let nadoStats = { requests: 0, success: 0, errors: 0, lastReset: Date.now() };

async function startNadoPolling() {
  if (nadoPollingActive) return;
  nadoPollingActive = true;
  
  const interval = 26;
  
  console.log(`NADO: ${NADO_MARKETS.length} markets, 1 proxy = 1 market`);
  console.log(`NADO: ${interval}ms interval = ~${Math.round(1000/interval)} req/sec per market`);
  console.log(`NADO: Total expected: ~${Math.round(1000/interval * NADO_MARKETS.length)} req/sec`);
  
  NADO_MARKETS.forEach((market, idx) => {
    if (idx >= NADO_PROXIES.length) {
      console.log(`NADO: No proxy for ${market.symbol}, skipping`);
      return;
    }
    
    const proxyUrl = NADO_PROXIES[idx];
    
    const pollLoop = async () => {
      if (!nadoPollingActive) {
        setTimeout(pollLoop, 1000);
        return;
      }
      
      nadoStats.requests++;
      const result = await fetchNadoOrderbookDedicated(market, proxyUrl);
      if (result) {
        nadoStats.success++;
        msgCounters.nado++;
      } else {
        nadoStats.errors++;
      }
      
      setTimeout(pollLoop, interval);
    };
    
    setTimeout(pollLoop, idx * 50);
    console.log(`NADO: Proxy ${idx+1} → ${market.symbol} (${market.tickerId})`);
  });
  
  setInterval(() => {
    const elapsed = (Date.now() - nadoStats.lastReset) / 1000;
    const rps = Math.round(nadoStats.requests / elapsed);
    const successRate = nadoStats.requests > 0 ? Math.round(nadoStats.success / nadoStats.requests * 100) : 0;
    console.log(`NADO: ${nadoStats.requests} req, ${nadoStats.success} ok (${successRate}%), ${rps} req/sec`);
    nadoStats = { requests: 0, success: 0, errors: 0, lastReset: Date.now() };
  }, 10000);
}

async function connectNado() {
  initNadoProxies();
  
  if (NADO_PROXIES.length === 0) {
    console.log('NADO: No proxies configured, skipping');
    return;
  }
  
  console.log(`NADO: ${NADO_MARKETS.length} hardcoded markets, ${NADO_PROXIES.length} proxies`);
  startNadoPolling();
}

async function start() {
  paradexMarkets = await fetchParadexMarkets();
  pacificaMarkets = await fetchPacificaMarkets();
  
  initLighterProxies();
  initExtendedProxies();
  
  // Memory cleanup every 15 seconds (was 60s - too slow for 20k+ msg/10s)
  setInterval(() => {
    limitCacheSize(priceCache);
    limitCacheSize(orderbookCache);
    limitCacheSize(previousPrices);
    limitCacheSize(responseCache, MAX_RESPONSE_CACHE_SIZE); // Clean REST API cache too!
    rebuildSymbolExchangeMap(); // Rebuild from cache to remove stale entries
  }, 15000);
  
  // Memory usage logging every 30s
  setInterval(() => {
    const mem = process.memoryUsage();
    const heapMB = Math.round(mem.heapUsed / 1024 / 1024);
    const rssMB = Math.round(mem.rss / 1024 / 1024);
    console.log(`[MEMORY] Heap: ${heapMB}MB, RSS: ${rssMB}MB, Caches: price=${priceCache.size}, orderbook=${orderbookCache.size}, response=${responseCache.size}`);
  }, 30000);
  
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
    connectNado();
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

// Heartbeat: log connection status every 30s and send ping to keep connections alive
setInterval(() => {
  const status = [];
  const exchanges = ['lighter', 'extended', 'extended_orderbook', 'paradex', 'grvt', 'reya', 'pacifica'];
  
  for (const name of exchanges) {
    const ws = exchangeSockets.get(name);
    if (ws && ws.readyState === WebSocket.OPEN) {
      status.push(`${name}:OK`);
      // Send ping to keep connection alive
      try {
        ws.ping();
      } catch (e) {
        // Ignore ping errors
      }
    } else if (ws && ws.readyState === WebSocket.CONNECTING) {
      status.push(`${name}:CONNECTING`);
    } else {
      status.push(`${name}:DEAD`);
    }
  }
  
  console.log(`Heartbeat: ${status.join(', ')}`);
  
  // Force reconnect dead connections
  for (const name of exchanges) {
    const ws = exchangeSockets.get(name);
    if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
      console.log(`Heartbeat: Forcing reconnect for ${name}`);
      if (name === 'lighter') connectLighter();
      else if (name === 'extended') connectExtended();
      else if (name === 'extended_orderbook') connectExtendedOrderbook();
      else if (name === 'paradex') connectParadex();
      else if (name === 'grvt') connectGrvt();
      else if (name === 'reya') connectReya();
      else if (name === 'pacifica') connectPacifica();
    }
  }
}, 30000);

start();
