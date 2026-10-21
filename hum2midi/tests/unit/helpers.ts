import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FIXTURES, FIXTURES_DIR, fixtureFileName } from '../../scripts/gen-test-audio';
import { decodeWav } from '../../src/audio/wav';

export function loadFixture(name: string, sampleRate: number) {
  return decodeWav(readFileSync(join(FIXTURES_DIR, fixtureFileName(name, sampleRate))));
}

export function fixture(name: string) {
  const fx = FIXTURES.find((f) => f.name === name);
  if (!fx) throw new Error(`沒有 ${name} 這個 fixture`);
  return fx;
}
