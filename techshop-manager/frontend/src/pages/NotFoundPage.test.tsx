/**
 * NotFoundPage — rendu statique de la 404 globale
 */
import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';

import NotFoundPage from './NotFoundPage';

function renderPage() {
  return render(
    <HelmetProvider>
      <MemoryRouter>
        <NotFoundPage />
      </MemoryRouter>
    </HelmetProvider>,
  );
}

describe('NotFoundPage', () => {
  test('affiche le 404', () => {
    renderPage();
    expect(screen.getByText('404')).toBeInTheDocument();
  });

  test('affiche le titre Page introuvable', () => {
    renderPage();
    expect(screen.getByText('Page introuvable')).toBeInTheDocument();
  });

  test('affiche le message explicatif', () => {
    renderPage();
    expect(
      screen.getByText("L'URL que vous avez saisie n'existe pas ou a été déplacée."),
    ).toBeInTheDocument();
  });

  test("lie vers l'accueil, la connexion et le support", () => {
    renderPage();
    expect(screen.getByRole('link', { name: "Retour à l'accueil" })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Se connecter' })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('link', { name: 'Contactez le support' })).toHaveAttribute('href', '/support');
  });
});
