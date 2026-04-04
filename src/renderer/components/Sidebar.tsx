interface SidebarProps {
  tab: string;
  setTab: (value: string) => void;
}

const tabs = ['Dashboard', 'Azahar Diagnostics', 'Hunt Config', 'History', 'Settings'];

export function Sidebar({ tab, setTab }: SidebarProps) {
  return (
    <aside className="sidebar">
      <h1>Pokemon Shiny Hunt Assistant</h1>
      <nav>
        {tabs.map((entry) => (
          <button key={entry} className={tab === entry ? 'active' : ''} onClick={() => setTab(entry)}>
            {entry}
          </button>
        ))}
      </nav>
    </aside>
  );
}