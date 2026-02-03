# Crypto Aggregator - Real-time Exchange Data (7 Exchanges + Orderbook)

## Overview
Aplikacja do agregacji danych w czasie rzeczywistym z 7 zdecentralizowanych giełd kryptowalut z obsługą dedykowanych proxy per-exchange oraz danymi orderbook (BID/ASK/Spread).

## Current Status (February 2026)
- **Lighter**: $3B+ volume, 97 markets, **pełny BID/ASK orderbook** ✓
- **Extended**: 79 markets, **orderbook działający** (SNAPSHOT + DELTA) ✓
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
| Extended | wss://api.starknet.extended.exchange/stream.extended.exchange/v1/orderbooks | ✓ Working - SNAPSHOT/DELTA |
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
- `Proxy_lighter_public` - Dedicated proxy for Lighter
- `Proxy_GRVT_public` - Dedicated proxy for GRVT
- `Proxy_pacifica_public` - Dedicated proxy for Pacifica
- `Proxy_extended_public` - Dedicated proxy for Extended
- `Proxy_reya_public` - Dedicated proxy for Reya
- `Nado_proxy1` to `Nado_proxy11` - 11 rotating proxies for NADO REST API
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

## Recent Changes (2026-02-03)
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
