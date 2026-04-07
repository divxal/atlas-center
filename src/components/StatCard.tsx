import "../styles/StatCard.css";

interface Props {
  label: string;
  children: React.ReactNode;
}

export function StatCard({ label, children }: Props) {
  return (
    <div className="stat-card">
      <span className="stat-card-label">{label}</span>
      {children}
    </div>
  );
}
