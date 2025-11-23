import math
import json
import os
from datetime import datetime, timedelta
from typing import List, Dict, Optional
import uvicorn
import yfinance as yf
import pandas as pd
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

# 1. 設定 CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 簡單的記憶體快取
_cache = {}
_cache_timestamp = {}
CACHE_DURATION = 300  # 5分鐘快取

# 2. 載入所有台股清單
def load_all_stocks() -> List[Dict]:
    """從 JSON 檔案載入所有台股"""
    json_path = os.path.join(os.path.dirname(__file__), "data", "twse_stocks.json")
    try:
        with open(json_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        print(f"Warning: {json_path} not found, using default stock list")
        # 備用清單
        return [
            {"id": "2330.TW", "name": "台積電"},
            {"id": "2317.TW", "name": "鴻海"},
            {"id": "2454.TW", "name": "聯發科"},
            {"id": "2308.TW", "name": "台達電"},
            {"id": "2303.TW", "name": "聯電"},
        ]

ALL_STOCKS = load_all_stocks()

# 3. 清洗 NaN 的輔助函式
def clean_float(val):
    if pd.isna(val) or math.isnan(val) or math.isinf(val):
        return 0.0
    return float(val)

# 4. 模糊搜尋股票代碼
def filter_stocks_by_search(stocks: List[Dict], search_query: str) -> List[Dict]:
    """模糊搜尋股票代碼（例如 '50' 可找到 '0050', '500', '2501'）"""
    if not search_query:
        return stocks
    
    search_query = search_query.strip().upper()
    filtered = []
    
    for stock in stocks:
        symbol = stock["id"].replace(".TW", "").upper()
        # 檢查代碼中是否包含搜尋字串
        if search_query in symbol:
            filtered.append(stock)
    
    return filtered

# 策略: 第一根紅K
def check_first_red_k(history: List[Dict]) -> bool:
    """
    檢查是否符合「第一根紅K」策略
    條件:
    1. 實體紅K (收>開) 且 幅度 > 2%
    2. 昨日是黑K或下跌 (確認是轉折)
    3. 量能放大 (> 5日均量 1.5倍)
    """
    if len(history) < 6:
        return False
        
    today = history[-1]
    yesterday = history[-2]
    
    # 1. 檢查型態: 紅K (收>開) 且 實體 > 2%
    if today['open'] == 0: return False
    body_pct = (today['close'] - today['open']) / today['open']
    is_strong_red_k = body_pct > 0.02
    
    if not is_strong_red_k:
        return False
        
    # 2. 檢查趨勢: 昨天弱勢 (黑K 或 下跌)
    # 昨天收 < 開 (黑K) 或 昨天收 < 前天收 (下跌)
    prev_day = history[-3]
    was_weak_yesterday = yesterday['close'] < yesterday['open'] or yesterday['close'] < prev_day['close']
    
    if not was_weak_yesterday:
        return False
        
    # 3. 檢查量能: > 1.5倍 5日均量
    # 取前5天 (不含今天)
    past_5_days = history[-6:-1]
    avg_volume = sum(d['volume'] for d in past_5_days) / 5
    
    if avg_volume == 0: return False
    
    is_volume_spike = today['volume'] > (avg_volume * 1.5)
    
    return is_volume_spike

# 5. 批次下載股票數據
def download_stock_batch(symbols: List[str], use_cache: bool = True):
    """批次下載股票數據，支援快取"""
    cache_key = ",".join(sorted(symbols))
    
    # 檢查快取
    if use_cache and cache_key in _cache:
        cache_time = _cache_timestamp.get(cache_key)
        if cache_time and (datetime.now() - cache_time).seconds < CACHE_DURATION:
            print(f"Using cached data for {len(symbols)} stocks")
            return _cache[cache_key]
    
    # 下載數據
    print(f"Downloading data for {len(symbols)} stocks...")
    try:
        data = yf.download(symbols, period="3mo", group_by='ticker', threads=True)
        
        # 更新快取
        _cache[cache_key] = data
        _cache_timestamp[cache_key] = datetime.now()
        
        return data
    except Exception as e:
        print(f"Download error: {e}")
        return pd.DataFrame()

# 6. 處理股票數據
def process_stock_data(stock_info: Dict, data) -> Optional[Dict]:
    symbol = stock_info["id"]
    name = stock_info["name"]
    
    try:
        # 取得單一股票的 DataFrame
        if isinstance(data, pd.DataFrame) and data.empty:
            return None
            
        if len(ALL_STOCKS) == 1 or (isinstance(data.columns, pd.MultiIndex) and len(data.columns.levels[0]) == 1):
             df = data
        else:
            if symbol not in data.columns.levels[0]:
                return None
            df = data[symbol]
        
        # 處理 NaN
        df = df.ffill().bfill()
        
        # 轉換歷史數據
        history = []
        for index, row in df.iterrows():
            try:
                # 確保數值有效
                if pd.isna(row['Open']) or pd.isna(row['Close']):
                    continue
                    
                history.append({
                    "date": index.strftime('%Y-%m-%d'),
                    "open": float(row['Open']),
                    "high": float(row['High']),
                    "low": float(row['Low']),
                    "close": float(row['Close']),
                    "volume": int(row['Volume'])
                })
            except Exception as e:
                continue
                
        if not history:
            return None
            
        # 計算漲跌幅
        last_day = history[-1]
        prev_day = history[-2] if len(history) > 1 else last_day
        change_pct = ((last_day['close'] - prev_day['close']) / prev_day['close']) * 100
        
        return {
            "symbol": symbol,
            "name": name,
            "currentPrice": last_day['close'],
            "changePct": change_pct,
            "history": history
        }
        
    except Exception as e:
        # print(f"Error processing {symbol}: {e}")
        return None

# 7. 原有端點（向下相容）
@app.get("/api/stocks")
def get_stocks():
    """
    獲取所有股票數據（舊版 API，僅回傳前 100 檔）
    """
    # 為了保持相容性，這裡只回傳前 100 檔
    target_stocks = ALL_STOCKS[:100]
    tickers = [s["id"] for s in target_stocks]
    
    data = download_stock_batch(tickers)
    
    results = []
    for stock_info in target_stocks:
        result = process_stock_data(stock_info, data)
        if result:
            results.append(result)
            
    return results

# 8. 新的分頁端點
@app.get("/api/stocks/paginated")
def get_stocks_paginated(
    offset: int = Query(0, ge=0, description="起始位置"),
    limit: int = Query(100, ge=1, le=200, description="每頁數量"),
    search: Optional[str] = Query(None, description="搜尋股票代碼"),
    strategy: Optional[str] = Query(None, description="策略篩選 (例如: first_red_k)"),
    sort: str = Query("symbol", description="排序方式"),
    order: str = Query("asc", description="排序順序 (asc/desc)")
):
    """
    分頁獲取股票資料，支援搜尋、策略篩選和排序
    """
    
    # 1. 搜尋篩選
    filtered_stocks = filter_stocks_by_search(ALL_STOCKS, search)
    
    # 2. 策略篩選 (如果有的話)
    if strategy == "first_red_k":
        # 如果有策略，需要先下載數據才能篩選
        # 這會比較慢，因為要下載所有候選股票的數據
        print(f"Applying strategy: {strategy} to {len(filtered_stocks)} stocks")
        
        tickers = [s["id"] for s in filtered_stocks]
        # 這裡必須下載所有數據才能篩選
        data = download_stock_batch(tickers)
        
        strategy_matched_stocks = []
        
        for stock_info in filtered_stocks:
            result = process_stock_data(stock_info, data)
            if result and result['history']:
                if check_first_red_k(result['history']):
                    # 保留原始 info 結構以便後續排序
                    strategy_matched_stocks.append(stock_info)
        
        filtered_stocks = strategy_matched_stocks
        print(f"Strategy matched: {len(filtered_stocks)} stocks")

    # 3. 排序
    if sort == "symbol":
        filtered_stocks = sorted(
            filtered_stocks, 
            key=lambda x: x["id"], 
            reverse=(order == "desc")
        )
    
    # 4. 計算總數
    total = len(filtered_stocks)
    
    # 5. 分頁切片
    paginated_stocks = filtered_stocks[offset:offset + limit]
    
    # 6. 下載股票數據 (如果是策略篩選過，其實已經下載過了，但為了架構一致性，這裡再處理一次)
    # 優化: 如果已經有數據，可以重用，但這裡為了簡單，再次調用 download_stock_batch (會有快取)
    
    if not paginated_stocks:
        return {
            "total": total,
            "offset": offset,
            "limit": limit,
            "data": []
        }
    
    tickers = [s["id"] for s in paginated_stocks]
    data = download_stock_batch(tickers)
    
    # 7. 處理數據
    results = []
    for stock_info in paginated_stocks:
        result = process_stock_data(stock_info, data)
        if result:
            results.append(result)
    
    return {
        "total": total,
        "offset": offset,
        "limit": limit,
        "data": results
    }

if __name__ == "__main__":
    print(f"Loaded {len(ALL_STOCKS)} Taiwan stocks")
    uvicorn.run(app, host="0.0.0.0", port=8000)
