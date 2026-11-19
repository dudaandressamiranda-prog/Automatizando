import { useEffect, useState } from 'react';
import { useData } from './store';
import { Hoje, Tab } from './Hoje';
import { Foco } from './Foco';
import { Contas } from './Contas';
import { Demandas } from './Demandas';
import { Semana } from './Semana';
import { Ajustes } from './Ajustes';
import { Icon, Toaster } from './ui';

const TABS: { id: Tab; nome: string }[] = [
  { id: 'hoje', nome: 'Hoje' }, { id: 'contas', nome: 'Contas' },
  { id: 'demandas', nome: 'Demandas' }, { id: 'semana', nome: 'Semana' },
];

function useTema(tema: 'auto' | 'claro' | 'noite') {
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const aplica = () => {
      const noite = tema === 'noite' || (tema === 'auto' && mq.matches);
      document.documentElement.dataset.theme = noite ? 'noite' : 'claro';
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', noite ? '#13283A' : '#F5EDE1');
    };
    aplica();
    mq.addEventListener('change', aplica);
    return () => mq.removeEventListener('change', aplica);
  }, [tema]);
}

export function App() {
  const data = useData();
  useTema(data.settings.theme);
  const [tab, setTab] = useState<Tab>('hoje');
  const [foco, setFoco] = useState<string | null>(null);
  const [ajustes, setAjustes] = useState(false);
  const go = (t: Tab) => { setTab(t); setFoco(null); setAjustes(false); window.scrollTo(0, 0); };

  let tela;
  if (foco) tela = <Foco stepId={foco} onClose={() => setFoco(null)} />;
  else if (ajustes) tela = <Ajustes onClose={() => { setAjustes(false); window.scrollTo(0, 0); }} />;
  else if (tab === 'hoje') tela = <Hoje go={go} openFoco={setFoco} openAjustes={() => { setAjustes(true); window.scrollTo(0, 0); }} />;
  else if (tab === 'contas') tela = <Contas />;
  else if (tab === 'demandas') tela = <Demandas />;
  else tela = <Semana go={go} />;

  return (
    <div className="app">
      {tela}
      {!foco && (
        <nav className="nav">
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id && !ajustes ? 'on' : ''} onClick={() => go(t.id)}>
              <span className="pill">{Icon[t.id]}</span>{t.nome}
            </button>
          ))}
        </nav>
      )}
      <Toaster />
    </div>
  );
}
