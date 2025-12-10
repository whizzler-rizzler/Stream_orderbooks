import WebSocket, { WebSocketServer } from 'ws';
import http from 'http';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';

const PORT = process.env.PORT || 3001;

const EXCHANGES = {
  lighter: {
    url: 'wss://mainnet.zklighter.elliot.ai/stream',
    name: 'Lighter',
  },
  extended: {
    url: 'wss://api.starknet.extended.exchange/stream.extended.exchange/v1/prices/mark',
    name: 'Extended',
  },
  paradex: {
    url: 'wss://ws.api.prod.paradex.trade/v1',
    marketsUrl: 'https://api.prod.paradex.trade/v1/markets',
    name: 'Paradex',
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

function getProxyAgent() {
  const proxyUrl = process.env.PROXY_URL || process.env.HTTP_PROXY || process.env.HTTPS_PROXY;
  
  if (!proxyUrl) {
    return null;
  }
  
  console.log(`Using proxy: ${proxyUrl.replace(/:[^:@]+@/, ':****@')}`);
  
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
    res.end('Crypto Data Stream Aggregator Server');
  }
});

const wss = new WebSocketServer({ server });
const clients = new Set();
const exchangeSockets = new Map();
const priceCache = new Map();
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
  const agent = getProxyAgent();
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
    });
    console.log(`Lighter: Subscribed to ${LIGHTER_MARKETS.length} markets`);
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
        
        const priceData = {
          exchange: 'Lighter',
          symbol: normalizedSymbol,
          price: price.toString(),
          timestamp: Date.now(),
          volume: volumeUsd !== undefined ? volumeUsd.toString() : undefined,
          priceChange
        };
        
        priceCache.set(cacheKey, priceData);
        broadcast(priceData);
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
  const agent = getProxyAgent();
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
          
          const priceData = {
            exchange: 'Extended',
            symbol: normalizedSymbol,
            price: price.toString(),
            timestamp: Date.now(),
            volume: volumeUsd !== undefined ? volumeUsd.toString() : undefined,
            priceChange
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

function connectParadex() {
  const agent = getProxyAgent();
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
    
    paradexMarkets.forEach((market, index) => {
      const msg = {
        jsonrpc: '2.0',
        method: 'subscribe',
        params: { channel: `trades.${market}` },
        id: index + 2,
      };
      ws.send(JSON.stringify(msg));
    });
    
    console.log(`Paradex: Subscribed to ${paradexMarkets.length} markets`);
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
            
            const priceData = {
              exchange: 'Paradex',
              symbol: normalizedSymbol,
              price: price.toString(),
              timestamp: Date.now(),
              volume: volume !== undefined ? volume.toString() : undefined,
              priceChange
            };
            
            priceCache.set(cacheKey, priceData);
            broadcast(priceData);
          });
        }
        
        if (channel && channel.startsWith('trades.') && marketData.price) {
          const symbol = channel.replace('trades.', '');
          const price = parseFloat(marketData.price);
          
          if (price && price > 0) {
            const normalizedSymbol = normalizeSymbol(symbol);
            const cacheKey = `paradex_${normalizedSymbol}`;
            
            const priceData = {
              exchange: 'Paradex',
              symbol: normalizedSymbol,
              price: price.toString(),
              timestamp: Date.now()
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
    console.log(`Proxy: ${process.env.PROXY_URL ? 'Enabled' : 'Disabled'}`);
    
    connectLighter();
    connectExtended();
    connectParadex();
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
