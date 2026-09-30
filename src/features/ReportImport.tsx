// Import a report a company sent: spreadsheets, Word files, PDFs, photos and
// pasted text are read on the device (scans and photos by on-device text
// recognition); Claude reads them instead when the person has added a key.
// Every row is matched to existing work first, so a payment statement
// settles jobs instead of duplicating them. Several files can be chosen at
// once to bring in a whole career's records.

import { Camera, ClipboardPaste, FileSearch, FileSpreadsheet, FileText, FileUp, Image as ImageIcon, Link2, Sparkles, TriangleAlert } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { aiAvailable, aiReadReport, type ReportSource } from '../ai/claude';
import { useData } from '../db/data';
import { applyImport, planImport } from '../db/reportApply';
import { guessColumns, type ImportField } from '../domain/csv';
import { findTemplate, headerSignature, loadTemplates, saveTemplate } from '../domain/importTemplates';
import { textToGrid } from '../domain/lineTable';
import { looksLikeTable, pdfItemsToGrid, pdfItemsToText } from '../domain/pdfTable';
import { clientMentioned, defaultAction, fillFromRow, findHeaderRow, gridToReport, matchReport, type ParsedReport, type ReportKind, type RowAction, type RowMatch } from '../domain/reportImport';
import { fileKind, readTables, type Grid } from '../domain/sheets';
import type { PdfItem } from '../domain/pdfTable';
import type { Job } from '../domain/types';
import { tx } from '../i18n';
import { CurrencySelect } from './common';
import { Button, cx, Field, Input, NumberInput, Segmented, Select, Sheet, Textarea } from '../ui/kit';
import { date, money, qty } from '../ui/format';
import { useUI } from '../ui/store';

const FIELDS = (): { id: ImportField; label: string }[] => [
  { id: 'ignore', label: tx('（略過）', '(skip)') },
  { id: 'title', label: tx('案件名稱', 'Title') },
  { id: 'ref', label: tx('PO／單號', 'PO / reference') },
  { id: 'client', label: tx('客戶', 'Client') },
  { id: 'project', label: tx('專案', 'Project') },
  { id: 'date', label: tx('日期（交稿）', 'Date (delivered)') },
  { id: 'receivedAt', label: tx('接案日', 'Received') },
  { id: 'dueAt', label: tx('截止日', 'Due') },
  { id: 'deliveredAt', label: tx('交稿日', 'Delivered') },
  { id: 'paidAt', label: tx('收款日', 'Paid on') },
  { id: 'pair', label: tx('語言組合', 'Language pair') },
  { id: 'sourceLang', label: tx('原文語言', 'Source language') },
  { id: 'targetLang', label: tx('譯文語言', 'Target language') },
  { id: 'quantity', label: tx('字數／數量', 'Words / quantity') },
  { id: 'weightedWords', label: tx('加權字數（計費）', 'Weighted words (billed)') },
  { id: 'rawWords', label: tx('原始字數', 'Raw words') },
  { id: 'unit', label: tx('計價單位', 'Unit') },
  { id: 'rate', label: tx('單價', 'Rate') },
  { id: 'currency', label: tx('幣別', 'Currency') },
  { id: 'amount', label: tx('金額', 'Amount') },
  { id: 'status', label: tx('狀態', 'Status') },
  { id: 'domain', label: tx('領域', 'Field') },
  { id: 'service', label: tx('服務類型', 'Service') },
  { id: 'catTool', label: tx('CAT 工具', 'CAT tool') },
  { id: 'notes', label: tx('備註', 'Notes') },
];

const WHY = (): Record<string, string> => ({
  invoice: tx('依請款單號', 'by invoice number'),
  ref: tx('依 PO／案件編號', 'by PO / job number'),
  amount: tx('依金額與日期', 'by amount and date'),
  title: tx('依案件名稱', 'by title'),
  manual: tx('手動指定', 'set by you'),
});

const PATCH_LABEL = (): Record<string, string> => ({
  poNumber: tx('PO 號碼', 'PO number'),
  quantity: tx('字數', 'volume'),
  rawWords: tx('原始字數', 'raw words'),
  rate: tx('單價', 'rate'),
  dueAt: tx('截止日', 'due date'),
  deliveredAt: tx('交稿日', 'delivery date'),
});

type Stage = { at: 'pick' } | { at: 'reading'; ai: boolean; ocr?: { page: number; pages: number; pct: number } } | { at: 'review' } | { at: 'needs-ai' } | { at: 'no-table'; pdf: boolean } | { at: 'error'; message: string };

/** Everything the file picker offers; images also come from the camera button. */
const ACCEPT = '.xlsx,.xlsm,.xls,.ods,.csv,.tsv,.docx,.doc,.rtf,.html,.htm,.pdf,.txt,.eml,.md,image/*';

type Source =
  | { via: 'local'; name: string; tables: { name: string; grid: Grid }[] }
  | { via: 'ai'; name: string; report: ParsedReport };

const toBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

/** Photos are downscaled and re-encoded as JPEG, which also covers HEIC where the browser can decode it. */
const imageSource = async (file: File): Promise<ReportSource> => {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode().catch(() => {
      throw new Error('image-decode');
    });
    const scale = Math.min(1, 2000 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const g = canvas.getContext('2d')!;
    g.fillStyle = '#fff';
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.drawImage(img, 0, 0, canvas.width, canvas.height);
    return { type: 'image', mediaType: 'image/jpeg', data: canvas.toDataURL('image/jpeg', 0.88).split(',')[1] };
  } finally {
    URL.revokeObjectURL(url);
  }
};

/** A grid from positioned text (a PDF's text layer or recognised words): its table, else its record lines. */
const itemsToGrid = (items: PdfItem[]): Grid | undefined => {
  const grid = pdfItemsToGrid(items);
  if (looksLikeTable(grid)) return grid;
  return textToGrid(pdfItemsToText(items));
};

const errorText = (e: unknown) => {
  const m = (e as Error)?.message ?? String(e);
  if (m === 'xls-encrypted') return tx('這個 Excel 檔有密碼保護。請在 Excel 移除密碼或另存為 .xlsx 後再匯入。', 'This Excel file is password-protected. Remove the password or save it as .xlsx and try again.');
  if (m === 'export-xlsx') return tx('這種格式無法在本機讀取。請用 Excel 或 Numbers 開啟，另存為 .xlsx 或 CSV 後再匯入。', 'This format cannot be read on the device. Open it in Excel or Numbers and save it as .xlsx or CSV.');
  if (m === 'ocr-offline') return tx('第一次辨識圖片需要連網下載中文辨識資料（約 20 MB），之後離線也能用。請連上網路再試一次。', 'Recognising text in images the first time downloads about 20 MB of language data; after that it works offline. Connect to the internet and try again.');
  if (m === 'ocr-failed') return tx('無法啟動文字辨識。請重新整理頁面再試一次，或把報表另存為 Excel／CSV。', 'Text recognition could not start. Reload the page and try again, or save the report as Excel/CSV.');
  if (m === 'xls-binary') return tx('這是舊版 Excel（.xls）檔。請用 Excel 或 Google 試算表開啟，另存為 .xlsx 或 CSV 後再匯入。', 'This is an old binary Excel (.xls) file. Open it in Excel or Google Sheets and save it as .xlsx or CSV.');
  if (m === 'empty') return tx('檔案裡找不到表格或資料列。', 'No table or rows were found in this file.');
  if (m === 'unsupported') return tx('不支援這種檔案。可以匯入 Excel、CSV、ODS、Word、RTF、網頁、PDF、文字檔或圖片。', 'This file type is not supported. Try Excel, CSV, ODS, Word, RTF, a web page, a PDF, a text file or an image.');
  if (m === 'image-decode') return tx('無法讀取這張圖片，請存成 JPG 或 PNG 再試一次。', 'This image could not be read. Save it as JPG or PNG and try again.');
  if (m === 'too-big') return tx('檔案太大（超過 25 MB）。請只匯出需要的頁面或月份。', 'The file is over 25 MB. Export only the pages or months you need.');
  if (m === 'no-rows') return tx('Claude 沒有在這份文件裡找到任何案件或款項。', 'Claude found no jobs or payments in this document.');
  return m;
};

export function ReportImport() {
  const { reportImport, closeReportImport, navigate, toast, fireStamp } = useUI();
  const { jobs, invoices, clients, clientMap, jobMap, projects, projectMap, settings, today } = useData();
  const [stage, setStage] = useState<Stage>({ at: 'pick' });
  const [source, setSource] = useState<Source | null>(null);
  const [tableIdx, setTableIdx] = useState(0);
  const [header, setHeader] = useState(0);
  const [mapping, setMapping] = useState<ImportField[]>([]);
  const [showMap, setShowMap] = useState(false);
  const [kind, setKind] = useState<ReportKind | undefined>();
  const [clientId, setClientId] = useState<string | undefined>();
  const [paidAt, setPaidAt] = useState<string | undefined>();
  // the whole import's currency: rows without their own take it
  const [currency, setCurrency] = useState<string | undefined>();
  const [projectId, setProjectId] = useState<string | undefined>();
  const [matchOver, setMatchOver] = useState<Record<number, string | null>>({});
  const [actionOver, setActionOver] = useState<Record<number, RowAction>>({});
  const [openRow, setOpenRow] = useState<number | null>(null);
  const [paste, setPaste] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const loadingFor = useRef<File | undefined>(undefined);
  // several files chosen at once go through the review one after another
  const [queue, setQueue] = useState<{ files: File[]; at: number } | null>(null);
  const [template, setTemplate] = useState<string | null>(null);

  const resetReview = () => {
    setKind(undefined);
    setClientId(undefined);
    setPaidAt(undefined);
    setCurrency(undefined);
    setProjectId(undefined);
    setMatchOver({});
    setActionOver({});
    setOpenRow(null);
  };

  /** Header and mapping for a table: a layout saved from this vendor before, else a fresh guess. */
  const layoutFor = (grid: Grid) => {
    const h = findHeaderRow(grid);
    const saved = findTemplate(grid, h, loadTemplates());
    setTemplate(saved ? saved.template.name : null);
    setHeader(saved ? saved.header : h);
    setMapping(saved ? saved.mapping : guessColumns(grid, h));
    resetReview();
    const cid = saved?.template.clientId;
    if (cid && clientMap.has(cid)) setClientId(cid);
    if (saved?.template.currency) setCurrency(saved.template.currency);
  };

  const resetLayout = () => {
    const h = findHeaderRow(grid);
    setTemplate(null);
    setHeader(h);
    setMapping(guessColumns(grid, h));
    resetReview();
  };

  const useTables = (name: string, tables: { name: string; grid: Grid }[]) => {
    setSource({ via: 'local', name, tables });
    setTableIdx(0);
    setShowMap(false);
    layoutFor(tables[0].grid);
    setStage({ at: 'review' });
  };

  /** On-device text recognition, for scans and photos when no Claude key is set. */
  const ocr = async (file: File, pdf: boolean): Promise<Grid | undefined> => {
    if (__DEMO_BUILD__) return undefined;
    const { recognise } = await import('../domain/ocr');
    const items = await recognise(file, pdf, (page, pages, pct) => setStage({ at: 'reading', ai: false, ocr: { page, pages, pct } }));
    return itemsToGrid(items);
  };

  /** What a PDF's own text layer holds; scans have none, and a damaged or locked file cannot be opened. */
  const pdfText = async (file: File): Promise<{ grid?: Grid; text: boolean; opened: boolean }> => {
    if (__DEMO_BUILD__) return { text: false, opened: false };
    try {
      const { readPdfItems } = await import('../domain/pdfText');
      const items = await readPdfItems(await file.arrayBuffer());
      return { grid: itemsToGrid(items), text: items.length > 0, opened: true };
    } catch {
      return { text: false, opened: false };
    }
  };

  const viaAI = async (name: string, src: ReportSource) => {
    if (!aiAvailable()) {
      setSource(null);
      setStage({ at: 'needs-ai' });
      return;
    }
    setStage({ at: 'reading', ai: true });
    const report = await aiReadReport(src, { clients, today, settings });
    if (!report.rows.length) throw new Error('no-rows');
    setSource({ via: 'ai', name, report });
    resetReview();
    setStage({ at: 'review' });
  };

  const load = async (file: File) => {
    setPaste(null);
    setStage({ at: 'reading', ai: false });
    try {
      const k = fileKind(file.name, file.type);
      if (k === 'sheet') {
        const t = await readTables(file);
        if (!t.length) throw new Error('empty');
        useTables(file.name, t);
      } else if (k === 'text') {
        const text = await file.text();
        const grid = textToGrid(text);
        if (grid) useTables(file.name, [{ name: file.name, grid }]);
        else if (aiAvailable()) await viaAI(file.name, { type: 'text', text });
        else setStage({ at: 'no-table', pdf: false });
      } else if (k === 'pdf') {
        if (file.size > 25 * 1024 * 1024) throw new Error('too-big');
        const pdf = await pdfText(file);
        if (pdf.grid) useTables(file.name, [{ name: file.name, grid: pdf.grid }]);
        else if (aiAvailable()) await viaAI(file.name, { type: 'pdf', data: await toBase64(file) });
        else if (__DEMO_BUILD__) setStage({ at: 'needs-ai' });
        else if (pdf.text || !pdf.opened) setStage({ at: 'no-table', pdf: true });
        else {
          // a scan: recognise the text of each page
          const scanned = await ocr(file, true);
          if (scanned) useTables(file.name, [{ name: file.name, grid: scanned }]);
          else setStage({ at: 'no-table', pdf: true });
        }
      } else if (k === 'image') {
        if (aiAvailable() || __DEMO_BUILD__) await viaAI(file.name, await imageSource(file));
        else {
          const grid = await ocr(file, false);
          if (grid) useTables(file.name, [{ name: file.name, grid }]);
          else setStage({ at: 'no-table', pdf: true });
        }
      } else throw new Error('unsupported');
    } catch (e) {
      setStage({ at: 'error', message: errorText(e) });
    }
  };

  /** Starts on a list of files; more than one shows “file 2 / 5” and a skip button. */
  const loadAll = (files: File[]) => {
    if (!files.length) return;
    setQueue(files.length > 1 ? { files, at: 0 } : null);
    void load(files[0]);
  };

  /** The next file of the batch; false when there is none. */
  const next = () => {
    if (!queue || queue.at + 1 >= queue.files.length) {
      setQueue(null);
      return false;
    }
    const at = queue.at + 1;
    setQueue({ ...queue, at });
    setSource(null);
    void load(queue.files[at]);
    return true;
  };

  const readPasted = async (text: string) => {
    const grid = textToGrid(text);
    try {
      if (grid) useTables(tx('貼上的表格', 'Pasted table'), [{ name: 'paste', grid }]);
      else if (aiAvailable()) await viaAI(tx('貼上的內容', 'Pasted text'), { type: 'text', text });
      else {
        setStage({ at: 'no-table', pdf: false });
        setPaste(null);
        return;
      }
      setPaste(null);
    } catch (e) {
      setStage({ at: 'error', message: errorText(e) });
    }
  };

  // a file handed over by the window-wide drop or share target
  useEffect(() => {
    if (!reportImport.open) {
      setStage({ at: 'pick' });
      setSource(null);
      setPaste(null);
      setQueue(null);
      setTemplate(null);
      loadingFor.current = undefined;
      return;
    }
    const f = reportImport.file;
    if (f && loadingFor.current !== f) {
      loadingFor.current = f;
      loadAll(reportImport.files?.length ? reportImport.files : [f]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportImport.open, reportImport.file]);

  // screenshots pasted straight from the clipboard
  useEffect(() => {
    if (!reportImport.open) return;
    const onPaste = (e: ClipboardEvent) => {
      const f = [...(e.clipboardData?.files ?? [])][0];
      if (!f) return;
      e.preventDefault();
      void load(f);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportImport.open]);

  const grid = source?.via === 'local' ? source.tables[tableIdx]?.grid ?? [] : [];
  const base = useMemo<ParsedReport | null>(() => {
    if (!source) return null;
    if (source.via === 'ai') return source.report;
    const r = gridToReport(grid, header, mapping, { today, defaultTargetLang: settings.defaultTargetLang });
    const named = clientMentioned([source.name, ...grid.slice(0, header).flat()].join(' '), clients);
    return named ? { ...r, client: named.name } : r;
  }, [source, grid, header, mapping, today, settings.defaultTargetLang, clients]);

  const reportClient = clientId ? clientMap.get(clientId) : undefined;
  const report = useMemo<ParsedReport | null>(() => {
    if (!base) return null;
    const k = kind ?? base.kind;
    return {
      ...base,
      kind: k,
      client: reportClient?.name ?? base.client,
      currency: currency ?? base.currency ?? reportClient?.currency,
      paidAt: k === 'payments' ? paidAt ?? base.paidAt ?? today : base.paidAt,
    };
  }, [base, kind, reportClient, paidAt, today, currency]);
  const importCurrency = report?.currency ?? settings.baseCurrency;
  const hasCurrencyCol = source?.via === 'local' && mapping.includes('currency');

  const auto = useMemo(() => (report ? matchReport(report, { jobs, invoices, clients }) : []), [report, jobs, invoices, clients]);
  const matches = useMemo<(RowMatch & { manual?: boolean })[]>(
    () => auto.map((m, i) => (i in matchOver ? (matchOver[i] ? { jobIds: [matchOver[i]!], score: 1, manual: true } : { jobIds: [], score: 0, manual: true }) : m)),
    [auto, matchOver],
  );
  const actions = useMemo(() => (report ? report.rows.map((_, i) => actionOver[i] ?? defaultAction(report.kind, matches[i], jobMap)) : []), [report, matches, actionOver, jobMap]);
  const plan = useMemo(
    () => (report ? planImport(report, matches, actions, { jobs, invoices, clients, settings, today, projects, projectId: projectId && projectMap.has(projectId) ? projectId : undefined }) : null),
    [report, matches, actions, jobs, invoices, clients, settings, today, projects, projectId, projectMap],
  );

  const candidates = useMemo(() => {
    const live = jobs.filter((j) => !j.deletedAt && j.status !== 'cancelled');
    const cid = reportClient?.id;
    const rank = (j: Job) => (cid && j.clientId === cid ? 0 : 2) + (j.status === 'paid' ? 1 : 0);
    return [...live].sort((a, b) => rank(a) - rank(b) || (b.deliveredAt ?? b.receivedAt ?? '').localeCompare(a.deliveredAt ?? a.receivedAt ?? '')).slice(0, 80);
  }, [jobs, reportClient]);

  const apply = async () => {
    if (!plan) return;
    setBusy(true);
    try {
      await applyImport(plan);
      // remember this vendor's layout for the next report like it
      if (source?.via === 'local' && grid[header]?.some((c) => c.trim())) {
        saveTemplate({
          sig: headerSignature(grid[header]),
          headers: grid[header],
          mapping,
          header,
          clientId: reportClient?.id,
          currency: currency ?? report?.currency,
          name: reportClient?.name ?? source.name,
          lastUsed: Date.now(),
        });
      }
      const { paid, updated, created } = plan.counts;
      const parts = [
        paid && tx(`${paid} 筆標記已收款`, `${paid} marked paid`),
        updated && tx(`${updated} 筆已更新`, `${updated} updated`),
        created && tx(`新增 ${created} 筆`, `${created} added`),
        plan.clients.length && tx(`新客戶 ${plan.clients.length} 位`, `${plan.clients.length} new clients`),
        plan.projects.length && tx(`新專案 ${plan.projects.length} 個`, `${plan.projects.length} new projects`),
      ].filter(Boolean);
      toast(tx('匯入完成：', 'Imported: ') + parts.join(tx('、', ', ')), { tone: 'good' });
      if (paid) fireStamp(tx('已收款', 'Paid'), tx(`${paid} 筆`, `${paid} jobs`));
      if (next()) return;
      closeReportImport();
      if (report?.kind === 'payments' && paid) navigate('/money');
    } finally {
      setBusy(false);
    }
  };

  const total = plan ? plan.counts.paid + plan.counts.updated + plan.counts.created : 0;
  const matchedCount = matches.filter((m) => m.jobIds.length).length;

  const pick = (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setDrag(false);
        loadAll([...(e.dataTransfer.files ?? [])]);
      }}
      className={cx('flex flex-col items-center gap-4 rounded-[6px] border-2 border-dashed px-4 py-10 text-center transition-colors', drag ? 'border-accent bg-accent-soft' : 'border-line-strong')}
    >
      <FileUp size={28} className="text-accent" />
      <div>
        <div className="text-[16px] font-semibold text-ink">{tx('把報表拖到這裡', 'Drop reports here')}</div>
        <p className="mx-auto mt-1 max-w-md text-[13.5px] text-ink-2">
          {tx('翻譯社的對帳單、PO 清單、平台匯出檔、匯款通知、自己記的 Word 清單都可以，一次選好幾個檔案也行。也能直接貼上截圖（Ctrl／⌘ + V）。', 'Statements, PO lists, vendor-portal exports, remittance advice and your own Word lists all work, and you can pick several files at once. You can also paste a screenshot (Ctrl/⌘ + V).')}
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button variant="primary" icon={<FileUp size={15} />} onClick={() => fileRef.current?.click()} data-autofocus>
          {tx('選擇檔案', 'Choose files')}
        </Button>
        <Button icon={<Camera size={15} />} onClick={() => camRef.current?.click()}>
          {tx('拍照', 'Take a photo')}
        </Button>
        <Button icon={<ClipboardPaste size={15} />} onClick={() => setPaste('')}>
          {tx('貼上文字', 'Paste text')}
        </Button>
      </div>
      <input
        ref={fileRef}
        type="file"
        multiple
        accept={ACCEPT}
        className="hidden"
        aria-label={tx('選擇報表檔案', 'Choose a report file')}
        onChange={(e) => {
          loadAll([...(e.target.files ?? [])]);
          e.target.value = '';
        }}
      />
      <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => e.target.files?.[0] && void load(e.target.files[0])} />
      <div className="mt-2 grid w-full max-w-lg gap-2 text-left text-[12.5px] sm:grid-cols-2">
        <div className="flex gap-2.5 rounded-[4px] border border-line bg-surface-2 px-3 py-2.5">
          <FileSpreadsheet size={16} className="mt-0.5 shrink-0 text-accent" />
          <div>
            <div className="font-medium text-ink">{tx('在這台裝置上讀取', 'Read on this device')}</div>
            <div className="text-muted">Excel (.xlsx, .xls) · CSV · ODS · Word (.docx, .doc) · RTF · PDF · {tx('網頁表格', 'web tables')} · {tx('文字檔與郵件', 'text and email')}</div>
          </div>
        </div>
        <div className="flex gap-2.5 rounded-[4px] border border-line bg-surface-2 px-3 py-2.5">
          <Sparkles size={16} className="mt-0.5 shrink-0 text-accent" />
          <div>
            <div className="font-medium text-ink">{tx('辨識圖片中的文字', 'Text recognised in images')}</div>
            <div className="text-muted">{tx('掃描的 PDF', 'scanned PDFs')} · {tx('照片', 'photos')} · {tx('截圖', 'screenshots')} · {tx('有 Claude 金鑰時由 Claude 讀取', 'read by Claude when you have a key')}</div>
          </div>
        </div>
      </div>
    </div>
  );

  const pasteBox = paste != null && (
    <div className="flex flex-col gap-3">
      <Field label={tx('貼上報表內容', 'Paste the report')} htmlFor="ri-paste" hint={tx('從 Excel 複製的儲存格，或一行一筆的紀錄（例如「2023/05/01 某案名 3,000字 NT$4,500」）都能直接讀取。', 'Cells copied from a spreadsheet, or one record per line (such as “2023-05-01 Manual 3,000 words $450”), are read directly.')}>
        <Textarea id="ri-paste" rows={9} value={paste} onChange={(e) => setPaste(e.target.value)} data-autofocus />
      </Field>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => setPaste(null)}>
          {tx('返回', 'Back')}
        </Button>
        <Button variant="primary" disabled={!paste.trim()} onClick={() => void readPasted(paste)}>
          {tx('讀取', 'Read')}
        </Button>
      </div>
    </div>
  );

  // in a batch, a file that cannot be read is skipped rather than replaced
  const skip = queue ? (
    <Button onClick={() => next() || setStage({ at: 'pick' })}>{queue.at + 1 < queue.files.length ? tx('略過，看下一個', 'Skip to the next') : tx('略過', 'Skip')}</Button>
  ) : undefined;

  const progress = queue && (
    <div className="mb-3 flex items-center gap-2 text-[12.5px] text-muted" role="status">
      <span className="tnum shrink-0 rounded-[3px] border border-line px-1.5 py-px font-medium text-ink-2">{tx(`檔案 ${queue.at + 1} / ${queue.files.length}`, `File ${queue.at + 1} of ${queue.files.length}`)}</span>
      <span className="min-w-0 truncate">{queue.files[queue.at]?.name}</span>
    </div>
  );

  const body = () => {
    if (paste != null) return pasteBox;
    if (stage.at === 'reading')
      return (
        <div className="flex flex-col items-center gap-3 py-16 text-center" role="status">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-line-strong border-t-accent" />
          <div className="text-[14.5px] font-medium text-ink">
            {stage.ai
              ? tx('Claude 正在閱讀這份報表…', 'Claude is reading the report…')
              : stage.ocr
                ? stage.ocr.page
                  ? tx(`正在辨識 第 ${stage.ocr.page}/${stage.ocr.pages} 頁…`, `Recognizing page ${stage.ocr.page}/${stage.ocr.pages}…`)
                  : tx(`正在準備文字辨識… ${Math.round(stage.ocr.pct * 100)}%`, `Preparing text recognition… ${Math.round(stage.ocr.pct * 100)}%`)
                : tx('讀取中…', 'Reading…')}
          </div>
          {stage.ai && <div className="text-[12.5px] text-muted">{tx('多頁 PDF 可能需要半分鐘。', 'A long PDF can take half a minute.')}</div>}
          {stage.ocr && !stage.ocr.page && <div className="max-w-sm text-[12.5px] text-muted">{tx('第一次使用會下載約 20 MB 的辨識資料，之後離線也能用。', 'The first time downloads about 20 MB of language data; after that it works offline.')}</div>}
        </div>
      );
    if (stage.at === 'needs-ai')
      return (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <Sparkles size={26} className="text-accent" />
          <div className="max-w-md text-[14.5px] text-ink">
            {__DEMO_BUILD__
              ? tx('預覽版無法讀取 PDF 與圖片。安裝完整版後，就能在本機讀取文字 PDF、辨識掃描檔與照片。', 'The preview cannot read PDFs or images. The full app reads text PDFs and recognises scans and photos on the device.')
              : tx('這段內容要由 Claude 讀取。到「設定 → AI 助理」輸入你的 API 金鑰就能使用；金鑰只存在這台裝置。', 'This content is read by Claude. Add your API key in Settings → AI assistant; it stays on this device.')}
          </div>
          <div className="max-w-md text-[12.5px] text-muted">{tx('不需要金鑰的：Excel、CSV、Word、PDF、照片和貼上的表格，都在本機讀取。', 'No key needed for Excel, CSV, Word, PDFs, photos and pasted tables: they are read on the device.')}</div>
          <div className="flex flex-wrap justify-center gap-2">
            {skip ?? <Button onClick={() => setStage({ at: 'pick' })}>{tx('換一個檔案', 'Choose another file')}</Button>}
            {!__DEMO_BUILD__ && (
              <Button
                variant="primary"
                onClick={() => {
                  closeReportImport();
                  navigate('/settings/ai');
                }}
              >
                {tx('設定 AI 金鑰', 'Add an AI key')}
              </Button>
            )}
          </div>
        </div>
      );
    if (stage.at === 'no-table')
      return (
        <div className="flex flex-col items-center gap-3 py-10 text-center" role="alert">
          <FileSearch size={26} className="text-accent" />
          <div className="max-w-md text-[14.5px] text-ink">
            {stage.pdf
              ? tx('這份檔案裡沒有讀得出來的表格。如果是掃描檔，可能不夠清楚。', 'No readable table was found in this file. If it is a scan, it may not be clear enough.')
              : tx('這段內容裡找不到表格或一行一筆的紀錄。', 'No table or one-record-per-line list was found in this text.')}
          </div>
          <div className="max-w-md text-[12.5px] text-muted">
            {tx('可以到翻譯社的平台匯出 Excel 或 CSV，或把表格複製後貼上。', 'Export Excel or CSV from the vendor portal, or copy the table and paste it.')}
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {skip ?? <Button onClick={() => setStage({ at: 'pick' })}>{tx('換一個檔案', 'Choose another file')}</Button>}
            <Button icon={<ClipboardPaste size={15} />} onClick={() => setPaste('')}>
              {tx('貼上表格', 'Paste a table')}
            </Button>
          </div>
        </div>
      );
    if (stage.at === 'error')
      return (
        <div className="flex flex-col items-center gap-3 py-10 text-center" role="alert">
          <TriangleAlert size={26} className="text-bad" />
          <div className="max-w-md text-[14.5px] text-ink">{stage.message}</div>
          {skip ?? <Button onClick={() => setStage({ at: 'pick' })}>{tx('換一個檔案', 'Choose another file')}</Button>}
        </div>
      );
    if (stage.at === 'review' && source && report && plan) return review();
    return pick;
  };

  const review = () => {
    const r = report!;
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
          <span className="inline-flex min-w-0 items-center gap-1.5 font-medium text-ink">
            {source!.via === 'ai' ? <ImageIcon size={15} className="shrink-0 text-accent" /> : <FileText size={15} className="shrink-0 text-accent" />}
            <span className="truncate">{source!.name}</span>
          </span>
          <span className="rounded-[3px] border border-line px-1.5 py-px text-[11px] font-medium tracking-wide text-muted">{source!.via === 'ai' ? tx('Claude 讀取', 'Read by Claude') : tx('本機讀取', 'Read on device')}</span>
          <span className="text-muted">
            {tx(`${r.rows.length} 列 · 對應到 ${matchedCount} 筆既有案件`, `${r.rows.length} rows · ${matchedCount} matched to existing jobs`)}
          </span>
          {queue ? (
            <Button size="sm" variant="ghost" className="ml-auto" onClick={() => next() || setStage({ at: 'pick' })}>
              {queue.at + 1 < queue.files.length ? tx('略過這個檔案', 'Skip this file') : tx('略過', 'Skip')}
            </Button>
          ) : (
            <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setStage({ at: 'pick' })}>
              {tx('換一個檔案', 'Choose another file')}
            </Button>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={tx('這份報表是', 'This report is')}>
            <Segmented
              size="sm"
              value={r.kind}
              onChange={(v) => {
                setKind(v);
                setActionOver({});
              }}
              options={[
                { value: 'jobs', label: tx('案件清單', 'Job list') },
                { value: 'payments', label: tx('付款明細', 'Payments') },
              ]}
            />
          </Field>
          <Field label={tx('來自哪個客戶', 'From client')} htmlFor="ri-client">
            <Select id="ri-client" value={clientId ?? ''} onChange={(e) => setClientId(e.target.value || undefined)}>
              <option value="">{base?.client ? tx(`偵測到：${base.client}`, `Detected: ${base.client}`) : tx('（依每列的客戶欄）', '(per row)')}</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label={tx('幣別', 'Currency')}
            htmlFor="ri-currency"
            hint={hasCurrencyCol ? tx('用於幣別欄空白的列', 'For rows with a blank currency cell') : undefined}
          >
            <CurrencySelect id="ri-currency" value={importCurrency} onChange={setCurrency} />
          </Field>
          <Field label={tx('加入專案', 'Add to project')} htmlFor="ri-project">
            <Select id="ri-project" value={projectId ?? ''} onChange={(e) => setProjectId(e.target.value || undefined)}>
              <option value="">{mapping.includes('project') && source?.via === 'local' ? tx('（依每列的專案欄）', '(per row)') : tx('（不加入專案）', '(no project)')}</option>
              {projects
                .filter((p) => !p.archived || p.id === projectId)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </Select>
          </Field>
          {r.kind === 'payments' && (
            <Field label={tx('收款日', 'Paid on')} htmlFor="ri-paid">
              <Input id="ri-paid" type="date" value={r.paidAt ?? today} onChange={(e) => setPaidAt(e.target.value || undefined)} />
            </Field>
          )}
          {source!.via === 'local' && source!.tables.length > 1 && (
            <Field label={tx('工作表／表格', 'Sheet / table')} htmlFor="ri-table">
              <Select
                id="ri-table"
                value={tableIdx}
                onChange={(e) => {
                  const i = Number(e.target.value);
                  setTableIdx(i);
                  layoutFor((source as Extract<Source, { via: 'local' }>).tables[i].grid);
                }}
              >
                {source!.tables.map((t, i) => (
                  <option key={i} value={i}>
                    {t.name} · {tx(`${t.grid.length} 列`, `${t.grid.length} rows`)}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>

        {source!.via === 'local' && template && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-[4px] border border-line bg-surface-2 px-3 py-2 text-[12.5px] text-ink-2" role="status">
            <span className="min-w-0">{tx(`已套用上次「${template}」的欄位對應`, `Using the column layout saved from ${template}`)}</span>
            <button type="button" className="font-medium text-accent hover:underline" onClick={resetLayout}>
              {tx('改回自動判斷', 'Reset to the guess')}
            </button>
          </div>
        )}

        {source!.via === 'local' && (
          <div>
            <button type="button" className="text-[13px] font-medium text-accent underline-offset-2 hover:underline" aria-expanded={showMap} onClick={() => setShowMap((v) => !v)}>
              {showMap ? tx('收起欄位對應', 'Hide column mapping') : tx('欄位讀錯了？調整欄位對應', 'Columns wrong? Adjust the mapping')}
            </button>
            {showMap && (
              <div className="mt-2 flex flex-col gap-2">
                <label className="flex items-center gap-2 text-[13px] text-ink-2">
                  {tx('標題列在第', 'Header is row')}
                  <NumberInput
                    className="input-sm w-20"
                    min={1}
                    value={header + 1}
                    onChange={(v) => {
                      const h = Math.max(0, Math.min(grid.length - 1, (v ?? 1) - 1));
                      setHeader(h);
                      setMapping(guessColumns(grid, h));
                      setTemplate(null);
                      resetReview();
                    }}
                    aria-label={tx('標題列', 'Header row')}
                  />
                  {tx('列', '')}
                </label>
                <div className="overflow-x-auto rounded-[4px] border border-line">
                  <table className="w-full text-[12.5px]">
                    <thead className="bg-surface-2">
                      <tr>
                        {(grid[header] ?? []).map((h, i) => (
                          <th key={i} className="min-w-[132px] border-b border-line p-2 text-left align-top font-medium">
                            <div className="mb-1 truncate text-ink">{h || `#${i + 1}`}</div>
                            <Select
                              className="input-sm"
                              value={mapping[i] ?? 'ignore'}
                              onChange={(e) => {
                                const m = [...mapping];
                                m[i] = e.target.value as ImportField;
                                setMapping(m);
                                setMatchOver({});
                                setActionOver({});
                              }}
                              aria-label={tx(`「${h}」對應到`, `Map “${h}” to`)}
                            >
                              {FIELDS().map((f) => (
                                <option key={f.id} value={f.id}>
                                  {f.label}
                                </option>
                              ))}
                            </Select>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {grid.slice(header + 1, header + 5).map((row, ri) => (
                        <tr key={ri} className="border-b border-line last:border-0">
                          {(grid[header] ?? []).map((_, i) => (
                            <td key={i} className="max-w-[200px] truncate p-2 text-ink-2">
                              {row[i]}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {plan && plan.projects.length > 0 && (
          <div className="rounded-[4px] border border-line bg-surface-2 px-3 py-2 text-[12.5px] text-ink-2" role="status">
            {tx(`將建立 ${plan.projects.length} 個新專案：`, `Will create ${plan.projects.length} new project${plan.projects.length > 1 ? 's' : ''}: `)}
            {plan.projects.map((p) => p.name).join(tx('、', ', '))}
          </div>
        )}

        <ul className="divide-y divide-line rounded-[4px] border border-line" aria-label={tx('報表內容', 'Report rows')}>
          {r.rows.map((row, i) => {
            const m = matches[i];
            const a = actions[i];
            const job = m.jobIds.length ? jobMap.get(m.jobIds[0]) : undefined;
            const cur = row.currency ?? r.currency ?? job?.currency ?? reportClient?.currency ?? settings.baseCurrency;
            const patch = job && a !== 'skip' && a !== 'new' ? Object.keys(fillFromRow(job, row)) : [];
            const label = row.title || (row.ref ? `#${row.ref}` : tx(`第 ${i + 1} 列`, `Row ${i + 1}`));
            return (
              <li key={i} className={cx('flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-start sm:gap-3', a === 'skip' && 'opacity-60')}>
                <Select
                  className="input-sm order-last w-full shrink-0 sm:order-first sm:w-[150px]"
                  value={a}
                  onChange={(e) => setActionOver((o) => ({ ...o, [i]: e.target.value as RowAction }))}
                  aria-label={tx(`「${label}」的處理方式`, `What to do with “${label}”`)}
                >
                  {m.jobIds.length > 0 && <option value="paid">{tx('標記已收款', 'Mark paid')}</option>}
                  {m.jobIds.length > 0 && <option value="update">{tx('補齊資料', 'Fill in details')}</option>}
                  <option value="new">{r.kind === 'payments' ? tx('新增（已收款）', 'Add as paid') : tx('新增案件', 'Add as new job')}</option>
                  <option value="skip">{tx('略過', 'Skip')}</option>
                </Select>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-[14px] font-medium text-ink">{label}</span>
                    {row.amount != null && <span className="tnum shrink-0 text-[14px] text-ink">{money(row.amount, cur)}</span>}
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-x-2.5 text-[12px] text-muted">
                    {row.ref && row.title && <span>#{row.ref}</span>}
                    {row.client && <span>{row.client}</span>}
                    {row.date && <span>{date(row.date)}</span>}
                    {row.quantity != null && row.unit !== 'flat' && <span>{qty(row.quantity, row.unit ?? 'word')}</span>}
                    {row.rawWords != null && <span>{tx(`原始 ${qty(row.rawWords, 'word')}`, `raw ${qty(row.rawWords, 'word')}`)}</span>}
                    {row.project && <span>{row.project}</span>}
                    {row.paidAt && <span>{tx(`${date(row.paidAt)} 收款`, `paid ${date(row.paidAt)}`)}</span>}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[12.5px]">
                    {job ? (
                      <span className="inline-flex min-w-0 items-center gap-1 text-ink-2">
                        <Link2 size={13} className="shrink-0 text-accent" />
                        <span className="truncate">
                          {m.score < 0.8 && !m.manual ? tx('可能是', 'Probably') + ' ' : ''}「{job.title}」
                          {m.jobIds.length > 1 ? tx(` 等 ${m.jobIds.length} 筆`, ` +${m.jobIds.length - 1}`) : ''}
                        </span>
                        <span className="shrink-0 text-muted">· {WHY()[m.manual ? 'manual' : m.why ?? 'title']}</span>
                        {job.status === 'paid' && <span className="shrink-0 text-muted">· {tx('已收款', 'already paid')}</span>}
                      </span>
                    ) : (
                      <span className="text-muted">{tx('沒有對應的既有案件', 'No existing job matches')}</span>
                    )}
                    <button type="button" className="text-[12.5px] font-medium text-accent hover:underline" onClick={() => setOpenRow(openRow === i ? null : i)} aria-expanded={openRow === i}>
                      {job ? tx('更改', 'Change') : tx('指定案件', 'Pick a job')}
                    </button>
                    {patch.length > 0 && a === 'update' && <span className="text-muted">· {tx('補上', 'adds')} {patch.map((k) => PATCH_LABEL()[k] ?? k).join(tx('、', ', '))}</span>}
                  </div>
                  {openRow === i && (
                    <Select
                      className="input-sm mt-2"
                      data-autofocus
                      value={m.jobIds[0] ?? ''}
                      onChange={(e) => {
                        const id = e.target.value || null;
                        setMatchOver((o) => ({ ...o, [i]: id }));
                        setActionOver((o) => {
                          const n = { ...o };
                          delete n[i];
                          return n;
                        });
                        setOpenRow(null);
                      }}
                      aria-label={tx('對應到哪個案件', 'Match to job')}
                    >
                      <option value="">{tx('（不對應，視為新的一筆）', '(none — treat as new)')}</option>
                      {job && !candidates.includes(job) && <option value={job.id}>{job.title}</option>}
                      {candidates.map((j) => (
                        <option key={j.id} value={j.id}>
                          {j.title}
                          {j.clientId ? ` · ${clientMap.get(j.clientId)?.name ?? ''}` : ''}
                          {j.status === 'paid' ? tx('（已收款）', ' (paid)') : ''}
                        </option>
                      ))}
                    </Select>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    );
  };

  return (
    <Sheet
      open={reportImport.open}
      onClose={closeReportImport}
      size="xl"
      title={tx('匯入報表', 'Import a report')}
      subtitle={stage.at === 'pick' ? tx('讀取客戶或翻譯社給的報表，自動對應到你的案件。', 'Read a statement from a client or agency and match it to your jobs.') : undefined}
      footer={
        stage.at === 'review' && plan ? (
          <>
            <span className="mr-auto text-[12.5px] text-muted">
              {[
                plan.counts.paid && tx(`${plan.counts.paid} 筆標記已收款`, `${plan.counts.paid} to mark paid`),
                plan.counts.updated && tx(`${plan.counts.updated} 筆更新`, `${plan.counts.updated} to update`),
                plan.counts.created && tx(`${plan.counts.created} 筆新增`, `${plan.counts.created} to add`),
              ]
                .filter(Boolean)
                .join(' · ') || tx('沒有要變更的項目', 'Nothing to change')}
            </span>
            {queue ? (
              <Button variant="ghost" onClick={() => next() || closeReportImport()}>
                {tx('略過', 'Skip')}
              </Button>
            ) : (
              <Button variant="ghost" onClick={closeReportImport}>
                {tx('取消', 'Cancel')}
              </Button>
            )}
            <Button variant="primary" disabled={!total || busy} onClick={() => void apply()}>
              {tx('套用', 'Apply')}
            </Button>
          </>
        ) : undefined
      }
    >
      {stage.at !== 'pick' && progress}
      {body()}
    </Sheet>
  );
}
