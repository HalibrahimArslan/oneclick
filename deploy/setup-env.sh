#!/usr/bin/env sh
# deploy/.env dosyasını oluşturur: alan adını sorar, gizli anahtarları üretir.
set -eu
cd "$(dirname "$0")"

if [ -f .env ]; then
  echo ".env zaten var; üzerine yazılmadı. Düzenlemek için: nano .env"
  exit 0
fi
command -v openssl >/dev/null || { echo "openssl gerekli"; exit 1; }

printf "Panelin alan adı (ör. app.ornek.com): "
read -r domain
[ -n "$domain" ] || { echo "Alan adı gerekli"; exit 1; }

printf "Tanıtım modu açılsın mı? Giriş ekranında 'Demoyu dene' çıkar [e/H]: "
read -r demo
case "$demo" in e|E|y|Y) demo=true ;; *) demo=false ;; esac

sed \
  -e "s|^APP_DOMAIN=.*|APP_DOMAIN=$domain|" \
  -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -hex 24)|" \
  -e "s|^JWT_SECRET=.*|JWT_SECRET=$(openssl rand -base64 48 | tr -d '\n')|" \
  -e "s|^ENCRYPTION_KEY=.*|ENCRYPTION_KEY=$(openssl rand -base64 32)|" \
  -e "s|^DEMO_MODE=.*|DEMO_MODE=$demo|" \
  .env.example > .env
chmod 600 .env

echo ""
echo "✓ .env oluşturuldu. Bu dosyanın bir yedeğini güvenli bir yerde saklayın."
echo "Sonraki adım: docker compose up -d --build"
echo "Ardından https://$domain adresinde ilk hesabı oluşturun (sonrasında kayıt kapanır)."
