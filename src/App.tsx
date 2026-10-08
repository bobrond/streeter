import { Suspense, lazy, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useAppData } from './db/hooks';
import { SessionScreen } from './features/session/SessionScreen';
import { ImportReportScreen } from './features/setup/ImportReportView';
import { WelcomeScreen } from './features/setup/WelcomeScreen';
import { TodayScreen } from './features/today/TodayScreen';
import type { ImportReport } from './io/xlsx/importWorkbook';
import { matchRoute, navigate, useRoute } from './lib/router';
import { TabBar } from './ui/TabBar';
import { ToastHost } from './ui/Toast';
import { tabOf } from './ui/tabs';

// Onglets chargés à la demande : l'accueil et la séance démarrent plus vite.
const WeekScreen = lazy(() => import('./features/week/WeekScreen').then((m) => ({ default: m.WeekScreen })));
const JournalScreen = lazy(() => import('./features/journal/JournalScreen').then((m) => ({ default: m.JournalScreen })));
const ObjectivesScreen = lazy(() => import('./features/objectives/ObjectivesScreen').then((m) => ({ default: m.ObjectivesScreen })));
const SettingsScreen = lazy(() => import('./features/settings/SettingsScreen').then((m) => ({ default: m.SettingsScreen })));

const WITH_TAB_BAR = {
  '--tabbar-h': 'calc(4rem + env(safe-area-inset-bottom))',
  '--footer-pad': '0.75rem',
} as CSSProperties;

export default function App() {
  const data = useAppData();
  const path = useRoute();
  const [report, setReport] = useState<ImportReport | null>(null);

  // Au lancement, une séance interrompue (appel, fermeture) reprend directement.
  const resumed = useRef(false);
  useEffect(() => {
    if (resumed.current || !data) return;
    resumed.current = true;
    const active = data.sessions.find((s) => s.status === 'in_progress');
    if (active && path === '/') navigate(`/session/${active.id}`);
  }, [data, path]);

  if (data === undefined) return null;
  if (report || data === null) {
    return (
      <>
        {report ? <ImportReportScreen report={report} onDone={() => setReport(null)} /> : <WelcomeScreen onImported={setReport} />}
        <ToastHost />
      </>
    );
  }

  const session = matchRoute('/session/:id', path);
  if (session) {
    return (
      <>
        <SessionScreen sessionId={session.id} data={data} />
        <ToastHost belowHeader />
      </>
    );
  }

  let screen;
  switch (tabOf(path)) {
    case '/week':
      screen = <WeekScreen data={data} />;
      break;
    case '/journal':
      screen = <JournalScreen data={data} path={path} />;
      break;
    case '/objectives':
      screen = <ObjectivesScreen data={data} path={path} />;
      break;
    case '/settings':
      screen = <SettingsScreen data={data} path={path} onImported={setReport} onShowReport={setReport} />;
      break;
    default:
      screen = <TodayScreen data={data} />;
  }
  return (
    <div style={WITH_TAB_BAR} className="pb-[var(--tabbar-h)]">
      <Suspense fallback={null}>{screen}</Suspense>
      <TabBar path={path} />
      <ToastHost />
    </div>
  );
}
