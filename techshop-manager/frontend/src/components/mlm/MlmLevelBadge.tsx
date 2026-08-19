import React from 'react';
import { cn } from '@/lib/utils';
import { MLM_LEVELS_REF } from '@/types';
import { Award, Crown, Gem, Shield, Star, TrendingUp, Zap } from 'lucide-react';

interface MlmLevelBadgeProps {
  level: number;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
  showIcon?: boolean;
}

const iconMap: Record<string, React.FC<any>> = {
  star: Star,
  award: Award,
  shield: Shield,
  zap: Zap,
  crown: Crown,
  gem: Gem,
  'trending-up': TrendingUp,
};

export const MlmLevelBadge: React.FC<MlmLevelBadgeProps> = ({
  level,
  size = 'md',
  className,
  showIcon = true,
}) => {
  const levelData = MLM_LEVELS_REF.find((l) => l.ordre === level) || MLM_LEVELS_REF[0];
  const Icon = iconMap[levelData.icone] || Star;

  const sizeClasses = {
    xs: 'px-1.5 py-0.5 text-[10px] gap-1',
    sm: 'px-2 py-1 text-xs gap-1.5',
    md: 'px-2.5 py-1 text-sm gap-2',
    lg: 'px-3 py-1.5 text-base gap-2',
  };

  const iconSizes = {
    xs: 10,
    sm: 12,
    md: 16,
    lg: 20,
  };

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full font-medium shadow-sm transition-transform hover:scale-105',
        sizeClasses[size],
        className
      )}
      style={{
        backgroundColor: `${levelData.couleur}15`, // 15% opacity
        color: levelData.couleur,
        border: `1px solid ${levelData.couleur}40`, // 40% opacity border
      }}
    >
      {showIcon && <Icon size={iconSizes[size]} strokeWidth={2.5} />}
      {levelData.nom}
    </span>
  );
};
