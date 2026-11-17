import { SetMetadata } from '@nestjs/common';
import type { Feature } from '../access/features';

export const FEATURE_KEY = 'feature';

/**
 * Rattache une route (ou tout un contrôleur) à une fonctionnalité que le super
 * admin peut retirer à un utilisateur. Vérifié par RolesGuard.
 */
export const RequireFeature = (feature: Feature) => SetMetadata(FEATURE_KEY, feature);
