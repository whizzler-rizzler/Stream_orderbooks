# Render Deployment Guide

## Environment Variables

Copy these environment variables to Render:

```
PORT=3001
Proxy_lighter_public=host:port:user:pass
Proxy_GRVT_public=host:port:user:pass
Proxy_pacifica_public=host:port:user:pass
Proxy_extended_public=host:port:user:pass
Proxy_reya_public=host:port:user:pass
Nado_proxy1=host:port:user:pass
Nado_proxy2=host:port:user:pass
Nado_proxy3=host:port:user:pass
Nado_proxy4=host:port:user:pass
Nado_proxy5=host:port:user:pass
Nado_proxy6=host:port:user:pass
Nado_proxy7=host:port:user:pass
Nado_proxy8=host:port:user:pass
Nado_proxy9=host:port:user:pass
Nado_proxy10=host:port:user:pass
Nado_proxy11=host:port:user:pass
```

## Render Settings

- **Build Command**: `npm install`
- **Start Command**: `npm start`
- **Health Check Path**: `/health`
- **Node Version**: 18+

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check, returns status and cache sizes |
| `/api/prices` | GET | All prices from all exchanges |
| `/api/orderbooks` | GET | All orderbook data (bid/ask/spread) |
| `/api/exchanges` | GET | Exchange statistics (volume, markets) |
| `ws://` | WebSocket | Real-time price/orderbook stream |

## Performance

- Gzip compression enabled
- In-memory caching
- Keep-alive connections
- Target: 1000+ req/sec

## WebSocket

Connect to `wss://your-render-url.onrender.com` for real-time data.
Messages are sent immediately when new data arrives (no rate limiting).
