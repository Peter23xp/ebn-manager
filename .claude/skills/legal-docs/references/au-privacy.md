# Australian Privacy & Consumer Law Reference

Source: Privacy Act 1988 (Cth), Australian Privacy Principles (Schedule 1), Notifiable Data Breaches scheme, Australian Consumer Law (Schedule 2, Competition and Consumer Act 2010)
Official references: oaic.gov.au, accc.gov.au, legislation.gov.au

---

## Who This Applies To

The Privacy Act 1988 applies to:
- Australian Government agencies
- Private sector organisations with annual turnover > AUD $3 million
- Health service providers (regardless of turnover)
- Businesses that opt in, or where the Act is otherwise extended

**Small business note:** Businesses under the $3M turnover threshold are generally exempt, but may still want to comply for trust and investor reasons — and the threshold may be removed in upcoming reforms. Always note this threshold in the document with a caveat to seek legal advice.

---

## Australian Privacy Principles (APPs) — Key Obligations for SaaS

The 13 APPs govern the collection, use, storage, and disclosure of personal information.

### APP 1 — Open and Transparent Management
- Must have a clearly expressed, up-to-date APP Privacy Policy publicly available
- Policy must cover: what data is collected, how it's collected, purposes, how individuals can access/correct data, complaints process, overseas disclosures

### APP 2 — Anonymity and Pseudonymity
- Where reasonably practicable, individuals must have the option to interact without identifying themselves

### APP 3 — Collection of Solicited Personal Information
- Only collect personal information that is **reasonably necessary** for the function or activity
- Must collect directly from the individual unless unreasonable or impracticable
- At or before collection, notify the individual (see APP 5)

### APP 4 — Dealing with Unsolicited Personal Information
- If you receive personal information you didn't ask for and couldn't have collected under APP 3, you must destroy or de-identify it unless it's contained in a Commonwealth record

### APP 5 — Notification of Collection
At or before the time of collection, notify the individual of:
- Your identity and contact details
- The purposes of collection
- Whether collection is required by law
- Any third parties the data will be disclosed to
- Whether data will be sent overseas and to which countries
- How to access/correct data and how to complain

### APP 6 — Use and Disclosure
- Only use or disclose personal information for the **primary purpose** for which it was collected, or a directly related secondary purpose the individual would reasonably expect
- Exceptions: with consent, required by law, serious threat to health/safety

### APP 7 — Direct Marketing
- Must not use personal information for direct marketing unless the individual has consented, or it was collected directly and they would reasonably expect it
- Must provide a simple opt-out mechanism
- Must honour opt-outs within a reasonable time

### APP 8 — Cross-Border Disclosure
- Before disclosing personal information to an overseas recipient, take **reasonable steps** to ensure they comply with the APPs
- The sending entity remains accountable for the overseas recipient's handling unless an exception applies
- **Practical implication:** If using AWS, Google Cloud, or other US/EU infrastructure, disclose this in the privacy policy and note the transfer mechanism

### APP 9 — Adoption, Use, or Disclosure of Government-Related Identifiers
- Must not adopt, use, or disclose government identifiers (e.g. tax file numbers) as your own identifier

### APP 10 — Quality of Personal Information
- Take reasonable steps to ensure personal information is accurate, up-to-date, and complete before use or disclosure

### APP 11 — Security of Personal Information
- Take reasonable steps to protect personal information from misuse, interference, loss, unauthorised access, modification, or disclosure
- If no longer needed: take reasonable steps to destroy or de-identify it

### APP 12 — Access to Personal Information
- On request, provide individuals with access to personal information held about them
- Must respond within 30 days
- Can refuse in limited circumstances (legal privilege, unreasonable disclosure, etc.) — must give reasons

### APP 13 — Correction of Personal Information
- Take reasonable steps to correct personal information that is inaccurate, out-of-date, incomplete, irrelevant, or misleading
- If corrected, notify any third parties who received the incorrect data (if requested and practicable)

---

## Notifiable Data Breaches (NDB) Scheme

Introduced: 22 February 2018. Applies to all entities covered by the Privacy Act.

**A notifiable data breach occurs when:**
1. There is unauthorised access, disclosure, or loss of personal information
2. **AND** a reasonable person would conclude it is likely to result in **serious harm** to affected individuals

**Serious harm factors include:**
- Financial harm
- Physical harm
- Psychological harm
- Reputational harm
- The sensitivity of the information (health, financial, identity documents)
- Whether the information is in the hands of someone who could misuse it

**What you must do:**
1. Assess the breach as quickly as possible (ideally within **30 days** of becoming aware)
2. If it meets the threshold, notify:
   - The **Australian Information Commissioner (OAIC)** — via the online form at oaic.gov.au
   - **Affected individuals** — directly if practicable, or via public notification
3. Notification must include:
   - Your identity and contact details
   - Description of the breach
   - The types of information involved
   - What steps you recommend individuals take

**Privacy policy must include:**
- A statement that the organisation is subject to the NDB scheme
- How data breaches will be handled and disclosed

---

## Australian Consumer Law (ACL) — Refunds and Statutory Guarantees

The ACL (Schedule 2 of the Competition and Consumer Act 2010) provides statutory consumer guarantees that **cannot be excluded, restricted, or modified by contract**.

**Key implications for SaaS T&C:**

1. **Guarantee of acceptable quality** — services must be fit for purpose, acceptable in quality, and free from defects
2. **Guarantee that services are fit for a disclosed purpose** — if a user tells you what they need the service for, it must be fit for that
3. **Consumer remedies** — consumers are entitled to a remedy (repair, replacement, refund) for failures that cannot be fixed or are a major failure

**What to include in T&C:**
- Acknowledge that nothing in the terms excludes rights under the ACL
- Use language like: *"Our liability to you is limited to the maximum extent permitted by law. Nothing in these Terms excludes, restricts, or modifies any right or remedy, or any guarantee, warranty, or other term or condition, implied or imposed by the ACL or any other law that cannot be lawfully excluded or limited."*
- Do not include blanket "no refunds" clauses — they may be unenforceable under ACL

**Consumer vs. Business users:**
- ACL guarantees apply to **consumers** (individuals or small businesses acquiring goods/services for personal/domestic/business use under AUD $100,000, or of a kind ordinarily acquired for personal use)
- B2B transactions above thresholds have more flexibility, but unfair contract terms protections still apply

---

## Privacy Policy Language for Australian Businesses

Include these elements explicitly:

```
This policy is intended to comply with the Privacy Act 1988 (Cth) and the Australian Privacy Principles (APPs).

If you are in Australia and have a complaint about how we handle your personal information, please contact us at [PRIVACY_EMAIL]. We will investigate and respond within 30 days.

If you are not satisfied with our response, you may lodge a complaint with the Office of the Australian Information Commissioner (OAIC) at oaic.gov.au/privacy/privacy-complaints.

[If applicable:] We are subject to the Notifiable Data Breaches (NDB) scheme. If a data breach involving your personal information is likely to result in serious harm, we will notify you and the OAIC as required by law.
```
