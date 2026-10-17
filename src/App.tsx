import { Suspense, lazy, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useAppData } from './db/hooks';
import { useLookups } from './db/lookups';
import { ACTIVE_BAR_SPACE, ActiveSessionBar } from './features/session/ActiveSessionBar';
import { SessionLauncher } from './features/session/SessionLauncher';
import { SessionRuntime } from './features/session/SessionRuntime';
import { SessionScreen } from './features/session/SessionScreen';
import { ImportReportScreen } from './features/setup/ImportReportView';
import { WelcomeScreen } from './features/setup/WelcomeScreen';
import { TodayScreen } from './features/today/TodayScreen';
import type { ImportReport } from './io/xlsx/importWorkbook';
import { matchRoute, navigate, useRoute } from './lib/router';
import { readLocal } from './lib/storage';
import { PROGRESS_VIEW_KEY, TabBar } from './ui/TabBar';
import { ToastHost } from './ui/Toast';
import { PROGRESS_PATHS, tabOf, type ProgressView } from './ui/tabs';

// Onglets chargés à la demande : l'accueil et la séance démarrent plus vite.
const WeekScreen = lazy(() => import('./features/week/WeekScreen').then((m) => ({ default: m.WeekScreen })));
const JournalScreen = lazy(() => import('./features/journal/JournalScreen').then((m) => ({ default: m.JournalScreen })));
const ObjectivesScreen = lazy(() => import('./features/objectives/ObjectivesScreen').then((m) => ({ default: m.ObjectivesScreen })));
const ProgramsScreen = lazy(() => import('./features/programs/ProgramsScreen').then((m) => ({ default: m.ProgramsScreen })));
const SettingsScreen = lazy(() => import('./features/settings/SettingsScreen').then((m) => ({ default: m.SettingsScreen })));

export default function App() {
  const data = useAppData();
  const path = useRoute();
  const [report, setReport] = useState<ImportReport | null>(null);

  // Au lancement, une séance interrompue (appel, fermeture, caméra) reprend directement.
  const resumed = useRef(false);
  useEffect(() => {
    if (resumed.current || !data) return;
    resumed.current = true;
    const active = data.sessions.find((s) => s.status === 'in_progress');
    if (active && path === '/') navigate(`/session/${active.id}`);
  }, [data, path]);

  // « /progress » : la dernière vue de Progression ouverte.
  useEffect(() => {
    if (path.split('?')[0] !== '/progress') return;
    const view = readLocal(PROGRESS_VIEW_KEY);
    navigate(view && view in PROGRESS_PATHS ? PROGRESS_PATHS[view as ProgressView] : PROGRESS_PATHS.skills, { replace: true });
  }, [path]);

  if (data === undefined) return null;
  if (report || data === null) {
    return (
      <>
        {report ? <ImportReportScreen report={report} onDone={() => setReport(null)} /> : <WelcomeScreen onImported={setReport} />}
        <ToastHost />
      </>
    );
  }
  return <AppShell data={data} path={path} onReport={setReport} />;
}

function AppShell({ data, path, onReport }: { data: NonNullable<ReturnType<typeof useAppData>>; path: string; onReport: (report: ImportReport) => void }) {
  const lookups = useLookups(data);
  const active = data.sessions.find((s) => s.status === 'in_progress') ?? null;
  // Repos (sons, vibrations) et écran allumé de la séance en cours, quel que soit l'écran affiché.
  const runtime = <SessionRuntime sessions={data.sessions} />;

  const session = matchRoute('/session/:id', path);
  if (session) {
    return (
      <>
        <SessionScreen sessionId={session.id} data={data} />
        {runtime}
        <ToastHost belowHeader />
      </>
    );
  }

  let screen;
  const first = path.split('?')[0].split('/').filter(Boolean)[0];
  switch (tabOf(path)) {
    case 'session':
      screen = <SessionLauncher data={data} />;
      break;
    case 'programs':
      screen = first === 'settings' ? <SettingsScreen data={data} path={path} onImported={onReport} onShowReport={onReport} /> : <ProgramsScreen data={data} path={path} />;
      break;
    case 'progress':
      screen = first === 'week' ? <WeekScreen data={data} /> : first === 'journal' ? <JournalScreen data={data} path={path} /> : first === 'objectives' ? <ObjectivesScreen data={data} path={path} /> : null;
      break;
    default:
      screen = <TodayScreen data={data} />;
  }
  // Espace réservé en bas : barre d'onglets, et barre de la séance en cours quand il y en a une.
  const style = {
    '--tabbar-h': `calc(4rem + env(safe-area-inset-bottom)${active ? ` + ${ACTIVE_BAR_SPACE}` : ''})`,
    '--footer-pad': '0.75rem',
  } as CSSProperties;
  return (
    <div style={style} className="pb-[var(--tabbar-h)]">
      <Suspense fallback={null}>{screen}</Suspense>
      {active && <ActiveSessionBar session={active} data={data} lookups={lookups} />}
      <TabBar path={path} activeSessionId={active?.id ?? null} />
      {runtime}
      <ToastHost />
    </div>
  );
}
