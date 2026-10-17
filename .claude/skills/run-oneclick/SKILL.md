---
name: run-oneclick
description: Launch OneClick locally on macOS (Postgres/Redis via OrbStack, NestJS API + worker on :4000, Vite panel on :5173) and smoke-test the login. Use when asked to run, start, or "ayağa kaldır" the project.
---

# OneClick'i yerelde çalıştırma

Tüm komutlar repo kökünden (`~/Documents/devtools/oneclick`) çalışır.

## 1. Araçlar

```bash
# Docker daemon OrbStack; kapalıysa başlat ve hazır olmasını bekle
docker info >/dev/null 2>&1 || open -a OrbStack
for i in $(seq 1 30); do docker info >/dev/null 2>&1 && break; sleep 2; done

# pnpm global kurulu değil; packageManager alanındaki sürümü corepack getirir
command -v pnpm >/dev/null || corepack enable
```

## 2. Bağımlılıklar ve servisler

```bash
[ -d node_modules ] || pnpm install   # postinstall prisma generate'i de çalıştırır
docker compose up -d
until docker exec oneclick-postgres-1 pg_isready -U oneclick >/dev/null 2>&1; do sleep 1; done
```

## 3. Ortam değişkenleri (yalnızca ilk kez)

`apps/api/.env` yoksa örnekten oluştur ve gizli anahtarları üret. Var olanın üzerine yazma; `ENCRYPTION_KEY` değişirse kayıtlı hesap token'ları çözülemez.

```bash
if [ ! -f apps/api/.env ]; then
  cp apps/api/.env.example apps/api/.env
  J=$(openssl rand -base64 48 | tr -d '\n'); K=$(openssl rand -base64 32)
  sed -i '' "s|^JWT_SECRET=.*|JWT_SECRET=$J|; s|^ENCRYPTION_KEY=.*|ENCRYPTION_KEY=$K|" apps/api/.env
fi
```

## 4. Veritabanı

```bash
pnpm --filter @oneclick/api exec prisma migrate dev   # migrations/ yoksa: --name init
pnpm db:seed                                           # demo@oneclick.local / demo12345
```

## 5. Çalıştır

Arka planda başlat, logu dosyaya yaz:

```bash
pnpm dev > "$LOG" 2>&1   # run_in_background ile; API :4000, worker, panel :5173
```

Ayrı ayrı: `pnpm --filter @oneclick/api dev:api`, `dev:worker`, `pnpm --filter @oneclick/web dev`.

## 6. Doğrula

```bash
for i in $(seq 1 40); do curl -s -o /dev/null localhost:4000 && curl -s -o /dev/null localhost:5173 && break; sleep 1; done
grep -E 'successfully started|çalışıyor|ERROR' "$LOG"
# Panel proxy'si üzerinden giriş; accessToken dönmeli
curl -s -X POST localhost:5173/v1/auth/login -H 'content-type: application/json' \
  -d '{"email":"demo@oneclick.local","password":"demo12345"}'
```

## Bilinen tuzaklar

- **API'yi `tsx` çalıştırır (esbuild), o yüzden `emitDecoratorMetadata` üretilmez.** Constructor parametresi tipe göre inject edilen her Nest provider'ı açılışta `Nest can't resolve dependencies of X` hatasıyla çöker. Her zaman açık token kullan: `@Inject(Reflector)`, `@InjectContainer()`.
- API açılışta çökerse `tsx watch` süreci çıkar ve kaydedince geri gelmez. `pkill -f 'turbo run dev'; pkill -f 'tsx watch'; pkill -f vite` ile durdurup `pnpm dev`'i yeniden başlat.
- Durdurmak için: yukarıdaki pkill komutları + `docker compose stop`.
