import { lazy, Suspense, useEffect } from 'react';
import { useData } from './db/data';
import { setLang } from './i18n';
import { CommandPalette } from './app/CommandPalette';
import { ConfirmDialog, MoreSheet, PageFrame, Sidebar, StampLayer, TabBar, TimerPill, Toasts } from './app/Shell';
import { LogoMark } from './app/Logo';
import { QuickAdd } from './features/QuickAdd';
import { JobEditor } from './features/JobEditor';
import { ClientEditor } from './features/ClientEditor';
import { ProjectEditor } from './features/ProjectEditor';
import { DropImport } from './features/DropImport';
import { matchRoute, useUI } from './ui/store';
import { startAutoSync } from './sync/engine';
import { loadAIKey } from './ai/claude';
import { loadDemo } from './db/repo';
import { DemoBanner } from './app/DemoBanner';
import { Overture } from './app/Overture';
import { Dashboard } from './pages/Dashboard';
import { Jobs } from './pages/Jobs';
import { JobDetail } from './pages/JobDetail';
import { Onboarding } from './pages/Onboarding';

const Clients = lazy(() => import('./pages/Clients').then((m) => ({ default: m.Clients })));
const ClientDetail = lazy(() => import('./pages/ClientDetail').then((m) => ({ default: m.ClientDetail })));
const Money = lazy(() => import('./pages/Money').then((m) => ({ default: m.Money })));
const InvoiceView = lazy(() => import('./pages/InvoiceView').then((m) => ({ default: m.InvoiceView })));
const Insights = lazy(() => import('./pages/Insights').then((m) => ({ default: m.Insights })));
const Resume = lazy(() => import('./pages/Resume').then((m) => ({ default: m.Resume })));
const Wrapped = lazy(() => import('./pages/Wrapped').then((m) => ({ default: m.Wrapped })));
const Tools = lazy(() => import('./pages/Tools').then((m) => ({ default: m.Tools })));
const Tax = lazy(() => import('./pages/Tax').then((m) => ({ default: m.Tax })));
const SettingsPage = lazy(() => import('./pages/Settings').then((m) => ({ default: m.SettingsPage })));
const Focus = lazy(() => import('./pages/Focus').then((m) => ({ default: m.Focus })));
const Projects = lazy(() => import('./pages/Projects').then((m) => ({ default: m.Projects })));
const ProjectDetail = lazy(() => import('./pages/ProjectDetail').then((m) => ({ default: m.ProjectDetail })));
const ReportImport = lazy(() => import('./features/ReportImport').then((m) => ({ default: m.ReportImport })));
const Pair = lazy(() => import('./pages/Pair').then((m) => ({ default: m.Pair })));

function Route() {
  const route = useUI((s) => s.route);
  let p: Record<string, string> | null;
  if (route === '/' || route === '') return <Dashboard />;
  if (matchRoute(route, '/jobs')) return <Jobs />;
  if ((p = matchRoute(route, '/jobs/:id'))) return <JobDetail id={p.id} />;
  if (matchRoute(route, '/projects')) return <Projects />;
  if ((p = matchRoute(route, '/projects/:id'))) return <ProjectDetail id={p.id} />;
  if (matchRoute(route, '/clients')) return <Clients />;
  if ((p = matchRoute(route, '/clients/:id'))) return <ClientDetail id={p.id} />;
  if (matchRoute(route, '/money')) return <Money />;
  if ((p = matchRoute(route, '/money/invoices/:id'))) return <InvoiceView id={p.id} />;
  if (matchRoute(route, '/insights')) return <Insights />;
  if (matchRoute(route, '/resume')) return <Resume />;
  if (matchRoute(route, '/wrapped')) return <Wrapped />;
  if (matchRoute(route, '/tools')) return <Tools />;
  if (matchRoute(route, '/tax')) return <Tax />;
  if (matchRoute(route, '/settings')) return <SettingsPage />;
  if ((p = matchRoute(route, '/settings/:section'))) return <SettingsPage section={p.section} />;
  return <Dashboard />;
}

function ReportImportMount() {
  const open = useUI((s) => s.reportImport.open);
  if (!open) return null;
  return (
    <Suspense fallback={null}>
      <ReportImport />
    </Suspense>
  );
}

function Splash() {
  return (
    <div className="grid min-h-dvh place-items-center">
      <LogoMark size={56} className="animate-[pulseDot_1.2s_ease_infinite]" />
    </div>
  );
}

function useGlobalShortcuts() {
  const { openQuickAdd, setPalette, navigate } = useUI();
  useEffect(() => {
    let g = false;
    let gTimer: ReturnType<typeof setTimeout> | undefined;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette(!useUI.getState().palette);
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.querySelector('[role="dialog"]')) return;
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        openQuickAdd();
      } else if (e.key === '/') {
        e.preventDefault();
        setPalette(true);
      } else if (e.key === 'g') {
        g = true;
        clearTimeout(gTimer);
        gTimer = setTimeout(() => (g = false), 900);
      } else if (g) {
        const map: Record<string, string> = { d: '/', p: '/projects', j: '/jobs', c: '/clients', m: '/money', i: '/insights', r: '/resume', t: '/tools', s: '/settings' };
        if (map[e.key]) navigate(map[e.key]);
        g = false;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openQuickAdd, setPalette, navigate]);
}

export default function App() {
  const { ready } = useData();
  return (
    <>
      <AppBody />
      <Overture ready={ready} />
    </>
  );
}

function AppBody() {
  const { ready, settings, jobs } = useData();
  const route = useUI((s) => s.route);
  const navigate = useUI((s) => s.navigate);
  const openQuickAdd = useUI((s) => s.openQuickAdd);
  const openReportImport = useUI((s) => s.openReportImport);
  setLang(settings.lang);
  useGlobalShortcuts();

  useEffect(() => {
    // only undo a theme we set ourselves, so a host page's own data-theme survives
    const root = document.documentElement;
    if (settings.theme === 'system') {
      if (root.dataset.wtTheme) {
        root.removeAttribute('data-theme');
        delete root.dataset.wtTheme;
      }
    } else {
      root.setAttribute('data-theme', settings.theme);
      root.dataset.wtTheme = '1';
    }
  }, [settings.theme]);

  useEffect(() => {
    if (__DEMO_BUILD__ && ready && !settings.onboarded && jobs.length === 0) void loadDemo();
  }, [ready, settings.onboarded, jobs.length]);

  useEffect(() => {
    void startAutoSync();
    void loadAIKey();
  }, []);

  // text shared into the installed app (Android share sheet → Wordtrail)
  const shareReady = ready && (settings.onboarded || jobs.length > 0);
  useEffect(() => {
    if (!shareReady) return;
    let params: URLSearchParams;
    try {
      params = new URLSearchParams(window.location.search);
    } catch {
      return;
    }
    if (params.get('shared-file')) {
      try {
        history.replaceState(null, '', window.location.pathname + window.location.hash);
      } catch {
        /* ignore */
      }
      void (async () => {
        const cache = await caches.open('wordtrail-share');
        const res = await cache.match('shared-file');
        if (!res) return;
        await cache.delete('shared-file');
        const blob = await res.blob();
        const name = decodeURIComponent(res.headers.get('x-file-name') ?? 'report');
        openReportImport(new File([blob], name, { type: blob.type }));
      })().catch(() => undefined);
      return;
    }
    const shared = ['title', 'text', 'url']
      .map((k) => params.get(k)?.trim())
      .filter((v, i, a): v is string => !!v && a.indexOf(v) === i)
      .join('\n');
    if (!shared) return;
    try {
      history.replaceState(null, '', window.location.pathname + window.location.hash);
    } catch {
      /* ignore */
    }
    openQuickAdd(shared);
  }, [shareReady, openQuickAdd, openReportImport]);

  useEffect(() => {
    if (route === '/new') {
      navigate('/', { replace: true });
      openQuickAdd();
    }
  }, [route, navigate, openQuickAdd]);

  if (!ready) return <Splash />;

  const pair = matchRoute(route, '/pair/:payload');
  if (pair)
    return (
      <Suspense fallback={<Splash />}>
        <Pair payload={pair.payload} />
      </Suspense>
    );

  if (!settings.onboarded && jobs.length === 0) return __DEMO_BUILD__ ? <Splash /> : <Onboarding />;

  const focus = matchRoute(route, '/focus/:id');
  if (focus)
    return (
      <Suspense fallback={<Splash />}>
        <Focus id={focus.id} />
        <Toasts />
        <StampLayer />
      </Suspense>
    );

  if (route === '/wrapped')
    return (
      <Suspense fallback={<Splash />}>
        <Wrapped />
        <Toasts />
      </Suspense>
    );

  return (
    <div key={settings.lang} className="min-h-dvh">
      {__DEMO_BUILD__ && <DemoBanner />}
      <Sidebar />
      <main className="lg:pl-[232px] print:pl-0">
        <PageFrame key={route}>
          <Suspense fallback={<div className="h-[60vh]" />}>
            <Route />
          </Suspense>
        </PageFrame>
      </main>
      <TabBar />
      <TimerPill />
      <MoreSheet />
      <QuickAdd />
      <JobEditor />
      <ClientEditor />
      <ProjectEditor />
      <ReportImportMount />
      <DropImport />
      <CommandPalette />
      <ConfirmDialog />
      <Toasts />
      <StampLayer />
    </div>
  );
}
