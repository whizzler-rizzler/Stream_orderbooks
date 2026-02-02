# Crypto Aggregator - Real-time Exchange Data (6 Exchanges + Orderbook)

## Overview
Aplikacja do agregacji danych w czasie rzeczywistym z 6 zdecentralizowanych giełd kryptowalut z obsługą dedykowanych proxy per-exchange oraz danymi orderbook (BID/ASK/Spread).

## Current Status (February 2026)
- **5/6 giełd w pełni operacyjnych**
- Lighter: $5.2B+ volume, 70+ markets, full BID/ASK orderbook
- Extended: 79 markets
- Paradex: 108 markets (filtered to PERP)
- Reya: 84 markets
- Pacifica: $1.0B+ volume, 50+ markets
- GRVT: Connected but subscription format requires investigation (error 1101)

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

| Exchange | WebSocket URL | Proxy Env |
|----------|---------------|-----------|
| Lighter | wss://mainnet.zklighter.elliot.ai/stream | Proxy_lighter_public |
| Extended | wss://api.starknet.extended.exchange/stream.extended.exchange/v1/prices/mark | Proxy_extended_public |
| Paradex | wss://ws.api.prod.paradex.trade/v1 | Proxy_paradex_public (fallback) |
| GRVT | wss://market-data.grvt.io/ws/full | Proxy_GRVT_public |
| Reya | wss://ws.reya.xyz | Proxy_reya_public |
| Pacifica | wss://ws.pacifica.fi/ws | Proxy_pacifica_public |

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
1. **GRVT**: Subscription format returns error 1101 - API requires specific feed format that needs investigation
2. **Pacifica**: Using fallback (no proxy) when dedicated proxy returns 502

## Running
1. Backend: `cd server && node server.js`
2. Frontend: `npm run dev`

## Recent Changes (2026-02-02)
- Added 3 new exchanges: GRVT, Reya, Pacifica
- Implemented per-exchange proxy configuration
- Added orderbook subscriptions with BID/ASK/Spread display
- Fixed Pacifica URL (api.pacifica.fi → ws.pacifica.fi)
- Fixed Pacifica data parser for array format
- Added proxy fallback mechanism for Pacifica
