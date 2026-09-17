export function formatMlmMoney(amount: string | number | null | undefined): string {
  if (amount == null || amount === '' || !Number.isFinite(Number(amount))) return '—';
  return new Intl.NumberFormat('fr-CD', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(amount)) + ' USD';
}

export function formatMlmDate(date: string | null | undefined, timezone = 'Africa/Lubumbashi'): string {
  if (!date || Number.isNaN(Date.parse(date))) return '—';
  return new Intl.DateTimeFormat('fr-FR', { timeZone: timezone, dateStyle: 'short', timeStyle: 'short' }).format(new Date(date));
}
