import math
import uvicorn
import yfinance as yf
import pandas as pd
from fastapi import FastAPI
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

# 股票清單
STOCKS = [
    {"id": "2330.TW", "name": "台積電"},
    {"id": "2317.TW", "name": "鴻海"},
    {"id": "2454.TW", "name": "聯發科"},
    {"id": "2308.TW", "name": "台達電"},
    {"id": "2303.TW", "name": "聯電"},
]

# 2. 清洗 NaN 的輔助函式
def clean_float(val):
    if pd.isna(val) or math.isnan(val) or math.isinf(val):
        return 0.0
    return float(val)

@app.get("/api/stocks")
def get_stocks():
    # 準備代碼列表
    tickers = [s["id"] for s in STOCKS]
    
    # 3. 批量下載數據
    # group_by='ticker' 確保結構為 (股票代碼) -> (Open, High, Low...)
    data = yf.download(tickers, period="3mo", group_by='ticker', threads=True)
    
    results = []
    
    for stock_info in STOCKS:
        symbol = stock_info["id"]
        name = stock_info["name"]
        
        try:
            # 取得單一股票的 DataFrame
            # 注意: yfinance 批量下載時，如果該股票沒資料，可能會拋出 KeyError 或回傳空 DataFrame
            if symbol not in data.columns.levels[0]:
                 print(f"No data found for {symbol}")
                 continue

            df = data[symbol]
            
            if df.empty:
                continue

            # 4. 轉換歷史數據 (OHLCV)
            history = []
            for index, row in df.iterrows():
                # 確保所有數值都不是 NaN
                record = {
                    "date": index.strftime('%Y-%m-%d'),
                    "open": clean_float(row.get('Open', 0)),
                    "high": clean_float(row.get('High', 0)),
                    "low": clean_float(row.get('Low', 0)),
                    "close": clean_float(row.get('Close', 0)),
                    "volume": clean_float(row.get('Volume', 0))
                }
                history.append(record)
            
            # 5. 計算漲跌幅與現價
            if len(history) >= 2:
                last_day = history[-1]
                prev_day = history[-2]
                current_price = last_day['close']
                
                # 避免分母為 0
                prev_close = prev_day['close'] if prev_day['close'] != 0 else 1 
                change_pct = ((current_price - prev_close) / prev_close) * 100
            else:
                current_price = history[-1]['close'] if history else 0
                change_pct = 0.0

            # 移除 .TW 後綴以便前端顯示整潔 (可選)
            display_symbol = symbol.replace('.TW', '')

            results.append({
                "symbol": display_symbol,
                "name": name,
                "currentPrice": current_price,
                "changePct": change_pct,
                "history": history
            })
            
        except Exception as e:
            print(f"Error processing {symbol}: {e}")
            continue

    return results

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
