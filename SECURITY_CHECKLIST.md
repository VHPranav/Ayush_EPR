# AYUSH EPR v7 — Production Security Checklist

Before real patient data:
- Replace all development passwords. (Production starts with no seeded accounts; set ADMIN_PASSWORD for the first start, then remove it from .env.)
- Provision strong PostgreSQL credentials and a random PASSWORD_SALT before first use. Preserve the existing salt for an existing database; changing it invalidates all passwords.
- Run only behind HTTPS/TLS (reverse proxy such as IIS, Nginx or a managed TLS gateway).
- Restrict PostgreSQL port 5432 to the private network; do not expose it to the public internet.
- Restrict port 3000 to the reverse proxy/private network.
- Configure firewall rules and least-privilege OS accounts.
- Enable encrypted disk/database backups where appropriate.
- Test daily backups and a restore procedure.
- Store uploaded documents on protected server storage with restricted permissions.
- Review role permissions for each staff role.
- Configure session timeout appropriate to clinical workflow.
- Establish incident response, retention and deletion policies.
- Confirm the clinic and hosting jurisdictions, then complete the applicable health-data/privacy assessment with qualified local professionals.
- Perform penetration testing and vulnerability scanning before production.

Built in (verify rather than assume): scrypt password hashes with a mandatory PASSWORD_SALT, 15-minute sign-in throttling,
sessions revoked on deactivation/password change, no-store API responses, upload type allow-list, audit entries for writes,
security headers on the web app, non-root containers, and the API is not published to the host.
Still your job: TLS in front of port 3000, set TRUST_PROXY to the number of proxies you add, backups, and the assessments above.

Current release gates and evidence are tracked in PRODUCTION_READINESS.md. File signatures are checked, but malware scanning/content disarm is not implemented. Legacy Office/archive uploads are disabled.
