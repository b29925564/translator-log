# DECISIONS

規劃書沒寫到、或需要詮釋的地方，在這裡一行記一個決策＋理由。依里程碑分段。

## M0 專案骨架

- 專案放在 `translator-log` repo 的 `hum2midi/` 子目錄，有自己的 `package.json` 與 lockfile — 這個 repo 原本是另一個 App（Witimemo），分開才不會互相影響建置與測試。
- TypeScript 用 6.0.x（`~6.0.3`），不用最新的 7.x — `typescript-eslint` 8.72 的 peer dependency 是 `typescript <6.1`，7.x 的原生編譯器沒有 ESLint 需要的 JS API。
- `@playwright/test` 釘在 1.56.1 — 對應開發容器裡預先裝好的 Chromium（chromium-1194），不必再下載瀏覽器；CI 用 `npx playwright install chromium` 裝同一版。
- 測試音檔不進版控，由 Vitest／Playwright 的 globalSetup 每次開跑前重新產生 — 產生器用固定種子，輸出位元完全相同，產生只要幾百毫秒；也保證音檔永遠與產生器程式碼同步。手動產生：`npm run fixtures`。
- 所有測試音檔頭尾各留 0.3 秒 −60 dBFS 白雜訊 — 真實錄音按下空白鍵後總有一小段安靜；7.1 的 noiseFloor（最安靜 10% 幀）也需要它才有意義。
- 測試音檔檔名格式 `<名稱>_44k.wav`／`<名稱>_48k.wav` — 規劃書 13.3 用的是 `scale_c_major_48k.wav`，照這個慣例。
- 「哼聲」音色：諧波振幅 1, 0.5, 0.3, 0.18, 0.1, 0.06，峰值約 −9 dBFS，起音 15 ms、釋音 30 ms — 閉口哼聲以基頻為主、諧波快速衰減。
- `glide` 解讀為「從 C4 開始，200 ms 內線性（以半音計）滑到 G4，然後停在 G4 600 ms」，總長 800 ms。
- `octave_glitch`：A3 長 1.2 秒，在第 0.6–0.63 秒換成 A4（相位連續）。
- `repeated_notes`：E4 連續發聲，四下各 400 ms，之間 100 ms 音量降到 30%（30 ms 升餘弦過渡），相位連續、不中斷。
- `speech_like`：5 個音節，起點間隔 260 ms、每個 200 ms；能量包絡為 sin^0.7 隆起，音高在音節內線性下滑 3 個半音；每個音節前有 35 ms 的 −42 dBFS 氣音（模擬子音）。
- `noise_only`：Paul Kellet 濾波器產生的粉紅雜訊，RMS −30 dBFS，2.5 秒。
- 單元測試用 Vitest 的 node 環境；分析程式是純函式，不需要 DOM。
- ESLint 用 flat config＋`typescript-eslint` recommended（不開 type-aware 規則）— 快，而且型別檢查已經由 `tsc --noEmit` 負責。
- Vite `base: './'` — build 出來的 `dist/` 放在任何子路徑都能開。
- 新增 `.github/workflows/hum2midi.yml`，只在 `hum2midi/**` 有變動時跑 lint、typecheck、單元測試、build、e2e — 里程碑的完成條件是「測試全綠」，讓 CI 自動把關；不影響原本 Witimemo 的部署流程。
