#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p deploy/secrets
chmod 700 deploy/secrets
if [[ -e deploy/secrets/htpasswd ]]; then
  echo 'Credentials already exist. Back up and remove that file first if rotating credentials.' >&2
  exit 1
fi
read -r -p 'Workspace username (letters, digits, underscore, dash): ' username
[[ "$username" =~ ^[a-zA-Z0-9_-]{1,64}$ ]] || { echo 'Invalid username.' >&2; exit 1; }
read -r -s -p 'Password (at least 12 characters): ' password
printf '\n'
read -r -s -p 'Confirm password: ' confirmation
printf '\n'
[[ ${#password} -ge 12 && "$password" == "$confirmation" ]] || { echo 'Passwords do not match or are too short.' >&2; exit 1; }
umask 077
hash=$(printf '%s\n' "$password" | openssl passwd -6 -stdin)
printf '%s:%s\n' "$username" "$hash" > deploy/secrets/htpasswd
unset password confirmation
# The unprivileged Nginx UID must be able to read this bind-mounted hash file.
# The containing host directory stays owner-only; no plaintext password is stored.
chmod 644 deploy/secrets/htpasswd
echo 'Workspace password hash created. Use HTTPS or a localhost SSH tunnel.'
