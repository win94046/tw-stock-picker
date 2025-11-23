<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Strategy Pro - TW Stock Picker

這是一個結合 Python 後端與 React 前端的台股策略選股工具。

## 執行方式 (Run Locally)

本專案包含兩個部分，需要分別啟動：

### 1. 啟動後端 (Backend)

後端負責從 Yahoo Finance 抓取數據。

**需求:** Python 3.8+

1. 安裝依賴套件:
   ```bash
   pip install -r requirements.txt
   ```
   (如果使用 Windows 且 `pip` 無法執行，請嘗試 `py -m pip install -r requirements.txt`)

2. 啟動伺服器:
   ```bash
   python server.py
   ```
   (或 `py server.py`)

   成功後會看到: `Uvicorn running on http://0.0.0.0:8000`

### 2. 啟動前端 (Frontend)

前端負責顯示介面與圖表。

**需求:** Node.js

1. 安裝依賴套件:
   ```bash
   npm install
   ```

2. 啟動開發伺服器:
   ```bash
   npm run dev
   ```

3. 開啟瀏覽器訪問顯示的網址 (通常是 `http://localhost:5173`)。

## 注意事項

- 請確保後端 (Port 8000) 與前端同時執行，否則前端會顯示無法連接伺服器的錯誤 (或自動切換為 Demo 模式)。
