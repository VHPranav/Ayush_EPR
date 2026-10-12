# AYUSH EPR v7 — Production Security Checklist

Before real patient data:
- Replace all development passwords.
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
