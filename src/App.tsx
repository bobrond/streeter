import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useAppData } from './db/hooks';
import { JournalScreen } from './features/journal/JournalScreen';
import { ObjectivesScreen } from './features/objectives/ObjectivesScreen';
import { SessionScreen } from './features/session/SessionScreen';
import { SettingsScreen } from './features/settings/SettingsScreen';
import { ImportReportScreen } from './features/setup/ImportReportView';
import { WelcomeScreen } from './features/setup/WelcomeScreen';
import { TodayScreen } from './features/today/TodayScreen';
import { WeekScreen } from './features/week/WeekScreen';
import type { ImportReport } from './io/xlsx/importWorkbook';
import { matchRoute, navigate, useRoute } from './lib/router';
import { TabBar } from './ui/TabBar';
import { ToastHost } from './ui/Toast';
import { tabOf } from './ui/tabs';

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
  if (report) return <ImportReportScreen report={report} onDone={() => setReport(null)} />;
  if (data === null) return <WelcomeScreen onImported={setReport} />;

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
      {screen}
      <TabBar path={path} />
      <ToastHost />
    </div>
  );
}
