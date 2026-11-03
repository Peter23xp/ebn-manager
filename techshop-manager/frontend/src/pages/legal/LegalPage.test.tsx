import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import LegalPage, { LEGAL_DOCS } from './LegalPage';
import { parseMarkdown, LegalMarkdown } from '@/components/legal/LegalMarkdown';

afterEach(cleanup);

function renderAt(path: string) {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes><Route path="/legal/:slug" element={<LegalPage />} /></Routes>
      </MemoryRouter>
    </HelmetProvider>,
  );
}

describe('LegalPage', () => {
  it.each(LEGAL_DOCS.map(d => [d.slug, d.titre]))('affiche le document %s', (slug, titre) => {
    renderAt(`/legal/${slug}`);
    expect(screen.getByRole('heading', { level: 1, name: new RegExp(`^${titre}`) })).toBeInTheDocument();
    expect(screen.getByText(/Dernière mise à jour : 3 novembre 2026/)).toBeInTheDocument();
    // Navigation entre les 4 documents
    for (const d of LEGAL_DOCS) expect(screen.getByRole('link', { name: d.titre })).toBeInTheDocument();
  });

  it('renvoie la 404 pour un document inconnu', () => {
    renderAt('/legal/inconnu');
    expect(screen.getByText('Page introuvable')).toBeInTheDocument();
  });
});

describe('LegalMarkdown', () => {
  it('reconnaît titres, listes, citations et tableaux', () => {
    const kinds = parseMarkdown('# T\n\n> note\n\n## Section\n\n- a\n- b\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\ntexte').map(b => b.kind);
    expect(kinds).toEqual(['h1', 'quote', 'h2', 'ul', 'table', 'p']);
  });

  it('surligne les cases à remplir et les hypothèses, et rend les URL cliquables', () => {
    render(<LegalMarkdown source={'Siège : **[ADRESSE_SIÈGE]** [HYPOTHÈSE : à valider] voir https://exemple.be/page.'} />);
    expect(screen.getByText('[ADRESSE_SIÈGE]').tagName).toBe('MARK');
    expect(screen.getByText('[HYPOTHÈSE : à valider]')).toHaveClass('lg-assume');
    expect(screen.getByRole('link', { name: 'exemple.be/page' })).toHaveAttribute('href', 'https://exemple.be/page');
  });
});
