import { BadRequestException } from '@nestjs/common';

function reportDate(value: string, end: boolean): Date {
  const isDay = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(isDay ? `${value}T${end ? '23:59:59.999' : '00:00:00.000'}Z` : value);
  if (!Number.isFinite(date.getTime()) || (isDay && date.toISOString().slice(0, 10) !== value)) {
    throw new BadRequestException('La période du rapport contient une date invalide.');
  }
  return date;
}

export function reportPeriod(from?: string, to?: string) {
  const now = new Date();
  const gte = reportDate(from ?? `${now.toISOString().slice(0, 7)}-01`, false);
  const lte = reportDate(to ?? now.toISOString(), true);
  if (gte > lte || lte.getTime() - gte.getTime() > 366 * 5 * 86_400_000) {
    throw new BadRequestException('Choisissez une période chronologique de cinq ans maximum.');
  }
  return { gte, lte };
}

export function reportBuckets(from: Date, to: Date, granularity: 'day' | 'week' | 'month'): Date[] {
  const cursor = new Date(from);
  cursor.setUTCHours(0, 0, 0, 0);
  if (granularity === 'week') cursor.setUTCDate(cursor.getUTCDate() - (cursor.getUTCDay() + 6) % 7);
  if (granularity === 'month') cursor.setUTCDate(1);
  const buckets: Date[] = [];
  while (cursor <= to) {
    buckets.push(new Date(cursor));
    if (granularity === 'month') cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    else cursor.setUTCDate(cursor.getUTCDate() + (granularity === 'week' ? 7 : 1));
  }
  return buckets;
}

export function reportBucketLabel(date: Date, granularity: 'day' | 'week' | 'month'): string {
  const label = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'UTC', year: 'numeric', month: 'short',
    ...(granularity === 'month' ? {} : { day: 'numeric' }),
  }).format(date);
  return granularity === 'week' ? `Semaine du ${label}` : label;
}
