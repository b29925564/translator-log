# hum2midi · 哼歌變 MIDI

打開網頁、按空白鍵哼一段，自動轉成音符，一鍵輸出 `.mid` 拖進 GarageBand。
隱藏模式「說話變唱歌」：把一句話原封不動循環播放，直到它聽起來像在唱歌，再自動抽出旋律、配上和弦。

純前端、無帳號，音訊不離開你的電腦。實作時的決策記在 [`DECISIONS.md`](DECISIONS.md)；需要真機的驗收項目在 [`MANUAL-QA.md`](MANUAL-QA.md)。

## 開發

```sh
cd hum2midi
npm install
npm run dev        # http://localhost:5173 （麥克風只能在 localhost 或 https 下使用）
```

| 指令 | 用途 |
|---|---|
| `npm test` | 單元測試（Vitest），開跑前自動產生測試音檔 |
| `npm run e2e` | 端對端測試（Playwright＋Chromium 假麥克風；含正式 build 與 axe 無障礙檢查） |
| `npm run lint` / `npm run typecheck` | ESLint／TypeScript |
| `npm run fixtures` | 只產生測試音檔到 `tests/fixtures/` |
| `npm run build` | 建置到 `dist/`（相對路徑，放在任何子路徑都能開） |

## 功能

- **錄音**：空白鍵開始／停止；關掉瀏覽器的降噪、自動增益與回音消除；可選節拍器（1 小節預備拍、延遲補償）；最長 3 分鐘；即時音高曲線＋調音器。
- **離線分析**（Web Worker，結果可重現）：pitchy 逐幀音高 → 中位數濾波與八度修正 → 圓形平均的整體調音偏移 → 哼唱音符切分（hysteresis、同音重複起音、最短 80 ms）→ 調性偵測（Krumhansl–Kessler）→ 吸附音階（選用）→ 量化（有 BPM 時）。30 秒錄音改設定後重新分析約 10 ms。
- **編輯**：鋼琴捲軸拖曳改音高與位置、拖右緣改長度、Delete、雙擊新增、↑↓ 半音、←→ 切換、⌘Z／⇧⌘Z；原始音高曲線畫在音符後面；右側設定改了立即重新分析（覆蓋手動編輯前會先確認）。
- **播放**：原音／合成音／兩者，各自音量，播放頭跟著走，點時間尺從該處開始。
- **匯出**：`.mid`（tempo＋4/4，沒有 BPM 時寫 120、時間保持原樣）、`.wav`（16-bit 單聲道）。
- **Takes 庫**：每次錄音自動存進 IndexedDB，編輯也自動存；分頁列表、迷你縮圖、改名、複製、刪除。
- **說話變唱歌**（錄音頁連點 logo 三下或按 `⇧S`）：錄一句話或從庫裡框選 → 完全相同地循環播放＋5 級自評曲線 → 揭曉旋律（能量包絡切音節、誇張化、推算 BPM）→ Viterbi 配和弦、voice leading、長音／分解和弦、鼓組 → 匯出 Melody／Chords／Drums 三軌 MIDI。

## 快捷鍵

| 範圍 | 按鍵 |
|---|---|
| 全域 | `⌘1` `⌘2` `⌘3`（`⌘4` 隱藏模式）切換頁面；瀏覽器若保留了這組，直接按 `1`–`4`。`?` 說明卡。`⇧S` 說話變唱歌 |
| 錄音頁 | `Space` 開始／停止錄音（預備拍中再按 = 取消） |
| 編輯頁 | `Space` 播放／停止、`Enter` 匯出 MIDI、`Delete` 刪除、`↑` `↓` 半音、`←` `→` 切換選取、`⌘Z` `⇧⌘Z` 復原／重做、`Esc` 取消選取 |
| 說話變唱歌 | `←` `→` 翻頁、`Space` 錄音／循環／播放、`1`–`5` 評分 |

## 專案結構

```
src/
  analysis/   純函式分析管線（Worker 與 Vitest 共用）：pitch-track, smoothing, tuning, segment-hum,
              segment-speech, quantize, key, harmonize, pipeline, speech, analyzer, worker, client
  audio/      錄音（AudioWorklet）、即時音高、節拍器、合成器、播放、循環播放、WAV、修剪靜音
  midi/       MIDI 匯出（@tonejs/midi）
  store/      Takes 庫（IndexedDB）
  app/        狀態、錄音流程、session、自動儲存、編輯操作與復原
  ui/         各頁面、鋼琴捲軸、波形、對話框、說明卡
scripts/gen-test-audio.ts   產生合成測試音檔（固定種子）
tests/unit, tests/e2e
```

## 進度

- [x] M0 專案骨架、測試音檔
- [x] M1 離線分析管線
- [x] M2 匯出 MIDI／WAV
- [x] M3 錄音＋即時顯示＋鋼琴捲軸（唯讀）
- [x] M4 量化、調性、編輯、播放、復原
- [x] M5 Takes 庫
- [x] M6 隱藏模式：說話變唱歌
- [ ] M7 打磨：視覺、說明卡、快捷鍵、無障礙已完成；**13.4 人工驗收（真的 Mac、Safari、GarageBand 實測）待做** → [`MANUAL-QA.md`](MANUAL-QA.md)
