interface SidebarProps { tab: string; setTab: (v: string) => void; }
const tabs = ["Dashboard", "Hunt Config", "History", "Settings"];
export function Sidebar({ tab, setTab }: SidebarProps) {
  return (
    <aside className="sidebar">
      <h1>Pokemon Shiny Hunt Assistant</h1>
      <nav>{tabs.map((t) => <button key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>{t}</button>)}</nav>
    </aside>
  );
}
