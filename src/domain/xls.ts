// Old binary Excel (.xls, Excel 97–2003) read on the device: the compound
// file container, then the cell records of each sheet. Only what a report
// needs: text, numbers, dates and cached formula results.

import type { Grid } from './sheets';

const u16 = (d: Uint8Array, o: number) => d[o] | (d[o + 1] << 8);
const u32 = (d: Uint8Array, o: number) => (d[o] | (d[o + 1] << 8) | (d[o + 2] << 16) | (d[o + 3] << 24)) >>> 0;

/** Named streams of an OLE compound file (.xls, .doc). */
export const readCfb = (d: Uint8Array): Map<string, Uint8Array> => {
  if (u32(d, 0) !== 0xe011cfd0 || u32(d, 4) !== 0xe11ab1a1) throw new Error('xls-binary');
  const size = 1 << u16(d, 0x1e);
  const miniSize = 1 << u16(d, 0x20);
  const sector = (id: number) => d.subarray((id + 1) * size, (id + 2) * size);
  // the FAT sectors: 109 listed in the header, the rest in DIFAT sectors
  const fatIds: number[] = [];
  for (let i = 0; i < 109; i++) fatIds.push(u32(d, 0x4c + i * 4));
  for (let s = u32(d, 0x44), n = 0; s < 0xfffffffa && n < u32(d, 0x48); n++) {
    const sec = sector(s);
    for (let i = 0; i < size / 4 - 1; i++) fatIds.push(u32(sec, i * 4));
    s = u32(sec, size - 4);
  }
  const fat: number[] = [];
  for (const id of fatIds.slice(0, u32(d, 0x2c))) {
    const sec = sector(id);
    for (let i = 0; i < size / 4; i++) fat.push(u32(sec, i * 4));
  }
  const chain = (start: number, table: number[]) => {
    const out: number[] = [];
    for (let s = start; s < 0xfffffffa && out.length <= table.length; s = table[s]) out.push(s);
    return out;
  };
  const join = (ids: number[], get: (id: number) => Uint8Array, len: number) => {
    const out = new Uint8Array(ids.length * get(0).length || 0);
    ids.forEach((id, i) => out.set(get(id), i * get(0).length));
    return out.subarray(0, len);
  };
  const dir = join(chain(u32(d, 0x30), fat), sector, Infinity);
  const miniFat: number[] = [];
  const mf = join(chain(u32(d, 0x3c), fat), sector, Infinity);
  for (let i = 0; i + 4 <= mf.length; i += 4) miniFat.push(u32(mf, i));
  const streams = new Map<string, Uint8Array>();
  let miniStream = new Uint8Array();
  const cutoff = u32(d, 0x38) || 4096;
  for (let o = 0; o + 128 <= dir.length; o += 128) {
    const type = dir[o + 0x42];
    if (type !== 2 && type !== 5) continue;
    const nameLen = u16(dir, o + 0x40);
    let name = '';
    for (let i = 0; i + 2 < nameLen; i += 2) name += String.fromCharCode(u16(dir, o + i));
    const start = u32(dir, o + 0x74);
    const len = u32(dir, o + 0x78);
    if (type === 5) {
      miniStream = join(chain(start, fat), sector, len);
      continue;
    }
    streams.set(name, len < cutoff ? join(chain(start, miniFat), (id) => miniStream.subarray(id * miniSize, (id + 1) * miniSize), len) : join(chain(start, fat), sector, len));
  }
  return streams;
};

// built-in number formats that show a date
const DATE_FMT = new Set([14, 15, 16, 17, 22, 27, 30, 36, 45, 46, 47, 50, 57]);

const serialToISO = (v: number, date1904: boolean) => {
  const d = new Date(Math.round((v + (date1904 ? 1462 : 0) - 25569) * 86_400_000));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
};

const rk = (v: number) => {
  let n: number;
  if (v & 2) n = v >> 2;
  else {
    const b = new DataView(new ArrayBuffer(8));
    b.setUint32(4, v & 0xfffffffc, true);
    n = b.getFloat64(0, true);
  }
  return v & 1 ? n / 100 : n;
};

/** A cursor over a record and its CONTINUE records, where strings may break across the seam. */
class Segments {
  seg = 0;
  off = 0;
  constructor(private parts: Uint8Array[]) {}
  private ensure() {
    while (this.seg < this.parts.length && this.off >= this.parts[this.seg].length) {
      this.seg++;
      this.off = 0;
    }
  }
  byte() {
    this.ensure();
    return this.parts[this.seg]?.[this.off++] ?? 0;
  }
  u16() {
    return this.byte() | (this.byte() << 8);
  }
  u32() {
    return (this.u16() | (this.u16() << 16)) >>> 0;
  }
  skip(n: number) {
    for (let i = 0; i < n; i++) this.byte();
  }
  done() {
    this.ensure();
    return this.seg >= this.parts.length;
  }
  /** An XLUnicodeRichExtendedString. */
  str() {
    const cch = this.u16();
    let flags = this.byte();
    const runs = flags & 8 ? this.u16() : 0;
    const ext = flags & 4 ? this.u32() : 0;
    let s = '';
    for (let i = 0; i < cch; i++) {
      // a continued string restarts with its own width flag
      if (this.seg < this.parts.length && this.off >= this.parts[this.seg].length) {
        this.seg++;
        this.off = 0;
        flags = this.byte();
      }
      s += String.fromCharCode(flags & 1 ? this.u16() : this.byte());
    }
    this.skip(runs * 4 + ext);
    return s;
  }
}

const xlString = (d: Uint8Array, o: number, cchBytes: 1 | 2) => {
  const cch = cchBytes === 2 ? u16(d, o) : d[o];
  const flags = d[o + cchBytes];
  let s = '';
  for (let i = 0, p = o + cchBytes + 1; i < cch; i++) {
    s += String.fromCharCode(flags & 1 ? u16(d, p) : d[p]);
    p += flags & 1 ? 2 : 1;
  }
  return s;
};

const num = (n: number) => String(Number(n.toPrecision(12)));

/** Every sheet of a BIFF8 workbook as a grid of display strings; dates become YYYY-MM-DD. */
export const readXls = (data: Uint8Array): { name: string; grid: Grid }[] => {
  const cfb = readCfb(data);
  const wb = cfb.get('Workbook') ?? cfb.get('Book');
  if (!wb) throw new Error('xls-binary');
  const records = (start: number) => {
    const out: { type: number; data: Uint8Array; conts: Uint8Array[] }[] = [];
    for (let o = start; o + 4 <= wb.length; ) {
      const type = u16(wb, o);
      const len = u16(wb, o + 2);
      const body = wb.subarray(o + 4, o + 4 + len);
      o += 4 + len;
      if (type === 0x003c && out.length) out[out.length - 1].conts.push(body);
      else out.push({ type, data: body, conts: [] });
      if (type === 0x000a) break;
    }
    return out;
  };
  const globals = records(0);
  if (globals[0]?.type !== 0x0809 || u16(globals[0].data, 0) !== 0x0600) throw new Error('xls-binary');
  const sst: string[] = [];
  const customDate = new Set<number>();
  const xfDate: boolean[] = [];
  const sheets: { name: string; pos: number }[] = [];
  let date1904 = false;
  for (const r of globals) {
    if (r.type === 0x002f) throw new Error('xls-encrypted');
    if (r.type === 0x0022) date1904 = u16(r.data, 0) === 1;
    if (r.type === 0x00fc) {
      const s = new Segments([r.data, ...r.conts]);
      s.skip(4);
      const n = s.u32();
      for (let i = 0; i < n && !s.done(); i++) sst.push(s.str());
    }
    if (r.type === 0x041e) {
      const code = xlString(r.data, 2, 2).replace(/"[^"]*"|\[[^\]]*\]/g, '');
      if (/[ymd]/i.test(code) && !/^[#0.,%\s]*$/.test(code)) customDate.add(u16(r.data, 0));
    }
    if (r.type === 0x00e0) {
      const f = u16(r.data, 2);
      xfDate.push(DATE_FMT.has(f) || customDate.has(f));
    }
    if (r.type === 0x0085 && r.data[5] === 0) sheets.push({ pos: u32(r.data, 0), name: xlString(r.data, 6, 1) });
  }
  return sheets.map(({ name, pos }) => {
    const grid: Grid = [];
    const set = (row: number, col: number, v: string) => {
      if (row > 65535 || col > 255) return;
      while (grid.length <= row) grid.push([]);
      const r = grid[row];
      while (r.length < col) r.push('');
      r[col] = v;
    };
    const value = (xf: number, n: number) => (xfDate[xf] && n > 0 && n < 2958466 ? serialToISO(n, date1904) : num(n));
    let pending: [number, number] | undefined;
    for (const r of records(pos)) {
      const d = r.data;
      switch (r.type) {
        case 0x00fd:
          set(u16(d, 0), u16(d, 2), sst[u32(d, 6)] ?? '');
          break;
        case 0x0203:
          set(u16(d, 0), u16(d, 2), value(u16(d, 4), new DataView(d.buffer, d.byteOffset + 6, 8).getFloat64(0, true)));
          break;
        case 0x027e:
          set(u16(d, 0), u16(d, 2), value(u16(d, 4), rk(u32(d, 6))));
          break;
        case 0x00bd: {
          const row = u16(d, 0);
          const first = u16(d, 2);
          for (let i = 0, o = 4; o + 6 <= d.length - 2; i++, o += 6) set(row, first + i, value(u16(d, o), rk(u32(d, o + 2))));
          break;
        }
        case 0x0204:
          set(u16(d, 0), u16(d, 2), xlString(d, 6, 2));
          break;
        case 0x0205:
          if (d[7] === 0) set(u16(d, 0), u16(d, 2), d[6] ? 'TRUE' : 'FALSE');
          break;
        case 0x0006: {
          const row = u16(d, 0);
          const col = u16(d, 2);
          if (u16(d, 12) === 0xffff) {
            if (d[6] === 0) pending = [row, col];
            else if (d[6] === 1) set(row, col, d[8] ? 'TRUE' : 'FALSE');
          } else set(row, col, value(u16(d, 4), new DataView(d.buffer, d.byteOffset + 6, 8).getFloat64(0, true)));
          break;
        }
        case 0x0207:
          if (pending) set(pending[0], pending[1], xlString(d, 0, 2));
          pending = undefined;
          break;
      }
    }
    return { name, grid };
  });
};
