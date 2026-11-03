/**
 * Vitest global test setup.
 * Imports @testing-library/jest-dom to extend Vitest's expect with DOM matchers
 * (toBeInTheDocument, toHaveStyle, toBeDisabled, etc.)
 */
import '@testing-library/jest-dom';
import { configure } from '@testing-library/react';

// La suite complète tourne en parallèle sur tous les cœurs : un rendu suivi
// d'un refetch peut dépasser le délai par défaut de 1 s de findBy/waitFor
// (échecs intermittents sous charge, jamais en isolation).
configure({ asyncUtilTimeout: 5000 });
