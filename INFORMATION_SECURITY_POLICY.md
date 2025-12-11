# Oakerds LLC - Information Security Policy (ISP)

**Version:** 1.0  
**Effective Date:** December 10, 2024  
**Last Review:** December 10, 2024  
**Next Review:** December 10, 2025  
**Approved By:** Alex Veit, Owner/Managing Member  

---

## 1. Objectives

The objective of this Information Security Policy is to protect the confidentiality, integrity, and availability of:
- Customer data (names, addresses, contact information, job details)
- Financial records (transactions, invoices, accounting data)
- Business operations data (job costing, vendor information, installer records)
- Authentication credentials and API keys

## 2. Scope

This policy applies to:
- All information systems operated by Oakerds LLC
- The Oakerds Accounting application (app.alexveit.com)
- Associated databases (Supabase/PostgreSQL)
- Development environments and source code
- Third-party integrations (Plaid, Anthropic API)
- All devices used to access business systems

## 3. Accountability

**Alex Veit, Owner/Managing Member** is responsible for:
- Implementation and enforcement of this policy
- Security decisions and risk acceptance
- Incident response and remediation
- Annual policy review and updates

## 4. Security Controls

### 4.1 Access Control
- Application access requires authentication via Supabase Auth
- Database access restricted to authenticated users via Row Level Security (RLS)
- API keys stored as environment variables, never in source code
- Development and production environments use separate credentials

### 4.2 Data Protection
- All data transmitted over HTTPS/TLS
- Database hosted on Supabase with encryption at rest
- No storage of bank credentials (Plaid handles authentication)
- Sensitive tokens (access_token, API keys) never exposed to client

### 4.3 Vulnerability Management
- Dependency vulnerabilities scanned via `npm audit`
- Patching SLA: Critical (48h), High (7d), Medium (30d), Low (90d)
- Accepted risks documented with justification in CODING_RULES.txt
- Supabase security recommendations reviewed and addressed

### 4.4 Development Security
- Source code maintained in version control (Git)
- No hardcoded credentials or secrets in codebase
- Type-safe code (TypeScript) to prevent common vulnerabilities
- Input validation on all user-submitted data

### 4.5 Backup and Recovery
- Database backups maintained by Supabase (point-in-time recovery)
- Local SQL dumps created periodically for additional redundancy
- Application code stored in Git with full history

## 5. Incident Response

In the event of a security incident:
1. Identify and contain the threat
2. Assess scope and impact
3. Remediate vulnerability
4. Document incident and response
5. Review and update controls as needed

## 6. Policy Review

This policy will be reviewed annually and updated as needed to address:
- Changes in business operations
- New threats or vulnerabilities
- Regulatory or compliance requirements
- Lessons learned from incidents

---

**Approval:**

Alex Veit  
Owner/Managing Member, Oakerds LLC  
Date: December 10, 2024
