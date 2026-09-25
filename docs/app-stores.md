# 上架 App Store 與 Google Play

記譯是 PWA（可安裝的網頁 App）。它可以直接從瀏覽器安裝，也可以包裝成原生 App 上架商店。以下是實際可行的做法與需要準備的東西。

## 事前準備

1. **部署正式網址**：依 README 的「部署」啟用 GitHub Pages，或部署到自己的網域（建議使用自己的網域，日後搬家不影響已安裝的使用者）。
2. **開發者帳號**：
   - Google Play Console：一次性註冊費 US$25。
   - Apple Developer Program：每年 US$99。
3. **隱私權政策網址**：兩個商店都要求。記譯沒有後端、不蒐集資料，可以直接改寫 README 的「隱私」段落放在網站上。

## Google Play（Trusted Web Activity）

1. 打開 <https://www.pwabuilder.com>，輸入部署後的網址。PWABuilder 會讀取 manifest，記譯的圖示、可遮罩圖示、截圖、捷徑與分享目標都已設定好。
2. 選 **Android → Generate package**，套件名稱例如 `app.witimemo.twa`。
3. 下載產生的 `.aab` 與 `assetlinks.json`。
4. 把 `assetlinks.json` 放到網站的 `/.well-known/assetlinks.json`（放進 `public/.well-known/` 後重新部署）。這一步讓 App 以全螢幕顯示，不會出現網址列。
5. 在 Play Console 建立 App，上傳 `.aab`，填寫商店資訊（可以直接用 `docs/screenshots/` 裡的截圖）並送審。

## App Store（iOS）

1. 在 PWABuilder 選 **iOS → Generate package**，下載 Xcode 專案。
2. 需要一台 Mac 與 Xcode：開啟專案、設定 Bundle ID 與簽署團隊，在模擬器與實機測試。
3. Apple 審核會看 App 是否「只是包一個網站」。記譯的離線運作、計時器、專注模式、年度回顧與原生分享都有幫助；建議在送審說明中強調這些功能都可離線使用、資料只存在裝置上。
4. 用 Xcode 的 **Product → Archive** 上傳到 App Store Connect，填寫資訊後送審。

## 替代方案：Capacitor

若之後需要更深入的原生功能（例如桌面小工具、原生通知排程），可以改用 [Capacitor](https://capacitorjs.com)：`npm i @capacitor/core @capacitor/cli`、`npx cap init`、`npx cap add ios android`，再把 `dist/` 當作 web 資源。這條路需要自己維護原生專案，適合確定要長期經營商店版本時再採用。

## 老實說

上架只是開始；能不能登上排行榜取決於商店頁面、評價、口碑與持續更新。記譯已經把「第一眼的印象」與「每天打開的理由」做好了，商店版本可以直接沿用同一套程式碼，網頁版的每次更新也會自動反映在 TWA 版本上。
