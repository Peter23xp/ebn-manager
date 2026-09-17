import { generationProgress, generationCapacity } from './mlm-generation';
import { describe, it, expect } from '@jest/globals';

describe('four-branch generations', () => {
  const levels = ['Builder', 'Sapphire', 'Ruby', 'Emerald', 'Diamond', 'Crown Diamond', 'Ambassadeur', 'Crown Ambassadeur']
    .map((nom, index) => ({ id: index + 1, ordre: index + 1, nom }));

  it('has no acquired rank before the first complete generation', () => {
    expect(generationProgress(levels, [{ ordre: 1, count: 3 }], 0)).toMatchObject({
      currentLevel: null, nextLevel: levels[0], currentGeneration: 1,
      completedPositions: 3, requiredPositions: 4, remainingPositions: 1, progressPercentage: 75,
    });
  });

  it('acquires Builder, not Sapphire, with four children', () => {
    expect(generationProgress(levels, [{ ordre: 1, count: 4 }], 1)).toMatchObject({
      currentLevel: levels[0], nextLevel: levels[1], requiredPositions: 16, completedPositions: 0,
    });
  });

  it('does not complete generation two when only one branch has children', () => {
    expect(generationProgress(levels, [{ ordre: 1, count: 4 }, { ordre: 2, count: 4 }], 1))
      .toMatchObject({ currentLevel: levels[0], completedPositions: 4, remainingPositions: 12 });
  });

  it('acquires Sapphire from four complete branches', () => {
    expect(generationProgress(levels, [{ ordre: 1, count: 4 }, { ordre: 2, count: 16 }], 2))
      .toMatchObject({ currentLevel: levels[1], currentGeneration: 3, requiredPositions: 64 });
  });

  it('does not infer completion from a total of 100 mixed descendants', () => {
    expect(generationProgress(levels, [{ ordre: 1, count: 3 }, { ordre: 2, count: 12 }, { ordre: 3, count: 48 }, { ordre: 4, count: 37 }], 0).currentLevel).toBeNull();
  });

  it('computes progress independently of the parent and retains historical rank', () => {
    expect(generationProgress(levels, [{ ordre: 1, count: 4 }], 2))
      .toMatchObject({ currentLevel: levels[0], highestLevelAchieved: 2 });
  });

  it('supports eight generations without materializing empty positions', () => {
    const matrices = levels.map(level => ({ ordre: level.ordre, count: generationCapacity(level.ordre) }));
    expect(generationProgress(levels, matrices, 8)).toMatchObject({
      currentLevel: levels[7], nextLevel: null, currentGeneration: 8,
      requiredPositions: 65536, completedPositions: 65536, remainingPositions: 0, progressPercentage: 100,
    });
    expect(matrices.reduce((total, matrix) => total + matrix.count, 0)).toBe(87380);
  });

  it('rejects invalid generation numbers and inconsistent counters', () => {
    expect(() => generationCapacity(0)).toThrow();
    expect(() => generationCapacity(9)).toThrow();
    expect(() => generationProgress(levels, [{ ordre: 1, count: 5 }], 0)).toThrow();
  });
});
