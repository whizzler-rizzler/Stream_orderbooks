# Crypto Aggregator - Real-time Exchange Data (6 Exchanges + Orderbook)

## Overview
Aplikacja do agregacji danych w czasie rzeczywistym z 6 zdecentralizowanych giełd kryptowalut z obsługą dedykowanych proxy per-exchange oraz danymi orderbook (BID/ASK/Spread).

## Current Status (February 2026)
- **Lighter**: $5.2B+ volume, 102 markets, **pełny BID/ASK orderbook** ✓
- **Extended**: 79 markets, **orderbook działający** (SNAPSHOT + DELTA) ✓
- **Paradex**: 108 markets (PERP), **orderbook działający** (inserts format with mid price fallback) ✓
- **Reya**: 85 markets, $148M volume, **dynamic depth subscription** (subskrybuje depth gdy otrzyma listę z /v2/prices)
- **Pacifica**: $1.0B+ volume, 50 markets, **dynamic market loading** z API
- **GRVT**: Not working - API requires specific JSON-RPC format (error 1107)

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
│   └── server.js                    # WebSocket aggregator (6 exchanges)
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
- `PROXY_URL` - Fallback proxy URL

## Proxy Format
Supports format: `host:port:user:pass` which is converted to `http://user:pass@host:port`

## Known Issues
1. **GRVT**: Subscription format returns error 1107 "JSON RPC version must be 2.0" - API requires specific format
2. **Reya**: Depth channel subscribed but no data received - may need different channel format
3. **Pacifica**: Book source configured but orderbook data not visible in UI

## Orderbook Implementation Details
- **Lighter**: `order_book/{market_id}` channel - sorted bids/asks, skip unchanged values
- **Extended**: `/v1/orderbooks` single endpoint - SNAPSHOT clears state, DELTA updates incrementally
- **Paradex**: `order_book.{market}.snapshot@15@100ms` channel - inserts array with side: BUY/SELL
- **Reya**: `/v2/market/{symbol}/depth` channel - bids[0].px/asks[0].px format
- **Pacifica**: `source: 'book'` with agg_level=1 - data.l[0] for bids, data.l[1] for asks

## Running
1. Backend: `cd server && node server.js`
2. Frontend: `npm run dev`

## Recent Changes (2026-02-02)
- Fixed Lighter orderbook flickering by sorting bids/asks and skipping unchanged values
- Changed Extended to use `/v1/orderbooks` endpoint with SNAPSHOT/DELTA handling
- Fixed Paradex orderbook to parse inserts array with side: BUY/SELL format
- Fixed Paradex subscription to use `order_book.{market}.snapshot@15@100ms` format
