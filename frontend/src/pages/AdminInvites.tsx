import { useEffect, useState } from 'react';
import { getAdminInvites, createInvite, revokeInvite } from '@/api/admin';
import type { AdminInvite } from '@/api/admin';
import { Mail, Plus, Trash2, Copy, Check } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';

const AdminInvites = () => {
  const { t } = useTranslation();
  const [invites, setInvites] = useState<AdminInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [maxUses, setMaxUses] = useState(1);
  const [expiresDays, setExpiresDays] = useState(30);
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchInvites = async () => {
    setLoading(true);
    try {
      const data = await getAdminInvites();
      setInvites(data);
    } catch {
      console.error('Failed to load invites');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvites();
  }, []);

  const handleCreate = async () => {
    setCreating(true);
    try {
      await createInvite(email || undefined, maxUses, expiresDays);
      setEmail('');
      fetchInvites();
    } catch {
      console.error('Failed to create invite');
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (id: string) => {
    try {
      await revokeInvite(id);
      fetchInvites();
    } catch {
      console.error('Failed to revoke invite');
    }
  };

  const handleCopy = (link: string, id: string) => {
    navigator.clipboard.writeText(link);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Mail size={32} className="text-green-500" />
        <h1 className="text-3xl font-bold text-white">{t('admin.invites')}</h1>
      </div>

      <div className="rounded-lg bg-gray-900 p-6">
        <h2 className="mb-4 text-lg font-semibold text-white">{t('admin.create_invite')}</h2>
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[200px]">
            <label className="mb-1 block text-sm text-gray-400">{t('admin.invite_email_optional')}</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('admin.invite_email_placeholder')}
              className="w-full rounded-md border border-gray-600 bg-gray-800 px-4 py-2 text-white placeholder-gray-400 outline-none focus:border-green-500"
            />
          </div>
          <div className="w-24">
            <label className="mb-1 block text-sm text-gray-400">{t('admin.max_uses')}</label>
            <input
              type="number"
              value={maxUses}
              onChange={(e) => setMaxUses(parseInt(e.target.value) || 1)}
              min={1}
              className="w-full rounded-md border border-gray-600 bg-gray-800 px-4 py-2 text-white outline-none focus:border-green-500"
            />
          </div>
          <div className="w-32">
            <label className="mb-1 block text-sm text-gray-400">{t('admin.expires_days')}</label>
            <input
              type="number"
              value={expiresDays}
              onChange={(e) => setExpiresDays(parseInt(e.target.value) || 30)}
              min={1}
              className="w-full rounded-md border border-gray-600 bg-gray-800 px-4 py-2 text-white outline-none focus:border-green-500"
            />
          </div>
          <button
            onClick={handleCreate}
            disabled={creating}
            className="flex items-center gap-2 rounded-full bg-green-500 px-6 py-2 font-bold text-black hover:bg-green-400 disabled:opacity-50"
          >
            <Plus size={18} />
            {creating ? t('admin.creating') : t('admin.create_invite')}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex h-32 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-green-500 border-t-transparent" />
        </div>
      ) : invites.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-500">
          <Mail size={48} className="mb-4" />
          <p>{t('admin.no_invites')}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-700 bg-gray-800 text-xs uppercase text-gray-400">
              <tr>
                <th className="px-4 py-3">{t('admin.invite_email')}</th>
                <th className="px-4 py-3">{t('admin.max_uses')}</th>
                <th className="px-4 py-3">{t('admin.uses')}</th>
                <th className="px-4 py-3">{t('admin.expires')}</th>
                <th className="px-4 py-3">{t('admin.status')}</th>
                <th className="px-4 py-3">{t('admin.created')}</th>
                <th className="px-4 py-3 text-right">{t('admin.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {invites.map((invite) => (
                <tr key={invite.id} className="bg-gray-900 hover:bg-gray-800">
                  <td className="px-4 py-3 text-white">{invite.email || '—'}</td>
                  <td className="px-4 py-3 text-gray-400">{invite.max_uses}</td>
                  <td className="px-4 py-3 text-gray-400">{invite.use_count}</td>
                  <td className="px-4 py-3 text-gray-400">
                    {invite.expires_at ? new Date(invite.expires_at).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                      invite.is_revoked
                        ? 'bg-red-500/20 text-red-400'
                        : invite.use_count >= invite.max_uses
                          ? 'bg-yellow-500/20 text-yellow-400'
                          : 'bg-green-500/20 text-green-400'
                    }`}>
                      {invite.is_revoked ? t('admin.revoked') : invite.use_count >= invite.max_uses ? t('admin.used') : t('admin.active')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400">
                    {new Date(invite.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      {!invite.is_revoked && invite.use_count < invite.max_uses && (
                        <button
                          onClick={() => handleCopy(invite.invite_link, invite.id)}
                          className="rounded p-1.5 text-gray-400 hover:bg-gray-700 hover:text-green-400"
                          title={t('admin.copy_link')}
                        >
                          {copiedId === invite.id ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
                        </button>
                      )}
                      {!invite.is_revoked && (
                        <button
                          onClick={() => handleRevoke(invite.id)}
                          className="rounded p-1.5 text-gray-400 hover:bg-gray-700 hover:text-red-400"
                          title={t('admin.revoke_invite')}
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AdminInvites;
