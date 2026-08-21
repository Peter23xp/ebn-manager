# KPay Mobile Money Design

## Goal

Integrate KPay Mobile Money throughout EBN Network: USD collections for onboarding and POS sales, full-sale refunds, and USD commission withdrawals to Mobile Money accounts in the Democratic Republic of Congo.

## Scope

Included:

- Onboarding payments for the `RECIT`, `FICHE`, and `ACTIVATION` steps.
- POS sale collections.
- Full refunds of KPay-paid sales.
- MLM wallet withdrawals to DRC Mobile Money accounts.
- KPay USSD collections and the hosted gateway fallback.
- KPay status webhooks, secure callback verification, transaction history, and operator/provider selection.

Excluded:

- Cross-border payouts and providers outside the DRC.
- Card and PayPal payments.
- KPay inter-wallet transfers.
- Partial KPay refunds, because KPay refunds the original payment in full only.

## Currency and presentation

- The source of truth for every KPay request is USD.
- Collections and MLM wallet balances remain USD.
- The DRC KPay providers used are `VODACOM_MPESA_COD`, `AIRTEL_COD`, and `ORANGE_COD`, subject to the KPay application allow-list.
- The customer onboarding fiche and sale receipt retain their existing CDF presentation/mention only. No USD-to-CDF conversion, exchange rate, or converted amount is stored or displayed.

## Approaches considered

1. Add KPay columns directly to `Vente`, `OnboardingEtape`, and `Portefeuille`.
   This couples every domain aggregate to KPay and cannot correctly represent retries, webhooks, refunds, or a pending payout.

2. Create a dedicated KPay transaction ledger and use a single KPay adapter service. **Selected.**
   The ledger gives every asynchronous KPay operation a durable local state, supports idempotent webhook processing, and keeps business finalisation in the owning module.

3. Use only KPay hosted gateway redirects.
   This would avoid the USSD form but does not meet POS-assisted Mobile Money collection requirements.

## Architecture

### KPay module

A new NestJS `KpayModule` owns all server-to-server KPay access. `KpayService` is the only class that reads `KPAY_API_KEY`, `KPAY_SECRET_KEY`, `KPAY_WEBHOOK_SECRET`, and `KPAY_GATEWAY_SECRET`. The frontend never receives these values.

The service sends authenticated requests to `https://admin.kpay.site/api/v1`, applies bounded exponential retry to transient network, `429`, and `5xx` failures, and preserves the same external ID on retry. It exposes typed operations for:

- initiating a deposit;
- reading a deposit status;
- initiating a withdrawal;
- reading a withdrawal status;
- initiating a full refund;
- verifying webhook signatures; and
- verifying signed gateway-return query parameters.

### Durable payment ledger

The Prisma schema gains a KPay transaction model rather than duplicating provider fields on each business table. It stores the local operation kind, business owner, USD amount, KPay `id`, KPay `reference`, unique `externalId`, provider, normalized phone number, state, failure reason, raw-safe metadata, completion timestamps, and the processed terminal event marker.

Operation kinds are `ONBOARDING_PAYMENT`, `SALE_PAYMENT`, `SALE_REFUND`, and `MLM_PAYOUT`. States mirror KPay lifecycle states, including pending, processing, completed, failed, cancelled, and refunded where relevant. KPay transaction IDs and external IDs are unique.

The ledger links to a sale, onboarding step, return, or MLM payout record as appropriate. Referential links are unique per active operation, while failed or cancelled attempts remain in history for auditability.

### Sale and onboarding collections

For a KPay payment, the backend creates a local pending business operation and KPay ledger entry before calling KPay. Its generated external ID is never regenerated during retry.

USSD requests include one explicitly selected DRC provider and an international `243...` phone number. Gateway requests omit the provider and phone number and return a `gatewayUrl` to the frontend. Gateway return is informative only: the backend checks its HMAC and timestamp, then fetches the KPay transaction before making a business decision.

POS sales paid via KPay receive a new pending-payment status. They do not decrement stock, become reportable revenue, or earn loyalty points until a verified `payment.completed` webhook finalises them in one database transaction. Cash and existing manual payment modes preserve their current synchronous flow.

Paid onboarding steps remain incomplete until their associated KPay collection is completed. A duplicate webhook or client retry must not complete the same step twice.

### Refunds

The return workflow determines whether the original sale has a completed KPay deposit. If it does, a KPay refund button is available only when the return covers every originally sold item and no prior active refund exists. The system creates a pending return/refund record, calls `POST /payments/:id/refund`, and applies stock restoration and the final sale-return status only when `refund.completed` arrives.

Partial returns and non-KPay sales retain the current local return workflow. The KPay refund request uses an independent idempotent external ID and the provider payment ID, never an amount.

### MLM payouts

Members request a USD payout to a DRC Mobile Money number and explicitly select M-Pesa, Airtel Money, or Orange Money. The backend validates the member identity, wallet, provider, USD amount, and phone number before creating the request.

In a database transaction the request reserves the requested wallet balance and creates a local payout record plus its KPay ledger entry. The available wallet balance is therefore `soldeDisponible - soldeReserve`. On `payout.completed`, the system converts the reservation into a single immutable `DEBIT` wallet transaction. On `payout.failed` or `payout.cancelled`, it releases the reservation. Terminal event processing is idempotent.

No payout can be submitted outside the DRC. The KPay `sourceCountry` field is omitted, preventing cross-country processing.

### Webhooks and callbacks

`POST /api/v1/kpay/webhooks` is public only to KPay, is rate-limited separately, and reads the unmodified request body. It validates `X-KPAY-Signature` with HMAC-SHA256 and constant-time comparison before parsing or processing. Invalid signatures return `401`; valid events receive a rapid `200`.

Terminal webhook processing locks/updates the KPay transaction by KPay payment ID or external ID and is idempotent. Informational initiated/processing events update only the ledger. Completed, failed, and cancelled events trigger their related business finaliser exactly once.

Gateway return endpoints validate `status|reference|externalId|ts`, reject timestamps older than ten minutes, and then retrieve the KPay resource. A valid return never replaces webhook authority.

### Frontend

Existing POS and onboarding payment selectors retain cash and transfer options and add/route the three DRC KPay provider choices. For a Mobile Money transaction, the UI shows a number field, a pending/confirmation state, and error details returned by the backend. For gateway mode it redirects to `gatewayUrl`.

The MLM portal wallet adds a withdrawal form, displays available and reserved USD amounts, and shows payout progress and final status. Administration can view KPay references and retry-safe failure details without exposing secrets.

## Error handling

- Client input rejects unknown providers, non-DRC phone numbers, non-positive amounts, and attempts to withdraw more than the available wallet balance.
- Local business operations remain pending when KPay is unavailable; transient KPay errors are retried with a bounded exponential backoff.
- A KPay `409` reuses and retrieves the existing operation through its original external ID rather than starting a second financial operation.
- `422` payout failures release no local money until KPay terminal status confirms failure; any local reservation is released only on a verified failed/cancelled event.
- Webhook failures are logged with no secrets or raw personal data beyond the auditable transaction reference.

## Configuration

The backend environment template adds:

```text
KPAY_API_KEY=kpay_test_...
KPAY_SECRET_KEY=<64-hex-secret>
KPAY_WEBHOOK_SECRET=<webhook-hmac-secret>
KPAY_GATEWAY_SECRET=<gateway-return-hmac-secret>
KPAY_BASE_URL=https://admin.kpay.site
KPAY_RETURN_URL=https://app.example.com/payments/kpay/return
KPAY_CANCEL_URL=https://app.example.com/payments/kpay/cancel
```

The production deployment must configure the KPay payment, payout, and refund webhook URLs to the HTTPS backend endpoint. Sandbox keys are required for automated tests and initial manual validation.

## Testing

- Unit tests cover payload construction, DRC provider validation, HMAC verification, gateway signature freshness, retry decisions, and idempotency.
- Service tests cover sale/onboarding finalisation, wallet reservation/finalisation/release, and the full-only refund rule.
- Controller tests cover authorization, validation errors, gateway responses, and webhook behaviour using raw-body fixtures.
- Integration tests use KPay sandbox values: successful and failed DRC deposits/payouts, and replayed completed webhooks.
- Existing sale, return, onboarding, MLM, portal, report, and receipt tests must remain green.

## Acceptance criteria

1. A DRC USD Mobile Money sale or onboarding payment is not finalised before a verified KPay completion.
2. A confirmed payment finalises the related business operation exactly once, even if KPay retries its webhook.
3. A MLM payout cannot exceed the member's available USD balance and releases the reservation on a terminal failure.
4. A KPay refund is possible only for an eligible full return and is finalised only by a verified refund webhook.
5. The application never exposes KPay credentials to the browser.
6. The fiche and receipt do not introduce a stored or displayed USD-to-CDF conversion.
