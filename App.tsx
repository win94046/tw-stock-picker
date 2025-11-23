import React, { useState, useEffect, useMemo } from 'react';
import { Activity, RefreshCw, Filter, ArrowUp, ArrowDown, Search, Zap, AlertTriangle, Loader2, Database } from 'lucide-react';
import { StockData, StrategyType } from './types';
import { fetchStocks, fetchMockStocks, fetchStocksPaginated } from './services/stockService';
import { checkStrategy } from './services/strategyService';
import StockList from './components/StockList';
import CandleStickChart from './components/CandleStickChart';
import PaginationControls from './components/PaginationControls';

export default function App() {
  const [activeStrategy, setActiveStrategy] = useState<StrategyType>(StrategyType.ALL);
  const [selectedStock, setSelectedStock] = useState<StockData | null>(null);
  const [stocks, setStocks] = useState<StockData[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isDemoMode, setIsDemoMode] = useState<boolean>(false);

  // 分頁狀態
  const [usePagination, setUsePagination] = useState<boolean>(true);
  const [currentPage, setCurrentPage] = useState<number>(0);
  const [totalStocks, setTotalStocks] = useState<number>(0);
  const [itemsPerPage] = useState<number>(100);

  // 搜尋狀態
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchInput, setSearchInput] = useState<string>('');

  const loadData = async (useMock: boolean = false, page: number = 0, search: string = '') => {
    setLoading(true);
    setError(null);
    try {
      let data: StockData[];
      let total = 0;

      if (useMock) {
        // 模擬模式使用原有邏輯
        data = await fetchMockStocks();
        setIsDemoMode(true);
        setUsePagination(false);
        total = data.length;
      } else if (usePagination) {
        // 分頁模式
        const response = await fetchStocksPaginated({
          offset: page * itemsPerPage,
          limit: itemsPerPage,
          search: search,
          sort: 'symbol',
          order: 'asc'
        });
        data = response.data;
        total = response.total;
        setIsDemoMode(false);
      } else {
        // 舊模式（向下相容）
        data = await fetchStocks();
        setIsDemoMode(false);
        total = data.length;
      }

      setStocks(data);
      setTotalStocks(total);
      setLastUpdated(new Date());

      // Update selection logic
      if (data.length > 0) {
        if (!selectedStock || page !== currentPage || search !== searchQuery) {
          // Select first if nothing selected or changed page/search
          setSelectedStock(data[0]);
        } else {
          // Try to keep current selection updated
          const updated = data.find(s => s.symbol === selectedStock.symbol);
          if (updated) {
            setSelectedStock(updated);
          } else {
            setSelectedStock(data[0]);
          }
        }
      }
    } catch (err) {
      console.error(err);
      setError("無法連接後端伺服器。請確保您已執行 'python server.py' 並且 yfinance 運作正常。");
      setUsePagination(false); // 錯誤時回退到舊模式
    } finally {
      setLoading(false);
    }
  };

  // Initial Load
  useEffect(() => {
    loadData(isDemoMode, currentPage, searchQuery);
  }, [currentPage, searchQuery]);

  // Filtering Logic
  const filteredStocks = useMemo(() => {
    if (activeStrategy === StrategyType.ALL) return stocks;
    return stocks.filter(stock => checkStrategy(activeStrategy, stock.history));
  }, [activeStrategy, stocks]);

  const handleRefresh = () => {
    loadData(isDemoMode, currentPage, searchQuery);
  };

  const handleSwitchToDemo = () => {
    setCurrentPage(0);
    setSearchQuery('');
    setSearchInput('');
    loadData(true, 0, '');
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handleSearch = () => {
    setCurrentPage(0); // 搜尋時重置到第一頁
    setSearchQuery(searchInput);
  };

  const handleSearchClear = () => {
    setSearchInput('');
    setSearchQuery('');
    setCurrentPage(0);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <header className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-800 pb-6">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-blue-400 via-cyan-400 to-emerald-400 bg-clip-text text-transparent flex items-center gap-3">
              <Activity className="text-blue-400" />
              智選股 Strategy Pro
            </h1>
            <p className="text-slate-400 text-sm mt-2 ml-1 max-w-md leading-relaxed">
              Professional grade technical analysis tool featuring <span className="text-red-400 font-medium">First Red K</span> strategy detection.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {isDemoMode && (
              <span className="px-2 py-1 bg-yellow-900/30 text-yellow-500 text-xs font-bold border border-yellow-500/30 rounded">
                DEMO MODE
              </span>
            )}
            {lastUpdated && (
              <span className="text-xs text-slate-500 hidden md:block">
                Last Update: {lastUpdated.toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={handleRefresh}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 hover:text-white rounded-lg text-sm font-medium border border-slate-700 transition-all active:scale-95 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
              {loading ? "載入中..." : "刷新盤勢"}
            </button>
          </div>
        </header>

        {error && (
          <div className="mb-6 p-4 bg-red-900/20 border border-red-500/50 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-red-200">
            <div className="flex items-center gap-3">
              <AlertTriangle size={24} className="shrink-0" />
              <div>
                <p className="font-bold">數據載入失敗</p>
                <p className="text-sm opacity-80">{error}</p>
              </div>
            </div>
            <button
              onClick={handleSwitchToDemo}
              className="px-4 py-2 bg-red-800 hover:bg-red-700 text-white text-sm font-medium rounded-lg shadow transition-colors flex items-center gap-2 whitespace-nowrap"
            >
              <Database size={16} />
              使用演示數據
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

          {/* Sidebar: Strategy & List */}
          <aside className="lg:col-span-4 flex flex-col gap-4">

            {/* Search Panel */}
            {usePagination && (
              <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 shadow-sm">
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <input
                      type="text"
                      value={searchInput}
                      onChange={(e) => setSearchInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                      placeholder="搜尋股票代碼... (例如: 50)"
                      className="w-full px-4 py-2 bg-slate-800 text-slate-200 rounded-lg border border-slate-700 focus:border-blue-500 focus:outline-none text-sm"
                    />
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                  </div>
                  <button
                    onClick={handleSearch}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-all"
                  >
                    搜尋
                  </button>
                  {searchQuery && (
                    <button
                      onClick={handleSearchClear}
                      className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-medium transition-all"
                    >
                      清除
                    </button>
                  )}
                </div>
                {searchQuery && (
                  <div className="mt-2 text-xs text-slate-400">
                    搜尋: <span className="text-blue-400 font-medium">「{searchQuery}」</span>
                  </div>
                )}
              </div>
            )}

            {/* Strategy Selector Panel */}
            <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 shadow-sm">
              <h3 className="text-xs font-bold text-slate-500 mb-4 uppercase tracking-widest flex items-center gap-2">
                <Filter size={14} /> Strategy Filter
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setActiveStrategy(StrategyType.ALL)}
                  className={`p-3 rounded-lg text-sm font-medium transition-all border ${activeStrategy === StrategyType.ALL
                    ? 'bg-blue-600 text-white border-blue-500 shadow-lg shadow-blue-900/40'
                    : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-750'
                    }`}
                >
                  全部股票
                </button>
                <button
                  onClick={() => setActiveStrategy(StrategyType.FIRST_RED_K)}
                  className={`p-3 rounded-lg text-sm font-medium transition-all border flex flex-col items-center justify-center gap-1 ${activeStrategy === StrategyType.FIRST_RED_K
                    ? 'bg-red-600 text-white border-red-500 shadow-lg shadow-red-900/40'
                    : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-750'
                    }`}
                >
                  <span className="flex items-center gap-1"><Zap size={14} fill="currentColor" /> 第一根紅K</span>
                </button>
              </div>
            </div>

            {/* Stock List Panel */}
            <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 flex-1 shadow-sm min-h-[400px]">
              <div className="flex justify-between items-center mb-4 pb-2 border-b border-slate-800/50">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                  Market Watch ({filteredStocks.length}{usePagination && totalStocks > 0 ? ` / ${totalStocks}` : ''})
                </h3>
                <Search size={16} className="text-slate-600" />
              </div>

              {loading && stocks.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-slate-500 gap-3">
                  <Loader2 size={32} className="animate-spin text-blue-500" />
                  <p>正在獲取數據...</p>
                </div>
              ) : (
                <StockList
                  stocks={filteredStocks}
                  selectedId={selectedStock?.symbol}
                  onSelect={setSelectedStock}
                  isFiltered={activeStrategy !== StrategyType.ALL}
                />
              )}

              {/* Pagination Controls */}
              {usePagination && !loading && totalStocks > itemsPerPage && (
                <PaginationControls
                  currentPage={currentPage}
                  totalPages={Math.ceil(totalStocks / itemsPerPage)}
                  onPageChange={handlePageChange}
                  totalItems={totalStocks}
                  itemsPerPage={itemsPerPage}
                  displayedItems={filteredStocks.length}
                />
              )}
            </div>
          </aside>

          {/* Main: Chart & Details */}
          <main className="lg:col-span-8 flex flex-col gap-6">
            {selectedStock ? (
              <>
                {/* Stock Header Card */}
                <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 shadow-sm relative overflow-hidden">
                  {/* Background decoration */}
                  <div className={`absolute top-0 right-0 w-64 h-64 bg-gradient-to-br ${selectedStock.changePct >= 0 ? 'from-red-500/10' : 'from-green-500/10'} to-transparent rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none`}></div>

                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center relative z-10">
                    <div>
                      <div className="flex items-baseline gap-3">
                        <h2 className="text-3xl font-bold text-white">
                          {selectedStock.name}
                        </h2>
                        <span className="text-lg text-slate-500 font-medium">{selectedStock.symbol}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-slate-400 bg-slate-800 px-2 py-0.5 rounded">TWSE</span>
                        <span className="text-xs text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
                          {isDemoMode ? "Simulated Data" : "Real-time Data"}
                        </span>
                      </div>
                    </div>

                    <div className="mt-4 md:mt-0 flex gap-6 items-end">
                      <div className="text-right">
                        <div className="text-xs text-slate-500 mb-1 uppercase tracking-wider">Price</div>
                        <div className="text-4xl font-mono font-medium text-slate-200">
                          {selectedStock.currentPrice.toFixed(2)}
                        </div>
                      </div>
                      <div className="text-right pb-1">
                        <div className="text-xs text-slate-500 mb-1 uppercase tracking-wider">Change</div>
                        <span className={`px-3 py-1.5 rounded-lg text-base font-bold flex items-center gap-1 ${selectedStock.changePct >= 0 ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-green-500/10 text-green-400 border border-green-500/20'
                          }`}>
                          {selectedStock.changePct >= 0 ? <ArrowUp size={18} /> : <ArrowDown size={18} />}
                          {Math.abs(selectedStock.changePct).toFixed(2)}%
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Chart Container */}
                <div className="bg-slate-900 p-1 rounded-xl border border-slate-800 flex-1 min-h-[500px] flex flex-col shadow-sm relative">
                  <div className="absolute top-4 left-4 z-10">
                    <h3 className="text-slate-400 text-xs font-bold uppercase tracking-widest bg-slate-900/80 backdrop-blur px-2 py-1 rounded border border-slate-800">
                      Daily Candlestick (3 Months)
                    </h3>
                  </div>

                  <div className="flex-1 w-full p-2">
                    <CandleStickChart data={selectedStock.history} />
                  </div>

                  {/* Strategy Explanation Box */}
                  {activeStrategy === StrategyType.FIRST_RED_K && (
                    <div className="mx-4 mb-4 p-4 bg-slate-950/80 rounded-lg border border-red-900/30 flex items-start gap-3">
                      <div className="p-2 bg-red-900/20 rounded-full mt-0.5">
                        <Zap size={16} className="text-red-400" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-200">Strategy: First Red K Detected</h4>
                        <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                          This stock shows signs of a trend reversal. It matches the criteria:
                          <span className="text-slate-300"> Previous downtrend</span> +
                          <span className="text-slate-300">Strong Red Candle ({'>'}2%)</span> +
                          <span className="text-slate-300">Volume Spike ({'>'}1.5x avg)</span>.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="h-full flex items-center justify-center flex-col gap-4 text-slate-600 bg-slate-900/50 rounded-xl border border-slate-800 border-dashed">
                <Activity size={48} className="opacity-20" />
                <span>Select a stock to view technical analysis</span>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
