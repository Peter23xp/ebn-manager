# Required Document Sections

Reference for the privacy-and-terms-generator skill. Use these as the structural baseline for both documents. Add, remove, or merge sections based on the specific product — but never omit a section without a clear reason.

---

## Terms & Conditions — Required Sections

### 1. Definitions
Define key terms used throughout the document. At minimum: "Service", "User", "Account", "Content", "we/us/our" (the company). Add product-specific terms as needed (e.g. "Subscription", "Workspace", "API Key").

### 2. Acceptance of Terms
How users agree — by using the service, creating an account, or clicking "I agree". Clarify that continued use constitutes acceptance. Note that users must be of the minimum age to use the service.

### 3. Accounts and Responsibilities
- Registration requirements
- User responsibility for account credentials and all activity under their account
- Prohibition on sharing credentials or creating accounts on behalf of others without authority
- Right to terminate accounts for violations

### 4. Acceptable Use
What users may and may not do. Cover:
- Prohibited activities (illegal use, harassment, spam, scraping, circumventing access controls, reverse engineering)
- Restrictions on automated access without permission
- Consequences of violation (suspension, termination, legal action)

### 5. Payments, Subscriptions, and Refunds
- Billing cycles and payment methods
- Subscription renewal (auto-renewal and cancellation process)
- Refund policy — be specific; if Australian, note ACL statutory guarantees cannot be excluded by contract (see `au-privacy.md`)
- Price change notification obligations
- What happens to data on cancellation

### 6. Intellectual Property
- Ownership of the service, code, brand, and content
- User-generated content: user retains ownership but grants a licence to the company to host, display, and operate the service
- Restrictions on reproducing or distributing the company's IP

### 7. Termination Rights
- Conditions under which either party may terminate
- Effect of termination (data deletion timelines, loss of access)
- Survival of clauses post-termination (IP, liability, dispute resolution)

### 8. Disclaimers of Warranties
- Service provided "as is" and "as available"
- No guarantee of uptime, error-free operation, or fitness for a particular purpose
- Carve out: some jurisdictions (including Australia under ACL) do not allow exclusion of implied warranties — note this

### 9. Limitation of Liability
- Liability cap (typically: fees paid in the prior 12 months, or a fixed amount)
- Exclusion of indirect, consequential, incidental losses
- Carve out for: death/personal injury caused by negligence, fraud, or where law prohibits exclusion

### 10. Indemnification
User agrees to indemnify and hold harmless the company from claims arising out of:
- User's breach of these terms
- User's content
- User's violation of any law or third-party rights

### 11. Changes to Terms
- Company's right to modify terms
- How users will be notified (email, in-app notice, or website posting)
- What constitutes acceptance of updated terms
- Effective date of changes

### 12. Severability
If any provision is found invalid or unenforceable, the remaining provisions continue in full force.

### 13. Governing Law and Dispute Resolution
- Jurisdiction and governing law (be explicit: e.g. "the laws of New South Wales, Australia")
- Preferred resolution process: good-faith negotiation → mediation → litigation
- Waiver of class actions (if applicable and enforceable in the jurisdiction)

### 14. Contact and Complaints
- Where to send legal notices
- Complaints process and expected response time
- Registered address if applicable

---

## Privacy Policy — Required Sections

### 1. Introduction and Scope
What this policy covers, who it applies to, and what "personal information" means in this context. Reference the governing privacy law(s).

### 2. Data Collected
Break into clear categories:
- **Account data** — name, email, password hash, billing details
- **Usage data** — pages visited, features used, session duration, clicks
- **Content data** — files uploaded, messages sent, user-generated content
- **Device/technical data** — IP address, browser type, OS, device ID
- **Communications** — support tickets, emails, feedback
- **Payment data** — note that full card details are handled by the payment processor, not stored by the company

### 3. How Data Is Used
Explicit list of purposes:
- Providing and improving the service
- Account management and authentication
- Processing payments
- Sending transactional emails (receipts, password resets)
- Sending marketing communications (with consent or opt-out)
- Security monitoring and fraud prevention
- Legal compliance
- Analytics and product improvement

### 4. Third-Party Services
Name each service explicitly. For each, state:
- What data is shared with them
- Why (what they do)
- Link to their own privacy policy

Template row:
> **[Service Name]** — Used for [purpose]. Data shared: [types]. Privacy policy: [URL]

### 5. Data Retention
- How long each category of data is kept
- What triggers deletion (account closure, user request, legal hold expiry)
- Backup and log retention timelines

### 6. International Data Transfers
If data is stored or processed outside the user's country (e.g. AWS us-east-1 for Australian users), disclose:
- Which countries data is transferred to
- The mechanism that makes it lawful (e.g. SCCs for GDPR, Art. 46; adequacy decisions; or simply noting the transfer for AU users)

### 7. Security Practices
Plain-language description of security measures:
- Encryption in transit (TLS/HTTPS)
- Encryption at rest (where applicable)
- Access controls and authentication
- Regular security reviews
- Note: no system is 100% secure; describe reasonable measures only

### 8. User Rights
Minimum baseline — apply even for non-EU products, noting which rights apply in which jurisdiction:
- Right to access personal data
- Right to correct inaccurate data
- Right to delete / erasure
- Right to data portability
- Right to object to processing
- Right to withdraw consent
- How to exercise rights (contact email, expected response time)

### 9. Cookies and Tracking
If analytics, session tracking, or advertising pixels are used:
- What cookies are set and why
- Whether consent is required (EU: yes; AU: recommended)
- How users can opt out or manage cookies
- Reference to cookie management tool if applicable

### 10. Children's Privacy
- Minimum age to use the service
- Whether the service is directed at children
- If COPPA-relevant: note that data from under-13s is not knowingly collected

### 11. Changes to This Policy
- How and when the policy will be updated
- How users will be notified
- Effective date

### 12. Contact and Privacy Requests
- Dedicated email for privacy enquiries
- Expected response time (e.g. within 30 days)
- If Australian: complaints process under the Privacy Act 1988 and right to escalate to the OAIC
- If GDPR-relevant: right to lodge a complaint with the relevant supervisory authority
