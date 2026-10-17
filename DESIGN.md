# OneClick Tasarım Rehberi

Paneldeki (apps/web) her ekran bu belgeye uyar. Yeni bir ekran ya da bileşen yazmadan önce önce buraya bakılır; burada olmayan bir karar gerekiyorsa önce bu belge güncellenir, sonra kod yazılır.

Son güncelleme: 8 Ekim 2026

---

## 1. Yön

OneClick, ajansların ve küçük ekiplerin birden fazla sosyal hesabı tek yerden planladığı bir iş aracıdır. Kullanıcı günde onlarca kez takvime bakar, gönderi yazar, hata düzeltir. Bu yüzden arayüz:

1. **Yoğun ama sakin.** Bir bakışta çok gönderi görünür; renk yalnızca anlam taşıdığında kullanılır (durum, platform, tek bir ana eylem).
2. **Hesap merkezli.** Her gönderi hangi hesaba gidiyorsa o hesabın avatarı ve platform işareti görünür. Kullanıcı metinden önce "nereye" sorusunu cevaplar.
3. **Durum her zaman görünür.** Taslak, planlandı, yayınlandı, başarısız; her kartta aynı renk ve aynı yerde.
4. **Önizleme gerçeğe yakın.** Kullanıcı yayınlamadan önce gönderinin her platformda nasıl görüneceğini görür.
5. **Hata kullanıcıyı yarı yolda bırakmaz.** Her hata mesajı ne olduğunu ve ne yapılacağını söyler, yanında düzeltme eylemi durur.

### Referanslar

Birincil referans **Agorapulse**, ikincil referans **Buffer**. İkisinden de yapıyı ve etkileşim kalıplarını alıyoruz; marka rengini, logoyu, ikonları ya da metinleri kopyalamıyoruz. OneClick kendi renk ve kimliğini kullanır.

| Kaynak | Aldığımız | Almadığımız |
| --- | --- | --- |
| Agorapulse takvim | Takvimin solunda platforma göre gruplanmış, aramalı ve onay kutulu hesap filtresi; üst araç çubuğu (Bugün, oklar, ay adı, görünüm seçici); gönderi kartında solda durum şeridi, saat, metin, sağda platform ikonu; "+N gönderi" bağlantısı; gün hücresinde üzerine gelince "+" | Turuncu marka rengi; çok sıkışık 11 px yazılar; deneme süresi kutuları |
| Agorapulse gönderi oluşturma | Üç sütun: hesap listesi, editör, önizleme; editör altında platform başına karakter sayacı; medya kartı; platforma özel ayarların açılır panelleri; önizlemede "Özelleştirildi" etiketi ve kalem ikonu; altta sabit eylem çubuğu (Tarih ve saat, ana yayın düğmesi) | Önizlemenin editörden geniş olması |
| Agorapulse hesap ekleme | Platform kutucukları (ikon, ad, hesap türü, "+"); sağda platforma göre gruplanmış bağlı hesaplar listesi ve sayıları | Reklam hesapları bölümü |
| Agorapulse gönderi ayrıntısı | Başarısız gönderide orijinal hata mesajı ve "Tekrar dene"; yayınlanmışta "Platformda aç" | İstatistik sekmeleri (henüz veri yok) |
| Buffer (2026) | Ferah beyaz yüzeyler, ince çizgiler; hafta görünümünde küçük görselli gönderi kartı (platform ikonu + saat, iki satır metin, sağda küçük görsel); kuyruk listesinde gün başlıkları ve solda saat sütunu; filtrelerin açılır düğme olarak durması; geçmiş günlerin gri tonla ayrılması | Yeşil marka rengi; yapay zekâ önerileri |

Kaynaklar (8 Ekim 2026'da incelendi): [Agorapulse Publishing Calendar](https://support.agorapulse.com/en/articles/12019371-publishing-calendar-explained), [Agorapulse Publishing Composer](https://support.agorapulse.com/en/articles/8769280), [Agorapulse yayınlanmış/başarısız gönderi](https://support.agorapulse.com/en/articles/10184307-how-to-view-a-published-or-failed-post), [Buffer takvim](https://support.buffer.com/articles/how-to-use-buffers-calendar-feature-FSSKbH32DN), [Buffer gönderi planlama](https://support.buffer.com/articles/scheduling-posts-4Qdld7giAZ), [Buffer All Channels](https://support.buffer.com/articles/how-to-use-the-all-channels-view-in-buffer-oqqE4Sdf3T). Dribbble ve Behance otomatik erişime kapalı olduğu için bu turda incelenemedi.

---

## 2. Tasarım belirteçleri (tokens)

Tüm değerler [apps/web/src/index.css](apps/web/src/index.css) içindeki `@theme` bloğunda tanımlıdır. Bileşenlerde ham hex ya da Tailwind'in hazır gri/mavi tonları (`gray-100`, `sky-50` vb.) **kullanılmaz**; yalnızca aşağıdaki adlar kullanılır. Böylece ileride koyu tema tek yerden eklenebilir.

### 2.1 Renk

**Marka (indigo).** Ana eylem, seçili durum, odak halkası.

| Belirteç | Değer | Kullanım |
| --- | --- | --- |
| `brand-50` | `#F0F1FF` | Seçili menü öğesi zemini, sürükle-bırak hedefi |
| `brand-100` | `#E1E4FF` | Seçili satır zemini, hafif vurgu |
| `brand-200` | `#C5CAFE` | Seçili kenarlık |
| `brand-500` | `#5D63F0` | Odak halkası, ikon vurgusu |
| `brand-600` | `#4B4FE0` | Birincil düğme, bugünün tarihi |
| `brand-700` | `#3D3FC2` | Birincil düğme üzerine gelme, seçili metin |

**Nötrler (soğuk gri).** Metin, çizgi, yüzey.

| Belirteç | Değer | Kullanım |
| --- | --- | --- |
| `ink` | `#171D2E` | Başlık ve ana metin |
| `ink-2` | `#384157` | İkincil güçlü metin (kart metni) |
| `muted` | `#667085` | Açıklama, etiket, ikon |
| `faint` | `#98A1B2` | Pasif metin, ay dışı günler, yer tutucu |
| `line` | `#E4E7EC` | Kart ve tablo çizgileri |
| `line-strong` | `#D0D5DD` | Girdi kenarlığı, üzerine gelinen kart |
| `subtle` | `#F2F4F7` | Üzerine gelme zemini, pasif kutu |
| `canvas` | `#F7F8FA` | Sayfa zemini, önizleme sütunu, geçmiş günler |
| `surface` | `#FFFFFF` | Kart, panel, kenar çubuğu |

**Durum renkleri.** Her gönderi durumu için üçlü: nokta/şerit (`*`), zemin (`*-bg`), metin (`*-fg`).

| Durum | Şerit | Zemin | Metin | Not |
| --- | --- | --- | --- | --- |
| Taslak | `#98A1B2` | `#F2F4F7` | `#475467` | |
| Onay bekliyor | `#F5A524` | `#FFF6E5` | `#93570A` | |
| Planlandı | `#2E90FA` | `#EBF4FF` | `#175CD3` | |
| Yayınlanıyor | `#2E90FA` | `#EBF4FF` | `#175CD3` | Nokta yanıp söner (`animate-pulse`) |
| Yayınlandı | `#17B26A` | `#E7F7EF` | `#067647` | |
| Kısmen başarısız | `#F79009` | `#FEF0E1` | `#B54708` | |
| Başarısız | `#F04438` | `#FEECEB` | `#B42318` | |

Marka indigo ile "Planlandı" mavisi bilerek ayrık tutulmuştur; durum hiçbir zaman marka rengiyle gösterilmez.

**Platform renkleri.** Yalnızca platform ikonunun zemininde kullanılır, başka hiçbir yerde değil.

| Platform | Renk | İkon |
| --- | --- | --- |
| Instagram | `#E4405F` | Simple Icons "instagram" (CC0) |
| TikTok | `#111111` | Simple Icons "tiktok" (CC0) |
| LinkedIn | `#0A66C2` | Simple Icons "linkedin" v8 (CC0) |
| Test (Mock) | `#7A5AF8` | lucide `FlaskConical` |

**Geri bildirim.** Bildirim kutuları ve toast'lar için: bilgi = Planlandı mavisi, başarı = Yayınlandı yeşili, uyarı = Onay bekliyor sarısı, hata = Başarısız kırmızısı.

### 2.2 Tipografi

Yazı tipi **Inter** (400, 500, 600). Sayılar ve saatler her zaman `tabular-nums`.

| Ad | Boyut / satır | Kalınlık | Kullanım |
| --- | --- | --- | --- |
| `title` | 20 / 28 | 600 | Sayfa başlığı |
| `heading` | 15 / 22 | 600 | Kart ve panel başlığı, modal başlığı |
| `body` | 14 / 20 | 400 | Varsayılan metin, girdiler, düğmeler |
| `small` | 13 / 18 | 400–500 | Liste satırı alt metni, etiketler, sekmeler |
| `caption` | 12 / 16 | 400–500 | Yardım metni, rozetler, takvim kartı metni |
| `micro` | 11 / 14 | 500 | Takvim kartındaki saat, sayaçlar; bunun altına inilmez |

- Başlıklarda `tracking-tight`.
- Büyük harfle yazılmış etiket kullanılmaz; bölüm etiketleri `small` + `font-medium` + `muted`.
- Cümle düzeni: "Gönderi oluştur", "Gönderi Oluştur" değil.

### 2.3 Boşluk, boyut, köşe, gölge

- **Izgara 4 px.** Kullanılan adımlar: 4, 8, 12, 16, 20, 24, 32, 40.
- **Kontrol yükseklikleri:** `sm` 32 px, `md` 36 px (varsayılan), `lg` 44 px (yalnızca giriş ekranı).
- **Köşe yarıçapı:** takvim kartı ve rozet 6 px · düğme ve girdi 8 px · kart ve panel 12 px · modal ve popover 14 px · avatar, durum hapı, anahtar tam yuvarlak.
- **Kenarlık:** her yüzey 1 px `line`. Kartlarda gölge yok.
- **Gölge yalnızca yüzen katmanlarda:**
  - `shadow-pop` (popover, menü, toast): `0 12px 32px -8px rgb(16 24 40 / 0.18), 0 2px 6px rgb(16 24 40 / 0.06)`
  - `shadow-modal`: `0 24px 64px -12px rgb(16 24 40 / 0.28)`
  - Sürüklenen kart: `shadow-pop`.
- **Katman sırası (z-index):** kenar çubuğu 20 · sabit eylem çubuğu 30 · popover ve menü 40 · modal 50 · toast 60.

### 2.4 Hareket

- Süre 120–180 ms, `ease-out`. Esneme ya da sıçrama yok.
- Popover ve menü: 4 px yukarıdan solarak gelir. Modal: arka plan solar, panel 8 px aşağıdan gelir.
- `prefers-reduced-motion` açıksa tüm geçişler kapanır.

### 2.5 İkonlar

- **lucide-react**, `strokeWidth` 1.75, boyutlar 14 / 16 / 18. Düğme içinde 16, yoğun satırlarda 14.
- Platform logoları yalnızca `PlatformIcon` bileşeninden gelir; lucide'ın marka ikonları kullanılmaz.

---

## 3. Uygulama kabuğu

```
┌──────────────┬──────────────────────────────────────────────────────┐
│ [■] Demo Ajans ▾│  Sayfa başlığı                       [eylemler]     │
│              │  ───────────────────────────────────────────────────  │
│ [+ Gönderi   │                                                      │
│    oluştur]  │                 sayfa içeriği                         │
│              │                                                      │
│ YAYIN        │                                                      │
│ ▣ Takvim     │                                                      │
│ ☰ Gönderiler │                                                      │
│ ▢ Medya      │                                                      │
│ AYARLAR      │                                                      │
│ ⚇ Hesaplar   │                                                      │
│              │                                                      │
│ ─────────────│                                                      │
│ (DK) Demo K. ▾│                                                      │
└──────────────┴──────────────────────────────────────────────────────┘
```

- **Kenar çubuğu:** 240 px, `surface`, sağda `line`. Daraltılınca 64 px'lik ikon şeridi olur; tercih `localStorage`'da saklanır. Daraltılmış halde her öğenin `title` ipucu vardır.
- **Üst bölüm:** çalışma alanı seçici. Kare avatarda baş harfler, yanında ad ve aşağı ok. Tek çalışma alanı varsa ok görünmez ve tıklanmaz.
- **Ana eylem:** "Gönderi oluştur" birincil düğmesi, tam genişlikte, `md` boyutunda. Kabuktaki tek renkli düğme budur.
- **Menü grupları:** "Yayın" (Takvim, Gönderiler, Medya) ve "Ayarlar" (Hesaplar). Grup başlığı `micro`, `faint`. Öğe 36 px yüksekliğinde, 8 px köşeli. Seçili öğe `brand-50` zemin, `brand-700` metin ve ikon; diğerleri `muted`, üzerine gelince `subtle`.
- **Alt bölüm:** kullanıcı satırı (yuvarlak avatar, ad, e-posta). Tıklanınca "Çıkış yap" menüsü açılır.
- **İçerik alanı:** `canvas` zemin. Yatay iç boşluk 32 px (mobilde 16 px), üst boşluk 28 px.
- **Sayfa başlığı:** solda `title` ve isteğe bağlı tek satır `small muted` açıklama, sağda sayfa eylemleri. Başlık ile içerik arası 20 px.
- **Mobil (< 768 px):** kenar çubuğu gizlenir. 56 px'lik üst çubukta logo, menü düğmesi ve "+" (gönderi oluştur) durur. Menü soldan çekmece olarak açılır.

Gönderi oluşturma ve düzenleme ekranları bu kabuğun **dışında**, tam ekran çalışır (bkz. 5.3).

---

## 4. Bileşenler

Hepsi [apps/web/src/components/ui.tsx](apps/web/src/components/ui.tsx) ve kardeş dosyalarda durur. Ekranlarda bunların yerine elle stil yazılmaz.

### 4.1 Düğme (`Button`)

| Varyant | Görünüm | Ne zaman |
| --- | --- | --- |
| `primary` | `brand-600` zemin, beyaz metin, üzerine gelince `brand-700` | Ekrandaki tek ana eylem (Planla, Kaydet, Bağla) |
| `secondary` | `surface` zemin, `line-strong` kenarlık, `ink` metin, üzerine gelince `subtle` | Yan eylemler |
| `ghost` | Zeminsiz, `muted` metin, üzerine gelince `subtle` zemin ve `ink` metin | Araç çubuğu, düşük öncelikli eylemler |
| `danger` | `surface` zemin, kırmızı metin, üzerine gelince `FEECEB` zemin | Sil, Bağlantıyı kaldır |

- Boyutlar `sm` (32) ve `md` (36). İkon 16 px, metinle arası 6 px.
- Yükleniyor durumunda ikon yerine dönen gösterge çıkar, genişlik değişmez, düğme pasifleşir.
- Bir ekranda birden fazla `primary` olmaz. Modal altbilgisinde `primary` sağda, vazgeçme solunda durur.
- **`IconButton`:** kare (32 ya da 36), yalnızca ikon, `ghost` görünüm; mobil üst çubuktaki "+" için `primary`. `aria-label` zorunlu.

### 4.2 Form öğeleri

- **Input / Textarea / Select:** Select varsayılan olarak tam genişliktir; araç çubuğunda `fit` ile içeriğe göre daralır. 36 px, 8 px köşe, `line-strong` kenarlık, `surface` zemin. Odakta `brand-500` kenarlık ve 3 px `brand-100` halka. Hata durumunda kırmızı kenarlık, altında `caption` kırmızı mesaj.
- **Field:** üstte `small font-medium ink` etiket, altta `caption muted` yardım metni ya da hata.
- **Checkbox:** 16 px, 4 px köşe. İşaretlide `brand-600` zemin ve beyaz tik. Ara durum (indeterminate) desteklenir.
- **Switch:** 32×18, açıkken `brand-600`. "Bu hesap için metni özelleştir" gibi açık/kapalı ayarlarda kullanılır.
- **SegmentedControl:** `subtle` zeminli 32 px kap. Seçili parça `surface` zemin ve 1 px gölge. Görünüm seçici (Ay/Hafta), gönderi türü (Gönderi/Reel/Hikâye) ve medya filtresinde kullanılır.
- **Tabs:** alt çizgili sekmeler. Seçili sekme `ink` metin ve 2 px `brand-600` alt çizgi. Sayaç rozeti `subtle` zeminli hap içinde.

### 4.3 Yüzeyler

- **Card:** `surface`, 1 px `line`, 12 px köşe. Başlıklı kartta başlık satırı 48 px, `heading`, altında `line`.
- **Panel (yan panel):** `surface`, tek kenarda `line`, köşesiz. Takvim hesap filtresi ve gönderi oluşturma hesap listesinde kullanılır.
- **Modal:** 14 px köşe, `shadow-modal`, arka plan `ink`'in %40'ı. Başlık satırı 56 px (başlık + kapat), içerik 20 px boşluklu, altbilgi `line` ile ayrılır ve eylemler sağa yaslanır. Esc ile ve arka plana tıklayınca kapanır. Odak modal içinde tutulur. Genişlikler: `sm` 420 · `md` 560 · `lg` 880.
- **ConfirmDialog:** tarayıcının `confirm()` penceresinin yerine kullanılır. Başlık, tek cümle açıklama, "Vazgeç" ve eylem düğmesi. Geri alınamayan eylemde düğme `danger` olur.
- **Popover / Menu:** `surface`, 12 px köşe, `shadow-pop`, 6 px iç boşluk. Menü öğesi 32 px, ikon 16, üzerine gelince `subtle`. Dışarı tıklayınca ve Esc ile kapanır.
- **Toast:** sağ altta yığılır, 4 saniyede kaybolur, kapatma düğmesi vardır. Tarayıcının `alert()` penceresi kullanılmaz.
- **Notice (sayfa içi bildirim):** 8 px köşe, ilgili durum renginin zemini, solda 16 px ikon. Kalıcı bilgiler için (ör. "Bu gönderi artık düzenlenemez").

### 4.4 Kimlik öğeleri

- **PlatformIcon:** platform renginde yuvarlatılmış kare (boyutun %28'i köşe), içinde beyaz logo (boyutun %58'i). Boyutlar 14, 16, 20, 28, 40.
- **AccountAvatar:** yuvarlak profil fotoğrafı. Fotoğraf yoksa ada göre sabit bir pastel zeminde iki baş harf. Sağ altta PlatformIcon (avatarın %42'si), çevresinde 2 px `surface` halka.
- **AvatarStack:** birden fazla hedef hesabı üst üste bindirir (-6 px). En fazla 3 avatar gösterilir, sonrası "+N" dairesi.
- **StatusPill:** tam yuvarlak hap, 22 px yükseklik. Solunda 6 px durum noktası, yanında `caption font-medium` etiket. Renkler 2.1'deki durum tablosundan gelir.
- **StatusBar:** takvim ve liste kartının sol kenarındaki 3 px'lik durum şeridi.

### 4.5 Durum ekranları

- **Yükleniyor:** içerik şeklinde iskelet (`subtle` zemin, yanıp sönen). Tam sayfa dönen gösterge yalnızca ilk oturum kontrolünde kullanılır.
- **Boş:** ortalanmış 40 px ikon (`subtle` daire içinde `muted`), `heading` başlık, en fazla iki satır `small muted` açıklama ve tek bir eylem düğmesi. Kesik çizgili kenarlık kullanılmaz.
- **Hata:** ilgili alanın üstünde Notice (hata tonu), mesaj ve "Tekrar dene" bağlantısı.

---

## 5. Ekranlar

### 5.1 Takvim (`/calendar`)

```
┌ Takvim ─────────────────────────────────────── [Ay|Hafta] [+ Gönderi oluştur] ┐
├──────────────┬────────────────────────────────────────────────────────────────┤
│ Hesaplar     │ [Bugün] ‹ ›  Ekim 2026                  [Durum: Tümü ▾]       │
│ [Ara…]       │ ┌Pzt──┬Sal──┬Çar──┬Per──┬Cum──┬Cmt──┬Paz──┐                  │
│ ☑ Tümü    6  │ │ 28  │ 29  │ 30  │ 1   │ 2   │ 3   │ 4   │                  │
│ ▾ ☑ Instagram│ │     │▌09:30 Pazartesi…  ◎♪│     │     │                  │
│   ☑ (K) Kahve│ │     │     │     │     │     │     │     │                  │
│   ☑ (A) Atöl.│ ├─────┼─────┼─────┼─────┼─────┼─────┼─────┤                  │
│ ▾ ☑ TikTok   │ │ 5   │ 6   │ 7   │ (8) │ 9   │ 10  │ 11  │                  │
│ ▾ ☑ LinkedIn │ │▌08:45 Yeni…   │▌09:00 Günaydın…  ◎│                       │
│              │ │     │     │     │+2 gönderi│     │     │                  │
└──────────────┴────────────────────────────────────────────────────────────────┘
```

**Hesap filtresi (sol panel, 256 px):** Agorapulse kalıbı.
- Başlık "Hesaplar", altında arama kutusu, altında "Tümü" onay kutusu ve toplam hesap sayısı.
- Platform grupları: açılır başlık (ok, onay kutusu, PlatformIcon 16, platform adı, sayı). Grup kutusu, içindeki hesapların hepsi seçiliyse işaretli, bir kısmı seçiliyse ara durumdadır.
- Hesap satırı 36 px: onay kutusu, AccountAvatar 24, ad (tek satır, taşarsa üç nokta). Üzerine gelince sağda "Yalnızca bu" bağlantısı çıkar.
- Yeniden bağlanması gereken hesabın adının yanında sarı uyarı ikonu durur.
- Seçim `localStorage`'da çalışma alanı bazında saklanır. Gizlenen hesaplar tutulur; böylece yeni bağlanan hesap varsayılan olarak görünür. Hiç hesap seçili değilse "Hiç hesap seçilmedi" boş durumu görünür.
- Panel Agorapulse'taki gibi daraltılabilir (başlıktaki panel ikonu). Varsayılan olarak 1536 px ve üzerinde açık, altında kapalıdır; tercih `localStorage`'da saklanır. Panel kapalıyken ya da 1024 px altında araç çubuğunda "Hesaplar 4/6 ▾" açılır düğmesi olur.

**Araç çubuğu:** solda "Bugün" (`secondary sm`), önceki ve sonraki için `IconButton`, dönem etiketi (`heading`; ay görünümünde "Ekim 2026", hafta görünümünde "6–12 Ekim 2026"). Sağda durum filtresi (Tümü, Planlandı, Yayınlandı, Başarısız, Taslak).

**Ay görünümü:**
- Hücre en az 128 px yüksekliğinde. Gün numarası sol üstte `caption font-medium`. Bugün 22 px `brand-600` daire içinde beyaz numara olarak gösterilir.
- Ay dışı günlerde numara `faint`, zemin `canvas` olur. Geçmiş günlerin zemini `canvas`'tır, kartlar normal görünür.
- Üzerine gelince sağ üstte "+" (`IconButton sm`) çıkar ve o güne saat 09:00 seçili olarak gönderi oluşturma ekranını açar. Geçmiş günlerde görünmez.
- **Takvim kartı (24 px):** `surface`, 1 px `line`, 6 px köşe. Soldan sağa: 3 px durum şeridi, saat (`micro tabular muted`), metin (`caption font-medium ink-2`, tek satır, taşarsa üç nokta), sağda hedef platformların PlatformIcon 14'leri (en fazla 3). Metin yoksa "Medya" yazılır. Üzerine gelince kenarlık `line-strong` olur. Tıklayınca gönderi ayrıntısı açılır.
- Bir hücrede en fazla 3 kart görünür, fazlası için "+N gönderi" bağlantısı vardır ve tıklanınca o haftanın hafta görünümü açılır.
- **Sürükle-bırak:** taşınabilir kartlar (Taslak, Planlandı, Başarısız, Kısmen başarısız) sürüklenebilir. Hedef hücre `brand-50` zemin ve 1 px kesik `brand-200` kenarlık alır. Geçmiş güne bırakılamaz; bu durumda toast ile "Gönderi geçmiş bir güne taşınamaz" mesajı gösterilir. Saat korunur.
- Tarihsiz taslaklar takvimde gösterilmez; Gönderiler > Taslaklar'da durur.

**Hafta görünümü:** Buffer kalıbı.
- 7 sütun. Başlıkta gün kısaltması ve numarası ("Çar 8"); bugün `brand-700` metin ve altında 2 px `brand-600` çizgi taşır.
- **Hafta kartı:** `surface`, 8 px köşe, 10 px iç boşluk, solda 3 px durum şeridi. Üst satır: PlatformIcon'lar (16, üst üste) + saat (`small font-medium tabular`) + sağda durum noktası. Altında `caption ink-2` metin (en fazla 3 satır). İlk görsel varsa metnin altında tam genişlikte 80 px yüksekliğinde durur; sosyal içerik görseldir ve sütun dar olduğu için yan yana koymak metni sıkıştırır. Kartlar saate göre sıralanır.
- Boş günlerde üzerine gelince "+ Gönderi ekle" kesik çizgili düğmesi görünür.

**Mobil:** varsayılan görünüm hafta olur. Hafta sütunları alt alta gün listesine dönüşür.

### 5.2 Gönderiler (`/posts`)

```
┌ Gönderiler ──────────────────────────────────────────── [+ Gönderi oluştur] ┐
│ Planlanmış 12 │ Taslaklar 2 │ Başarısız 2 │ Yayınlanmış 6                    │
│ ─────────────                                                               │
│ Bugün · 8 Ekim Çarşamba                                                     │
│ 17:30   ┌──────────────────────────────────────────────┬────────┐          │
│         │ (A)(K)(K)  Atölye Moda +2                     │ [img]  │          │
│         │ Atölye Moda x Kahve Durağı iş birliği: sınırlı│        │          │
│         │ sayıda tote çanta 🛍️                          │        │          │
│         ├──────────────────────────────────────────────┴────────┤          │
│         │ ● Planlandı                    [Düzenle] [Şimdi yayınla] [⋯] │   │
│         └───────────────────────────────────────────────────────┘          │
│ Yarın · 9 Ekim Perşembe                                                     │
│ 11:00   ┌ …                                                                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

- İçerik en fazla 880 px genişlikte, ortalı.
- Sekmeler: Planlanmış, Taslaklar (onay bekleyenler dahil), Başarısız, Yayınlanmış. Her sekmede sayı rozeti bulunur. Seçili sekme URL'de `?tab=` olarak tutulur.
- **Gün başlığı:** `small font-semibold ink`. Bugün ve yarın için göreli ad kullanılır, ardından tarih gelir ("Bugün · 8 Ekim Çarşamba"). Taslaklar sekmesinde gün başlığı yerine "Son düzenlenen" sırası uygulanır.
- **Saat sütunu:** 64 px, `small font-medium tabular`. Tarihsiz taslakta "—" yazar.
- **Gönderi kartı:** Card, solda 3 px durum şeridi.
  - Başlık satırında AvatarStack (24) ve ilk hesabın adı, birden fazla hesap varsa "+N".
  - Gövdede metin `body ink-2`, en fazla 3 satır. İlk görsel sağda 88 px kare durur, birden fazla görselde köşede "1/3" rozeti çıkar.
  - Altbilgi `line` ile ayrılır: solda StatusPill, başarısız hedef varsa yanında kırmızı "Instagram: hata mesajı…" özeti. Sağda eylemler: Düzenle, Şimdi yayınla (yalnızca taslak ve planlanmışta), Tekrar dene (başarısızda), ⋯ menüsü (Sil).
  - Kartın kendisine tıklayınca gönderi ayrıntısı açılır.
- `?highlight=<id>` ile gelinen kart 2 saniye `brand-50` zeminle vurgulanır ve görünür alana kaydırılır.
- Boş durum, sekmeye göre farklı metin gösterir. Örnek: "Planlanmış gönderi yok · Takvimde bir gün seçerek ya da yeni gönderi oluşturarak başlayın · [Gönderi oluştur]".

### 5.3 Gönderi oluşturma ve düzenleme (`/compose`, `/posts/:id/edit`)

Tam ekran, uygulama kabuğu yok. Agorapulse'un üç sütunlu düzeni uygulanır.

```
┌ ✕  Gönderi oluştur ─────────────────────────────────────── Taslak kaydedilmedi ┐
├────────────────┬─────────────────────────────────┬────────────────────────────┤
│ Hesaplar    3/7│ Gönderi                         │ Önizleme                    │
│ [Ara…]         │ ┌─────────────────────────────┐ │ ◎ Instagram · Kahve Durağı  │
│ ▾ Instagram    │ │ Ne paylaşmak istiyorsunuz?  │ │ ┌────────────────────────┐ │
│  ☑ (K) Kahve D.│ │                             │ │ │ (K) kahveduragi        │ │
│  ☐ (A) Atölye  │ │                             │ │ │ [      görsel       ]  │ │
│  ⚠ (S) Sahil   │ └─────────────────────────────┘ │ │ ♡ ◯ ➤                  │ │
│ ▾ TikTok       │ ◎ 2.180  ♪ 2.180  in 2.980      │ │ kahveduragi Metin…     │ │
│  ☑ (K) Kahve D.│                                 │ └────────────────────────┘ │
│ ▾ LinkedIn     │ Medya                           │ ♪ TikTok · Kahve Durağı    │
│  ☑ (E) Elif Y. │ [img][img][ + ]  Kütüphaneden   │  Özelleştirildi ✎          │
│                │                                 │ ┌──────┐                   │
│                │ ▸ Instagram · Kahve Durağı      │ │ 9:16 │                   │
│                │ ▸ TikTok · Kahve Durağı  ⚠ 1    │ └──────┘                   │
│                │ ▸ LinkedIn · Elif Yılmaz        │                            │
├────────────────┴─────────────────────────────────┴────────────────────────────┤
│ ⚠ 1 sorun düzeltilmeli   [Taslak kaydet]     [📅 9 Eki Per, 10:00 ▾] [Planla ▾]│
└────────────────────────────────────────────────────────────────────────────────┘
```

- **Üst çubuk (56 px):** solda kapat (`IconButton ✕`, kaydedilmemiş değişiklik varsa ConfirmDialog sorar) ve başlık ("Gönderi oluştur" ya da "Gönderiyi düzenle"). Sağda `caption muted` kayıt durumu.
- **Sol sütun, hesaplar (272 px):** takvim filtresiyle aynı gruplu liste, başlıkta "Hesaplar 3/7" sayacı. Yeniden bağlanması gereken hesap pasiftir; yanında uyarı ikonu ve "Yeniden bağla" bağlantısı vardır. Hiç bağlı hesap yoksa sütunda boş durum ve "Hesap bağla" düğmesi gösterilir.
- **Orta sütun, editör (esnek, en fazla 680 px):**
  - **Gönderi kartı:** başlık "Gönderi". Textarea en az 180 px yüksekliğinde ve kendiliğinden uzar; 15 px yazı, 24 px satır aralığı. Altında araç satırı vardır: solda hashtag sayısı, sağda seçili her platform için kalan karakter sayısı (PlatformIcon 14 + sayı). Sınıra 100 karakter kalınca sayaç sarı, aşılınca kırmızı olur.
  - **Medya kartı:** 96 px kare küçük resimler. Üzerine gelince sola ve sağa taşıma, sağ üstte kaldırma düğmesi çıkar. Sonda "+" yükleme kutusu (kesik kenarlık, sürükle-bırak hedefi) ve "Kütüphaneden seç" düğmesi bulunur. Yükleme sırasında kutuda yüzde gösterilir. Kart platform kurallarını tek satır `caption muted` ile hatırlatır ("Instagram yalnızca JPEG kabul eder").
  - **Hesap ayarları:** seçili her hesap için açılır panel. Başlıkta AccountAvatar 24, "Platform · Hesap adı", sağda sorun sayısı rozeti ve ok. İçerikte sırasıyla şunlar durur:
    1. Switch "Bu hesap için metni özelleştir" (açılınca ortak metinle doldurulmuş ayrı bir textarea çıkar).
    2. Platforma özel ayarlar: Instagram'da SegmentedControl Gönderi / Reel / Hikâye; TikTok'ta görünürlük seçimi, izinler ve ticari içerik beyanı (TikTok'un zorunlu tuttuğu öğeler, sırası ve metni değiştirilmez).
    3. Doğrulama sorunları: hata kırmızı, uyarı sarı, her biri ikonlu tek satır.
  - Sorunu olan panel otomatik açık gelir.
- **Sağ sütun, önizleme (400 px, `canvas` zemin):** başlık "Önizleme". Seçili her hesap için bir önizleme bloğu gösterilir; başında PlatformIcon, "Platform · Hesap", özelleştirildiyse "Özelleştirildi" rozeti ve kalem ikonu (ilgili paneli açıp metne odaklanır) bulunur.
  - Instagram: kare (Reel ve Hikâyede 9:16) görsel, üstte avatar ve kullanıcı adı, altta beğeni, yorum ve gönder ikonları, kalın kullanıcı adı ardından açıklama. 125 karakterden sonra "… devamı" eklenir.
  - TikTok: 9:16 koyu çerçeve; altta beyaz metinle kullanıcı adı ve açıklama, sağda dikey ikonlar.
  - LinkedIn: avatar, ad ve "Şimdi" satırı, metin (210 karakterden sonra "…daha fazla"), görsel, altta Beğen, Yorum yap, Paylaş satırı.
  - Hiç hesap seçilmemişse "Önizleme için soldan hesap seçin" boş durumu gösterilir.
- **Alt eylem çubuğu (64 px, sabit, `surface`, üstte `line`):**
  - Solda sorun özeti ("1 sorun düzeltilmeli", tıklanınca ilgili panele kaydırır) ve "Taslak kaydet" (`ghost`).
  - Sağda tarih-saat düğmesi (`secondary`, takvim ikonu ve "9 Eki Per, 10:00") ile birincil "Planla" düğmesi. Birincil düğmenin sağ parçası (▾) "Şimdi yayınla" seçeneğini açar.
  - Sorun varken Planla ve Şimdi yayınla pasif olur; Taslak kaydet her zaman kullanılabilir.
- **Tarih-saat popover'ı:** üstte hızlı seçenekler ("1 saat sonra", "Yarın 09:00", "Pazartesi 09:00"), altta Pazartesi'den başlayan mini ay takvimi (geçmiş günler pasif, seçili gün `brand-600`), en altta saat girdisi (24 saat) ve "Tamam" düğmesi. Geçmiş bir zaman seçilirse altında kırmızı uyarı çıkar.
- **Takvimden gelince:** `?at=<ISO>` parametresi varsa tarih ona ayarlanır.
- **Mobil:** sütunlar alt alta dizilir (hesaplar, editör). Önizleme üst çubuktaki "Önizleme" düğmesiyle tam ekran açılır. Eylem çubuğu sabit kalır.

### 5.4 Gönderi ayrıntısı (modal `lg`)

```
┌ Gönderi ─────────────────────────────────────────────────────────── ✕ ┐
│ ● Kısmen başarısız · Plan: 2 Ekim 18:15 · Demo Kullanıcı              │
├─────────────────────────────────────┬──────────────────────────────────┤
│ Metin                               │ [Instagram|TikTok] önizleme       │
│ Sonbahar koleksiyonu çekim…         │ ┌──────────────────────────────┐ │
│ [img]                               │ │                              │ │
│ Hesaplar                            │ └──────────────────────────────┘ │
│ (A) Atölye Moda   ● Yayınlandı  ↗   │                                  │
│ (K) Kahve Durağı  ● Başarısız       │                                  │
│     Video süresi en az 3 sn…        │                                  │
│                      [Tekrar dene]  │                                  │
├─────────────────────────────────────┴──────────────────────────────────┤
│ [Sil]                                      [Düzenle] [Şimdi yayınla]   │
└────────────────────────────────────────────────────────────────────────┘
```

- Üstte StatusPill, zaman bilgisi ("Plan:" ya da "Yayın:" ya da "Oluşturma:") ve yazar.
- Sol sütun: metin, medya küçük resimleri, hesap sonuçları listesi. Satırda avatar, ad, hedef durumu, yayın zamanı ve varsa "Platformda aç" ikonu bulunur; başarısız satırda hata mesajı kırmızı kutuda, yanında "Tekrar dene" durur.
- Sağ sütun: gönderi oluşturma ekranındaki önizleme bileşeni. Birden fazla platform varsa üstte SegmentedControl ile seçilir.
- Altbilgi: solda "Sil" (`danger`, ConfirmDialog ile), sağda Düzenle ve Şimdi yayınla. Yayınlanmış ya da yayınlanmakta olan gönderide yalnızca Sil görünür.

### 5.5 Hesaplar (`/accounts`)

Agorapulse'un hesap ekleme ekranı örnek alınır.

```
┌ Hesaplar ──────────────────────────────────────────────────────────────────┐
│ Hesap bağla                               │ Bağlı hesaplar (7)  [Ara…]      │
│ ┌──────────┐┌──────────┐┌──────────┐      │ ◎ Instagram 3                   │
│ │ ◎      + ││ ♪      + ││ in     + │      │  (K) Kahve Durağı  @kahve…  ⋯   │
│ │Instagram ││ TikTok   ││ LinkedIn │      │  (S) Sahil Butik ⚠ Yeniden bağla│
│ │Profesyonel││ Hesaplar ││Profil, şir.│    │ ♪ TikTok 1                      │
│ └──────────┘└──────────┘└──────────┘      │  …                              │
│ ┌──────────┐                              │                                 │
│ │ ⚗  Test  │                              │                                 │
│ └──────────┘                              │                                 │
│ ⓘ Giriş ve izin platformun kendi           │                                 │
│   ekranında yapılır…                       │                                 │
└────────────────────────────────────────────┴─────────────────────────────────┘
```

- İki sütun: solda bağlama kutucukları (esnek), sağda bağlı hesaplar paneli (400 px). 1024 px altında alt alta dizilir.
- **Platform kutucuğu:** Card 104 px yüksekliğinde. Ortada PlatformIcon 28, altında platform adı (`small font-semibold`) ve hesap türü (`caption muted`: "Profesyonel hesaplar", "Hesaplar", "Profil ve şirket sayfaları"). Sağ üstte "+" ikonu bulunur. Üzerine gelince kenarlık `brand-200`, "+" ise `brand-600` olur.
- **Yapılandırılmamış platform:** kutucuk pasif (`canvas` zemin), "+" yerine kilit ikonu ve "Yapılandırılmadı" rozeti durur. Üzerine gelince ipucu: "Uygulama anahtarları henüz girilmedi."
- **Bağlanırken** kutucukta dönen gösterge ve "Yönlendiriliyor…" görünür.
- **Bağlı hesaplar paneli:** başlıkta sayı ve arama kutusu bulunur. Hesaplar platform başlıkları altında (PlatformIcon 16, ad, sayı) gruplanır. Satır 52 px: AccountAvatar 32, ad, "@kullanıcıadı · hesap türü" ve ⋯ menüsü (Yeniden bağla, Bağlantıyı kaldır). Yeniden bağlanması gereken hesapta sarı uyarı satırı ve `primary sm` "Yeniden bağla" düğmesi görünür.
- OAuth dönüşündeki başarı ya da hata mesajı toast olarak gösterilir ve URL parametresi temizlenir.

### 5.6 Medya (`/media`)

- Başlık eylemleri: "Yükle" (`primary`). Araç çubuğunda SegmentedControl (Tümü / Görseller / Videolar), dosya adı araması ve sağda öğe sayısı bulunur.
- Izgara: 6 sütun (1280+), 4 sütun (768+), 2 sütun (mobil); aralık 12 px.
- **Medya kartı:** kare küçük resim, 12 px köşe, `line` kenarlık. Videoda sol altta süre rozeti (koyu yarı saydam). Üzerine gelince koyu degrade ve sağ üstte sil `IconButton` çıkar. Altında dosya adı (`caption font-medium`, tek satır) ve "1080×1080 · 240 KB" (`micro muted`) yazar.
- Sayfaya dosya sürüklenince tüm alanı kaplayan katman çıkar (`brand-50` zemin, kesik `brand-200` kenarlık, "Yüklemek için bırakın").
- Yükleme sürerken ızgaranın başında ilerleme çubuklu yer tutucu kart görünür.
- Silme işlemi ConfirmDialog ile onaylanır. Gönderide kullanılan medya silinemez; API'nin hata mesajı toast olarak gösterilir.
- **Medya seçici (modal `lg`):** aynı ızgara, 4 sütun. Seçilen öğede `brand-600` 2 px halka ve sağ üstte sıra numarası bulunur. Altbilgide "3 öğe ekle".

### 5.7 Giriş ve kayıt (`/login`, `/register`)

- İki bölme. Sol bölme (en fazla 520 px, `surface`): logo, `title` başlık, tek satır açıklama, form (`lg` girdiler ve düğme) ve alt bağlantı.
- Sağ bölme (`brand-600` zemin, 1024 px altında gizlenir): üç kısa vaat satırı ("Bir kez yazın, her yerde yayınlayın" vb.) ve altında beyaz kartlardan oluşan küçük bir takvim önizlemesi (CSS ile çizilir, görsel dosyası değil).
- Hata mesajı formun üstünde Notice olarak gösterilir.

---

## 6. Metin ve dil

- Arayüz dili Türkçe. Kullanıcıya **"siz"** diye hitap edilir, kısa ve doğrudan yazılır.
- Düğmeler fiille başlar: "Planla", "Şimdi yayınla", "Bağla", "Tekrar dene". "Tamam" yalnızca seçim popover'ında kullanılır.
- Tarih biçimleri (date-fns `tr`):
  - Takvim ve kart saati: `HH:mm` (24 saat).
  - Kısa: `d MMM EEE, HH:mm` → "9 Eki Per, 10:00".
  - Uzun: `d MMMM yyyy, HH:mm` → "9 Ekim 2026, 10:00".
  - Gün başlığı: "Bugün", "Yarın", "Dün", diğerlerinde `d MMMM EEEE`.
- Sayılar Türkçe biçimde yazılır: "2.180", "%20".
- Hata metni üç parçadan oluşur: ne oldu, neden (biliniyorsa), ne yapılmalı. Örnek: "Instagram bu görseli kabul etmedi. Görsel JPEG olmalı. Başka bir görsel seçin."
- Platform adları her zaman doğru yazılır: Instagram, TikTok, LinkedIn.

## 7. Erişilebilirlik

- Metin kontrastı en az AA. `faint` yalnızca pasif ve yardımcı bilgide kullanılır, asla tek başına önemli bilgi taşımaz.
- Durum hiçbir zaman yalnızca renkle anlatılmaz: şerit ve noktanın yanında etiket ya da `title` ipucu bulunur.
- Odak halkası: `outline: 2px solid brand-500; outline-offset: 2px`. Hiçbir yerde `outline: none` bırakılmaz.
- İkon düğmelerinde `aria-label`, modallarda `role="dialog"`, `aria-modal` ve başlık bağlantısı, sekmelerde `role="tablist"` kullanılır.
- Tüm eylemler klavyeyle yapılabilir. Sürükle-bırakın klavye karşılığı gönderiyi düzenleyip tarihini değiştirmektir.
- Tıklama hedefi en az 32×32 px (mobilde 40×40).

## 8. Duyarlı tasarım

| Kırılım | Davranış |
| --- | --- |
| < 768 | Kenar çubuğu çekmeceye döner. Takvim varsayılan olarak hafta (gün listesi) görünümünde açılır. Gönderi oluşturma ekranı tek sütuna iner, önizleme ayrı tam ekran açılır. |
| 768–1023 | Takvim hesap filtresi açılır düğmeye döner. Hesaplar ekranı tek sütuna iner. |
| 1024–1279 | Tam düzen. Gönderi oluşturma ekranında önizleme 340 px'e daralır. |
| ≥ 1280 | Tam düzen. |

## 9. Yapılmayacaklar

- Ham hex, Tailwind'in kendi renk paletleri (`gray-*`, `sky-*`, `emerald-*` …) ya da satır içi `style` ile renk vermek. İstisnalar: kullanıcıya göre üretilen avatar zemini ve platform önizlemelerinin içi (ör. Instagram hikâye halkası), çünkü önizleme platformun kendi görünümünü taklit eder.
- Ortak bileşenin varsayılan `display` sınıfını `hidden` ile ezmeye çalışmak (`className="hidden sm:inline-flex"` çakışır). Bunun yerine `max-sm:hidden` gibi kırılım önekli gizleme kullanılır.
- Gradyan düğmeler, kartlarda gölge, 11 px altı yazı.
- Tarayıcının `alert`, `confirm` ve `prompt` pencereleri.
- Aynı ekranda birden fazla birincil düğme.
- Platform logosu yerine harf kısaltması ("IG", "TT").
- Durumu yalnızca renkle göstermek.
- Agorapulse ya da Buffer'ın marka rengini, logosunu, ikonlarını veya metinlerini kopyalamak.

## 10. Dosya haritası

| Konu | Dosya |
| --- | --- |
| Belirteçler | `apps/web/src/index.css` |
| Temel bileşenler (Button, IconButton, Field, Input, Select, Card, Modal, Popover, MenuItem, Tabs, SegmentedControl, Checkbox, Switch, EmptyState, Skeleton, Notice) | `apps/web/src/components/ui.tsx` |
| Kimlik öğeleri (PlatformIcon, AccountAvatar, AvatarStack, StatusPill) | `apps/web/src/components/identity.tsx` |
| Toast ve onay penceresi (`useFeedback`) | `apps/web/src/components/feedback.tsx` |
| Tarih-saat seçici | `apps/web/src/components/DateTimePicker.tsx` |
| Tarih biçimleri | `apps/web/src/lib/format.ts` |
| Gruplu hesap listesi (takvim filtresi ve gönderi oluşturma) | `apps/web/src/components/AccountPicker.tsx` |
| Platform önizlemeleri | `apps/web/src/components/PostPreview.tsx` |
| Uygulama kabuğu | `apps/web/src/components/Layout.tsx` |
| Ekranlar | `apps/web/src/pages/*` |
