import "../styles/TabNav.css";

export type Tab = "sys" | "monitor" | "red" | "control" | "cara";

interface Props {
  active: Tab;
  onChange: (t: Tab) => void;
}

const TABS: { id: Tab; label: string }[] = [
  { id: "sys",     label: "SISTEMA" },
  { id: "monitor", label: "MONITOR" },
  { id: "red",     label: "RED" },
  { id: "control", label: "CONTROL" },
  { id: "cara",    label: "CARA" },
];

export function TabNav({ active, onChange }: Props) {
  return (
    <nav className="tab-nav">
      {TABS.map(({ id, label }) => (
        <button
          key={id}
          className={`tab-btn ${active === id ? "active" : ""}`}
          onClick={() => onChange(id)}
        >
          {label}
        </button>
      ))}
    </nav>
  );
}
