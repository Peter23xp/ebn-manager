import { MOBILE_MONEY_AVAILABLE, MOBILE_MONEY_UNAVAILABLE_MESSAGE } from '@/lib/mobile-money';

export function MobileMoneyUnavailableNotice() {
  if (MOBILE_MONEY_AVAILABLE) return null;
  return <p role="status" className="my-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{MOBILE_MONEY_UNAVAILABLE_MESSAGE}</p>;
}
