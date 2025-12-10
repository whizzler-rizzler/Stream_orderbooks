# Crypto Aggregator - Real-time Exchange Data

## Overview
Aplikacja do zbierania danych w czasie rzeczywistym z publicznych WebSocketów giełd kryptowalut z obsługą proxy.

## Architecture

### Frontend (React + Vite)
- Port: 5000
- Komponent `CryptoAggregator.tsx` wyświetla dane z 3 giełd
- Połączenie WebSocket przez proxy `/ws`

### Backend Server (Node.js)
- Port: 3001
- Lokalizacja: `server/server.js`
- Łączy się z publicznymi WebSocketami giełd:
  - **Lighter**: `wss://mainnet.zklighter.elliot.ai/stream`
  - **Extended**: `wss://api.starknet.extended.exchange/stream.extended.exchange/v1/prices/mark`
  - **Paradex**: `wss://ws.api.prod.paradex.trade/v1`

### Proxy Support
Ustaw zmienną środowiskową `PROXY_URL` aby używać proxy:
- HTTP/HTTPS: `http://user:pass@proxy:port`
- SOCKS5: `socks5://user:pass@proxy:port`

## Project Structure
```
├── src/                    # Frontend React
│   ├── components/         # Komponenty UI
│   └── hooks/              # React hooks
├── server/                 # Backend Node.js
│   └── server.js           # WebSocket aggregator
├── public/                 # Static assets
└── vite.config.ts          # Vite configuration
```

## Environment Variables
- `PROXY_URL` - URL proxy (opcjonalne)
- `PORT` - Port backendu (domyślnie 3001)

## Running
1. Backend: `cd server && node server.js`
2. Frontend: `npm run dev`

## Render Deployment
Backend gotowy do wdrożenia na Render - użyj `server/` jako root directory.
