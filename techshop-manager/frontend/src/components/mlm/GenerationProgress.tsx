import type { GenerationProgress as Progress } from '@/types/mlm';

export function GenerationProgress({ progression }: { progression?: Progress }) {
  if (!progression || progression.currentLevel === undefined) {
    return <p className="text-sm text-text-muted" role="status">Progression indisponible — actualisez les données serveur.</p>;
  }
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-text">
        {progression.nextLevel ? `Progression vers ${progression.nextLevel.nom} — génération ${progression.currentGeneration}` : 'Parcours complet — rang 8 atteint'}
      </p>
      <p className="text-sm text-text">{progression.completedPositions} / {progression.requiredPositions} positions validées</p>
      <div role="progressbar" aria-label="Progression de génération" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progression.progressPercentage} className="h-3 rounded-full bg-bg-inset overflow-hidden">
        <div className="h-full bg-primary-accent" style={{ width: `${progression.progressPercentage}%` }} />
      </div>
      {progression.nextLevel && <p className="text-xs text-text-muted">{progression.remainingPositions} positions restantes · {progression.progressPercentage}%</p>}
      <p className="text-xs text-text-muted">Plus haut rang acquis : {progression.highestLevelAchieved || 'Aucun'}</p>
    </div>
  );
}
