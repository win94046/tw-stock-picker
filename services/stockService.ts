import { StockData, OHLCV } from '../types';

const API_URL = 'http://localhost:8000/api/stocks';
const API_URL_PAGINATED = 'http://localhost:8000/api/stocks/paginated';

// --- Pagination Types ---

export interface PaginatedResponse {
  total: number;
  offset: number;
  limit: number;
  data: StockData[];
}

export interface PaginationParams {
  offset?: number;
  limit?: number;
  search?: string;
  sort?: 'symbol';
  order?: 'asc' | 'desc';
}

// --- API Fetch ---

export const fetchStocks = async (): Promise<StockData[]> => {
  try {
    // Use a timeout to fail fast if server is not running
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 3000); // 3 seconds timeout

    const response = await fetch(API_URL, { signal: controller.signal });
    clearTimeout(id);

    if (!response.ok) {
      throw new Error('Network response was not ok');
    }
    const data: StockData[] = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching stock data:', error);
    throw error;
  }
};

// --- Paginated API Fetch ---

export const fetchStocksPaginated = async (
  params: PaginationParams = {}
): Promise<PaginatedResponse> => {
  try {
    const { offset = 0, limit = 100, search = '', sort = 'symbol', order = 'asc' } = params;

    // 構建查詢參數
    const queryParams = new URLSearchParams({
      offset: offset.toString(),
      limit: limit.toString(),
      sort,
      order,
    });

    // 如果有搜尋關鍵字，加入參數
    if (search && search.trim()) {
      queryParams.append('search', search.trim());
    }

    const url = `${API_URL_PAGINATED}?${queryParams.toString()}`;

    // 使用較長的超時時間（100支股票需要更多時間）
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 15000); // 15 seconds timeout

    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(id);

    if (!response.ok) {
      throw new Error('Network response was not ok');
    }

    const data: PaginatedResponse = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching paginated stock data:', error);
    throw error;
  }
};

// --- Mock Data Generator (Fallback) ---

const generateMockStockData = (symbol: string, name: string, days = 60): StockData => {
  let price = 100 + Math.random() * 400; // Random price between 100 and 500
  const history: OHLCV[] = [];

  // Determine trend
  const trendType = Math.random();
  let trend = 0;
  if (trendType > 0.6) trend = 0.5; // Up trend
  else if (trendType < 0.3) trend = -0.5; // Down trend

  const today = new Date();

  for (let i = days; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    // Skip weekends simplified
    if (date.getDay() === 0 || date.getDay() === 6) continue;

    const volatility = price * 0.02;
    const change = (Math.random() - 0.5) * volatility + trend;

    const open = price;
    const close = price + change;
    const high = Math.max(open, close) + Math.random() * volatility * 0.5;
    const low = Math.min(open, close) - Math.random() * volatility * 0.5;
    const volume = Math.floor(Math.random() * 5000) + 1000;

    history.push({
      date: date.toISOString().split('T')[0],
      open,
      high,
      low,
      close,
      volume,
    });

    price = close;
  }

  // Force a "First Red K" pattern occasionally for demo
  if (Math.random() > 0.5) {
    const len = history.length;
    if (len > 3) {
      // Previous days weak
      history[len - 2].close = history[len - 2].open * 0.98;
      history[len - 3].close = history[len - 3].open * 0.99;

      // Today strong Red K
      history[len - 1].open = history[len - 2].close;
      history[len - 1].close = history[len - 1].open * 1.04; // +4%
      history[len - 1].high = history[len - 1].close;
      history[len - 1].low = history[len - 1].open;
      history[len - 1].volume = history[len - 2].volume * 2.5; // Volume Spike
    }
  }

  const lastDay = history[history.length - 1];
  const prevDay = history[history.length - 2];
  const changePct = ((lastDay.close - prevDay.close) / prevDay.close) * 100;

  return {
    symbol,
    name,
    currentPrice: lastDay.close,
    changePct,
    history
  };
};

export const fetchMockStocks = async (): Promise<StockData[]> => {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 800));

  return [
    generateMockStockData('2330', '台積電 (Demo)'),
    generateMockStockData('2317', '鴻海 (Demo)'),
    generateMockStockData('2454', '聯發科 (Demo)'),
    generateMockStockData('2603', '長榮 (Demo)'),
    generateMockStockData('2303', '聯電 (Demo)'),
    generateMockStockData('2881', '富邦金 (Demo)'),
    generateMockStockData('3008', '大立光 (Demo)'),
    generateMockStockData('1101', '台泥 (Demo)'),
  ];
};

export const INITIAL_STOCKS: StockData[] = [];
