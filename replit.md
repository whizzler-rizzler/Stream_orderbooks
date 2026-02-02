# Crypto Aggregator - Real-time Exchange Data (6 Exchanges + Orderbook)

## Overview
Aplikacja do agregacji danych w czasie rzeczywistym z 6 zdecentralizowanych giełd kryptowalut z obsługą dedykowanych proxy per-exchange oraz danymi orderbook (BID/ASK/Spread).

## Current Status (February 2026)
- **5/6 giełd operacyjnych z danymi cenowymi**
- **Lighter**: $5.2B+ volume, 100+ markets, **pełny BID/ASK orderbook** ✓
- **Extended**: 79 markets (orderbook connections established)
- **Paradex**: 108 markets (filtered to PERP), orderbook subscribed
- **Reya**: 85 markets, depth subscriptions added
- **Pacifica**: $1.0B+ volume, 50+ markets, book source configured
- **GRVT**: Not working - API requires specific JSON-RPC format

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
| Lighter | wss://mainnet.zklighter.elliot.ai/stream | ✓ Working |
| Extended | wss://api.starknet.extended.exchange/stream.extended.exchange/v1/prices/mark | Implemented |
| Extended OB | wss://api.starknet.extended.exchange/stream.extended.exchange/v1/orderbook/{market} | Awaiting data |
| Paradex | wss://ws.api.prod.paradex.trade/v1 | Subscribed |
| GRVT | wss://market-data.grvt.io/ws/full | Error 1107 |
| Reya | wss://ws.reya.xyz | /v2/market/{symbol}/depth added |
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
1. **GRVT**: Subscription format returns error 1107 "JSON RPC version must be 2.0" - API requires specific format that needs investigation with their docs/support
2. **Extended Orderbook**: WebSocket connections established but no data received - may require authentication or different URL format
3. **Reya Orderbook**: Depth channel added but data visibility needs verification

## Orderbook Implementation Details
- **Lighter**: `order_book/{market_id}` channel - bids[0].price/asks[0].price
- **Extended**: `/v1/orderbook/{market}` separate WebSocket per market - data.bids/data.asks
- **Paradex**: `order_book.{market}` channel - bids[0][0]/asks[0][0]
- **Reya**: `/v2/market/{symbol}/depth` channel - bids[0].px/asks[0].px
- **Pacifica**: `source: 'book'` with agg_level=1 - data.l[0]/data.l[1]

## Running
1. Backend: `cd server && node server.js`
2. Frontend: `npm run dev`

## Recent Changes (2026-02-02)
- Implemented per-exchange orderbook subscriptions
- Added Extended orderbook via separate WebSocket connections
- Fixed Pacifica to use 'book' source per API docs
- Added Reya depth subscriptions for 8 markets
- GRVT subscription format investigation ongoing
