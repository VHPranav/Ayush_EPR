#!/usr/bin/env bash
# Creates .env with random secrets (refuses to overwrite). Prints the admin password once.
set -e
cd "$(dirname "$0")/../.."
[ -f .env ] && { echo ".env already exists; not touching it."; exit 1; }
rnd() { openssl rand -hex "$1"; }
DBPW=$(rnd 24); SALT=$(rnd 32); ADMINPW=$(rnd 9)
sed -e "s/CHANGE_ME_LONG_RANDOM_DATABASE_PASSWORD/$DBPW/g" \
    -e "s/CHANGE_ME_LONG_RANDOM_PASSWORD_SALT/$SALT/" \
    -e "s/CHANGE_ME_STRONG_ADMIN_PASSWORD/$ADMINPW/" .env.example > .env
chmod 600 .env
echo "Created .env. First sign-in:  admin / $ADMINPW   (change it, then delete ADMIN_PASSWORD from .env)"
echo "Back up .env somewhere safe: losing PASSWORD_SALT makes every password unusable."
