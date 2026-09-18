# 多店商品叫貨管理系統（stockflow-web-pro）

## 專案概述
- **目標**：提供連鎖門市叫貨、主檔、庫存、通知、報表與 ERP 串接的一站式平台。
- **技術棧**：React 18 + Vite + TypeScript、Firebase（Auth / Firestore / Functions / Hosting）、Tailwind CSS、i18next、PWA。
- **目前狀態**：✅ 主要功能已完成，可進行整體流程測試。

## 目前已完成功能
1. **帳號與權限**
   - Firebase Email/Password 登入登出
   - 角色：`admin` / `manager` / `staff`
   - Protected Route 保護機制

2. **多語系**
   - `zh-TW`、`zh-CN`、`en`、`ja`、`ko`、`vi`、`th`、`id`

3. **主檔管理**
   - 商品（含分類、供應商、價格、安全庫存、啟用狀態）
   - 分店
   - 供應商
   - 分類（於設定頁）
   - 使用者資料維護（角色/分店/啟停）

4. **叫貨單完整流程（多品項）**
   - 建立草稿、編輯草稿
   - 狀態流轉：
     - `draft -> submitted -> approved -> shipped -> received -> closed`
     - `submitted -> rejected`
   - 收貨時自動入庫與異動紀錄

5. **庫存管理**
   - 庫存台帳（`storeId_productId`）
   - 手動異動（正負調整）
   - 異動紀錄（stockMovements）
   - 低庫存偵測

6. **通知中心**
   - 類型篩選、只看未讀、全部標示已讀
   - 管理員可發布廣播通知
   - 低庫存/送審/核准事件通知

7. **報表分析**
   - 訂單狀態總覽、總金額、ERP 同步結果、低庫存清單
   - 近 14 天趨勢圖（條形視覺化）
   - CSV 匯出（叫貨單 / 低庫存）

8. **ERP 串接（Firebase Functions）**
   - `syncOrderToERP`：單筆訂單 POST Webhook 推送
   - `importERPOrders`：由設定 URL GET 匯入 ERP 訂單
   - 同步紀錄寫入 `erpSyncLogs`

## 功能入口 URI
- `/login`：登入
- `/dashboard`：首頁統計
- `/orders`：叫貨單
- `/products`：商品管理
- `/stores`：分店管理
- `/suppliers`：供應商管理
- `/inventory`：庫存管理
- `/reports`：報表分析（含匯出）
- `/notifications`：通知中心
- `/users`：使用者管理（admin）
- `/settings`：系統設定（admin）

## 資料架構
- **Firestore 集合**：
  - `users`, `products`, `categories`, `suppliers`, `stores`
  - `orders`, `inventory`, `stockMovements`
  - `notifications`, `settings`, `erpSyncLogs`
- **訂單狀態**：`draft`、`submitted`、`approved`、`rejected`、`shipped`、`received`、`closed`

## 尚未完成 / 可再擴充
1. 圖表元件化（如 Chart.js）與更多維度圖表
2. PDF/Excel 匯出
3. ERP 匯入欄位對照 UI 與錯誤批次重試
4. 自動排程任務（目前為事件觸發 / 手動觸發）
5. E2E 測試（Playwright）

## 開發與測試
1. 前端安裝：`npm install`
2. 函式安裝：`cd functions && npm install`
3. 設定 `.env`
4. 前端 build：`npm run build`
5. 函式 build：`cd functions && npm run build`
6. 本地 smoke test：`npm run preview -- --host 0.0.0.0 --port 3000`

## 部署
- 前端：`npm run deploy`
- 函式：`cd functions && npm run deploy`
- GitHub Actions：`.github/workflows/firebase-deploy.yml`（若使用 GitHub App，需有 workflows 權限）
