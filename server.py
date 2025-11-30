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
        # print(f"Fail Strong Red K: {body_pct:.4f}")
        return False
        
    # 2. 檢查趨勢: 昨天弱勢 (黑K 或 下跌)
    # 昨天收 < 開 (黑K) 或 昨天收 < 前天收 (下跌)
    prev_day = history[-3]
    was_weak_yesterday = yesterday['close'] < yesterday['open'] or yesterday['close'] < prev_day['close']
    
    if not was_weak_yesterday:
        # print(f"Fail Weak Yesterday")
        return False
        
    # 3. 檢查量能: > 1.5倍 5日均量
    # 取前5天 (不含今天)
    past_5_days = history[-6:-1]
    avg_volume = sum(d['volume'] for d in past_5_days) / 5
    
    if avg_volume == 0: return False
    
    is_volume_spike = today['volume'] > (avg_volume * 1.5)
    
    if not is_volume_spike:
        # print(f"Fail Volume Spike: Vol={today['volume']}, Avg={avg_volume}")
        return False
    
    return True

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

import random

# ... (existing imports)

# 模擬數據生成器
def generate_mock_data(count: int = 200) -> List[Dict]:
    """生成模擬股票數據，包含符合策略的股票"""
    # 設定種子以確保每次生成的數據一致 (避免隨機產生符合策略的股票)
    random.seed(42)
    
    mock_stocks = []
    today = datetime.now()
    
    for i in range(count):
        symbol = f"MOCK{i+1:03d}"
        name = f"模擬股票{i+1}"
        
        # 建立 60 天歷史數據
        history = []
        price = 100.0
        
        # 決定這支股票是否要符合「第一根紅K」策略
        # 設定前 3 支股票符合策略
        is_target = i < 3 or 100 < i < 103
        
        for day in range(60, 0, -1):
            date = (today - timedelta(days=day)).strftime('%Y-%m-%d')
            
            # 隨機波動
            change = (random.random() - 0.5) * 4
            
            # 如果是目標股票的最後幾天，強制設定型態
            if is_target:
                if day == 1: # 今天: 強勢紅K + 爆量
                    # 開盤 = 昨收
                    open_price = price
                    # 收盤 > 開盤 3%
                    close_price = open_price * 1.03
                    high_price = close_price * 1.01
                    low_price = open_price
                    # 爆量 (5000張)
                    volume = 5000
                elif day == 2: # 昨天: 黑K 或 下跌
                    # 昨收 < 昨開 (黑K)
                    open_price = price
                    close_price = open_price * 0.98
                    high_price = open_price
                    low_price = close_price
                    volume = 1000
                elif day <= 7: # 前幾天: 量縮整理
                    open_price = price
                    close_price = price * (1 + (random.random() - 0.5) * 0.02)
                    high_price = max(open_price, close_price)
                    low_price = min(open_price, close_price)
                    volume = 1000 # 均量約 1000
                elif 100 < day < 103:
                    # 開盤 = 昨收
                    open_price = price
                    # 收盤 > 開盤 3%
                    close_price = open_price * 1.03
                    high_price = close_price * 1.01
                    low_price = open_price
                    # 爆量 (5000張)
                    volume = 5000
                else:
                    open_price = price
                    close_price = price + change
                    high_price = max(open_price, close_price) + random.random()
                    low_price = min(open_price, close_price) - random.random()
                    volume = random.randint(500, 2000)
            else:
                # 一般隨機股票
                open_price = price
                close_price = price + change
                high_price = max(open_price, close_price) + random.random()
                low_price = min(open_price, close_price) - random.random()
                volume = random.randint(500, 2000)
            
            history.append({
                "date": date,
                "open": round(open_price, 2),
                "high": round(high_price, 2),
                "low": round(low_price, 2),
                "close": round(close_price, 2),
                "volume": int(volume)
            })
            
            price = close_price

        # 計算漲跌幅
        last_day = history[-1]
        prev_day = history[-2]
        change_pct = ((last_day['close'] - prev_day['close']) / prev_day['close']) * 100
        
        mock_stocks.append({
            "symbol": symbol,
            "name": name,
            "currentPrice": last_day['close'],
            "changePct": change_pct,
            "history": history,
            "id": symbol # 為了相容性
        })
        
    return mock_stocks

# ... (existing code)

# 8. 新的分頁端點
@app.get("/api/stocks/paginated")
def get_stocks_paginated(
    offset: int = Query(0, ge=0, description="起始位置"),
    limit: int = Query(100, ge=1, le=200, description="每頁數量"),
    search: Optional[str] = Query(None, description="搜尋股票代碼"),
    strategy: Optional[str] = Query(None, description="策略篩選 (例如: first_red_k)"),
    sort: str = Query("symbol", description="排序方式"),
    order: str = Query("asc", description="排序順序 (asc/desc)"),
    mock: bool = Query(False, description="是否使用模擬數據")
):
    """
    分頁獲取股票資料，支援搜尋、策略篩選和排序
    """
    
    # 決定資料來源
    if mock:
        # 使用模擬數據 (已經包含完整 history)
        source_stocks = generate_mock_data(200)
        # 模擬數據不需要 filter_stocks_by_search 的 id 結構，但為了共用邏輯...
        # 這裡直接在 generate_mock_data 裡回傳完整結構
    else:
        source_stocks = ALL_STOCKS

    # 1. 搜尋篩選
    if mock:
        # 針對模擬數據的搜尋
        if search:
            search = search.upper()
            filtered_stocks = [s for s in source_stocks if search in s["symbol"] or search in s["name"]]
        else:
            filtered_stocks = source_stocks
    else:
        filtered_stocks = filter_stocks_by_search(source_stocks, search)
    
    # 2. 策略篩選
    if strategy == "first_red_k":
        print(f"Applying strategy: {strategy} to {len(filtered_stocks)} stocks (Mock: {mock})")
        
        strategy_matched_stocks = []
        
        if mock:
            # 模擬數據已經有 history，直接篩選
            for stock in filtered_stocks:
                if check_first_red_k(stock['history']):
                    strategy_matched_stocks.append(stock)
        else:
            # 真實數據需要下載
            tickers = [s["id"] for s in filtered_stocks]
            data = download_stock_batch(tickers)
            
            for stock_info in filtered_stocks:
                result = process_stock_data(stock_info, data)
                if result and result['history']:
                    if check_first_red_k(result['history']):
                        strategy_matched_stocks.append(stock_info)
        
        filtered_stocks = strategy_matched_stocks
        print(f"Strategy matched: {len(filtered_stocks)} stocks")

    # 3. 排序
    if sort == "symbol":
        filtered_stocks = sorted(
            filtered_stocks, 
            key=lambda x: x["symbol"] if mock else x["id"], 
            reverse=(order == "desc")
        )
    
    # 4. 計算總數
    total = len(filtered_stocks)
    
    # 5. 分頁切片
    paginated_stocks = filtered_stocks[offset:offset + limit]
    
    # 6. 準備回傳數據
    if mock:
        # 模擬數據已經是完整格式
        results = paginated_stocks
    else:
        # 真實數據需要下載和處理 (如果還沒做過)
        if not paginated_stocks:
             return {
                "total": total,
                "offset": offset,
                "limit": limit,
                "data": []
            }
            
        tickers = [s["id"] for s in paginated_stocks]
        data = download_stock_batch(tickers)
        
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
