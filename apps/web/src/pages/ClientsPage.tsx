import type { BrandDto } from '@oneclick/shared';
import { useQueryClient } from '@tanstack/react-query';
import { Briefcase, MoreHorizontal, Pencil, Plus, Trash2, Users } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useFeedback } from '../components/feedback';
import { AccountAvatar, Avatar, PlatformIcon } from '../components/identity';
import { Button, Card, Checkbox, EmptyState, Field, IconButton, Input, MenuItem, Modal, Notice, PageHeader, Popover, Skeleton } from '../components/ui';
import { api, ws } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useAccounts, useBrands, type AccountRow } from '../lib/queries';

export function ClientsPage() {
  const { workspace } = useAuth();
  const brands = useBrands();
  const accounts = useAccounts();
  const qc = useQueryClient();
  const { toast, confirm } = useFeedback();
  const canEdit = workspace?.role === 'OWNER' || workspace?.role === 'ADMIN';
  const [editing, setEditing] = useState<BrandDto | 'new' | null>(null);
  const [assigning, setAssigning] = useState<BrandDto | null>(null);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['brands'] });
    qc.invalidateQueries({ queryKey: ['accounts'] });
  };

  const remove = async (b: BrandDto) => {
    const ok = await confirm({
      title: `${b.name} silinsin mi?`,
      body: 'Müşterinin hesapları ve gönderileri silinmez; yalnızca müşteriyle ilişkileri kaldırılır.',
      action: 'Müşteriyi sil',
      danger: true,
    });
    if (!ok) return;
    try {
      await api(ws(`/brands/${b.id}`), { method: 'DELETE' });
      refresh();
      toast(`${b.name} silindi.`, 'success');
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  };

  const accountsOf = (id: string) => (accounts.data ?? []).filter((a) => a.brandId === id);
  const unassigned = (accounts.data ?? []).filter((a) => !a.brandId);

  return (
    <div className="mx-auto max-w-300">
      <PageHeader
        title="Müşteriler"
        subtitle="Yönettiğiniz markaları ekleyin ve sosyal hesaplarını müşteriye göre gruplayın."
        actions={
          canEdit && (
            <Button variant="primary" icon={Plus} onClick={() => setEditing('new')}>
              Müşteri ekle
            </Button>
          )
        }
      />

      {brands.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-40 rounded-card" />
          ))}
        </div>
      ) : !brands.data?.length ? (
        <Card>
          <EmptyState
            icon={Briefcase}
            title="Henüz müşteri yok"
            body="Her müşteri için bir kayıt açın, ardından o müşterinin Instagram, LinkedIn ve TikTok hesaplarını ona atayın."
            action={
              canEdit && (
                <Button variant="primary" icon={Plus} onClick={() => setEditing('new')}>
                  İlk müşteriyi ekle
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <div className="grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {brands.data.map((b) => {
            const list = accountsOf(b.id);
            return (
              <Card key={b.id} className="p-4">
                <div className="flex items-center gap-3">
                  <Avatar name={b.name} url={b.logoUrl} size={40} square />
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-heading font-semibold">{b.name}</h2>
                    <p className="text-caption text-muted tabular-nums">{list.length ? `${list.length} hesap` : 'Hesap atanmadı'}</p>
                  </div>
                  {canEdit && (
                    <Popover align="end" className="w-48" trigger={({ toggle }) => <IconButton icon={MoreHorizontal} size="sm" label={`${b.name} işlemleri`} onClick={toggle} />}>
                      {(close) => (
                        <div role="menu">
                          <MenuItem icon={Users} onClick={() => (close(), setAssigning(b))}>
                            Hesapları düzenle
                          </MenuItem>
                          <MenuItem icon={Pencil} onClick={() => (close(), setEditing(b))}>
                            Yeniden adlandır
                          </MenuItem>
                          <MenuItem icon={Trash2} danger onClick={() => (close(), remove(b))}>
                            Sil
                          </MenuItem>
                        </div>
                      )}
                    </Popover>
                  )}
                </div>

                <ul className="mt-4 space-y-2">
                  {list.map((a) => (
                    <li key={a.id} className="flex items-center gap-2.5">
                      <AccountAvatar name={a.name} url={a.avatarUrl} platform={a.platform} size={24} />
                      <span className="min-w-0 flex-1 truncate text-small">{a.name}</span>
                      <PlatformIcon platform={a.platform} size={14} />
                    </li>
                  ))}
                </ul>
                {canEdit && (
                  <Button size="sm" variant={list.length ? 'ghost' : 'secondary'} icon={Users} className="mt-3 w-full" onClick={() => setAssigning(b)}>
                    {list.length ? 'Hesapları düzenle' : 'Hesap ata'}
                  </Button>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {brands.data?.length && unassigned.length ? (
        <p className="mt-5 text-caption text-muted">
          {unassigned.length} hesap henüz bir müşteriye atanmadı. Müşteri kartındaki “Hesap ata” ile atayabilirsiniz.
        </p>
      ) : null}

      {editing && <BrandModal brand={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={refresh} />}
      {assigning && (
        <AssignModal brand={assigning} brands={brands.data ?? []} accounts={accounts.data ?? []} onClose={() => setAssigning(null)} onSaved={refresh} />
      )}
    </div>
  );
}

function BrandModal({ brand, onClose, onSaved }: { brand: BrandDto | null; onClose(): void; onSaved(): void }) {
  const { toast } = useFeedback();
  const [name, setName] = useState(brand?.name ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (brand) await api(ws(`/brands/${brand.id}`), { method: 'PATCH', body: { name } });
      else await api(ws('/brands'), { method: 'POST', body: { name } });
      onSaved();
      toast(brand ? 'Müşteri güncellendi.' : `${name.trim()} eklendi.`, 'success');
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      size="sm"
      onClose={onClose}
      title={brand ? 'Müşteriyi yeniden adlandır' : 'Müşteri ekle'}
      footer={
        <>
          <Button onClick={onClose}>Vazgeç</Button>
          <Button type="submit" form="brand-form" variant="primary" loading={busy}>
            {brand ? 'Kaydet' : 'Ekle'}
          </Button>
        </>
      }
    >
      <form id="brand-form" onSubmit={submit} className="space-y-3">
        {error && <Notice tone="error">{error}</Notice>}
        <Field label="Müşteri / marka adı">
          <Input autoFocus required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
      </form>
    </Modal>
  );
}

function AssignModal({
  brand,
  brands,
  accounts,
  onClose,
  onSaved,
}: {
  brand: BrandDto;
  brands: BrandDto[];
  accounts: AccountRow[];
  onClose(): void;
  onSaved(): void;
}) {
  const { toast } = useFeedback();
  const [selected, setSelected] = useState(() => new Set(accounts.filter((a) => a.brandId === brand.id).map((a) => a.id)));
  const [busy, setBusy] = useState(false);
  const brandName = (id: string | null) => brands.find((b) => b.id === id)?.name;

  const toggle = (id: string, on: boolean) =>
    setSelected((s) => {
      const n = new Set(s);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });

  const save = async () => {
    const changes = accounts.flatMap((a) => {
      const was = a.brandId === brand.id;
      const now = selected.has(a.id);
      if (was === now) return [];
      return [{ id: a.id, brandId: now ? brand.id : null }];
    });
    setBusy(true);
    try {
      await Promise.all(changes.map((c) => api(ws(`/accounts/${c.id}`), { method: 'PATCH', body: { brandId: c.brandId } })));
      onSaved();
      if (changes.length) toast(`${brand.name} hesapları güncellendi.`, 'success');
      onClose();
    } catch (err) {
      onSaved();
      toast((err as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`${brand.name} · hesaplar`}
      footer={
        <>
          <Button onClick={onClose}>Vazgeç</Button>
          <Button variant="primary" loading={busy} onClick={save} disabled={!accounts.length}>
            Kaydet
          </Button>
        </>
      }
    >
      {!accounts.length ? (
        <p className="text-small text-muted">Henüz bağlı hesap yok. Önce Hesaplar sayfasından bir hesap bağlayın.</p>
      ) : (
        <>
          <p className="mb-3 text-small text-muted">Bir hesap tek bir müşteriye ait olabilir. Başka müşteriye atanmış bir hesabı seçerseniz bu müşteriye taşınır.</p>
          <ul className="-mx-2 max-h-96 overflow-y-auto">
            {accounts.map((a) => {
              const other = a.brandId && a.brandId !== brand.id ? brandName(a.brandId) : null;
              return (
                <li key={a.id}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-control px-2 py-2 hover:bg-subtle">
                    <Checkbox checked={selected.has(a.id)} onChange={(v) => toggle(a.id, v)} label={a.name} />
                    <AccountAvatar name={a.name} url={a.avatarUrl} platform={a.platform} size={28} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-small font-medium">{a.name}</span>
                      {a.username && <span className="block truncate text-caption text-muted">@{a.username}</span>}
                    </span>
                    {other && <span className="shrink-0 rounded-full bg-subtle px-2 py-0.5 text-micro text-muted">{other}</span>}
                  </label>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Modal>
  );
}
