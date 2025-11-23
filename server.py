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
    data = yf.download(symbols, period="3mo", group_by='ticker', threads=True)
    
    # 更新快取
    _cache[cache_key] = data
    _cache_timestamp[cache_key] = datetime.now()
    
    return data

# 6. 處理股票數據
def process_stock_data(stock_info: Dict, data) -> Optional[Dict]:
    """處理單一股票的數據"""
    symbol = stock_info["id"]
    name = stock_info["name"]
    
    try:
        # 取得單一股票的 DataFrame
        if len(ALL_STOCKS) == 1:
            df = data
        else:
            if symbol not in data.columns.levels[0]:
                return None
            df = data[symbol]
        
        if df.empty:
            return None

        # 轉換歷史數據 (OHLCV)
        history = []
        for index, row in df.iterrows():
            record = {
                "date": index.strftime('%Y-%m-%d'),
                "open": clean_float(row.get('Open', 0)),
                "high": clean_float(row.get('High', 0)),
                "low": clean_float(row.get('Low', 0)),
                "close": clean_float(row.get('Close', 0)),
                "volume": clean_float(row.get('Volume', 0))
            }
            history.append(record)
        
        # 計算漲跌幅與現價
        if len(history) >= 2:
            last_day = history[-1]
            prev_day = history[-2]
            current_price = last_day['close']
            
            prev_close = prev_day['close'] if prev_day['close'] != 0 else 1
            change_pct = ((current_price - prev_close) / prev_close) * 100
        else:
            current_price = history[-1]['close'] if history else 0
            change_pct = 0.0

        display_symbol = symbol.replace('.TW', '')

        return {
            "symbol": display_symbol,
            "name": name,
            "currentPrice": current_price,
            "changePct": change_pct,
            "history": history
        }
        
    except Exception as e:
        print(f"Error processing {symbol}: {e}")
        return None

# 7. 原有端點（向下相容）
@app.get("/api/stocks")
def get_stocks():
    """原有端點，返回前5支股票（向下相容）"""
    # 使用前5支股票
    stock_subset = ALL_STOCKS[:5]
    tickers = [s["id"] for s in stock_subset]
    
    data = download_stock_batch(tickers)
    
    results = []
    for stock_info in stock_subset:
        result = process_stock_data(stock_info, data)
        if result:
            results.append(result)

    return results

# 8. 新增分頁端點
@app.get("/api/stocks/paginated")
def get_stocks_paginated(
    offset: int = Query(0, ge=0, description="起始位置"),
    limit: int = Query(100, ge=1, le=200, description="每頁數量"),
    search: Optional[str] = Query(None, description="搜尋股票代碼"),
    sort: str = Query("symbol", description="排序方式"),
    order: str = Query("asc", description="排序順序 (asc/desc)")
):
    """
    分頁獲取股票資料，支援搜尋和排序
    
    參數:
    - offset: 起始位置（預設0）
    - limit: 每頁數量（預設100，最大200）
    - search: 搜尋關鍵字（模糊搜尋股票代碼）
    - sort: 排序方式（symbol）
    - order: 排序順序（asc/desc）
    """
    
    # 1. 搜尋篩選
    filtered_stocks = filter_stocks_by_search(ALL_STOCKS, search)
    
    # 2. 排序
    if sort == "symbol":
        filtered_stocks = sorted(
            filtered_stocks, 
            key=lambda x: x["id"], 
            reverse=(order == "desc")
        )
    
    # 3. 計算總數
    total = len(filtered_stocks)
    
    # 4. 分頁切片
    paginated_stocks = filtered_stocks[offset:offset + limit]
    
    # 5. 下載股票數據
    if not paginated_stocks:
        return {
            "total": total,
            "offset": offset,
            "limit": limit,
            "data": []
        }
    
    tickers = [s["id"] for s in paginated_stocks]
    data = download_stock_batch(tickers)
    
    # 6. 處理數據
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

