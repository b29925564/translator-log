// 離線分析 Web Worker。訊息格式見 analyzer.ts。

import { createAnalyzer, type AnalyzeRequest } from './analyzer';

const analyzer = createAnalyzer();

self.onmessage = (e: MessageEvent<AnalyzeRequest>) => {
  const res = analyzer.handle(e.data);
  const transfer = res.type === 'error' ? [] : [res.result.curve.buffer];
  self.postMessage(res, { transfer });
};
