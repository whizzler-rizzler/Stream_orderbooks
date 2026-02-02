import { useEffect, useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ActivityIcon, TrendingUpIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";

interface PriceData {
  type?: string;
  exchange: string;
  symbol: string;
  price: string;
  timestamp: number;
  volume?: string;
  bestBid?: string;
  bestAsk?: string;
  bidSize?: string;
  askSize?: string;
  spread?: string;
  priceChange?: string;
  fundingRate?: string;
}

const EXCHANGES = ['Lighter', 'Extended', 'Paradex', 'GRVT', 'Reya', 'Pacifica'] as const;
type ExchangeName = typeof EXCHANGES[number];

const EXCHANGE_COLORS: Record<ExchangeName, string> = {
  Lighter: 'text-green-400',
  Extended: 'text-blue-400',
  Paradex: 'text-purple-400',
  GRVT: 'text-orange-400',
  Reya: 'text-cyan-400',
  Pacifica: 'text-pink-400',
};

const CryptoAggregator = () => {
  const [prices, setPrices] = useState<Map<string, PriceData>>(new Map());
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');
  const [searchTerm, setSearchTerm] = useState('');
  const [exchangeFilter, setExchangeFilter] = useState<'all' | ExchangeName>('all');
  const [sortConfig, setSortConfig] = useState<{
    key: 'symbol' | 'price' | 'spread';
    direction: 'asc' | 'desc';
  } | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const { toast } = useToast();
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const connectWebSocket = () => {
    try {
      setConnectionStatus('connecting');
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsHost = window.location.host;
      const ws = new WebSocket(`${wsProtocol}//${wsHost}/ws`);
      
      ws.onopen = () => {
        console.log('Connected to aggregator');
        setConnectionStatus('connected');
        toast({
          title: "Połączono",
          description: "Odbieranie danych z 6 giełd w czasie rzeczywistym",
        });
      };

      ws.onmessage = (event) => {
        try {
          const data: PriceData = JSON.parse(event.data);
          if (data.type === 'orderbook') return;
          setPrices(prev => {
            const newPrices = new Map(prev);
            const key = `${data.exchange}_${data.symbol}`;
            newPrices.set(key, data);
            return newPrices;
          });
        } catch (error) {
          console.error('Error parsing message:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setConnectionStatus('disconnected');
      };

      ws.onclose = () => {
        console.log('WebSocket closed, reconnecting in 3s...');
        setConnectionStatus('disconnected');
        reconnectTimeoutRef.current = setTimeout(connectWebSocket, 3000);
      };

      wsRef.current = ws;
    } catch (error) {
      console.error('Error connecting to WebSocket:', error);
      setConnectionStatus('disconnected');
      reconnectTimeoutRef.current = setTimeout(connectWebSocket, 3000);
    }
  };

  useEffect(() => {
    connectWebSocket();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const normalizeSymbol = (symbol: string) => {
    if (!symbol) return '';
    return symbol.toUpperCase()
      .replace(/-USD-PERP$/i, '')
      .replace(/-PERP$/i, '')
      .replace(/RUSDPERP$/i, '')
      .replace(/_USDT_Perp$/i, '')
      .replace(/-USD$/i, '');
  };

  type GroupedData = Partial<Record<ExchangeName, PriceData>>;
  const groupedPrices = new Map<string, GroupedData>();

  Array.from(prices.values()).forEach((data) => {
    const normalizedSymbol = normalizeSymbol(data.symbol);
    if (!normalizedSymbol) return;

    if (!groupedPrices.has(normalizedSymbol)) {
      groupedPrices.set(normalizedSymbol, {});
    }
    const group = groupedPrices.get(normalizedSymbol)!;
    group[data.exchange as ExchangeName] = data;
  });

  const exchangeStats = EXCHANGES.map(exchange => ({
    name: exchange,
    volume: Array.from(prices.values())
      .filter((p) => p.exchange === exchange && p.volume)
      .reduce((sum, p) => sum + parseFloat(p.volume || '0'), 0),
    markets: new Set(
      Array.from(prices.values())
        .filter((p) => p.exchange === exchange)
        .map((p) => normalizeSymbol(p.symbol))
    ).size,
  }));

  const formatPrice = (price: string) => {
    const num = parseFloat(price);
    if (num < 0.01) return num.toFixed(6);
    if (num < 1) return num.toFixed(4);
    return num.toFixed(2);
  };

  const formatVolume = (volume: number) => {
    if (volume >= 1e9) return `$${(volume / 1e9).toFixed(1)}B`;
    if (volume >= 1e6) return `$${(volume / 1e6).toFixed(1)}M`;
    if (volume >= 1e3) return `$${(volume / 1e3).toFixed(1)}K`;
    return `$${volume.toFixed(0)}`;
  };

  const filteredSymbols = (() => {
    let entries = Array.from(groupedPrices.entries())
      .filter(([symbol]) =>
        symbol.toLowerCase().includes(searchTerm.toLowerCase())
      );

    if (exchangeFilter !== 'all') {
      entries = entries.filter(([, group]) => group[exchangeFilter]);
    }

    if (sortConfig) {
      const { key, direction } = sortConfig;
      entries.sort(([symbolA, groupA], [symbolB, groupB]) => {
        if (key === 'symbol') {
          return direction === 'asc'
            ? symbolA.localeCompare(symbolB)
            : symbolB.localeCompare(symbolA);
        }
        return 0;
      });
    } else {
      entries.sort(([a], [b]) => a.localeCompare(b));
    }

    return entries;
  })();

  const handleSort = (key: 'symbol' | 'price' | 'spread') => {
    setSortConfig((prev) =>
      prev && prev.key === key
        ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'asc' }
    );
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="max-w-[1800px] mx-auto space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground mb-4 flex items-center gap-2">
            <TrendingUpIcon className="w-6 h-6" />
            Statystyki Giełd (6 Exchanges + Orderbook)
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {exchangeStats.map((stat, idx) => (
              <Card key={stat.name} className="bg-card border-border">
                <CardHeader className="pb-2">
                  <CardTitle className={`text-sm font-medium ${EXCHANGE_COLORS[stat.name as ExchangeName]}`}>
                    {stat.name}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-xl font-bold text-foreground">
                    {stat.volume > 0 ? formatVolume(stat.volume) : "-"}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{stat.markets} markets</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <div>
          <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
            <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <ActivityIcon className="w-6 h-6" />
              Porównanie Giełd z Orderbook (BID/ASK)
            </h2>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-card">
                <div className={`w-2 h-2 rounded-full ${
                  connectionStatus === 'connected' ? 'bg-green-500 animate-pulse' :
                  connectionStatus === 'connecting' ? 'bg-yellow-500' : 'bg-red-500'
                }`} />
                <span className="text-sm text-muted-foreground">
                  {connectionStatus === 'connected' ? 'Live' : 
                   connectionStatus === 'connecting' ? 'Łączenie...' : 'Rozłączono'}
                </span>
              </div>
              <Input
                placeholder="Szukaj symbolu..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-40"
              />
              <Select
                value={exchangeFilter}
                onValueChange={(value) => setExchangeFilter(value as 'all' | ExchangeName)}
              >
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Filtruj giełdę" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Wszystkie</SelectItem>
                  {EXCHANGES.map(ex => (
                    <SelectItem key={ex} value={ex}>{ex}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Card className="bg-card border-border">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border hover:bg-transparent">
                      <TableHead
                        className="font-bold text-foreground w-[80px] sticky left-0 bg-card z-10 cursor-pointer"
                        onClick={() => handleSort('symbol')}
                      >
                        Symbol ↕
                      </TableHead>
                      {EXCHANGES.map(exchange => (
                        <TableHead 
                          key={exchange} 
                          className={`${EXCHANGE_COLORS[exchange]} font-semibold text-center`}
                          colSpan={4}
                        >
                          {exchange}
                        </TableHead>
                      ))}
                    </TableRow>
                    <TableRow className="border-border hover:bg-transparent text-xs">
                      <TableHead className="sticky left-0 bg-card z-10"></TableHead>
                      {EXCHANGES.map(exchange => (
                        <TableHead key={`${exchange}-cols`} colSpan={4} className="p-0">
                          <div className="grid grid-cols-4">
                            <span className={`${EXCHANGE_COLORS[exchange]} text-xs px-2 py-2`}>Price</span>
                            <span className="text-green-300 text-xs px-2 py-2">Bid</span>
                            <span className="text-red-300 text-xs px-2 py-2">Ask</span>
                            <span className="text-yellow-300 text-xs px-2 py-2">Sprd</span>
                          </div>
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSymbols.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={1 + EXCHANGES.length * 4} className="text-center py-8 text-muted-foreground">
                          Oczekiwanie na dane...
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredSymbols.map(([symbol, group]) => (
                        <TableRow key={symbol} className="border-border hover:bg-muted/5">
                          <TableCell className="font-bold text-foreground sticky left-0 bg-card z-10 text-sm">
                            {symbol}
                          </TableCell>
                          {EXCHANGES.map(exchange => {
                            const data = group[exchange];
                            return (
                              <TableCell key={`${symbol}-${exchange}`} colSpan={4} className="p-0">
                                <div className="grid grid-cols-4">
                                  <span className={`${EXCHANGE_COLORS[exchange]} font-mono text-xs px-2 py-2`}>
                                    {data ? `$${formatPrice(data.price)}` : '-'}
                                  </span>
                                  <span className="text-green-300 font-mono text-xs px-2 py-2">
                                    {data?.bestBid ? `$${formatPrice(data.bestBid)}` : '-'}
                                  </span>
                                  <span className="text-red-300 font-mono text-xs px-2 py-2">
                                    {data?.bestAsk ? `$${formatPrice(data.bestAsk)}` : '-'}
                                  </span>
                                  <span className="text-yellow-300 text-xs px-2 py-2">
                                    {data?.spread ? `$${data.spread}` : '-'}
                                  </span>
                                </div>
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default CryptoAggregator;
