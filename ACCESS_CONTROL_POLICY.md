# Oakerds LLC - Access Control Policy

**Version:** 1.0  
**Effective Date:** December 10, 2024  
**Last Review:** December 10, 2024  
**Next Review:** December 10, 2025  
**Approved By:** Alex Veit, Owner/Managing Member  

---

## 1. Purpose

This policy establishes the principles and procedures for controlling access to Oakerds LLC information systems, ensuring that access is granted based on business need and the principle of least privilege.

## 2. Scope

This policy applies to:
- Oakerds Accounting application (app.alexveit.com)
- Supabase database and admin console
- Plaid Dashboard and API credentials
- Vercel deployment platform
- Source code repositories
- Cloud service provider accounts (Google, etc.)

## 3. Principles

### 3.1 Least Privilege
Users and systems are granted only the minimum access necessary to perform their functions. No access is granted "just in case" it might be needed.

### 3.2 Need-to-Know
Access to sensitive data is restricted to individuals who require it for legitimate business purposes.

### 3.3 Separation of Environments
- Production and development environments use separate credentials
- Production API keys are not used in development/testing

## 4. Role-Based Access Control (RBAC)

### 4.1 Current Roles

| Role | Description | Access Level |
|------|-------------|--------------|
| Owner/Admin | Alex Veit - Full system administration | Full access to all systems |
| Application User | Single-user application | Authenticated access to own data |
| Database (RLS) | Row Level Security | Users can only access their own records |
| API Services | Plaid, Anthropic | Limited to specific API endpoints |

### 4.2 System Access Matrix

| System | Owner/Admin | Application | Notes |
|--------|-------------|-------------|-------|
| Supabase Admin | Full | None | Admin console restricted |
| Database (data) | Full | RLS-filtered | Row Level Security enforced |
| Plaid Dashboard | Full | None | API keys in env vars only |
| Vercel | Full | None | Deployment access only |
| Source Code | Full | None | Git repository |
| Production App | Full | Authenticated | Via Supabase Auth |

## 5. Access Control Procedures

### 5.1 Granting Access

**For new systems/services:**
1. Evaluate business need for access
2. Determine minimum required permission level
3. Create account with appropriate role
4. Enable MFA where available
5. Document access in this policy

**For application users (future multi-user):**
1. Verify identity and business relationship
2. Create account with standard user role
3. RLS policies automatically restrict data access
4. Communicate access credentials securely

### 5.2 Modifying Access

1. Document reason for access change
2. Apply principle of least privilege
3. Update access matrix if roles change
4. Test that new permissions work correctly
5. Remove any permissions no longer needed

### 5.3 Revoking Access

**Immediate revocation required for:**
- Terminated business relationships
- Suspected security compromise
- Policy violations

**Revocation procedure:**
1. Disable/delete user account
2. Rotate any shared credentials
3. Review audit logs for suspicious activity
4. Document revocation date and reason

## 6. Credential Management

### 6.1 Password Requirements
- Minimum 12 characters
- Mix of uppercase, lowercase, numbers, symbols
- No reuse of previous passwords
- Unique passwords for each service

### 6.2 API Keys and Secrets
- Stored in environment variables, never in code
- Rotated if compromise suspected
- Different keys for development vs production
- Documented in secure location (not in repo)

### 6.3 Multi-Factor Authentication (MFA)
MFA is enabled on:
- [x] Supabase Dashboard
- [x] Plaid Dashboard  
- [x] Vercel
- [x] Google Account
- [x] GitHub (if used)

## 7. Technical Controls

### 7.1 Database Row Level Security (RLS)
- All tables have RLS policies enabled
- Policies restrict access to authenticated users
- Service role access limited to edge functions with auth checks

### 7.2 Application Authentication
- Supabase Auth handles user authentication
- Session tokens expire and require re-authentication
- Failed login attempts are logged

### 7.3 API Authentication
- All API calls require valid credentials
- Plaid access tokens stored securely in database
- API secrets never exposed to client-side code

## 8. Access Review

### 8.1 Review Schedule
- **Quarterly:** Review active accounts and permissions
- **Annually:** Full policy review and update
- **On change:** Review when business needs change

### 8.2 Review Checklist
- [ ] All accounts still needed?
- [ ] Permissions appropriate for current roles?
- [ ] Any unused accounts to disable?
- [ ] MFA enabled on all critical systems?
- [ ] API keys rotated in past year?

## 9. Audit and Monitoring

- Supabase logs all database queries
- Authentication attempts logged
- Admin actions tracked in platform audit logs
- Logs reviewed when investigating incidents

---

**Approval:**

Alex Veit  
Owner/Managing Member, Oakerds LLC  
Date: December 10, 2024
