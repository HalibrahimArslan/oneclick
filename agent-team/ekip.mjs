#!/usr/bin/env node
// OneClick landing page ekibini çalıştırır.
//
//   npm run tasarim                 → PM brief yazar, tasarımcı şartname yazar, durur (onayınız için)
//   npm run gelistir                → frontend uygular, tasarımcı inceler, PM son kontrolü yapar
//   npm run tam                     → hepsi tek seferde, ara onay olmadan
//   npm run gorev -- "Hero başlığını kısalt, SSS bölümü ekle"   → serbest görev
//
// Ortam değişkenleri (.env): ANTHROPIC_API_KEY (zorunlu), BUTCE_USD (varsayılan 10)

import { query } from "@anthropic-ai/claude-agent-sdk";
import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { agents, PM_PROMPT, LANDING_DIR, DOCS_DIR } from "./agents.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, ".."); // OneClick repo kökü

// ---------- Görev metinleri ----------
const [mod = "tasarim", ...rest] = process.argv.slice(2);
const serbest = rest.join(" ").trim();

const GOREVLER = {
  tasarim: `Adım 1 (brief) ve Adım 2'yi (tasarım şartnamesi) yap, sonra DUR. Geliştirmeye geçme.
Son raporunda kullanıcıdan ${DOCS_DIR}/01-brief.md ve ${DOCS_DIR}/02-tasarim.md dosyalarını
incelemesini ve onaylıyorsa "npm run gelistir" çalıştırmasını iste. Doldurulması gereken
[YER TUTUCU] maddelerini listele.`,
  gelistir: `${DOCS_DIR}/01-brief.md ve ${DOCS_DIR}/02-tasarim.md kullanıcı tarafından onaylandı
(kullanıcının bu dosyalarda yaptığı değişiklikler geçerlidir). Önce ikisini de oku, sonra Adım 3, 4 ve 5'i yap.`,
  tam: `Adım 1'den 5'e kadar tüm süreci yürüt.`,
  gorev: `Kullanıcının yeni isteği: "${serbest}"
Önce ${DOCS_DIR} altındaki mevcut dosyaları oku. İsteği doğru alt agent'a (veya sırayla ikisine) ver:
metin/düzen/görsel karar ise önce tasarımcı şartnameyi günceller, sonra frontend uygular.
Bitince build'in geçtiğini doğrula ve DURUM.md'ye kayıt ekle.`,
};

if (!GOREVLER[mod] || (mod === "gorev" && !serbest)) {
  console.error('Kullanım: node ekip.mjs tasarim | gelistir | tam | gorev "<istek>"');
  process.exit(1);
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY tanımlı değil. agent-team/.env dosyasını oluşturun (.env.example'a bakın).");
  process.exit(1);
}

// ---------- Kayıt ----------
mkdirSync(path.join(HERE, "logs"), { recursive: true });
const LOG = path.join(HERE, "logs", `${new Date().toISOString().replace(/[:.]/g, "-")}-${mod}.log`);
const log = (line) => {
  console.log(line);
  appendFileSync(LOG, line + "\n");
};

// ---------- Güvenlik kancaları ----------
const YAZILABILIR = [LANDING_DIR, DOCS_DIR].map((d) => path.join(ROOT, d) + path.sep);

function yazmaKontrol(input) {
  const hedef = input.tool_input?.file_path;
  if (!hedef) return null;
  const tam = path.resolve(ROOT, hedef);
  if (path.basename(tam).startsWith(".env")) return ".env dosyalarına yazılamaz.";
  if (!YAZILABILIR.some((kok) => tam.startsWith(kok)))
    return `Yalnızca ${LANDING_DIR}/ ve ${DOCS_DIR}/ altına yazılabilir. Reddedilen yol: ${hedef}`;
  return null;
}

const IZINLI_KOMUTLAR = new Set([
  "pnpm", "npm", "node", "ls", "cat", "head", "tail", "grep", "find", "wc",
  "mkdir", "cp", "mv", "pwd", "echo", "test", "cd", "true", "sort", "diff",
]);
const YASAK = [
  /\bgit\s+(push|commit|reset|checkout|clean|rebase)\b/, /\brm\b/, /\bsudo\b/,
  /\b(publish|deploy|dlx)\b/, /\b(curl|wget|ssh|scp)\b/, /\bdocker\b/, /\.env\b/,
];

function bashKontrol(input) {
  const cmd = String(input.tool_input?.command ?? "");
  const yasak = YASAK.find((r) => r.test(cmd));
  if (yasak) return `Bu komut ekip için yasak (${yasak}). Gerekirse kullanıcıya bırakın.`;
  for (const parca of cmd.split(/&&|\|\||;|\|/)) {
    const ilk = parca.trim().split(/\s+/)[0];
    if (ilk && !IZINLI_KOMUTLAR.has(ilk)) return `"${ilk}" komutu izinli listede değil.`;
  }
  return null;
}

const reddet = (sebep) => ({
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "deny",
    permissionDecisionReason: sebep,
  },
});

function okumaKontrol(input) {
  const hedef = String(input.tool_input?.file_path ?? "");
  return /(^|[\\/])\.env$/.test(hedef) ? ".env dosyaları okunamaz (gizli anahtarlar)." : null;
}

const korumaKancasi = async (input) => {
  const sebep =
    input.tool_name === "Bash" ? bashKontrol(input)
    : input.tool_name === "Read" ? okumaKontrol(input)
    : yazmaKontrol(input);
  if (sebep) {
    log(`  ⛔ engellendi: ${sebep}`);
    return reddet(sebep);
  }
  return {};
};

// ---------- Çalıştır ----------
const ajanAdi = new Map(); // Agent tool_use id → alt agent adı
const kisalt = (s, n = 140) => (s.length > n ? s.slice(0, n) + "…" : s);

function araçÖzeti(block) {
  const i = block.input ?? {};
  if (block.name === "Agent" || block.name === "Task") return `→ ${i.subagent_type}: ${kisalt(i.description ?? i.prompt ?? "")}`;
  if (i.file_path) return path.relative(ROOT, path.resolve(ROOT, i.file_path));
  if (i.command) return kisalt(i.command);
  if (i.pattern) return i.pattern;
  if (i.query) return i.query;
  if (i.url) return i.url;
  return "";
}

log(`OneClick landing ekibi · mod: ${mod} · ${new Date().toLocaleString("tr-TR")}`);
log(`Kayıt dosyası: ${path.relative(ROOT, LOG)}\n`);

try {
  for await (const msg of query({
    prompt: GOREVLER[mod],
    options: {
      cwd: ROOT,
      model: "opus",
      systemPrompt: { type: "preset", preset: "claude_code", append: PM_PROMPT },
      agents,
      settingSources: ["project"],
      allowedTools: ["Read", "Glob", "Grep", "Write", "Edit", "Bash", "Agent", "WebSearch", "WebFetch"],
      permissionMode: "acceptEdits",
      hooks: {
        PreToolUse: [{ matcher: "Read|Write|Edit|MultiEdit|NotebookEdit|Bash", hooks: [korumaKancasi] }],
      },
      maxBudgetUsd: Number(process.env.BUTCE_USD ?? 10),
      env: {
        ...process.env,
        CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH: "1", // alt agent'lar kendi alt agent'ını açmasın
        CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS: "2",
      },
    },
  })) {
    if (msg.type === "assistant") {
      const kim = msg.parent_tool_use_id ? ajanAdi.get(msg.parent_tool_use_id) ?? "alt-agent" : "PM";
      for (const block of msg.message.content) {
        if (block.type === "tool_use") {
          if (block.name === "Agent" || block.name === "Task") ajanAdi.set(block.id, block.input?.subagent_type);
          log(`[${kim}] ${block.name} ${araçÖzeti(block)}`);
        } else if (block.type === "text" && block.text.trim() && kim === "PM") {
          log(`[PM] ${kisalt(block.text.trim().replace(/\s+/g, " "), 300)}`);
        }
      }
    } else if (msg.type === "result") {
      log(`\n──────── Sonuç (${msg.subtype}) · maliyet ≈ $${(msg.total_cost_usd ?? 0).toFixed(2)} ────────`);
      if (msg.result) log(msg.result);
    }
  }
} catch (err) {
  log(`\nÇalışma hatayla bitti: ${err?.message ?? err}`);
  process.exitCode = 1;
}
