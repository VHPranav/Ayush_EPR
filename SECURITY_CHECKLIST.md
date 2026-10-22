# AYUSH EPR v7 — Production Security Checklist

Before real patient data:
- Replace all development passwords. (Production starts with no seeded accounts; set ADMIN_PASSWORD for the first start, then remove it from .env.)
- Change PostgreSQL password and PASSWORD_SALT.
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
- Complete the applicable Montenegro/EU health-data/privacy assessment with qualified legal/security professionals.
- Perform penetration testing and vulnerability scanning before production.

Built in (verify rather than assume): scrypt password hashes with a mandatory PASSWORD_SALT, 15-minute sign-in throttling,
sessions revoked on deactivation/password change, no-store API responses, upload type allow-list, audit entries for writes,
security headers on the web app, non-root containers, and the API is not published to the host.
Still your job: TLS in front of port 3000, set TRUST_PROXY to the number of proxies you add, backups, and the assessments above.
