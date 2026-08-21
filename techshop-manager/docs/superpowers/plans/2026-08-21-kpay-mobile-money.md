# KPay Mobile Money Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Add secure, idempotent USD KPay Mobile Money collections, full refunds, and DRC MLM payouts.

**Architecture:** A dedicated KpayModule owns credentials, KPay HTTP calls, retries, signatures, and webhook routing. A Prisma ledger persists each asynchronous operation; business records change only from a verified terminal webhook.

**Tech Stack:** NestJS 10, Prisma 5/PostgreSQL, Axios, Node crypto, Jest/ts-jest, React 18, TanStack Query, React Hook Form, Zod, Vitest.

**Spec:** docs/superpowers/specs/2026-08-21-kpay-mobile-money-design.md

## Global Constraints

- Every KPay request is USD and accepts only VODACOM_MPESA_COD, AIRTEL_COD, or ORANGE_COD.
- KPay credentials are backend environment variables only.
- The fiche and receipt remain CDF-presented documents; no exchange rate or converted amount is stored or displayed.
- Webhook completion is authoritative; gateway return only verifies then retrieves the KPay resource.
- KPay refunds require a full completed KPay sale. Wallet payouts reserve funds first and debit/release exactly once.
- Existing cash, transfer, manual return, and stock flows must stay operational.

---

### Task 1: Create durable KPay ledger and wallet reservation schema

**Files:**
- Modify: backend/prisma/schema.prisma
- Create: backend/prisma/migrations/20260821000000_add_kpay_mobile_money/migration.sql
- Modify: backend/.env.example
- Test: backend/prisma/schema.kpay.spec.ts

**Interfaces:**
- Produces KpayOperationType, KpayTransactionStatus, MlmPayoutStatus, StatutVente.EN_ATTENTE_PAIEMENT, KpayTransaction, MlmPayout, and Portefeuille.soldeReserve.
- Consumed by Tasks 2–6.

- [ ] **Step 1: Write the failing schema contract test**

~~~ts
import { readFileSync } from 'node:fs';

test('declares an auditable KPay ledger and wallet reserve', () => {
  const schema = readFileSync('prisma/schema.prisma', 'utf8');
  expect(schema).toContain('model KpayTransaction');
  expect(schema).toContain('externalId       String');
  expect(schema).toContain('soldeReserve      Decimal  @default(0)');
  expect(schema).toContain('EN_ATTENTE_PAIEMENT');
});
~~~

- [ ] **Step 2: Run the test to verify RED**

Run: npm test -- schema.kpay.spec.ts

Expected: FAIL because the KPay ledger and wallet reserve do not exist.

- [ ] **Step 3: Implement the minimal schema and migration**

Add enums KpayOperationType (ONBOARDING_PAYMENT, SALE_PAYMENT, SALE_REFUND, MLM_PAYOUT), KpayTransactionStatus (PENDING, PROCESSING, COMPLETED, FAILED, CANCELLED, REFUNDED), and MlmPayoutStatus (PENDING, PROCESSING, COMPLETED, FAILED, CANCELLED). Add KpayTransaction with unique externalId and optional unique kpayPaymentId, USD amount/currency, provider/phone/failure data, metadata, terminal marker/timestamps, and nullable unique relations to sale, onboarding step, return, or payout. Add MlmPayout, Portefeuille.soldeReserve defaulting to zero, a pending sale status, and a return pending-refund state. Generate/review migration with npx prisma migrate dev --name add_kpay_mobile_money. Add KPay environment placeholders from the spec.

- [ ] **Step 4: Verify GREEN**

Run: npx prisma validate --schema=prisma/schema.prisma && npm test -- schema.kpay.spec.ts

Expected: validation and test pass.

- [ ] **Step 5: Commit**

~~~bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20260821000000_add_kpay_mobile_money/migration.sql backend/prisma/schema.kpay.spec.ts backend/.env.example
git commit -m "feat: add KPay payment ledger schema"
~~~

### Task 2: Build typed KPay adapter with retries and signatures

**Files:**
- Create: backend/src/modules/kpay/kpay.types.ts
- Create: backend/src/modules/kpay/kpay.service.ts
- Create: backend/src/modules/kpay/kpay.module.ts
- Test: backend/src/modules/kpay/kpay.service.spec.ts

**Interfaces:**
- Produces initDeposit, getDeposit, initPayout, getPayout, refundDeposit, verifyWebhook, and verifyGatewayReturn.
- Consumed by Tasks 3–6.

- [ ] **Step 1: Write failing service tests**

~~~ts
it('sends a USD DRC deposit with KPay authentication headers', async () => {
  await service.initDeposit({ amount: 12.5, provider: 'AIRTEL_COD', phoneNumber: '243813456789', externalId: 'SALE-1' });
  expect(http.post).toHaveBeenCalledWith('/payments/init', expect.objectContaining({ provider: 'AIRTEL_COD', externalId: 'SALE-1' }));
});
it('retries a 429 with the same external ID', async () => {
  http.post.mockRejectedValueOnce({ response: { status: 429, headers: { 'retry-after': '0' } } }).mockResolvedValueOnce({ data: completedPayment });
  await expect(service.initDeposit(depositInput)).resolves.toEqual(completedPayment);
  expect(http.post).toHaveBeenCalledTimes(2);
});
it('rejects an invalid webhook signature', () => {
  expect(() => service.verifyWebhook(Buffer.from('{"event":"payment.completed"}'), 'bad')).toThrow('Signature KPay invalide');
});
~~~

- [ ] **Step 2: Verify RED**

Run: npm test -- kpay.service.spec.ts

Expected: FAIL because KpayService does not exist.

- [ ] **Step 3: Implement the adapter**

Create an Axios client at KPAY_BASE_URL/api/v1 and attach X-API-Key/X-Secret-Key. Retry network, 429, and 5xx at most three times using exponential backoff plus Retry-After; preserve externalId. Accept only supported DRC providers and digits beginning 243. Use HMAC-SHA256 plus timingSafeEqual on raw webhook bodies. For gateway returns validate status|reference|externalId|ts and reject timestamps older than ten minutes.

- [ ] **Step 4: Verify GREEN**

Run: npm test -- kpay.service.spec.ts && npm run build

Expected: test and backend build pass.

- [ ] **Step 5: Commit**

~~~bash
git add backend/src/modules/kpay
git commit -m "feat: add KPay API adapter"
~~~

### Task 3: Receive signed webhooks and dispatch terminal events idempotently

**Files:**
- Create: backend/src/modules/kpay/kpay-webhook.controller.ts
- Create: backend/src/modules/kpay/kpay-webhook.service.ts
- Modify: backend/src/modules/kpay/kpay.module.ts
- Modify: backend/src/main.ts
- Modify: backend/src/app.module.ts
- Test: backend/src/modules/kpay/kpay-webhook.service.spec.ts
- Test: backend/src/modules/kpay/kpay-webhook.controller.spec.ts

**Interfaces:**
- Produces public POST /api/v1/kpay/webhooks and KpayWebhookService.process(event).
- Finalisers register as registerFinalizer(operationType, handler).

- [ ] **Step 1: Write failing webhook tests**

~~~ts
it('processes a completed event once when KPay retries it', async () => {
  await service.process(completedSaleEvent);
  await service.process(completedSaleEvent);
  expect(saleFinalizer).toHaveBeenCalledTimes(1);
});
it('returns 401 before parsing an invalid raw request body', async () => {
  await request(app.getHttpServer()).post('/api/v1/kpay/webhooks').set('X-KPAY-Signature', 'bad').send('{"event":"payment.completed"}').expect(401);
});
~~~

- [ ] **Step 2: Verify RED**

Run: npm test -- kpay-webhook.service.spec.ts kpay-webhook.controller.spec.ts

Expected: FAIL because the route and dispatcher do not exist.

- [ ] **Step 3: Implement raw-body verification and dispatch**

Use NestFactory.create(AppModule, { rawBody: true }). Verify req.rawBody before parsing, return 401 on bad signatures, and return 200 quickly after persistence. Find ledger rows by KPay payment ID then external ID. Atomically set terminalEventProcessedAt before invoking the finaliser; progress events only update ledger status.

- [ ] **Step 4: Verify GREEN**

Run: npm test -- kpay-webhook.service.spec.ts kpay-webhook.controller.spec.ts && npm test -- --runInBand

Expected: webhook and complete backend suites pass.

- [ ] **Step 5: Commit**

~~~bash
git add backend/src/main.ts backend/src/app.module.ts backend/src/modules/kpay
git commit -m "feat: process signed KPay webhooks"
~~~

### Task 4: Initiate and finalise KPay sales and onboarding collections

**Files:**
- Modify: backend/src/modules/ventes/dto/vente.dto.ts, ventes.controller.ts, ventes.service.ts, ventes.module.ts
- Modify: backend/src/modules/clients/dto/client.dto.ts, clients.controller.ts, clients.service.ts, clients.module.ts
- Test: backend/src/modules/ventes/ventes.kpay.spec.ts
- Test: backend/src/modules/clients/clients.kpay.spec.ts

**Interfaces:**
- Produces POST /ventes/kpay/init, POST /clients/onboarding/:step/kpay/init, and finalisers returning transactionId, status, and optional gatewayUrl.

- [ ] **Step 1: Write failing business tests**

~~~ts
it('does not decrement stock or grant points until a KPay sale completes', async () => {
  const pending = await service.initKpaySale(saleInput, agentId);
  expect(pending.status).toBe('PENDING');
  expect(prisma.mouvementStock.create).not.toHaveBeenCalled();
  await service.finalizeKpaySale(pending.transactionId, completedEvent);
  expect(prisma.mouvementStock.create).toHaveBeenCalledTimes(1);
});
it('completes a paid onboarding fiche exactly once', async () => {
  await service.finalizeKpayOnboarding(transactionId, completedEvent);
  await service.finalizeKpayOnboarding(transactionId, completedEvent);
  expect(prisma.onboardingEtape.update).toHaveBeenCalledTimes(1);
});
~~~

- [ ] **Step 2: Verify RED**

Run: npm test -- ventes.kpay.spec.ts clients.kpay.spec.ts

Expected: FAIL because KPay initiation/finalisation is absent.

- [ ] **Step 3: Implement collections**

Define KpayCollectionDto with mode USSD|GATEWAY, optional provider, optional phoneNumber. USSD requires provider/phone; gateway forbids them and returns KPay gatewayUrl. Persist a sale/step and immutable ledger external ID before calling KPay. Keep KPay sales pending with no stock/revenue/points. Extract existing sale completion logic into a transaction-only finaliser registered with Task 3. Paid onboarding steps are pending until their completed event.

- [ ] **Step 4: Verify GREEN**

Run: npm test -- ventes.kpay.spec.ts clients.kpay.spec.ts && npm run build

Expected: targeted tests and build pass.

- [ ] **Step 5: Commit**

~~~bash
git add backend/src/modules/ventes backend/src/modules/clients
git commit -m "feat: collect sales and onboarding payments with KPay"
~~~

### Task 5: Make full KPay refunds asynchronous

**Files:**
- Modify: backend/src/modules/ventes/dto/vente.dto.ts, ventes.controller.ts, ventes.service.ts
- Test: backend/src/modules/ventes/ventes.refund-kpay.spec.ts

**Interfaces:**
- Produces POST /ventes/:id/retour/kpay-refund and finalizeKpayRefund(transactionId, event).

- [ ] **Step 1: Write failing refund tests**

~~~ts
it('rejects a partial return for a KPay refund', async () => {
  await expect(service.initKpayRefund(venteId, partialReturn, agentId)).rejects.toThrow('Le remboursement KPay doit couvrir toute la vente');
});
it('restores stock only after refund.completed', async () => {
  const pending = await service.initKpayRefund(venteId, fullReturn, agentId);
  expect(prisma.mouvementStock.create).not.toHaveBeenCalled();
  await service.finalizeKpayRefund(pending.transactionId, completedRefundEvent);
  expect(prisma.mouvementStock.create).toHaveBeenCalled();
});
~~~

- [ ] **Step 2: Verify RED**

Run: npm test -- ventes.refund-kpay.spec.ts

Expected: FAIL because KPay refund support is absent.

- [ ] **Step 3: Implement eligibility and finalisation**

Require original completed KPay sale, every original item quantity, no active refund, and KPay eligibility. Persist a pending return plus SALE_REFUND ledger, then call refundDeposit(kpayPaymentId, { externalId, reason }). Restore stock/finalise sale only from refund.completed; failed/cancelled requests alter no stock.

- [ ] **Step 4: Verify GREEN**

Run: npm test -- ventes.refund-kpay.spec.ts ventes.kpay.spec.ts && npm run build

Expected: tests and build pass.

- [ ] **Step 5: Commit**

~~~bash
git add backend/src/modules/ventes
git commit -m "feat: refund completed KPay sales"
~~~

### Task 6: Implement wallet reservation, payout finalisation, and portal API

**Files:**
- Modify: backend/src/modules/mlm/mlm-wallet.service.ts, mlm.controller.ts, mlm.module.ts
- Modify: backend/src/modules/portal/portal.controller.ts, portal.service.ts
- Modify: frontend/src/lib/portal.api.ts
- Test: backend/src/modules/mlm/mlm-wallet.kpay.spec.ts
- Test: backend/src/modules/portal/portal.kpay-payout.spec.ts

**Interfaces:**
- Produces POST /portal/wallet/payouts, GET /portal/wallet/payouts, availableBalance, reservedBalance, and payout finalisers.

- [ ] **Step 1: Write failing payout tests**

~~~ts
it('reserves the wallet amount before requesting KPay', async () => {
  await service.initPayout(memberId, { amount: 25, provider: 'VODACOM_MPESA_COD', phoneNumber: '243813456789' });
  expect(prisma.portefeuille.update).toHaveBeenCalledWith(expect.objectContaining({ data: { soldeReserve: { increment: expect.anything() } } }));
});
it('releases a failure and debits a completed payout once', async () => {
  await service.finalizePayout(failedId, failedEvent);
  await service.finalizePayout(completedId, completedEvent);
  await service.finalizePayout(completedId, completedEvent);
  expect(debitTransactionWriter).toHaveBeenCalledTimes(1);
});
~~~

- [ ] **Step 2: Verify RED**

Run: npm test -- mlm-wallet.kpay.spec.ts portal.kpay-payout.spec.ts

Expected: FAIL because payout lifecycle does not exist.

- [ ] **Step 3: Implement payout lifecycle**

Calculate availableBalance = soldeDisponible - soldeReserve; reject excess before KPay. In one transaction create MlmPayout, increment reserve, and create ledger. Completed events decrement both balance/reserve and add one TransactionPortefeuille(DEBIT); failed/cancelled events decrement reserve only. Portal derives member identity from authenticated client, never submitted member ID.

- [ ] **Step 4: Verify GREEN**

Run: npm test -- mlm-wallet.kpay.spec.ts portal.kpay-payout.spec.ts && npm test -- --runInBand

Expected: payout and backend suites pass.

- [ ] **Step 5: Commit**

~~~bash
git add backend/src/modules/mlm backend/src/modules/portal frontend/src/lib/portal.api.ts
git commit -m "feat: pay MLM wallets through KPay"
~~~

### Task 7: Add POS/onboarding Mobile Money controls

**Files:**
- Create: frontend/src/components/payments/MobileMoneyPaymentForm.tsx
- Create: frontend/src/components/payments/KpayPaymentStatus.tsx
- Create: frontend/src/lib/kpay.api.ts
- Modify: frontend/src/pages/ventes/POSPage.tsx
- Modify: frontend/src/pages/clients/OnboardingRecitPage.tsx, OnboardingFichePage.tsx, OnboardingActivationPage.tsx
- Modify: frontend/src/types/index.ts
- Test: frontend/src/components/payments/MobileMoneyPaymentForm.test.tsx
- Test: frontend/src/pages/ventes/POSPage.kpay.test.tsx

**Interfaces:**
- Consumes initiation response transactionId, status, and optional gatewayUrl.
- Produces provider/phone/mode controls and redirects only to returned gatewayUrl.

- [ ] **Step 1: Write failing component tests**

~~~tsx
it('shows DRC providers and requires a phone in USSD mode', async () => {
  render(<MobileMoneyPaymentForm onSubmit={vi.fn()} />);
  await userEvent.click(screen.getByRole('button', { name: 'Payer par Mobile Money' }));
  expect(screen.getByText('M-Pesa')).toBeInTheDocument();
  expect(screen.getByText('Airtel Money')).toBeInTheDocument();
  expect(screen.getByText('Orange Money')).toBeInTheDocument();
  expect(screen.getByText('Numéro Mobile Money requis')).toBeInTheDocument();
});
~~~

- [ ] **Step 2: Verify RED**

Run: npm test -- MobileMoneyPaymentForm.test.tsx POSPage.kpay.test.tsx

Expected: FAIL because components do not exist.

- [ ] **Step 3: Implement payment UI**

Add KpayPaymentMode USSD|GATEWAY and provider types while preserving cash/transfer. USSD displays awaiting confirmation and polls backend local status only while pending. Gateway uses window.location.assign(gatewayUrl). Render backend failure reason and do not modify fiche/receipt CDF presentation.

- [ ] **Step 4: Verify GREEN**

Run: npm test -- MobileMoneyPaymentForm.test.tsx POSPage.kpay.test.tsx && npm run lint && npm run build

Expected: tests, lint, build pass.

- [ ] **Step 5: Commit**

~~~bash
git add frontend/src/components/payments frontend/src/lib/kpay.api.ts frontend/src/pages/ventes/POSPage.tsx frontend/src/pages/clients frontend/src/types/index.ts
git commit -m "feat: add KPay Mobile Money checkout controls"
~~~

### Task 8: Add portal withdrawal interface and sandbox verification

**Files:**
- Create: frontend/src/components/portal/WalletWithdrawalForm.tsx
- Modify: frontend/src/pages/portal/PortalPointsPage.tsx, frontend/src/components/portal/WalletCard.tsx, frontend/src/hooks/usePortalMlm.ts, frontend/src/hooks/usePortalPoints.ts
- Modify: backend/README.md
- Test: frontend/src/components/portal/WalletWithdrawalForm.test.tsx
- Test: frontend/src/pages/portal/PortalPointsPage.kpay.test.tsx

**Interfaces:**
- Consumes portal payout APIs from Task 6.
- Produces a DRC USD withdrawal form and payout status history.

- [ ] **Step 1: Write failing UI tests**

~~~tsx
it('submits a valid DRC payout and shows funds reserved', async () => {
  render(<WalletWithdrawalForm availableBalance={50} reservedBalance={10} onSubmit={onSubmit} />);
  await userEvent.type(screen.getByLabelText('Montant USD'), '25');
  await userEvent.type(screen.getByLabelText('Numéro Mobile Money'), '243813456789');
  await userEvent.click(screen.getByRole('button', { name: 'Demander le retrait' }));
  expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ amount: 25, provider: 'VODACOM_MPESA_COD' }));
  expect(screen.getByText('10.00 USD réservés')).toBeInTheDocument();
});
~~~

- [ ] **Step 2: Verify RED**

Run: npm test -- WalletWithdrawalForm.test.tsx PortalPointsPage.kpay.test.tsx

Expected: FAIL because withdrawal UI is absent.

- [ ] **Step 3: Implement UI and runbook**

Show available, reserved, and total USD; require provider/normalised 243 number; prevent duplicate pending submissions; refresh wallet/history after initiation. Document environment values, KPay dashboard payment/payout/refund webhooks, HTTPS, DRC provider allow-list, sandbox data, and never committing credentials.

- [ ] **Step 4: Verify GREEN**

Run: npm test -- WalletWithdrawalForm.test.tsx PortalPointsPage.kpay.test.tsx && npm run lint && npm run build

Expected: frontend tests, lint, build pass.

- [ ] **Step 5: Sandbox smoke verification**

Run backend with non-committed kpay_test credentials. Test 243813456789 for successful DRC deposit/payout plus a replayed completion webhook. Verify one finalised sale/payout and one wallet debit; record only references/status.

- [ ] **Step 6: Commit**

~~~bash
git add frontend/src/components/portal frontend/src/pages/portal frontend/src/hooks backend/README.md
git commit -m "feat: add KPay MLM withdrawal experience"
~~~

## Plan self-review

- Spec coverage: Tasks 1–3 cover persistence, adapter, retries, signatures, and webhook authority; Tasks 4–5 cover collections and full refunds; Task 6 covers reserved payouts; Tasks 7–8 cover interfaces and deployment guidance.
- Placeholder scan: no unfinished markers or unspecified implementation steps remain.
- Type consistency: later tasks use the Task 1 ledger and Task 2 adapter; transactionId is local while kpayPaymentId is KPay resource identifier.
