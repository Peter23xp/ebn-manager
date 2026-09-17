export const MATRIX_BRANCHES = 4;
export const MATRIX_GENERATIONS = 8;

export interface GenerationCount {
  ordre: number;
  count: number;
  occupiedCount?: number;
}

export interface GenerationLevel {
  id: number;
  ordre: number;
  nom: string;
}

export function generationCapacity(generation: number): number {
  if (!Number.isInteger(generation) || generation < 1 || generation > MATRIX_GENERATIONS) {
    throw new Error('Generation attendue entre 1 et 8');
  }
  return MATRIX_BRANCHES ** generation;
}

export function generationProgress<Level extends GenerationLevel>(
  levels: Level[], matrices: GenerationCount[], highestLevelAchieved: number,
) {
  const ordered = [...levels].sort((left, right) => left.ordre - right.ordre);
  const counts = new Map(matrices.map(matrix => [matrix.ordre, matrix.count]));
  for (const matrix of matrices) {
    if (!Number.isInteger(matrix.count) || matrix.count < 0 || matrix.count > generationCapacity(matrix.ordre)) {
      throw new Error('Compteur de generation incoherent');
    }
  }
  let completedGeneration = 0;
  for (let generation = 1; generation <= MATRIX_GENERATIONS; generation++) {
    if ((counts.get(generation) ?? 0) !== generationCapacity(generation)) break;
    completedGeneration = generation;
  }
  const currentGeneration = Math.min(completedGeneration + 1, MATRIX_GENERATIONS);
  const requiredPositions = generationCapacity(currentGeneration);
  const completedPositions = counts.get(currentGeneration) ?? 0;
  return {
    currentLevel: ordered.find(level => level.ordre === completedGeneration) ?? null,
    nextLevel: completedGeneration === MATRIX_GENERATIONS ? null : ordered.find(level => level.ordre === currentGeneration) ?? null,
    currentGeneration,
    completedPositions,
    requiredPositions,
    remainingPositions: requiredPositions - completedPositions,
    progressPercentage: Math.round(completedPositions / requiredPositions * 10000) / 100,
    highestLevelAchieved,
  };
}
