# US Privacy Law Reference — CCPA, COPPA, CAN-SPAM

Sources: California Consumer Privacy Act (as amended by CPRA, effective Jan 1 2023), COPPA (FTC), CAN-SPAM Act (FTC)
Official references: oag.ca.gov/privacy/ccpa, ftc.gov

---

## CCPA / CPRA — California Consumer Privacy Act

### Who It Applies To

The CCPA applies to for-profit businesses that collect personal information from California consumers AND meet **at least one** of:
- Annual gross revenue > **$25 million**
- Annually buy, sell, or share personal information of **100,000+** California consumers or households
- Derive **50%+ of annual revenue** from selling or sharing California consumers' personal information

**Practical implication for early-stage SaaS:** Most early-stage companies fall below the threshold. However:
- If you are growing toward any of these thresholds, implement CCPA-compliant practices now
- Even if exempt, consumers increasingly expect CCPA-style disclosures — consider including a "Do Not Sell" mechanism proactively
- If you ever sell/share data with third parties for advertising, the 100k threshold is easier to hit than it looks

### Consumer Rights Under CCPA (as amended by CPRA)

| Right | What it means |
|---|---|
| **Right to Know** | Consumers can request disclosure of: what categories of personal information are collected, the sources, the purposes, the third parties it's shared with, and the specific pieces of data collected |
| **Right to Delete** | Consumers can request deletion of their personal information (with some exceptions: legal obligations, contractual necessity, fraud prevention, etc.) |
| **Right to Opt-Out of Sale or Sharing** | Consumers can opt out of the sale or sharing of their personal information (including sharing for cross-context behavioural advertising) |
| **Right to Correct** | Consumers can request correction of inaccurate personal information (added by CPRA) |
| **Right to Limit Use of Sensitive Personal Information** | Consumers can limit use of sensitive PI (social security numbers, financial info, health data, precise geolocation, etc.) to what is necessary for the service (added by CPRA) |
| **Right to Non-Discrimination** | Businesses cannot discriminate against consumers for exercising their CCPA rights (e.g. denying service, charging different prices) |

### Business Obligations

- **Privacy policy must disclose:** categories of personal information collected in the past 12 months, sources, business purposes, categories of third parties shared with, consumer rights and how to exercise them
- **"Do Not Sell or Share My Personal Information" link** required on homepage if you sell/share data
- **Response time:** 45 days to respond to consumer requests (extendable to 90 days with notice)
- **Verification:** Businesses must verify consumer identity before fulfilling requests
- **Data Processing Agreements:** Required with service providers who process data on your behalf

### Sensitive Personal Information (CPRA)

The CPRA added a category of "sensitive personal information" requiring additional protections:
- Government-issued ID (SSN, driver's licence, passport)
- Financial account credentials
- Precise geolocation
- Race, ethnic origin, religion
- Union membership
- Health/medical information
- Sexual orientation or sex life
- Contents of mail, email, or texts
- Biometric and genetic data

If your SaaS collects any of these, disclose this explicitly and implement the right to limit.

---

## COPPA — Children's Online Privacy Protection Act

### Who It Applies To

COPPA applies to operators of websites or online services **directed to children under 13**, or any operator who has **actual knowledge** they are collecting personal information from children under 13.

### Key Rules

- **No collection from under-13s without verifiable parental consent**
- Verifiable parental consent requires a method that gives parents control (written consent, credit card verification, video conference, etc.)
- Privacy notice must be conspicuously posted and clearly describe data practices for children
- Parental rights: access, correction, deletion of their child's data
- Must delete children's data when no longer necessary

### For Most SaaS Products

Include a clause stating the minimum age for use (typically 13 or 16 or 18 depending on the product). Example:

> "Our Service is not directed to children under the age of 13. We do not knowingly collect personal information from children under 13. If you become aware that a child under 13 has provided us with personal information, please contact us at [CONTACT_EMAIL] and we will take steps to delete that information."

If your product **could** be used by under-13s (e.g. an education product), COPPA compliance is mandatory and requires specialised legal advice beyond this skill's scope. Flag this prominently.

---

## CAN-SPAM Act — Commercial Email

### Who It Applies To

Any person or business that sends **commercial email messages** — messages whose primary purpose is advertising or promoting a commercial product or service. Applies to all businesses sending email to US recipients, regardless of where the sender is located.

**Transactional emails** (receipts, password resets, account notifications triggered by user action) are exempt from most CAN-SPAM requirements but must still not contain false header information.

### Key Requirements for Commercial Emails

1. **No false or misleading header information** — the "From", "To", "Reply-To", and routing information must accurately identify the sender
2. **No deceptive subject lines** — the subject must reflect the content of the email
3. **Identify the message as an advertisement** — must be clearly identified as an ad (though the law gives flexibility in how this is done)
4. **Include a valid physical postal address** — a street address, PO box, or private mailbox registered with a commercial mail receiving agency
5. **Include a clear opt-out mechanism** — a visible, operable opt-out link or reply mechanism
6. **Honour opt-out requests promptly** — within **10 business days**; cannot require users to pay a fee or provide more than email address and preferences to opt out
7. **Monitor what others do on your behalf** — if you hire a third party to send email, you are still legally responsible for CAN-SPAM compliance

### Privacy Policy Language for Email

```
If you receive marketing emails from us, you can unsubscribe at any time by clicking the unsubscribe link in the email or contacting us at [CONTACT_EMAIL]. We will process your request within 10 business days. Note that you may still receive transactional emails (such as receipts or account notifications) after unsubscribing from marketing.
```

---

## Multi-Jurisdiction US Note

While CCPA is the most comprehensive US state privacy law, several other states have enacted similar laws:
- **Virginia** (CDPA), **Colorado** (CPA), **Connecticut** (CTDPA), **Texas** (TDPSA), **Florida** (FDBR) — all have varying thresholds and requirements

For early-stage products, CCPA compliance is the practical baseline. If a product scales to national US distribution, a broader US privacy review is warranted. Flag this in the documents: *"We comply with applicable US state privacy laws, including the California Consumer Privacy Act (CCPA). Users in other states may have additional rights under applicable state law."*
