#!/usr/bin/env sh
# Veritabanı ve medya yedeği: ./backups/<tarih>/ altına yazar.
# Günlük için crontab: 0 3 * * * /root/oneclick/deploy/backup.sh >/dev/null 2>&1
set -eu
cd "$(dirname "$0")"
dir="backups/$(date +%Y-%m-%d_%H%M)"
mkdir -p "$dir"
docker compose exec -T postgres pg_dump -U oneclick -Fc oneclick > "$dir/db.dump"
docker compose run --rm --no-deps -T --entrypoint tar api czf - -C /app/apps/api uploads > "$dir/uploads.tgz"
cp .env "$dir/env.bak" && chmod 600 "$dir/env.bak"
# 14 günden eski yedekleri sil
find backups -mindepth 1 -maxdepth 1 -type d -mtime +14 -exec rm -rf {} +
echo "✓ Yedek: $dir"
