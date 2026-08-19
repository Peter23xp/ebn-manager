import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import type { StatutClient, StatutStock } from '@/types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCDF(amount: number): string {
  return new Intl.NumberFormat('fr-CD', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount) + ' CDF';
}

export function formatUSD(amount: number): string {
  return new Intl.NumberFormat('fr-CD', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount) + ' USD';
}

export function formatUSDShort(amount: number): string {
  if (amount >= 1000000) {
    return (amount / 1000000).toLocaleString('fr-CD', { maximumFractionDigits: 1 }) + 'M USD';
  }
  if (amount >= 1000) {
    return (amount / 1000).toLocaleString('fr-CD', { maximumFractionDigits: 1 }) + 'K USD';
  }
  return formatUSD(amount);
}

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '—';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '—';
  return format(d, 'dd/MM/yyyy', { locale: fr });
}

export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return '—';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '—';
  return format(d, 'dd/MM/yyyy HH:mm', { locale: fr });
}

export function formatRelative(date: string | Date | null | undefined): string {
  if (!date) return '—';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '—';
  return formatDistanceToNow(d, { locale: fr, addSuffix: true });
}

export function statutClientColor(statut: StatutClient): string {
  const map: Record<StatutClient, string> = {
    ACTIF: 'badge-success',
    EN_COURS: 'badge-warning',
    SUSPENDU: 'badge-danger',
    ARCHIVE: 'badge-gray',
  };
  return map[statut] ?? 'badge-gray';
}

export function statutClientLabel(statut: StatutClient): string {
  const map: Record<StatutClient, string> = {
    ACTIF: 'Actif',
    EN_COURS: 'En cours',
    SUSPENDU: 'Suspendu',
    ARCHIVE: 'Archivé',
  };
  return map[statut] ?? statut;
}



export function statutStockColor(statut: StatutStock): string {
  const map: Record<StatutStock, string> = {
    OK: 'badge-success',
    ALERTE: 'badge-warning',
    RUPTURE: 'badge-danger',
  };
  return map[statut] ?? 'badge-gray';
}

export function truncate(str: string, maxLen = 30): string {
  return str.length > maxLen ? str.slice(0, maxLen) + '…' : str;
}

export function initials(nom: string, prenom?: string): string {
  if (prenom) return (prenom[0] + nom[0]).toUpperCase();
  const parts = nom.split(' ');
  return parts.length >= 2 ? (parts[0][0] + parts[1][0]).toUpperCase() : nom.slice(0, 2).toUpperCase();
}
