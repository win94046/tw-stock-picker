import { OHLCV } from '../types';

/**
 * Strategy: First Red Candlestick (底部第一根紅K)
 * Logic:
 * 1. Trend: Previous days showed weakness (simplified as lower close yesterday or downtrend).
 * 2. Pattern: Today Close > Open (Red K) AND Body length > 2%.
 * 3. Volume: Today's volume > 1.5x average of past 5 days.
 */
export const checkFirstRedK = (history: OHLCV[]): boolean => {
  if (history.length < 6) return false; // Need at least 6 days for MA5 calculation
  
  const today = history[history.length - 1];
  const yesterday = history[history.length - 2];
  
  // 1. Check Pattern: Red K (Close > Open) AND Body > 2%
  const bodyPct = (today.close - today.open) / today.open;
  const isStrongRedK = bodyPct > 0.02; // 2% rise
  
  if (!isStrongRedK) return false;

  // 2. Check Trend/Context: Yesterday was weak (Green K or Drop)
  // In TW market: Green is drop, Red is rise. 
  // Weakness means Close < Open (Green) OR Close < Previous Close
  const wasWeakYesterday = yesterday.close < yesterday.open || yesterday.close < history[history.length - 3].close;
  
  if (!wasWeakYesterday) return false;

  // 3. Check Volume: > 1.5x MA5 Volume
  // Get past 5 days excluding today
  const past5Days = history.slice(history.length - 6, history.length - 1);
  const avgVolume = past5Days.reduce((sum, day) => sum + day.volume, 0) / 5;
  
  const isVolumeSpike = today.volume > (avgVolume * 1.5);

  return isVolumeSpike;
};

export const checkStrategy = (strategy: string, history: OHLCV[]): boolean => {
  if (strategy === 'first_red_k') {
    return checkFirstRedK(history);
  }
  // Add more strategies here if needed
  return true;
};