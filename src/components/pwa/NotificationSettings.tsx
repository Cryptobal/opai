'use client';
import { useState, useEffect } from 'react';
import { PORTAL_NOTIFICATION_TYPES } from '@/lib/pwa/portal-notification-types';
import { Smartphone, Mail } from 'lucide-react';

interface Props {
  userType: 'contact' | 'guardia';
  userId: string;
  tenantId: string;
  portalType: 'cliente' | 'guardia' | 'rondas';
}

interface Pref {
  push: boolean;
  email: boolean;
}

export function NotificationSettings({ userType, userId, tenantId, portalType }: Props) {
  const [preferences, setPreferences] = useState<Record<string, Pref>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const relevantTypes = PORTAL_NOTIFICATION_TYPES.filter((t) =>
    t.portals.includes(portalType as any)
  );

  useEffect(() => {
    fetch(`/api/notifications/push/preferences?userType=${userType}&userId=${userId}&portalType=${portalType}`)
      .then((r) => r.json())
      .then((data) => {
        setPreferences(data.preferences || {});
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [userType, userId, portalType]);

  const updatePref = async (type: string, field: keyof Pref, value: boolean) => {
    const updated = {
      ...preferences,
      [type]: { ...preferences[type], [field]: value },
    };
    setPreferences(updated);

    setSaving(true);
    await fetch('/api/notifications/push/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userType, userId, tenantId, portalType, preferences: updated }),
    });
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-3">
        {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-zinc-800/50 rounded-xl" />)}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-semibold">Notificaciones</h3>
        {saving && <span className="text-xs text-zinc-500">Guardando...</span>}
      </div>

      {relevantTypes.map((config) => {
        const pref = preferences[config.key] || {
          push: config.defaultPush,
          email: config.defaultEmail,
        };

        return (
          <div key={config.key} className="bg-zinc-800/40 border border-zinc-700/30 rounded-xl p-4">
            <p className="text-white text-sm font-medium">{config.label}</p>
            <p className="text-zinc-400 text-xs mt-0.5 mb-3">{config.description}</p>
            <div className="flex items-center gap-4">
              <button
                onClick={() => updatePref(config.key, 'push', !pref.push)}
                className={`flex items-center gap-1.5 text-xs transition-colors ${
                  pref.push ? 'text-blue-400' : 'text-zinc-500'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5" />
                Push
              </button>
              <button
                onClick={() => updatePref(config.key, 'email', !pref.email)}
                className={`flex items-center gap-1.5 text-xs transition-colors ${
                  pref.email ? 'text-blue-400' : 'text-zinc-500'
                }`}
              >
                <Mail className="w-3.5 h-3.5" />
                Email
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
