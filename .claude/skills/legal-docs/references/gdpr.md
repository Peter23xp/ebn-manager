# GDPR Reference — EU & UK Data Protection

Source: Regulation (EU) 2016/679 (GDPR), applicable as of 25 May 2018
UK GDPR: retained EU law post-Brexit, same obligations apply in the UK
Official reference: gdpr-info.eu, edpb.europa.eu

---

## Who This Applies To

GDPR applies if your organisation:
- Is established in the EU/UK, regardless of where processing occurs
- Is not established in the EU/UK, but **offers goods or services to EU/UK individuals**, or **monitors their behaviour** (e.g. tracking, analytics)

**Practical implication for SaaS:** If you have EU users — even if you're based in Australia or the US — GDPR applies to the processing of their personal data.

---

## Key Definitions

- **Personal data** — any information relating to an identified or identifiable natural person
- **Processing** — any operation on personal data (collection, storage, use, disclosure, deletion)
- **Controller** — the entity that determines the purposes and means of processing (you)
- **Processor** — an entity that processes data on your behalf (e.g. AWS, Stripe, Sentry)
- **Data subject** — the individual whose personal data is processed

---

## Article 5 — Principles of Processing

All processing must be:
1. **Lawful, fair, and transparent**
2. **Purpose-limited** — collected for specified, explicit, and legitimate purposes; not processed further in incompatible ways
3. **Data-minimised** — only what is necessary
4. **Accurate** — reasonable steps taken to keep it accurate
5. **Storage-limited** — not kept longer than necessary
6. **Integrity and confidentiality** — appropriate security measures
7. **Accountable** — you must be able to demonstrate compliance

---

## Article 6 — Lawful Basis for Processing

Every act of processing must have a lawful basis. For SaaS, the most common are:

| Basis | When it applies |
|---|---|
| **(a) Consent** | User has given clear, freely given, specific, informed, and unambiguous consent. Must be as easy to withdraw as to give. |
| **(b) Contract** | Processing is necessary to perform a contract with the user, or to take pre-contractual steps at their request. **Most common basis for account management, service delivery.** |
| **(c) Legal obligation** | Processing is required to comply with EU/member state law. |
| **(f) Legitimate interests** | Processing is necessary for your legitimate interests (or a third party's), unless overridden by the individual's rights. Requires a balancing test. **Common for analytics, fraud prevention, security.** |

**What to include in your privacy policy:** For each category of processing, state which lawful basis applies. Don't just list all six bases — be specific.

---

## Article 13 — What to Tell Users at Time of Collection

When collecting personal data directly from the user, you must provide:

**Required disclosures:**
- Your identity and contact details (and EU representative if applicable)
- DPO contact details (if you have one)
- The purposes of processing **and the lawful basis** for each purpose
- If relying on legitimate interests: what those interests are
- Any third parties the data will be shared with (or categories of recipients)
- If data will be transferred outside the EU: the mechanism (adequacy decision, SCCs, BCRs)

**Also required:**
- How long the data will be retained (or the criteria for determining that period)
- The existence of user rights (see below)
- The right to withdraw consent (where processing is based on consent)
- The right to lodge a complaint with a supervisory authority
- Whether providing the data is a statutory or contractual requirement, and consequences of not providing it
- Whether automated decision-making or profiling is used

---

## Chapter 3 — User Rights

These rights must be honoured. Include them in the privacy policy and explain how users can exercise them.

### Right of Access (Art. 15)
Users can request a copy of their personal data and information about how it's processed. Respond within **30 days** (extendable to 3 months for complex requests).

### Right to Rectification (Art. 16)
Users can request correction of inaccurate data and completion of incomplete data.

### Right to Erasure — "Right to be Forgotten" (Art. 17)
Users can request deletion when:
- Data is no longer necessary for the purpose it was collected
- They withdraw consent and there's no other lawful basis
- They object to processing and there are no overriding legitimate grounds
- Data has been unlawfully processed
- Erasure is required by law

**Exceptions** (erasure may be refused): legal claims, public interest, freedom of expression, public health.

### Right to Restriction of Processing (Art. 18)
Users can request that processing is restricted (data kept but not used) while accuracy is contested, or processing is objected to.

### Right to Data Portability (Art. 20)
Where processing is based on consent or contract and is automated, users can receive their data in a structured, machine-readable format (e.g. JSON, CSV) and transmit it to another controller.

### Right to Object (Art. 21)
Users can object to processing based on legitimate interests or public interest. You must stop processing unless you can demonstrate compelling legitimate grounds that override the user's rights. Objections to direct marketing must always be honoured.

---

## Data Protection Officer (DPO)

A DPO is required when:
- You process data on a large scale as a core activity
- You process special categories of data (health, biometrics, etc.) on a large scale
- You are a public authority

Most early-stage SaaS companies do not need a DPO — but if GDPR-applicable, include a privacy contact email and consider naming a privacy point of contact.

---

## Article 28 — Data Processing Agreements (DPAs)

When you use third-party processors (AWS, Stripe, Sentry, etc.):
- You must have a **Data Processing Agreement (DPA)** in place with each processor
- The DPA must cover: what data is processed, the purpose, duration, obligations, and rights of the processor
- Most major providers (AWS, Google, Stripe, Sentry, etc.) offer standard DPAs — link to them in your privacy policy

---

## International Transfers (Art. 46, 49)

Transferring personal data outside the EU/UK requires a lawful transfer mechanism:

| Mechanism | How it works |
|---|---|
| **Adequacy decision** | The Commission has decided the destination country has adequate protection (e.g. UK, Canada, New Zealand, Japan) |
| **Standard Contractual Clauses (SCCs)** | Contractual clauses approved by the Commission, signed with the recipient. Most common mechanism for US transfers. |
| **Binding Corporate Rules (BCRs)** | Internal rules for multinational group transfers — complex, rarely used by startups |
| **Art. 49 derogations** | Last resort: explicit consent, contract performance, public interest |

**Practical advice for SaaS:** If using AWS us-east-1, Google Cloud us-central, or similar US infrastructure for EU user data, note the transfer in the privacy policy and reference SCCs as the transfer mechanism.

---

## Cookies and Consent (ePrivacy Directive + GDPR)

For EU users:
- Non-essential cookies (analytics, marketing, tracking pixels) require **prior, informed consent** — not just notice
- Consent must be freely given, specific, informed, and unambiguous (a pre-ticked box is not valid)
- Users must be able to withdraw consent as easily as they gave it
- Essential cookies (session management, authentication, load balancing) do not require consent
- A cookie banner or consent management platform (CMP) is required if you use non-essential cookies

---

## Privacy Policy Language for GDPR

Include these elements explicitly:

```
If you are in the European Economic Area (EEA) or United Kingdom, you have rights under the GDPR / UK GDPR, including the right to access, correct, delete, and port your personal data. To exercise these rights, contact us at [PRIVACY_EMAIL].

We process your personal data on the following lawful bases:
- Contract performance (Art. 6(1)(b)): to provide the service you signed up for
- Legitimate interests (Art. 6(1)(f)): for security monitoring, fraud prevention, and product analytics
- Consent (Art. 6(1)(a)): for marketing communications (where applicable)

[If applicable:] Your personal data may be transferred to and processed in countries outside the EEA. Where this occurs, we rely on Standard Contractual Clauses (SCCs) approved by the European Commission to safeguard your data.

You have the right to lodge a complaint with the supervisory authority in your member state. A list of EU supervisory authorities is available at edpb.europa.eu.
```
