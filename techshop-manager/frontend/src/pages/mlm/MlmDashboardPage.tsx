import { useQuery } from '@tanstack/react-query';
import { mlmApi } from '@/lib/mlm.api';
import { NetworkStatsCards } from '@/components/mlm/NetworkStatsCards';

export default function MlmDashboardPage() {
  const stats = useQuery({ queryKey: ['mlm', 'stats'], queryFn: async () => (await mlmApi.getStats()).data });
  return <section className="space-y-6"><header><h1 className="text-2xl font-bold text-primary">Réseau MLM — EBN</h1><p className="mt-1 text-text-muted">Suivi des membres, commissions et promotions.</p></header><NetworkStatsCards stats={stats.data} /><section className="rounded-xl border border-border bg-white p-5"><h2 className="font-bold text-text">Répartition des membres par niveau</h2><p className="mt-2 text-sm text-text-muted">Les données détaillées apparaîtront dès que l’API MLM sera disponible.</p></section></section>;
}
