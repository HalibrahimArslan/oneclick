# OneClick

Instagram, TikTok ve LinkedIn hesaplarını tek panelden yönetmek için sosyal medya yönetim aracı. Gönderiyi bir kez yazın, hesapları seçin, takvimde planlayın; zamanı gelince worker yayınlar.

## Yapı

```
apps/api        NestJS API + yayın worker'ı (aynı kod tabanı, iki ayrı süreç)
apps/web        React + Vite paneli
packages/shared Platform kuralları, doğrulama şemaları, ortak tipler
```

| Bileşen | Teknoloji |
| --- | --- |
| Panel | React 19, Vite, TanStack Query, Tailwind 4 |
| API | NestJS 11, Prisma, PostgreSQL |
| Kuyruk | Redis + BullMQ (zamanlanmış yayın, yeniden deneme, token yenileme) |
| Medya | Yerel disk (geliştirme) veya S3 uyumlu depolama (Cloudflare R2) |

## Kurulum (macOS)

Gerekenler: Node 22, pnpm, Docker (OrbStack yeterli).

```bash
# 1) pnpm yoksa
corepack enable

# 2) Bağımlılıklar
cd ~/Documents/devtools/oneclick
pnpm install

# 3) Postgres ve Redis
docker compose up -d

# 4) Ortam değişkenleri
cp apps/api/.env.example apps/api/.env
#   JWT_SECRET ve ENCRYPTION_KEY için:
#   openssl rand -base64 48   → JWT_SECRET
#   openssl rand -base64 32   → ENCRYPTION_KEY

# 5) Veritabanı tabloları ve demo kullanıcı
pnpm --filter @oneclick/api exec prisma migrate dev --name init
pnpm db:seed

# 6) Çalıştır (API :4000, worker, panel :5173)
pnpm dev
```

Tarayıcıda http://localhost:5173 adresini açın. Demo giriş: `demo@oneclick.local` / `demo12345`.

### İlk deneme: Mock platform

`.env` içinde `ENABLE_MOCK_PROVIDER=true` iken Hesaplar ekranında **Test (Mock)** kartı görünür. Gerçek platforma gitmeden akışın tamamını dener: bağlan → izin ver → gönderi oluştur → planla → worker yayınlar.

- Metne `#fail` yazarsanız yayın kalıcı hata verir (hata ekranı ve "Tekrar dene" denemesi için).
- `#flaky` yazarsanız ilk deneme geçici hata verir, worker 1 dakika sonra tekrar dener.

## Gerçek platformları bağlamak

Instagram ve TikTok OAuth dönüş adresi için **HTTPS** ister. Ayrıca bu iki platform medyayı sizin sunucunuzdan **kendisi indirir**, bu yüzden API'nin internetten erişilebilir olması gerekir. Yerelde bunun en kolay yolu bir tünel:

```bash
brew install cloudflared
cloudflared tunnel --url http://localhost:4000
# verilen https://xxxx.trycloudflare.com adresini .env'e yazın:
#   API_PUBLIC_URL=https://xxxx.trycloudflare.com
#   PUBLIC_MEDIA_BASE_URL=https://xxxx.trycloudflare.com/media
```

Her platformda kaydedilecek dönüş adresi: `{API_PUBLIC_URL}/v1/oauth/callback/{instagram|tiktok|linkedin}`

### Instagram

1. https://developers.facebook.com → **Create app** → tür: **Business**.
2. **Instagram** ürününü ekleyin → "API setup with Instagram login".
3. "Business login settings" bölümüne dönüş adresini girin.
4. **App roles → Roles → Instagram Testers** bölümüne kullanıcının Instagram hesabını ekleyin; kullanıcı Instagram'da (Ayarlar → Web sitesi izinleri → Tester davetleri) daveti kabul etsin.
5. Instagram App ID ve Secret'ı `.env` dosyasına yazın: `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`.

Uygulama geliştirme modunda kaldığı sürece App Review gerekmez; yalnızca tester olarak eklenen hesaplar bağlanabilir. Hesap **Business veya Creator** olmalı. Görseller JPEG olmalı.

### TikTok

1. https://developers.tiktok.com → **Manage apps → Connect an app**.
2. **Login Kit** ve **Content Posting API** ürünlerini ekleyin; Content Posting API'de **Direct Post**'u açın.
3. Login Kit'e dönüş adresini girin; **URL properties** bölümünde medya alan adınızı doğrulayın (PULL_FROM_URL için zorunlu).
4. **Sandbox** sekmesinde kullanıcının TikTok hesabını hedef kullanıcı olarak ekleyin.
5. `TIKTOK_CLIENT_KEY` ve `TIKTOK_CLIENT_SECRET` değerlerini `.env` dosyasına yazın.

> Önemli: TikTok, denetimden (audit) geçmemiş uygulamaların gönderilerini **yalnızca gizli (SELF_ONLY)** yayınlar ve hesabın gizli olmasını ister. Herkese açık paylaşım için uygulama TikTok'a denetime gönderilmeli.

### LinkedIn

1. https://www.linkedin.com/developers/apps → **Create app** (bir LinkedIn şirket sayfası ile ilişkilendirilir).
2. **Products** sekmesinde **Sign In with LinkedIn using OpenID Connect** ve **Share on LinkedIn** ekleyin (anında onaylanır).
3. **Auth** sekmesinde dönüş adresini ekleyin.
4. `LINKEDIN_CLIENT_ID` ve `LINKEDIN_CLIENT_SECRET` değerlerini `.env` dosyasına yazın.

Bu ayarlarla kişisel profilde paylaşım yapılır. **Şirket sayfasında** paylaşım için **Community Management API** başvurusu gerekir; onaylandıktan sonra `LINKEDIN_ORGANIZATIONS_ENABLED=true` yapın ve hesabı yeniden bağlayın. Kullanıcının sayfada Admin veya Content Admin rolü olmalı.

LinkedIn token'ları yaklaşık 60 gün geçerlidir ve normal uygulamalar için otomatik yenilenemez. Süre dolunca hesap "Yeniden bağla" durumuna düşer.

## Nasıl çalışır

1. **Bağlama:** Panel `GET /v1/workspaces/:wid/accounts/connect/:platform` ile platformun izin sayfası adresini alır. Kullanıcı orada giriş yapıp izin verir, platform `/v1/oauth/callback/:platform` adresine döner. Token'lar AES-256-GCM ile şifrelenip saklanır.
2. **Gönderi:** Bir gönderi her hesap için bir `post_target` kaydına dönüşür. Böylece hesap bazında metin, ayar ve sonuç ayrı tutulur.
3. **Yayın:** Her hedef, zamanında çalışacak bir BullMQ işi olur. Worker token'ı gerekirse yeniler, platform adaptörünü çağırır, sonucu yazar.
   - Geçici hatalar (429, 5xx, medya işleniyor) 4 denemeye kadar üstel bekleme ile tekrar denenir.
   - Kalıcı hatalarda hedef "Başarısız" olur, panelden "Tekrar dene" yapılabilir.
   - Instagram container ve TikTok publish kimliği ara durum olarak saklanır; yeniden denemede çift paylaşım yapılmaz.
4. **Bakım:** Worker her saat süresi yaklaşan token'ları yeniler, her dakika Redis'te kaybolmuş işleri yeniden kuyruğa alır.

## Komutlar

| Komut | İş |
| --- | --- |
| `pnpm dev` | API, worker ve paneli birlikte çalıştırır |
| `pnpm test` | Birim testleri |
| `pnpm build` | Üretim derlemesi |
| `pnpm --filter @oneclick/api exec prisma studio` | Veritabanını tarayıcıda gör |

## Üretim

`pnpm build` sonrası tek sunucuda çalıştırılabilir: API, `apps/web/dist` klasörünü kendisi sunar.

```bash
pnpm --filter @oneclick/api prisma:deploy
node apps/api/dist/main.js      # API + panel
node apps/api/dist/worker.js    # worker (ayrı süreç)
```

Üretimde `WEB_URL` ve `API_PUBLIC_URL` aynı alan adı olur. Medya için `STORAGE_DRIVER=s3` ve herkese açık bir bucket (ör. Cloudflare R2) önerilir.

## Yol haritası

- [x] Faz 1: Hesap bağlama, composer, takvim, zamanlı yayın, hata ve tekrar deneme
- [ ] Faz 2: Ekip davetleri, onay akışı, raporlar
- [ ] Faz 3: Birleşik inbox (veritabanı tabloları hazır: `conversations`, `messages`, `labels`)
