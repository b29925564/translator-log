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

## M1 離線分析管線

- 幀時間 `t` 取分析窗中心（`(i·hop + 1024) / sampleRate`）— 實測起音誤差在 ±10 ms 內，不需要再補償。
- 音高追蹤拆成兩段：`trackRaw`（只跟音訊有關，跑 pitchy）與 `applyVoicing`（套用靈敏度）— 原始結果可快取，改設定後重新分析 30 秒錄音只要約 10 ms（規格目標 < 200 ms）；首次分析約 0.5 秒（開發容器、Node）。
- RMS 低於「最高靈敏度也不可能過門檻」（noiseFloor × 2）的幀不跑 pitchy，hz／clarity 記為 0 — 錄音裡的停頓不必算音高，首次分析快一倍以上。
- 靈敏度 0–1 對應：k = 5 − 3·s（5 → 2）；clarity 門檻在 s ≤ 0.5 時維持規格的 0.88，s > 0.5 才線性放寬到 0.80 — 預設值完全照規格，第 15 節「必要時降到 0.8」交給滑桿。預設靈敏度 0.5（k = 3.5）。
- noiseFloor 下限 3e-5（約 −90 dBFS）— 數位全靜音時底噪會是 0，任何微小聲音都會過門檻。
- pitchy 的 `clarityThreshold`（MPM 論文的 k，用來挑第一個夠高的峰）維持預設 0.9 — 它不是有聲門檻；有聲判定用回傳的 clarity 另外做。
- 7.2 順序照規格：先 5 幀中位數濾波、再修八度。八度修正的「前後兩側」可以跨過 ≤ 3 幀的無聲（偵測器在八度跳動處常會掉幾幀）。
- 合成的 `octave_glitch`（30 ms A4）實際上不會讓 MPM 產生八度錯誤（43 ms 分析窗內 A3 的週期仍然最強），所以另外用合成音高曲線對八度修正做單元測試。
- 調音偏移先在每段有聲區間內做 19 幀（約 190 ms）移動平均再算圓形平均 — 直接用逐幀音高時，±50 cents 的顫音會讓圓形平均指向 ±50 cents（實測 `vibrato` 得到 +47 cents）。合成向量長度 < 0.1（偏差幾乎均勻分散）時視為無法判斷，回傳 0。
- 哼唱切分的 hysteresis 加上「穩定」條件：連續 ≥ 6 幀偏離 running median 超過 θ，**而且最近 6 幀自己的範圍 ≤ θ** 才切 — 否則 200 ms 的滑音會被切成好幾個 60–90 ms 的碎音符；滑音途中先不切，等落到新音高再一次切開，切點放在第一個偏離的幀（滑進來的部分算新音符的頭）。新音符的 running median 只用穩定下來的那 6 幀起算。
- running median 只看目前音符最近 100 幀（1 秒）— 長音不會越算越慢；也讓長音裡緩慢的音準漂移不會被切開。
- 切分敏感度 0–1 → θ = 1.0 − 0.5·s（0.5–1.0 半音）；預設 0.6，對應規格的預設 θ = 0.7。
- 同音重複起音：「局部峰值」= 這個音符開始以來的最大 RMS；前一個音結束在 RMS 掉到 55% 以下的第一幀，新音符從谷底之後能量開始回升（> 谷底 × 1.25）的那一幀開始 — 音符長度比較接近實際唱的長度（中間的谷不算任何一個音）。
- 有聲區間之間 < 40 ms 的無聲先補起來再切分（內插只用來判斷，不拿去算音高）— 偵測器在長音中間掉一兩幀不會把一個音切成兩個；如果中間音量真的掉下去，重複起音規則會負責切開。
- 「最短 80 ms」：短音併入「相鄰」（間隙 < 40 ms）且音高較接近的音符；前後都有停頓的孤立短音直接刪除；從最短的開始處理，直到沒有短音。
- 「間隙 < 40 ms 就補連」：前一個音延長到下一個音的起點（legato），不合併成一個音。
- 音符 id 用 `n0, n1…`（依時間順序）— 同一段錄音、同一組設定 → 結果完全相同，包括 id。
- `AnalysisSettings.quantize` 的預設是開啟、1/16、75% — 但規格 7.5 說只有在有 BPM 時才量化，所以沒有 BPM 時這個設定不生效（M4 實作）。
- Worker 快取最近 4 段錄音的原始音高追蹤（LRU）；主執行緒的 `AnalysisClient` 第一次送音訊、之後只送設定，快取被擠掉時自動重送。
- 新增 `src/analysis/pipeline.ts`（串起整條管線）與 `analyzer.ts`（Worker 內的快取服務）— 規劃書的檔案清單沒有，但讓 Vitest 能不透過 Worker 直接測完整管線。

## M2 匯出

- ⚠️ 實測確認（`tests/unit/midi.test.ts`）：`@tonejs/midi` 2.0.28 用 `header.setTempo(bpm)` 設速度；拍號是往 `header.timeSignatures` push `{ ticks: 0, timeSignature: [4, 4] }` 後呼叫 `header.update()`。兩者都寫進第 0 軌（Type 1 檔，PPQ 480），用 `midi-file` 直接解析確認有 FF 51（tempo）與 FF 58（拍號）meta event。
- 必須先設 tempo 再加音符 — 音符的秒數是用 header 當下的 tempo 換算成 ticks；我們自己用 `secondsToTicks` 算好 `ticks`／`durationTicks` 再加，避免 `time`、`duration` setter 的設定順序問題。
- 力度傳 `(v + 0.5) / 127` — `@tonejs/midi` 寫檔用 `floor(velocity × 127)`，直接傳 `v / 127` 會因浮點誤差偶爾少 1。
- 不寫調號 — `@tonejs/midi` 2.0.28 的 `encodeKeySignature` 把升降記號數寫成「索引 + 7」（C 大調寫成 14、超出 −7…+7），小調也會用錯關係大調；規格沒要求調號，寧可不寫。
- 匯出時同一個音高重疊的音符會截短前一個 — 否則後一個 note-on 之後，前一個的 note-off 會把它提早關掉；長度 0 的音符略過。
- 鼓組軌用 channel index 9（即 General MIDI 的 channel 10），`@tonejs/midi` 會把它標成 percussion。
- 檔名用本地時間 `hum-YYYYMMDD-HHmm.mid`／`.wav`。
- WAV 編碼正值乘 32767、負值乘 32768 並四捨五入，解碼對稱 — 來回誤差最多半格（< 1/32768）。解碼另外支援 8/24/32-bit PCM、32-bit float、多聲道（平均成單聲道）、跳過不認得的區塊，讓使用者丟進來的檔案也能讀。
- 測試直接用 `midi-file` 解析原始位元組，所以把它從間接相依改成明確的 devDependency。

## M3 錄音＋即時顯示＋鋼琴捲軸

- AudioWorklet 用 Vite 的 `?worker&url` 載入 — 這樣 build 時會把 TS 編成獨立的 JS 檔；`new URL('./x.ts', import.meta.url)` 在 build 後不會轉譯 TS。
- Worklet 節點經過一個音量 0 的 GainNode 接到 destination — 確保每個瀏覽器都會持續呼叫 `process()`（沒接到輸出的節點在某些實作會被停掉）。
- Worklet 累積 4096 個樣本才送一次訊息 — 每 128 樣本送一次太頻繁。多聲道輸入平均成單聲道。
- 開節拍器時，收音從「第 1 小節第 1 拍的排程時間 ＋ outputLatency ＋ 手動偏移」那一個 frame 開始 — 錄音的第 0 個樣本就是唱的人聽到的第 1 拍，量化格線從 0 開始，不必另外存偏移。輸入端延遲（麥克風 → 程式）由手動偏移滑桿補。
- `Take.bpm` 改成 `number | null` — 規格的資料模型寫 `number`，但「沒開節拍器、也沒手動設 BPM」需要一個明確的「沒有」；用 0 當特殊值容易誤用。
- 節拍器在錄音期間持續打拍；開節拍器時提示戴耳機（關掉回音消除後，喇叭的拍子聲會被錄進去）。
- 預備拍中再按一次空白鍵（或 Esc）＝ 取消，不產生 take。
- 短於 0.3 秒的錄音當作誤觸，顯示「錄音太短」。
- 錄音中、預備拍中不能切換頁面（頁籤停用）。
- 已經允許過麥克風的話，一進錄音頁就先打開麥克風（即時音高先動起來、按空白鍵不必等權限）；離開錄音頁就關掉麥克風，瀏覽器的錄音指示燈會熄滅。沒有使用者動作前 AudioContext 是暫停的，第一次按鍵或點擊時恢復。
- `⌘1／⌘2／⌘3`（非 Mac 用 Ctrl）切換頁面；瀏覽器可能保留 ⌘＋數字（切換分頁），所以焦點不在輸入框時也接受不加修飾鍵的 `1／2／3`。⚠️ M7 在真的 Mac 上確認。
- 空白鍵由全域 keydown 處理並 `preventDefault`，同時吞掉對應的 keyup — 焦點在按鈕上時，空白鍵放開會再觸發一次按鈕點擊。
- `window.__humDebug` 只在開發模式（`import.meta.env.DEV`）存在，所以 e2e 跑在 `npm run dev` 上。
- 即時音高：clarity ≥ 0.8 才畫（規格 6）、顯示最近 8 秒、縱軸以最近音高為中心（指數平滑）顯示兩個八度。
- 鋼琴捲軸：自動捲到有音符的音域（上下各留 3 個半音、至少兩個八度），橫向整段放進畫面；滑鼠滾輪／觸控板捲動，⌘／Ctrl＋滾輪（含觸控板捏合）以游標為中心縮放時間軸。在看得到、量得到大小時才做自動對齊（切到編輯頁的同時資料已經到了，那時候 canvas 可能還沒有大小）。
- 標題用 `<h1>` 包住 logo 按鈕（之後連點三下解鎖隱藏模式），讓頁面有語意上的標題。
- 字型只用系統字（PingFang TC／SF Mono 等），不載入網路字型 — 純前端、離線可用、不對外連線。
