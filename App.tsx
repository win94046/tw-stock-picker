import React, { useState, useEffect, useMemo } from 'react';
import { Activity, RefreshCw, Filter, ArrowUp, ArrowDown, Search, Zap, AlertTriangle, Loader2, Database, TestTube, TrendingUp } from 'lucide-react';
import { StockData, StrategyType } from './types';
import { fetchStocks, fetchMockStocks, fetchStocksPaginated } from './services/stockService';
import { checkStrategy } from './services/strategyService';
import StockList from './components/StockList';
import CandleStickChart from './components/CandleStickChart';
import PaginationControls from './components/PaginationControls';

export default function App() {
  // Changed from single activeStrategy to multiple selectedStrategies
  const [selectedStrategies, setSelectedStrategies] = useState<string[]>([]);
  const [selectedStock, setSelectedStock] = useState<StockData | null>(null);
  const [stocks, setStocks] = useState<StockData[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isDemoMode, setIsDemoMode] = useState<boolean>(false);
  const [isMockMode, setIsMockMode] = useState<boolean>(false);

  // 分頁狀態
  const [usePagination, setUsePagination] = useState<boolean>(true);
  const [currentPage, setCurrentPage] = useState<number>(0);
  const [totalStocks, setTotalStocks] = useState<number>(0);
  const [itemsPerPage] = useState<number>(100);

  // 搜尋狀態
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchInput, setSearchInput] = useState<string>('');

  const loadData = async (useMock: boolean = false, page: number = 0, search: string = '', strategies: string[] = [], useBackendMock: boolean = false) => {
    setLoading(true);
    setError(null);
    try {
      let data: StockData[];
      let total = 0;

      if (useMock && !useBackendMock) {
        // 前端模擬模式 (舊有邏輯，暫不支援多策略)
        data = await fetchMockStocks();
        setIsDemoMode(true);
        setUsePagination(false);
        total = data.length;
      } else if (usePagination) {
        // 分頁模式 (Server-side filtering)
        // Join strategies with comma
        const strategyParam = strategies.length > 0 ? strategies.join(',') : undefined;

        const response = await fetchStocksPaginated({
          offset: page * itemsPerPage,
          limit: itemsPerPage,
          search: search,
          strategy: strategyParam,
          sort: 'symbol',
          order: 'asc',
          mock: useBackendMock
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
        // Simple logic: if current selection is not in new list, select first
        const updated = data.find(s => s.symbol === selectedStock?.symbol);
        if (updated) {
          setSelectedStock(updated);
        } else {
          setSelectedStock(data[0]);
        }
      } else {
        setSelectedStock(null);
      }
    } catch (err) {
      console.error(err);
      setError("無法連接後端伺服器。請確保您已執行 'python server.py' 並且 yfinance 運作正常。");
      setUsePagination(false);
    } finally {
      setLoading(false);
    }
  };

  // Initial load
  useEffect(() => {
    loadData(isDemoMode, currentPage, searchQuery, selectedStrategies, isMockMode);
  }, [currentPage, searchQuery, selectedStrategies, isMockMode]);

  const handleRefresh = () => {
    loadData(isDemoMode, currentPage, searchQuery, selectedStrategies, isMockMode);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchQuery(searchInput);
    setCurrentPage(0); // Reset to first page on search
  };

  const toggleStrategy = (strategy: string) => {
    setSelectedStrategies(prev => {
      if (prev.includes(strategy)) {
        return prev.filter(s => s !== strategy);
      } else {
        return [...prev, strategy];
      }
    });
    setCurrentPage(0); // Reset to first page on strategy change
  };

  const handleSwitchToDemo = () => {
    const newDemoMode = !isDemoMode;
    setIsDemoMode(newDemoMode);
    // Reset strategies when switching modes
    setSelectedStrategies([]);
    loadData(newDemoMode, 0, searchQuery, [], isMockMode);
  };

  const handleToggleMockMode = () => {
    const newMockMode = !isMockMode;
    setIsMockMode(newMockMode);
    setSelectedStrategies([]); // Reset strategies
    setSearchQuery(''); // Clear search
    setSearchInput('');
    setCurrentPage(0);
    // loadData will be triggered by useEffect
  };

  return (
    <div className="flex h-screen bg-slate-950 text-slate-200 font-sans overflow-hidden">
      {/* Sidebar - Stock List */}
      <div className="w-80 flex flex-col border-r border-slate-800 bg-slate-900/50">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 bg-slate-900 sticky top-0 z-10">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Activity className="w-6 h-6 text-blue-500" />
              <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">
                台股策略選股
              </h1>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleToggleMockMode}
                className={`p-2 rounded-full transition-colors ${isMockMode ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
                title={isMockMode ? "切換回真實模式" : "切換至測試模式"}
              >
                <TestTube className="w-4 h-4" />
              </button>
              <button
                onClick={handleRefresh}
                className="p-2 hover:bg-slate-800 rounded-full transition-colors text-slate-400 hover:text-blue-400"
                title="重新整理"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Search Bar */}
          <form onSubmit={handleSearch} className="relative mb-4">
            <input
              type="text"
              placeholder="搜尋代碼或名稱..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg py-2 pl-10 pr-4 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
            />
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
          </form>

          {/* Strategy Filters (Multi-select) */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => toggleStrategy('first_red_k')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${selectedStrategies.includes('first_red_k')
                ? 'bg-red-500/20 text-red-300 border-red-500/50 shadow-[0_0_10px_rgba(239,68,68,0.2)]'
                : 'bg-slate-800 text-slate-400 border-slate-700 hover:border-slate-600'
                }`}
            >
              <Zap className="w-3 h-3" />
              第一根紅K
            </button>

            <button
              onClick={() => toggleStrategy('close_above_upper')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${selectedStrategies.includes('close_above_upper')
                ? 'bg-purple-500/20 text-purple-300 border-purple-500/50 shadow-[0_0_10px_rgba(168,85,247,0.2)]'
                : 'bg-slate-800 text-slate-400 border-slate-700 hover:border-slate-600'
                }`}
            >
              <TrendingUp className="w-3 h-3" />
              突破布林上緣
            </button>

            <button
              onClick={() => toggleStrategy('6ma_kd_macd')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${selectedStrategies.includes('6ma_kd_macd')
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-[0_0_10px_rgba(16,185,129,0.2)]'
                : 'bg-slate-800 text-slate-400 border-slate-700 hover:border-slate-600'
                }`}
            >
              <Activity className="w-3 h-3" />
              六線+雙指標
            </button>
          </div>

          {/* Active Filters Display */}
          {selectedStrategies.length > 0 && (
            <div className="mt-2 text-xs text-slate-500 flex items-center gap-1">
              <Filter className="w-3 h-3" />
              <span>已套用 {selectedStrategies.length} 個策略 (AND)</span>
              <button
                onClick={() => { setSelectedStrategies([]); setCurrentPage(0); }}
                className="ml-auto text-blue-400 hover:text-blue-300"
              >
                清除
              </button>
            </div>
          )}
        </div>

        {/* Stock List */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {loading && stocks.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-slate-500">
              <Loader2 className="w-8 h-8 animate-spin mb-2 text-blue-500" />
              <p className="text-sm">正在掃描市場數據...</p>
              {selectedStrategies.length > 0 && <p className="text-xs mt-1 text-slate-600">應用策略篩選中</p>}
            </div>
          ) : error ? (
            <div className="p-6 text-center">
              <div className="bg-red-500/10 text-red-400 p-4 rounded-lg border border-red-500/20 mb-4">
                <AlertTriangle className="w-8 h-8 mx-auto mb-2" />
                <p className="text-sm">{error}</p>
              </div>
              <button
                onClick={handleRefresh}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm transition-colors"
              >
                重試
              </button>
            </div>
          ) : (
            <StockList
              stocks={stocks}
              selectedId={selectedStock?.symbol}
              onSelect={setSelectedStock}
              isFiltered={selectedStrategies.length > 0}
            />
          )}
        </div>

        {/* Pagination */}
        {usePagination && (
          <PaginationControls
            currentPage={currentPage}
            totalPages={Math.ceil(totalStocks / itemsPerPage)}
            totalItems={totalStocks}
            itemsPerPage={itemsPerPage}
            displayedItems={stocks.length}
            onPageChange={setCurrentPage}
            loading={loading}
          />
        )}

        {/* Footer Status */}
        <div className="p-2 border-t border-slate-800 bg-slate-950 text-[10px] text-slate-600 flex justify-between items-center">
          <span>
            {isMockMode ? "測試模式 (Mock Data)" : isDemoMode ? "前端模擬模式" : "連線模式 (Live Data)"}
          </span>
          <span>
            {lastUpdated ? `更新於 ${lastUpdated.toLocaleTimeString()}` : '尚未更新'}
          </span>
        </div>
      </div>

      {/* Main Content - Chart */}
      <div className="flex-1 flex flex-col bg-slate-950">
        {selectedStock ? (
          <>
            {/* Stock Header */}
            <div className="p-6 border-b border-slate-800 bg-slate-900/30">
              <div className="flex items-end gap-4 mb-2">
                <h2 className="text-3xl font-bold text-white tracking-tight">
                  {selectedStock.symbol}
                </h2>
                <span className="text-xl text-slate-400 font-light pb-1">
                  {selectedStock.name}
                </span>
                <div className={`flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium ml-auto ${selectedStock.changePct >= 0
                  ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                  : 'bg-green-500/10 text-green-400 border border-green-500/20'
                  }`}>
                  {selectedStock.changePct >= 0 ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
                  {Math.abs(selectedStock.changePct).toFixed(2)}%
                </div>
              </div>
              <div className="flex items-center gap-6 text-sm text-slate-400">
                <div className="flex items-center gap-2">
                  <span className="text-slate-500">收盤價</span>
                  <span className={`text-lg font-mono font-medium ${selectedStock.changePct >= 0 ? 'text-red-400' : 'text-green-400'
                    }`}>
                    {selectedStock.currentPrice.toFixed(2)}
                  </span>
                </div>
                {/* Add more details here if available */}
              </div>
            </div>

            {/* Chart Area */}
            <div className="flex-1 p-6 overflow-hidden">
              <div className="h-full w-full bg-slate-900/50 rounded-xl border border-slate-800 p-4 shadow-inner relative group">
                <CandleStickChart data={selectedStock.history} />

                {/* Chart Controls / Legend could go here */}
                <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="px-2 py-1 bg-slate-800/80 backdrop-blur rounded text-[10px] text-slate-400 border border-slate-700">
                    MA20 (黃線)
                  </div>
                  <div className="px-2 py-1 bg-slate-800/80 backdrop-blur rounded text-[10px] text-slate-400 border border-slate-700">
                    布林通道 (紫虛線)
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-600">
            <div className="w-24 h-24 bg-slate-900 rounded-full flex items-center justify-center mb-6 shadow-2xl border border-slate-800">
              <Activity className="w-10 h-10 text-slate-700" />
            </div>
            <p className="text-lg font-medium text-slate-500">請從左側列表選擇一檔股票</p>
            <p className="text-sm mt-2 text-slate-700">或是使用上方搜尋列尋找特定標的</p>
          </div>
        )}
      </div>
    </div>
  );
}
