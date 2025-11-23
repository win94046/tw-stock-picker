export interface OHLCV {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface StockData {
  symbol: string;
  name: string;
  currentPrice: number;
  changePct: number;
  history: OHLCV[];
}

export enum StrategyType {
  ALL = 'all',
  FIRST_RED_K = 'first_red_k',
  VOLUME_SPIKE = 'volume_spike'
}