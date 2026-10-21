# hum2midi · 哼歌變 MIDI

打開網頁、按空白鍵哼一段，自動轉成音符，一鍵輸出 `.mid` 拖進 GarageBand。純前端，音訊不離開你的電腦。

完整規格見規劃書；實作時的決策記在 [`DECISIONS.md`](DECISIONS.md)。

## 開發

```sh
cd hum2midi
npm install
npm run dev        # http://localhost:5173 （麥克風只能在 localhost 或 https 下使用）
```

| 指令 | 用途 |
|---|---|
| `npm test` | 單元測試（Vitest），開跑前會自動產生測試音檔 |
| `npm run e2e` | 端對端測試（Playwright＋Chromium 假麥克風） |
| `npm run lint` / `npm run typecheck` | ESLint／TypeScript |
| `npm run fixtures` | 只產生測試音檔到 `tests/fixtures/` |
| `npm run build` | 建置到 `dist/` |

## 進度

- [x] M0 專案骨架、測試音檔
- [x] M1 離線分析管線
- [x] M2 匯出 MIDI／WAV
- [x] M3 錄音＋即時顯示＋鋼琴捲軸（唯讀）
- [x] M4 量化、調性、編輯、播放、復原
- [ ] M5 Takes 庫
- [ ] M6 隱藏模式：說話變唱歌
- [ ] M7 打磨與人工驗收
