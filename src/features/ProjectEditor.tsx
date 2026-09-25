// Create or edit a project. An ongoing project starts empty (or with jobs
// you already have) and grows as new jobs come in; the other templates
// (game, series, book, software) create their parts as jobs in one step.

import { Check } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useData } from '../db/data';
import { createProject, newJob, newProject, saveProject } from '../db/repo';
import { fxRate } from '../domain/money';
import { isOngoing, PART_KINDS, PROJECT_TEMPLATES, partLabel, partTitle, templateFor, type PartKind } from '../domain/projects';
import type { Job, JobStatus, Project, ProjectKind } from '../domain/types';
import { getLang, tx } from '../i18n';
import { Button, cx, Field, Input, NumberInput, Segmented, Sheet, Textarea, Toggle } from '../ui/kit';
import { useUI } from '../ui/store';
import { clientHabits, ClientSelect, LangSelect } from './common';
import { JobPicker } from './JobPicker';

const DOMAIN_FOR: Record<ProjectKind, string | undefined> = { ongoing: undefined, game: 'games', series: 'media', book: 'literary', software: 'software', custom: undefined };

export function ProjectEditor() {
  const { projectEditor, closeProjectEditor, navigate, toast } = useUI();
  const { jobs, settings, today, clientMap } = useData();
  const [p, setP] = useState<Project | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [count, setCount] = useState<number | undefined>(8);
  const [start, setStart] = useState<JobStatus>('quote');
  const [existing, setExisting] = useState<Set<string>>(new Set());
  const isNew = projectEditor.isNew;
  const lang = getLang();

  useEffect(() => {
    if (!projectEditor.open) {
      setP(null);
      return;
    }
    const base = projectEditor.project ?? newProject({ kind: 'ongoing', sourceLang: settings.defaultSourceLang, targetLang: settings.defaultTargetLang });
    setP({ ...base });
    const t = templateFor(base.kind);
    setPicked(new Set(t.selected));
    setCount(t.count);
    setStart('quote');
    setExisting(new Set());
  }, [projectEditor.open, projectEditor.project, settings.defaultSourceLang, settings.defaultTargetLang]);

  const template = useMemo(() => (p ? templateFor(p.kind) : undefined), [p]);
  if (!p || !template) return null;
  const set = (x: Partial<Project>) => setP((cur) => (cur ? { ...cur, ...x } : cur));

  const chooseKind = (kind: ProjectKind) => {
    const t = templateFor(kind);
    set({ kind });
    setPicked(new Set(t.selected));
    setCount(t.count);
  };

  const ongoing = isOngoing(p);

  const plannedParts = (): { kind: PartKind; label: string }[] => {
    if (ongoing) return [];
    const out: { kind: PartKind; label: string }[] = [];
    for (const id of template.parts) {
      if (!picked.has(id)) continue;
      const kind = PART_KINDS.find((k) => k.id === id)!;
      if (kind.numbered) for (let n = 1; n <= Math.min(60, Math.max(1, count ?? 1)); n++) out.push({ kind, label: partLabel(kind, lang, n) });
      else out.push({ kind, label: partLabel(kind, lang) });
    }
    return out;
  };

  const save = async () => {
    const name = p.name.trim();
    if (!name) return;
    const project = { ...p, name };
    if (!isNew) {
      await saveProject(project);
      closeProjectEditor();
      toast(tx('已儲存', 'Saved'));
      return;
    }
    const client = project.clientId ? clientMap.get(project.clientId) : undefined;
    const habits = clientHabits(client?.id, jobs);
    const currency = client?.currency ?? settings.baseCurrency;
    const parts: Job[] = plannedParts().map(({ kind, label }) =>
      newJob({
        title: partTitle(name, label, lang),
        projectId: project.id,
        part: kind.id,
        clientId: client?.id,
        service: kind.service,
        unit: kind.unit,
        quantity: 0,
        rate: client?.defaultUnit === kind.unit ? client.defaultRate ?? 0 : habits?.unit === kind.unit ? habits.rate ?? 0 : 0,
        currency,
        fxToBase: fxRate(currency, settings.baseCurrency, settings.fx.rates),
        sourceLang: project.sourceLang ?? settings.defaultSourceLang,
        targetLang: project.targetLang ?? settings.defaultTargetLang,
        domain: DOMAIN_FOR[project.kind] ?? habits?.domain,
        catTool: habits?.catTool,
        status: start,
        progress: 0,
        receivedAt: today,
        dueAt: project.dueAt,
        incomeCategory: '9B',
        confidential: project.confidential || client?.kind === 'agency',
      }),
    );
    if (ongoing) {
      const moved = jobs.filter((j) => existing.has(j.id));
      await createProject(project, moved);
      closeProjectEditor();
      toast(moved.length ? tx(`已建立專案「${name}」，歸入 ${moved.length} 件案件`, `Created “${name}” with ${moved.length} jobs`) : tx(`已建立專案「${name}」`, `Created “${name}”`));
      navigate('/projects/' + project.id);
      return;
    }
    await createProject(project, parts);
    closeProjectEditor();
    toast(tx(`已建立專案「${name}」，含 ${parts.length} 個部分`, `Created “${name}” with ${parts.length} parts`));
    navigate('/projects/' + project.id);
  };

  const planned = isNew ? plannedParts() : [];

  return (
    <Sheet
      open={projectEditor.open}
      onClose={closeProjectEditor}
      size="lg"
      title={isNew ? tx('新增專案', 'New project') : tx('編輯專案', 'Edit project')}
      subtitle={
        isNew
          ? ongoing
            ? tx('同一個專案的案件陸續進來？先建專案，之後每接到一件就歸進來。', 'Jobs from one project keep coming in? Create it now and file each new job under it.')
            : tx('大案子拆成部分來管理：每個部分有自己的字數、費率、截止日與進度。', 'Split a big engagement into parts, each with its own volume, rate, deadline and progress.')
          : undefined
      }
      footer={
        <>
          {isNew && (
            <span className="mr-auto text-[12.5px] text-muted">
              {ongoing
                ? existing.size
                  ? tx(`將歸入 ${existing.size} 件案件`, `${existing.size} jobs will be filed here`)
                  : tx('之後隨時可以加入案件', 'Add jobs any time')
                : tx(`將建立 ${planned.length} 個部分`, `${planned.length} parts will be created`)}
            </span>
          )}
          <Button variant="ghost" onClick={closeProjectEditor}>
            {tx('取消', 'Cancel')}
          </Button>
          <Button variant="primary" disabled={!p.name.trim()} onClick={() => void save()}>
            {isNew ? tx('建立專案', 'Create project') : tx('儲存', 'Save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={tx('專案名稱', 'Project name')} htmlFor="pj-name" className="sm:col-span-2">
            <Input id="pj-name" data-autofocus value={p.name} onChange={(e) => set({ name: e.target.value })} placeholder={tx('例如：《星墜紀元》在地化', 'e.g. Starfall Chronicles localisation')} />
          </Field>
          <Field label={tx('客戶', 'Client')} htmlFor="pj-client">
            <ClientSelect
              id="pj-client"
              value={p.clientId}
              onChange={(id) => {
                const h = clientHabits(id, jobs);
                set({ clientId: id, ...(h ? { sourceLang: h.sourceLang, targetLang: h.targetLang } : {}) });
              }}
            />
          </Field>
          <Field label={tx('最終截稿日', 'Final deadline')} htmlFor="pj-due" hint={isNew && !ongoing ? tx('先套用到每個部分，之後可以個別調整。', 'Applied to every part for now; adjust each one later.') : isNew ? tx('不確定可以留空。', 'Leave empty if unsure.') : undefined}>
            <Input id="pj-due" type="date" value={p.dueAt ?? ''} onChange={(e) => set({ dueAt: e.target.value || undefined })} />
          </Field>
          <Field label={tx('原文', 'From')} htmlFor="pj-src">
            <LangSelect id="pj-src" value={p.sourceLang ?? settings.defaultSourceLang} onChange={(v) => set({ sourceLang: v })} />
          </Field>
          <Field label={tx('譯文', 'Into')} htmlFor="pj-tgt">
            <LangSelect id="pj-tgt" value={p.targetLang ?? settings.defaultTargetLang} onChange={(v) => set({ targetLang: v })} />
          </Field>
        </div>

        {isNew && (
          <>
            <Field label={tx('專案類型', 'Type of project')}>
              <div className="flex flex-wrap gap-2">
                {PROJECT_TEMPLATES.map((t) => (
                  <button key={t.kind} type="button" className="chip" aria-pressed={p.kind === t.kind} onClick={() => chooseKind(t.kind)}>
                    {lang === 'en' ? t.en : t.zh}
                  </button>
                ))}
              </div>
            </Field>
            {ongoing ? (
              <Field label={tx('把已經接的案件加進來', 'Add jobs you already have')} hint={tx('可以不選，之後在專案頁或編輯案件時再加。', 'Optional; you can also add them later from the project or a job.')}>
                <JobPicker project={p} picked={existing} onChange={setExisting} />
              </Field>
            ) : (
            <>
            <Field label={tx('包含哪些部分', 'Parts')} hint={tx('之後隨時可以再加、改名或刪除。', 'You can add, rename or remove parts any time.')}>
              <div className="flex flex-wrap gap-2">
                {template.parts.map((id) => {
                  const k = PART_KINDS.find((x) => x.id === id)!;
                  const on = picked.has(id);
                  return (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        setPicked((s) => {
                          const n = new Set(s);
                          if (n.has(id)) n.delete(id);
                          else n.add(id);
                          return n;
                        })
                      }
                      className={cx('chip', on && 'pl-2')}
                    >
                      {on && <Check size={14} strokeWidth={2.6} />}
                      {k.numbered ? (k.id === 'episode' ? tx('分集', 'Episodes') : tx('章節', 'Chapters')) : lang === 'en' ? k.en : k.zh}
                    </button>
                  );
                })}
              </div>
              {template.parts.some((id) => picked.has(id) && PART_KINDS.find((k) => k.id === id)?.numbered) && (
                <div className="mt-3 flex items-center gap-3">
                  <span className="text-[13px] text-ink-2">{picked.has('episode') ? tx('共幾集', 'How many episodes') : tx('共幾章', 'How many chapters')}</span>
                  <NumberInput className="input-sm w-24" value={count} onChange={setCount} min={1} aria-label={tx('數量', 'Count')} />
                </div>
              )}
            </Field>
            <Field label={tx('目前狀態', 'Where it stands')}>
              <Segmented
                size="sm"
                value={start}
                onChange={(v) => setStart(v)}
                options={[
                  { value: 'quote', label: tx('還在確認（詢價中）', 'Coming up (quote)') },
                  { value: 'active', label: tx('已確認，開始進行', 'Confirmed, in progress') },
                ]}
              />
            </Field>
            {planned.length > 0 && (
              <div className="rounded-[3px] border border-line bg-surface-2 px-3.5 py-3">
                <div className="eyebrow mb-2">{tx('預覽', 'Preview')}</div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-ink-2">
                  {planned.slice(0, 14).map((x, i) => (
                    <span key={i}>{x.label}</span>
                  ))}
                  {planned.length > 14 && <span className="text-muted">{tx(`…共 ${planned.length} 個`, `…${planned.length} in all`)}</span>}
                </div>
              </div>
            )}
            </>
            )}
          </>
        )}

        {!isNew && (
          <Field label={tx('備註', 'Notes')} htmlFor="pj-notes" hint={tx('窗口、交稿格式、字數限制…', 'Contacts, delivery format, length limits…')}>
            <Textarea id="pj-notes" rows={4} value={p.notes ?? ''} onChange={(e) => set({ notes: e.target.value || undefined })} />
          </Field>
        )}

        <div className="border-t border-line pt-4">
          <Toggle
            checked={!!p.confidential}
            onChange={(v) => set({ confidential: v })}
            label={tx('保密專案（NDA）', 'Confidential (NDA)')}
            description={tx('履歷與個人網站不會顯示專案名稱。', 'Your résumé and portfolio site will not show the project name.')}
          />
          {p.confidential && (
            <Field label={tx('對外名稱', 'Public description')} htmlFor="pj-public" className="mt-3">
              <Input id="pj-public" value={p.publicTitle ?? ''} onChange={(e) => set({ publicTitle: e.target.value || undefined })} placeholder={tx('例如：北美獨立遊戲 奇幻 RPG 在地化', 'e.g. Fantasy RPG for a North American indie studio')} />
            </Field>
          )}
        </div>
      </div>
    </Sheet>
  );
}
