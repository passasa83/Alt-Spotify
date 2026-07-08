import { useEffect, useState } from 'react';
import { getAdminUsers, updateUserRole, toggleUserActive, deleteUser } from '@/api/admin';
import type { AdminUser } from '@/api/admin';
import { Users, Search, Trash2, Shield, UserCheck, UserX } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';

const AdminUsers = () => {
  const { t } = useTranslation();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const result = await getAdminUsers(page, 20, searchQuery || undefined, roleFilter || undefined);
      setUsers(result.items);
      setTotalPages(result.pages);
    } catch {
      console.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [page, roleFilter]);

  const handleSearch = () => {
    setPage(1);
    fetchUsers();
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      await updateUserRole(userId, newRole);
      setUsers(users.map((u) => (u.id === userId ? { ...u, role: newRole } : u)));
    } catch {
      console.error('Failed to update role');
    }
  };

  const handleToggleActive = async (userId: string, currentActive: boolean) => {
    try {
      await toggleUserActive(userId, !currentActive);
      setUsers(users.map((u) => (u.id === userId ? { ...u, is_active: !currentActive } : u)));
    } catch {
      console.error('Failed to toggle active status');
    }
  };

  const handleDelete = async (userId: string) => {
    try {
      await deleteUser(userId);
      setUsers(users.filter((u) => u.id !== userId));
      setDeleteConfirm(null);
    } catch {
      console.error('Failed to delete user');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Users size={32} className="text-green-500" />
        <h1 className="text-3xl font-bold text-white">{t('admin.users')}</h1>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} aria-hidden="true" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder={t('admin.search_users')}
            aria-label={t('admin.search_users')}
            className="w-full rounded-full bg-gray-800 py-2 pl-10 pr-4 text-sm text-white placeholder-gray-400 outline-none focus:outline-2 focus:outline-green-500"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          aria-label={t('admin.role')}
          className="rounded-full bg-gray-800 px-4 py-2 text-sm text-white outline-none focus:outline-2 focus:outline-green-500"
        >
          <option value="">{t('admin.all_roles')}</option>
          <option value="ADMIN">{t('admin.admin_role')}</option>
          <option value="USER">{t('admin.user_role')}</option>
        </select>
      </div>

      {loading ? (
        <div className="flex h-32 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-green-500 border-t-transparent" />
        </div>
      ) : users.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-500">
          <Users size={48} className="mb-4" />
          <p>{t('admin.no_users')}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-700 bg-gray-800 text-xs uppercase text-gray-400">
              <tr>
                <th className="px-4 py-3">{t('auth.display_name')}</th>
                <th className="px-4 py-3">{t('auth.email')}</th>
                <th className="px-4 py-3">{t('admin.role')}</th>
                <th className="px-4 py-3">{t('admin.status')}</th>
                <th className="px-4 py-3">{t('admin.joined')}</th>
                <th className="px-4 py-3 text-right">{t('admin.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {users.map((user) => (
                <tr key={user.id} className="bg-gray-900 hover:bg-gray-800">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-700">
                        {user.avatar_url ? (
                          <img src={user.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover" />
                        ) : (
                          <span className="text-xs text-white">{user.pseudo.charAt(0).toUpperCase()}</span>
                        )}
                      </div>
                      <span className="text-white">{user.pseudo}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-400">{user.email}</td>
                  <td className="px-4 py-3">
                    <select
                      value={user.role}
                      onChange={(e) => handleRoleChange(user.id, e.target.value)}
                      aria-label={`${t('admin.change_role')} ${user.pseudo}`}
                      className="rounded bg-gray-800 px-2 py-1 text-xs text-white outline-none focus:outline-2 focus:outline-green-500"
                    >
                      <option value="USER">{t('admin.user_role')}</option>
                      <option value="ADMIN">{t('admin.admin_role')}</option>
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                        user.is_active
                          ? 'bg-green-500/20 text-green-400'
                          : 'bg-red-500/20 text-red-400'
                      }`}
                    >
                      {user.is_active ? t('admin.active') : t('admin.inactive')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400">
                    {new Date(user.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleToggleActive(user.id, user.is_active)}
                        className={`rounded p-1.5 ${
                          user.is_active
                            ? 'text-gray-400 hover:bg-gray-700 hover:text-yellow-400'
                            : 'text-gray-400 hover:bg-gray-700 hover:text-green-400'
                        } focus-visible:outline-2 focus-visible:outline-green-500`}
                        aria-label={user.is_active ? t('admin.inactive') : t('admin.active')}
                      >
                        {user.is_active ? <UserX size={16} /> : <UserCheck size={16} />}
                      </button>
                      {deleteConfirm === user.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleDelete(user.id)}
                            className="rounded bg-red-500 px-2 py-1 text-xs text-white hover:bg-red-400"
                          >
                            {t('action.confirm')}
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(null)}
                            className="rounded bg-gray-700 px-2 py-1 text-xs text-white hover:bg-gray-600"
                          >
                            {t('action.cancel')}
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirm(user.id)}
                          className="rounded p-1.5 text-gray-400 hover:bg-gray-700 hover:text-red-400 focus-visible:outline-2 focus-visible:outline-green-500"
                          aria-label={t('admin.delete_user')}
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

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            className="rounded-md bg-gray-800 px-4 py-2 text-sm text-white hover:bg-gray-700 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-green-500"
          >
            {t('action.back')}
          </button>
          <span className="text-sm text-gray-400">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page === totalPages}
            className="rounded-md bg-gray-800 px-4 py-2 text-sm text-white hover:bg-gray-700 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-green-500"
          >
            {t('player.next')}
          </button>
        </div>
      )}
    </div>
  );
};

export default AdminUsers;
