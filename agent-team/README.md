# OneClick landing page ekibi

Üç agent'lık küçük bir ekip: **PM** işi yönetir, **tasarımcı** şartnameyi yazar ve uygulamayı inceler,
**frontend** sayfayı `apps/landing` altında React + Vite + Tailwind ile kodlar.
[Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk/subagents) ile çalışır.

```
                ┌──────────────┐
  siz ────────▶ │  PM (Opus)   │  brief yazar, işi dağıtır, kontrol eder, rapor verir
                └──────┬───────┘
          ┌────────────┴────────────┐
   ┌──────▼───────┐          ┌──────▼───────┐
   │ Tasarımcı    │          │ Frontend     │
   │ (Opus)       │          │ (Sonnet)     │
   │ şartname +   │          │ apps/landing │
   │ inceleme     │          │ kod + build  │
   └──────────────┘          └──────────────┘
```

Ekip birbirine `docs/landing/` altındaki dosyalarla iş devreder:

| Dosya | Yazan | İçerik |
| --- | --- | --- |
| `01-brief.md` | PM | Değer önerisi, hedef kitle, bölümler, CTA'lar, kabul kriterleri |
| `02-tasarim.md` | Tasarımcı | Bölüm bölüm nihai metinler, düzen, belirteçler, erişilebilirlik |
| `03-uygulama-notlari.md` | Frontend | Yapılanlar, dosyalar, çalıştırma komutları |
| `04-inceleme.md` | Tasarımcı | "Düzeltilmeli" ve "İsteğe bağlı" listeleri |
| `DURUM.md` | PM | Her çalıştırmanın tarihli kaydı |

## Kurulum

```bash
cd agent-team
npm install
cp .env.example .env      # ANTHROPIC_API_KEY'i yazın
```

## Kullanım

```bash
npm run tasarim     # 1) PM brief'i, tasarımcı şartnameyi yazar ve durur
                    #    → docs/landing/01-brief.md ve 02-tasarim.md'yi okuyun, isterseniz düzeltin
npm run gelistir    # 2) Frontend kodlar, tasarımcı inceler (en fazla 2 düzeltme turu), PM kontrol eder

cd .. && pnpm --filter @oneclick/landing dev    # http://localhost:5174

npm run gorev -- "Fiyat bölümüne SSS ekle, hero başlığını kısalt"   # sonraki değişiklikler
npm run tam         # ara onay olmadan baştan sona
```

Her çalıştırmanın adım adım kaydı `agent-team/logs/` altına yazılır.

## Güvenlik sınırları

- Agent'lar yalnızca `apps/landing/` ve `docs/landing/` altına yazabilir. Panel, API ve `DESIGN.md` korunur.
- Bash'te yalnızca `pnpm`, `npm`, `node` ve okuma/klasör komutları çalışır. `git commit/push`, `rm`, `curl`, `docker`, deploy ve `.env` erişimi engellenir.
- Alt agent'lar kendi alt agent'larını açamaz. Çalıştırma başına harcama `BUTCE_USD` ile sınırlıdır.
- Commit'i siz atarsınız: `git diff` ile inceleyip onaylayın.

## Ekibi değiştirmek

Roller ve talimatlar `agents.mjs` içinde. Yeni bir rol (ör. metin yazarı, SEO uzmanı) eklemek için
`agents` nesnesine bir giriş ekleyin ve `PM_PROMPT`'taki adımlarda o role ne zaman başvurulacağını yazın.
