import { PLATFORM_LABELS, PLATFORMS, type Platform } from '@oneclick/shared';
import { AlertTriangle, ChevronDown, Search } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import type { AccountRow } from '../lib/queries';
import { AccountAvatar, PlatformIcon } from './identity';
import { Checkbox, cx } from './ui';

/**
 * Platforma göre gruplanmış, aramalı ve onay kutulu hesap listesi (DESIGN.md §5.1, §5.3).
 * Takvim filtresinde ve gönderi oluşturma ekranında kullanılır.
 */
export function AccountPicker({
  accounts,
  selected,
  onChange,
  only,
  disabledReason,
  rowExtra,
  className,
}: {
  accounts: AccountRow[];
  selected: string[];
  onChange(ids: string[]): void;
  /** "Yalnızca bu" bağlantısını gösterir */
  only?: boolean;
  /** Seçilemeyen hesap için açıklama; undefined dönerse seçilebilir */
  disabledReason?(a: AccountRow): string | undefined;
  rowExtra?(a: AccountRow): ReactNode;
  className?: string;
}) {
  const [q, setQ] = useState('');
  const [collapsed, setCollapsed] = useState<Platform[]>([]);
  const sel = useMemo(() => new Set(selected), [selected]);
  const selectable = (a: AccountRow) => !disabledReason?.(a);

  const filtered = accounts.filter((a) => `${a.name} ${a.username ?? ''}`.toLocaleLowerCase('tr').includes(q.toLocaleLowerCase('tr')));
  const groups = PLATFORMS.map((p) => ({ platform: p, items: filtered.filter((a) => a.platform === p) })).filter((g) => g.items.length);

  const setMany = (ids: string[], on: boolean) => {
    const next = new Set(sel);
    ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
    onChange([...next]);
  };
  const allIds = accounts.filter(selectable).map((a) => a.id);
  const allOn = allIds.length > 0 && allIds.every((id) => sel.has(id));
  const someOn = allIds.some((id) => sel.has(id));

  return (
    <div className={cx('flex min-h-0 flex-col', className)}>
      <div className="relative px-3">
        <Search className="pointer-events-none absolute top-1/2 left-5.5 size-4 -translate-y-1/2 text-faint" strokeWidth={1.75} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Hesap ara"
          aria-label="Hesap ara"
          className="h-8 w-full rounded-control border border-line-strong bg-surface pr-2 pl-8 text-small placeholder:text-faint focus:border-brand-500 focus:ring-3 focus:ring-brand-100 focus:outline-none"
        />
      </div>

      <label className="mx-1.5 mt-2 flex h-8 cursor-pointer items-center gap-2.5 rounded-control px-3 text-small font-medium hover:bg-subtle">
        <Checkbox checked={allOn} indeterminate={!allOn && someOn} onChange={(v) => onChange(v ? allIds : [])} label="Tümünü seç" />
        <span className="flex-1">Tümü</span>
        <span className="text-caption text-faint tabular-nums">{allIds.length}</span>
      </label>

      <div className="mt-1 min-h-0 flex-1 overflow-y-auto pb-3">
        {groups.map(({ platform, items }) => {
          const ids = items.filter(selectable).map((a) => a.id);
          const gOn = ids.length > 0 && ids.every((id) => sel.has(id));
          const gSome = ids.some((id) => sel.has(id));
          const isOpen = !collapsed.includes(platform);
          return (
            <div key={platform} className="mx-1.5 border-t border-line pt-1 first:border-t-0">
              <div className="flex h-8 items-center gap-2.5 rounded-control px-3 hover:bg-subtle">
                <Checkbox
                  checked={gOn}
                  indeterminate={!gOn && gSome}
                  disabled={!ids.length}
                  onChange={(v) => setMany(ids, v)}
                  label={`${PLATFORM_LABELS[platform]} hesaplarının tümü`}
                />
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  onClick={() => setCollapsed((c) => (isOpen ? [...c, platform] : c.filter((x) => x !== platform)))}
                  aria-expanded={isOpen}
                >
                  <PlatformIcon platform={platform} size={16} />
                  <span className="flex-1 truncate text-small font-medium">{PLATFORM_LABELS[platform]}</span>
                  <span className="text-caption text-faint tabular-nums">{items.length}</span>
                  <ChevronDown className={cx('size-4 text-faint transition-transform', !isOpen && '-rotate-90')} />
                </button>
              </div>
              {isOpen &&
                items.map((a) => {
                  const reason = disabledReason?.(a);
                  return (
                    <div
                      key={a.id}
                      className={cx(
                        'group flex min-h-9 items-center gap-2.5 rounded-control py-1 pr-2 pl-3',
                        reason ? 'opacity-60' : 'cursor-pointer hover:bg-subtle',
                      )}
                      onClick={() => !reason && setMany([a.id], !sel.has(a.id))}
                      title={reason}
                    >
                      <Checkbox checked={sel.has(a.id)} disabled={Boolean(reason)} onChange={(v) => setMany([a.id], v)} label={a.name} />
                      <AccountAvatar name={a.name} url={a.avatarUrl} platform={a.platform} size={24} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-small">{a.name}</p>
                        {a.username && <p className="truncate text-micro text-faint">@{a.username}</p>}
                      </div>
                      {a.status === 'NEEDS_REAUTH' && <AlertTriangle className="size-3.5 shrink-0 text-pending" aria-label="Yeniden bağlanmalı" />}
                      {rowExtra?.(a)}
                      {only && !reason && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onChange([a.id]);
                          }}
                          className="hidden shrink-0 rounded px-1 text-micro font-medium text-brand-700 group-hover:block hover:underline"
                        >
                          Yalnızca bu
                        </button>
                      )}
                    </div>
                  );
                })}
            </div>
          );
        })}
        {!groups.length && <p className="px-4 py-6 text-center text-small text-muted">Eşleşen hesap yok.</p>}
      </div>
    </div>
  );
}
