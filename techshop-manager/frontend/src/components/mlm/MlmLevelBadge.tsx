import { Award, Crown, Gem, Hammer } from 'lucide-react';
import type { MlmLevel } from '@/types/mlm';
import { formatUSD } from '@/lib/utils';

const icons = { Builder: Hammer, 'Crown Diamond': Crown, Ambassadeur: Award, 'Crown Ambassadeur': Crown };
export function MlmLevelBadge({ level, size = 'sm', showCommission = false }: { level: MlmLevel; size?: 'xs' | 'sm' | 'md' | 'lg'; showCommission?: boolean }) {
  const Icon = icons[level.nom as keyof typeof icons] ?? Gem;
  const padding = { xs: 'px-1.5 py-0.5 text-[10px]', sm: 'px-2 py-1 text-xs', md: 'px-3 py-1.5 text-sm', lg: 'px-4 py-2 text-sm' }[size];
  return <span className={`inline-flex items-center gap-1.5 rounded-full font-semibold text-white ${padding}`} style={{ backgroundColor: level.couleur }}><Icon size={size === 'xs' ? 11 : 14} />{level.nom}{showCommission && <span>· {formatUSD(level.commissionTotale)}</span>}</span>;
}
