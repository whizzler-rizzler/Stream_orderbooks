# Crypto Aggregator - Real-time Exchange Data (7 Exchanges + Orderbook)

## Overview
Aplikacja do agregacji danych w czasie rzeczywistym z 7 zdecentralizowanych giełd kryptowalut z obsługą dedykowanych proxy per-exchange oraz danymi orderbook (BID/ASK/Spread).

## Current Status (February 2026)
- **Lighter**: $3B+ volume, 97 markets, **pełny BID/ASK orderbook** ✓
- **Extended**: 79 markets, **pełny BID/ASK orderbook** ✓ (depth=1 SNAPSHOT only, ~1$ spread dla BTC)
- **Paradex**: 108 markets (PERP), **orderbook działający** (inserts format with mid price fallback) ✓
- **GRVT**: 82 markets, **pełny BID/ASK z mini ticker** ✓ (uwierzytelnienie przez API key)
- **Reya**: 86 markets, $175M volume, **tylko ceny** (WebSocket API nie udostępnia orderbook - model AMM)
- **Pacifica**: $966M volume, 50 markets, **dynamic market loading** z API
- **NADO**: 23 markets, $514M volume, **REST API polling z 11 proxy rotacją** ✓ (429 req/sec)

## Architecture

### Frontend (React + Vite + TypeScript)
- Port: 5000
- Komponent `CryptoAggregator.tsx` wyświetla dane z 6 giełd
- Kolumny: Price, Bid, Ask, Spread dla każdej giełdy
- Symbol normalization obsługuje: -PERP, -USD-PERP, RUSDPERP, _USDT_Perp
- Real-time updates via WebSocket

### Backend Server (Node.js)
- Port: 3001
- Lokalizacja: `server/server.js`
- WebSocket connections z dedykowanymi proxy:

| Exchange | WebSocket URL | Orderbook Status |
|----------|---------------|------------------|
| Lighter | wss://mainnet.zklighter.elliot.ai/stream | ✓ Working - sorted bids/asks |
| Extended | wss://api.starknet.extended.exchange/stream.extended.exchange/v1/orderbooks?depth=1 | ✓ Working - SNAPSHOT only (~1$ spread BTC) |
| Paradex | wss://ws.api.prod.paradex.trade/v1 | ✓ Working - inserts format |
| GRVT | wss://market-data.grvt.io/ws/full | ✗ Error 1107 |
| Reya | wss://ws.reya.xyz | Subscribed, no depth data |
| Pacifica | wss://ws.pacifica.fi/ws | source: 'book' configured |

## Project Structure
```
├── src/
│   ├── components/
│   │   └── CryptoAggregator.tsx    # Main dashboard component
│   └── hooks/
├── server/
│   └── server.js                    # WebSocket aggregator (7 exchanges)
├── public/
├── vite.config.ts
└── package.json
```

## Environment Variables
- `Lighter_proxy1` to `Lighter_proxy10` - 10 rotating proxies for Lighter WebSocket
- `Extended_proxy11` to `Extended_proxy50` - 40 rotating proxies for Extended WebSocket
- `Nado_proxy1` to `Nado_proxy11` - 11 rotating proxies for NADO REST API
- `Proxy_GRVT_public` - Dedicated proxy for GRVT
- `Proxy_pacifica_public` - Dedicated proxy for Pacifica
- `Proxy_reya_public` - Dedicated proxy for Reya
- `PROXY_URL` - Fallback proxy URL

## Proxy Format
Supports format: `host:port:user:pass` which is converted to `http://user:pass@host:port`

## Known Issues
1. **Reya**: Orderbook nie dostępny - giełda używa modelu AMM (passive liquidity pools), nie CLOB
2. **Pacifica**: Book source configured but orderbook data not visible in UI

## Orderbook Implementation Details
- **Lighter**: `order_book/{market_id}` channel - sorted bids/asks, skip unchanged values
- **Extended**: `/v1/orderbooks` single endpoint - SNAPSHOT clears state, DELTA updates incrementally
- **Paradex**: `order_book.{market}.snapshot@15@100ms` channel - inserts array with side: BUY/SELL
- **GRVT**: `v1.mini.s` stream - best_bid_price/best_ask_price from mini ticker
- **Reya**: Model AMM - brak orderbooka CLOB, tylko ceny z WebSocket
- **Pacifica**: `source: 'book'` with agg_level=1 - data.l[0] for bids, data.l[1] for asks
- **NADO**: REST API polling `GET /v2/orderbook?ticker_id={id}&depth=1` - 11 proxy rotation, 429 req/sec

## Running
1. Backend: `cd server && node server.js`
2. Frontend: `npm run dev`

## REST API Endpoints
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check, cache sizes |
| `/api/prices` | GET | All prices from all exchanges |
| `/api/orderbooks` | GET | All orderbook data (bid/ask/spread) |
| `/api/exchanges` | GET | Exchange stats (volume, markets) |

## WebSocket API
- Connect to `ws://host:3001` for real-time stream
- Messages sent immediately on new data (no rate limit)
- Format: `{"exchange":"...", "symbol":"...", "price":"...", "bestBid":"...", "bestAsk":"...", "spread":"..."}`

## Render Deployment
See `server/RENDER_DEPLOY.md` for deployment guide.

## Recent Changes (2026-02-06)
- **3-layer Extended protection** for Render stability:
  - **Layer 1**: Ping/pong keepalive for Extended (10s ping, 5s dead timeout → force reconnect)
  - **Layer 2**: Data Activity Watchdog (5s) - monitors msgCounters, if 0 messages → kill + reconnect in 200ms
  - **Layer 3**: Enhanced Heartbeat (5s) with force reconnect for dead connections
- **safeReconnect deduplication**: `safeReconnectExtended()` and `safeReconnectExtendedOB()` prevent duplicate reconnect scheduling from multiple layers firing simultaneously
- **Stale socket guards**: error/close handlers check `exchangeSockets.get() !== ws` to ignore events from old sockets
- **Fast reconnect**: Extended 500ms delay (was 1s), Extended OB max backoff reduced from 30s to 5s
- **Duplicate connection prevention**: All exchanges check CONNECTING/OPEN state before creating new connections

## Recent Changes (2026-02-05)
- **Memory optimization for Render OOM**: Rozwiązano problem "Ran out of memory (512MB)" na Render
  - MAX_CACHE_SIZE zmniejszone z 500 na 200
  - Cleanup co 15s zamiast 60s (przy 20k+ msg/10s cache rósł za szybko)
  - Dodano czyszczenie responseCache (wcześniej nie było czyszczone!)
  - safeCacheSet() - inline limit check przed każdym cache.set()
  - [MEMORY] logging co 30s: Heap ~25MB, RSS ~135MB (bezpiecznie poniżej 512MB)

## Recent Changes (2026-02-04)
- **Ping/pong keepalive for Lighter**: Dodano taki sam mechanizm keepalive jak dla Extended (10s ping, 30s timeout)
- **Fixed error handler reconnect**: Extended i Lighter teraz poprawnie wyzwalają reconnect z backoff w error handler (było tylko logowanie)
- **Exponential backoff**: Lighter ma teraz pełny exponential backoff (1s→2s→4s→8s→16s→30s max)
- **Extended price = mid price**: Cena Extended teraz obliczana jako (bid + ask) / 2 z orderbook, nie z zewnętrznego źródła
- **Lighter proxy rotation**: 10 proxy (Lighter_proxy1-10) z automatycznym przełączaniem przy błędzie 429
- **Extended proxy rotation**: 40 proxy (Extended_proxy11-50) z automatycznym przełączaniem przy błędzie 429
- **Memory optimization**: Cache limit 500 wpisów, czyszczenie co 60 sekund (zapobiega OOM na Render 512MB)
- Szybszy reconnect przy błędach (1s zamiast 5s)

## Recent Changes (2026-02-03)
- Added [STATS 10s] diagnostic logs showing message frequency from each exchange
- Removed ALL Extended orderbook filtering - now broadcasts every message immediately
- Extended orderbook: ~660 msg/sec (was filtered before, now real-time)
- Paradex: ~1400 msg/sec, GRVT: ~150 msg/sec, Pacifica: ~200 msg/sec
- Lighter issue: API sends only ~1 msg/10s after subscription (API limitation)
- Added heartbeat monitoring (30s interval) - logs status of all 7 exchange connections
- Added ping/pong keepalive for all WebSocket connections to prevent silent disconnects
- Added auto-reconnect for dead connections detected by heartbeat
- Paradex orderbook refresh rate: 50ms (stable)
- GRVT mini ticker: 500ms (API minimum)
- Fixed Extended orderbook: added price validation (>0, no NaN) and spread validation (ask > bid)
- Extended now streams 20+ markets automatically: BTC-USD, ETH-USD, SOL-USD, DOGE-USD, LTC-USD, BNB-USD, etc.
- Added NADO exchange with REST API polling (23 markets, $514M volume)
- NADO uses 11 proxy rotation for 429 req/sec effective rate
- GRVT fully working with API key authentication and mini ticker orderbook
- Confirmed Reya uses AMM model - no CLOB orderbook available

## Recent Changes (2026-02-02)
- Added Volume column with sorting by Symbol/Volume
- Fixed Lighter orderbook flickering by sorting bids/asks and skipping unchanged values
- Changed Extended to use `/v1/orderbooks` endpoint with SNAPSHOT/DELTA handling
- Fixed Paradex orderbook to parse inserts array with side: BUY/SELL format
- Fixed Paradex subscription to use `order_book.{market}.snapshot@15@100ms` format
- Pacifica: dynamic market loading from `/api/v1/info/prices` (50 markets)
- Reya: dynamic depth subscription for all markets from `/v2/prices`
- Frontend: improved data merging to prevent NaN and maintain values
