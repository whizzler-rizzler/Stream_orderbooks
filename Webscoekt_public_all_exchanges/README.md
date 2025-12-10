# Websocket Public All Exchanges

Real-time crypto data aggregator from public WebSocket endpoints.

## Exchanges
- **Lighter**: wss://mainnet.zklighter.elliot.ai/stream
- **Extended**: wss://api.starknet.extended.exchange/stream.extended.exchange/v1/prices/mark  
- **Paradex**: wss://ws.api.prod.paradex.trade/v1

## Proxy Configuration
Set `PROXY_URL` environment variable:
```
PROXY_URL=http://username:password@host:port
```

## Running
```bash
# Backend
cd server && npm install && node server.js

# Frontend
npm install && npm run dev
```

## Deployment (Render)
Use `server/` as root directory with command: `node server.js`
