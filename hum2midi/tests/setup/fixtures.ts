import { generateFixtures } from '../../scripts/gen-test-audio';

// Vitest 與 Playwright 共用：開跑前重新產生測試音檔（固定種子，很快，而且保證和產生器同步）
export default function setup() {
  generateFixtures();
}
