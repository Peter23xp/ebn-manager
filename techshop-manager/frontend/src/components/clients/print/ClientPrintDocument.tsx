import type { ClientRow } from '@/lib/clients.api';
import { CLIENT_PRINT_STATUS, type ClientPrintMode, type ClientPrintSnapshot } from './client-print';

export function ClientPrintDocument({ snapshot, rows, mode, generatedAt }: {
  snapshot: ClientPrintSnapshot;
  rows: ClientRow[];
  mode: ClientPrintMode;
  generatedAt: Date;
}) {
  return (
    <article className="client-print-sheet">
      <header className="client-print-heading">
        <img src="/assets/Progress%20business%20logo.png" alt="Progress Business" width="100" height="64" />
        <div>
          <p className="client-print-brand">Progress Business</p>
          <h2>Liste des clients</h2>
          <p>Édité le {generatedAt.toLocaleString('fr-CD')}</p>
        </div>
      </header>
      <div className="client-print-summary">
        <p>{mode === 'all' ? 'Tous les résultats filtrés' : `Page courante · page ${snapshot.filters.page ?? 1}`} · {rows.length.toLocaleString('fr')} client{rows.length !== 1 ? 's' : ''}</p>
        <p>Site : {snapshot.siteLabel} · Statut : {snapshot.filters.statut ? CLIENT_PRINT_STATUS[snapshot.filters.statut] : 'Tous'}</p>
        <p>Recherche : {snapshot.filters.search || 'Aucune'}</p>
      </div>
      <table aria-label="Clients à imprimer">
        <colgroup><col style={{ width: '18%' }} /><col style={{ width: '28%' }} /><col style={{ width: '22%' }} /><col style={{ width: '17%' }} /><col style={{ width: '15%' }} /></colgroup>
        <thead><tr>{['Matricule', 'Nom', 'Téléphone', 'Site', 'Statut'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
        <tbody>
          {rows.map(client => (
            <tr key={client.id}>
              <td>{client.matricule || client.codeParrain || '—'}</td>
              <td>{client.prenom} {client.nom}</td>
              <td>{client.telephone || '—'}</td>
              <td>{client.site?.nom || '—'}</td>
              <td>{CLIENT_PRINT_STATUS[client.statut] ?? client.statut}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <footer>Document confidentiel · Usage interne · {rows.length.toLocaleString('fr')} client{rows.length !== 1 ? 's' : ''}</footer>
    </article>
  );
}
