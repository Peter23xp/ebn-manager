const labels = ['B', 'Sap', 'Ruby', 'Eme', 'Dia', 'CrD', 'Amb', 'CrA'];
export function CareerProgressBar({ currentLevelOrdre, showLabels = true }: { currentLevelOrdre: number; showLabels?: boolean }) {
  return <div className="flex items-start w-full">{labels.map((label, index) => <div key={label} className="flex flex-1 flex-col items-center"><div className={`h-4 w-4 rounded-full border-2 ${index + 1 <= currentLevelOrdre ? 'bg-primary-accent border-primary-accent' : 'bg-white border-gray-300'}`} />{showLabels && <span className="mt-1 text-[10px] text-text-muted">{label}</span>}</div>)}</div>;
}
