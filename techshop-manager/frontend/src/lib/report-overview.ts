export interface ReportActivity {
  generatedAt: string;
  refunds: { count: number; amount: number };
  pendingSales: { count: number; amount: number };
  netAfterRefunds: number;
  discounts: number;
  averageBasket: number;
  onboardingCDF: number;
  onboarding: Array<{ etape: string; count: number; amount: number; currency: 'CDF' | 'USD'; includedInSales: boolean }>;
  payments: Array<{ mode: string; count: number; amount: number }>;
  clients: { total: number; activated: number; byStatus: Record<string, number> };
  stock: { references: number; units: number; alerts: number; value: number };
}
