import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '@/hooks/useTranslation';
import { Plus, X, Sparkles } from 'lucide-react';

interface Rule {
  type: string;
  op?: string;
  value?: string | number | boolean;
}

const SmartPlaylistCreate = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [maxTracks, setMaxTracks] = useState(50);
  const [rules, setRules] = useState<Rule[]>([]);
  const [saving, setSaving] = useState(false);

  const addRule = () => {
    setRules([...rules, { type: 'genre', op: 'equals', value: '' }]);
  };

  const removeRule = (index: number) => {
    setRules(rules.filter((_, i) => i !== index));
  };

  const updateRule = (index: number, field: keyof Rule, value: string | number | boolean) => {
    const updated = [...rules];
    updated[index] = { ...updated[index], [field]: value };
    setRules(updated);
  };

  const buildRulesPayload = () => {
    const payload: Record<string, unknown> = {};
    for (const rule of rules) {
      if (rule.type === 'genre' && rule.value) {
        payload.genre = { op: rule.op || 'equals', value: rule.value };
      } else if (rule.type === 'is_explicit') {
        payload.is_explicit = { value: rule.value };
      } else if (rule.type === 'play_count_min') {
        payload.play_count_min = Number(rule.value);
      } else if (rule.type === 'duration_min') {
        payload.duration_min = Number(rule.value);
      } else if (rule.type === 'duration_max') {
        payload.duration_max = Number(rule.value);
      } else if (rule.type === 'recently_listened_days') {
        payload.recently_listened_days = Number(rule.value);
      } else if (rule.type === 'top_listened') {
        payload.top_listened = Number(rule.value);
      } else if (rule.type === 'artist_name' && rule.value) {
        payload.artist_name = { op: rule.op || 'contains', value: rule.value };
      }
    }
    return payload;
  };

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const params = new URLSearchParams({
        title,
        max_tracks: String(maxTracks),
        rules: JSON.stringify(buildRulesPayload()),
      });
      const token = localStorage.getItem('access_token');
      const resp = await fetch(`/api/v1/playlists/smart?${params}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (resp.ok) {
        const data = await resp.json();
        navigate(`/playlist/${data.id}`);
      }
    } finally {
      setSaving(false);
    }
  };

  const RULE_TYPES = [
    { value: 'genre', label: t('smart.genre') },
    { value: 'is_explicit', label: t('smart.explicit') },
    { value: 'play_count_min', label: t('smart.min_plays') },
    { value: 'duration_min', label: t('smart.min_duration') },
    { value: 'duration_max', label: t('smart.max_duration') },
    { value: 'recently_listened_days', label: t('smart.recent_days') },
    { value: 'top_listened', label: t('smart.top_n') },
    { value: 'artist_name', label: t('smart.artist') },
  ];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="flex items-center gap-2 text-3xl font-bold text-white">
        <Sparkles size={28} className="text-green-500" />
        {t('smart.create_title')}
      </h1>

      <div className="space-y-4 rounded-lg bg-gray-800 p-6">
        <div>
          <label className="mb-1 block text-sm text-gray-400">{t('smart.playlist_name')}</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded bg-gray-700 px-4 py-2 text-white"
            placeholder={t('smart.name_placeholder')}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm text-gray-400">{t('smart.max_tracks')}</label>
          <input
            type="number"
            value={maxTracks}
            onChange={(e) => setMaxTracks(parseInt(e.target.value) || 50)}
            min={1}
            max={500}
            className="w-32 rounded bg-gray-700 px-4 py-2 text-white"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm text-gray-400">{t('smart.rules')}</label>
          <div className="space-y-2">
            {rules.map((rule, i) => (
              <div key={i} className="flex items-center gap-2">
                <select
                  value={rule.type}
                  onChange={(e) => updateRule(i, 'type', e.target.value)}
                  className="rounded bg-gray-700 px-2 py-1.5 text-sm text-white"
                >
                  {RULE_TYPES.map((rt) => (
                    <option key={rt.value} value={rt.value}>{rt.label}</option>
                  ))}
                </select>

                {(rule.type === 'genre' || rule.type === 'artist_name') && (
                  <select
                    value={rule.op || 'equals'}
                    onChange={(e) => updateRule(i, 'op', e.target.value)}
                    className="rounded bg-gray-700 px-2 py-1.5 text-sm text-white"
                  >
                    <option value="equals">={t('smart.equals')}</option>
                    <option value="contains">{t('smart.contains')}</option>
                    <option value="not_equals">≠ {t('smart.equals')}</option>
                  </select>
                )}

                <input
                  type={rule.type === 'is_explicit' ? 'checkbox' : rule.type.includes('days') || rule.type.includes('count') || rule.type.includes('duration') || rule.type.includes('top') ? 'number' : 'text'}
                  checked={rule.type === 'is_explicit' ? Boolean(rule.value) : undefined}
                  value={rule.type === 'is_explicit' ? undefined : String(rule.value || '')}
                  onChange={(e) => updateRule(i, 'value', rule.type === 'is_explicit' ? e.target.checked : e.target.value)}
                  className="flex-1 rounded bg-gray-700 px-3 py-1.5 text-sm text-white"
                  placeholder={rule.type === 'genre' ? 'Rock, Jazz...' : rule.type === 'artist_name' ? 'Queen...' : ''}
                />

                <button onClick={() => removeRule(i)} className="text-gray-500 hover:text-red-400">
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>

          <button
            onClick={addRule}
            className="mt-3 flex items-center gap-1 text-sm text-green-400 hover:text-green-300"
          >
            <Plus size={14} /> {t('smart.add_rule')}
          </button>
        </div>

        <button
          onClick={handleSave}
          disabled={!title.trim() || saving}
          className="w-full rounded-full bg-green-500 py-2.5 font-medium text-black hover:bg-green-400 disabled:opacity-50"
        >
          {saving ? t('smart.creating') : t('smart.create')}
        </button>
      </div>
    </div>
  );
};

export default SmartPlaylistCreate;
