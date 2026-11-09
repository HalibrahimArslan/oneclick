# OneClick sunucu kurulumu

Tek sunucuda tam kurulum: panel + API + worker + PostgreSQL + Valkey (Redis uyumlu) + Caddy (otomatik HTTPS).
Docker çalışan herhangi bir Linux sunucuda çalışır; aşağıdaki adımlar Hetzner Cloud içindir.

## 1. Sunucu

Hetzner Cloud Console → **Add Server**:

| Ayar | Seçim |
| --- | --- |
| Location | Nuremberg, Falkenstein veya Helsinki |
| Image | Ubuntu 24.04 |
| Type | Shared vCPU, **2 vCPU / 4 GB RAM** (CX22 veya güncel eşdeğeri) |
| Networking | Public IPv4 açık |
| SSH keys | Bilgisayarınızın açık anahtarını ekleyin (`cat ~/.ssh/id_ed25519.pub`) |
| Firewalls | Yeni kural: gelen **22, 80, 443** (TCP) ve **443** (UDP) |

Sunucu açılınca IPv4 adresini not edin.

## 2. Alan adı

DNS sağlayıcınızda (ör. Cloudflare) bir **A kaydı** ekleyin:

| Tür | Ad | Değer | Proxy |
| --- | --- | --- | --- |
| A | `app` | sunucunun IPv4 adresi | **DNS only** (gri bulut) |

Birkaç dakika sonra `ping app.alanadiniz.com` sunucu IP'sini göstermeli.

## 3. Kurulum

```sh
ssh root@SUNUCU_IP

# Docker
curl -fsSL https://get.docker.com | sh

# Kod
git clone https://github.com/HalibrahimArslan/oneclick.git
cd oneclick/deploy

# Ayarlar: alan adını sorar, gizli anahtarları üretir
./setup-env.sh

# Derle ve başlat (ilk derleme birkaç dakika sürer)
docker compose up -d --build
```

`https://app.alanadiniz.com` adresini açın ve **ilk hesabı oluşturun**. Bu hesap sahip olur; `ALLOW_REGISTRATION=false` olduğundan sonrasında kayıt kapanır.

> Repo private ise sunucuda `git clone` için bir [deploy key](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/managing-deploy-keys) ekleyin.

## 4. Platform uygulamaları

Panelde **Ayarlar → Platform uygulamaları** sayfası her platform için yönlendirme adresini (redirect URI) gösterir.

- **Meta:** Facebook Login → Ayarlar → Geçerli OAuth Yönlendirme URI'leri alanına ekleyin; Uygulama ayarları → Temel → Uygulama alan adları'na `app.alanadiniz.com` ekleyin.
- **LinkedIn:** Auth sekmesi → Authorized redirect URLs.
- **TikTok:** Login Kit → Redirect URI.

Ardından App ID / Secret bilgilerini panele girin ve **Hesaplar** sayfasından hesapları bağlayın.

## Günlük işler

| İş | Komut (`deploy/` içinde) |
| --- | --- |
| Güncelleme | `git pull && docker compose up -d --build` |
| Loglar | `docker compose logs -f api worker` |
| Durum | `docker compose ps` |
| Yeniden başlat | `docker compose restart api worker` |
| Yedek al | `./backup.sh` (veritabanı + medya + .env → `backups/`) |
| Ayar değiştir | `nano .env` sonra `docker compose up -d` |

Her gece otomatik yedek için `crontab -e`:

```
0 3 * * * /root/oneclick/deploy/backup.sh >/dev/null 2>&1
```

Yedekler aynı sunucuda durur; düzenli olarak bilgisayarınıza veya başka bir depolamaya kopyalayın.

**`.env` dosyasını kaybetmeyin.** `ENCRYPTION_KEY` değişirse kayıtlı token'lar ve uygulama bilgileri çözülemez; hesapların yeniden bağlanması gerekir.

## Ayarlar

| Ayar | Anlamı |
| --- | --- |
| `APP_DOMAIN` | Panelin alan adı |
| `ALLOW_REGISTRATION` | `false`: yalnızca ilk kullanıcı kayıt olabilir |
| `DEMO_MODE` | `true`: giriş ekranında "Demoyu dene"; ziyaretçiye örnek verili geçici çalışma alanı |
| `DEMO_TTL_HOURS` | Demo çalışma alanlarının ömrü (saat) |
| `STORAGE_DRIVER` | `local` (sunucu diski) veya `s3` (Cloudflare R2 vb.) |
| `PUBLIC_MEDIA_BASE_URL` | `s3` kullanılırsa medyanın herkese açık adresi |
