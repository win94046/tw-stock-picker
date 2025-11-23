# Python Backend Server 設計指南 (server.py)

本文件說明如何建立 `server.py`，這是本專案的後端核心，負責從 Yahoo Finance 抓取台股數據並提供 API 給 React 前端使用。

## 1. 核心依賴 (Dependencies)

程式開頭需導入以下套件：
- **FastAPI**: 建立 Web API 伺服器。
- **Uvicorn**: 用於執行 FastAPI 的 ASGI 伺服器。
- **yfinance**: 抓取股市數據。
- **pandas**: 處理數據表格 (DataFrame)。
- **CORSMiddleware**: 解決前端 (Port 3000) 呼叫後端 (Port 8000) 的跨域問題。
- **math**: 用於檢查 NaN (非數值)。

## 2. 核心函式與邏輯說明

`server.py` 應包含以下主要區塊與功能：

### A. CORS 設定 (Middleware)
**功能**：允許瀏覽器接受來自不同來源的資源。
**實作**：
必須設定 `allow_origins=["*"]` (或指定前端網址)，否則 React 會報錯 "Failed to fetch"。

### B. 數據清洗函式: `clean_float(value)`
**目的**：解決 JSON 標準不支援 `NaN` (Not a Number) 的問題。
**邏輯**：
1. 接收一個數值。
2. 檢查是否為 `NaN` (使用 `math.isnan` 或 `pandas.isna`)。
3. 如果是 `NaN`，回傳 `None` 或 `0`。
4. 如果是無限大 (`inf`)，回傳 `0`。
5. 否則回傳原始數值。

### C. 股票清單定義
**內容**：定義要抓取的股票代碼列表 (需加上 `.TW` 後綴)。
**範例**：
```python
STOCKS = [
    {"id": "2330.TW", "name": "台積電"},
    {"id": "2317.TW", "name": "鴻海"},
    # ... 其他股票
]
```

### D. API 端點: `GET /api/stocks`
這是前端呼叫的唯一接口。

**執行步驟**：

1.  **提取代碼**：從 `STOCKS` 列表中取出所有 ID (如 `['2330.TW', '2317.TW'...]`)。
2.  **批量下載 (Batch Download)**：
    *   呼叫 `yf.download(tickers=ids, period="3mo", group_by='ticker', threads=True)`。
    *   **關鍵設定**：`group_by='ticker'` 是必須的，這樣回傳的 DataFrame 結構才會是 `(股票代碼) -> (Open, High, Low...)` 的階層，方便後續遍歷。
3.  **遍歷處理**：
    *   使用迴圈針對每一檔股票進行資料處理。
    *   **容錯**：如果某檔股票下載失敗 (DataFrame 為空)，應 `continue` 跳過，不要讓整個 API 崩潰。
4.  **格式轉換 (DataFrame to JSON)**：
    *   將 Pandas DataFrame 的每一列 (Row) 轉換為前端需要的格式：
        ```json
        {
          "date": "2023-10-01",
          "open": 500.0,
          "high": 505.0,
          "low": 495.0,
          "close": 502.0,
          "volume": 10000000
        }
        ```
    *   **注意**：日期需轉為字串 (ISO Format `YYYY-MM-DD`)。
5.  **計算統計數據**：
    *   `currentPrice`: 取最後一筆的 `Close`。
    *   `changePct`: 計算 (今日收盤 - 昨日收盤) / 昨日收盤 * 100。
6.  **回傳結果**：
    *   回傳一個 List，包含所有處理好的股票物件。

## 3. 完整程式碼結構範例 (供參考)

在您自行撰寫 `server.py` 時，結構應如下所示：

```python
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
    # ...
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
    data = yf.download(tickers, period="3mo", group_by='ticker', threads=True)
    
    results = []
    
    for stock_info in STOCKS:
        symbol = stock_info["id"]
        name = stock_info["name"]
        
        try:
            # 取得單一股票的 DataFrame
            # 注意: yfinance 批量下載時，如果該股票沒資料，可能會拋出 KeyError
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
```

## 4. 啟動方式

建立檔案後，在終端機執行：

```bash
python server.py
```

確認出現 `Uvicorn running on http://0.0.0.0:8000` 即代表服務啟動成功。
