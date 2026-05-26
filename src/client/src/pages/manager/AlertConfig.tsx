import { useState, useEffect } from 'react';
import { AlertBanner } from '../../components/common';
import { getAccessToken } from '../../services/auth';

/**
 * AlertConfig Page (Module 16.4)
 *
 * Manage phone recipients per alert category.
 * GET /api/notifications/config — load current config
 * PUT /api/notifications/config — update config
 *
 * Validates: Requirements 7.1, 7.2, 7.3
 */

interface RecipientConfig {
  id?: string;
  alert_category: string;
  phone_number: string;
  user_id?: string;
  user_name?: string;
  is_active: boolean;
}

interface CategoryGroup {
  category: string;
  label: string;
  recipients: RecipientConfig[];
}

const ALERT_CATEGORIES = [
  { value: 'temperature_breach', label: 'Temperature Breach' },
  { value: 'sensor_failure', label: 'Sensor Failure' },
  { value: 'qc_rejection', label: 'QC Rejection' },
  { value: 'stock_low', label: 'Low Stock Alert' },
];

export default function AlertConfig() {
  const [categories, setCategories] = useState<CategoryGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetchConfig();
  }, []);

  async function fetchConfig() {
    setLoading(true);
    setError('');
    try {
      const token = getAccessToken();
      const res = await fetch('/api/notifications/config', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const configs: RecipientConfig[] = Array.isArray(data) ? data : data.configs || data.config || [];

        // Group by category
        const grouped = ALERT_CATEGORIES.map((cat) => ({
          category: cat.value,
          label: cat.label,
          recipients: configs.filter((c) => c.alert_category === cat.value),
        }));
        setCategories(grouped);
      } else {
        setError('Failed to load notification configuration.');
        // Initialize with empty categories
        setCategories(
          ALERT_CATEGORIES.map((cat) => ({
            category: cat.value,
            label: cat.label,
            recipients: [],
          }))
        );
      }
    } catch {
      setError('Network error loading configuration.');
      setCategories(
        ALERT_CATEGORIES.map((cat) => ({
          category: cat.value,
          label: cat.label,
          recipients: [],
        }))
      );
    } finally {
      setLoading(false);
    }
  }

  function addRecipient(categoryIndex: number) {
    setCategories((prev) =>
      prev.map((cat, i) =>
        i === categoryIndex
          ? {
              ...cat,
              recipients: [
                ...cat.recipients,
                { alert_category: cat.category, phone_number: '', is_active: true },
              ],
            }
          : cat
      )
    );
  }

  function removeRecipient(categoryIndex: number, recipientIndex: number) {
    setCategories((prev) =>
      prev.map((cat, i) =>
        i === categoryIndex
          ? { ...cat, recipients: cat.recipients.filter((_, ri) => ri !== recipientIndex) }
          : cat
      )
    );
  }

  function updateRecipient(categoryIndex: number, recipientIndex: number, phone: string) {
    setCategories((prev) =>
      prev.map((cat, i) =>
        i === categoryIndex
          ? {
              ...cat,
              recipients: cat.recipients.map((r, ri) =>
                ri === recipientIndex ? { ...r, phone_number: phone } : r
              ),
            }
          : cat
      )
    );
  }

  function toggleRecipient(categoryIndex: number, recipientIndex: number) {
    setCategories((prev) =>
      prev.map((cat, i) =>
        i === categoryIndex
          ? {
              ...cat,
              recipients: cat.recipients.map((r, ri) =>
                ri === recipientIndex ? { ...r, is_active: !r.is_active } : r
              ),
            }
          : cat
      )
    );
  }

  function validateE164(phone: string): boolean {
    return /^\+[1-9]\d{1,14}$/.test(phone);
  }

  async function handleSave() {
    setError('');
    setSuccess('');

    // Validate all phone numbers
    const allRecipients = categories.flatMap((cat) => cat.recipients);
    const invalidPhones = allRecipients.filter(
      (r) => r.phone_number && !validateE164(r.phone_number)
    );

    if (invalidPhones.length > 0) {
      setError('Some phone numbers are invalid. Use E.164 format (e.g., +6281234567890).');
      return;
    }

    setSaving(true);
    try {
      const token = getAccessToken();
      const configs = categories.flatMap((cat) =>
        cat.recipients
          .filter((r) => r.phone_number.trim())
          .map((r) => ({
            alert_category: cat.category,
            phone_number: r.phone_number.trim(),
            is_active: r.is_active,
          }))
      );

      const res = await fetch('/api/notifications/config', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ configs }),
      });

      if (res.ok) {
        setSuccess('Notification configuration saved successfully.');
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.message || 'Failed to save configuration.');
      }
    } catch {
      setError('Network error saving configuration.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="text-center py-12 text-gray-500">Loading notification configuration...</div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">Alert Configuration</h2>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Configuration'}
        </button>
      </div>

      {success && <AlertBanner type="info" message={success} onDismiss={() => setSuccess('')} />}
      {error && <AlertBanner type="error" message={error} onDismiss={() => setError('')} />}

      <p className="text-sm text-gray-600">
        Configure phone numbers to receive WhatsApp alerts for each category.
        Use E.164 format (e.g., +6281234567890).
      </p>

      <div className="space-y-6">
        {categories.map((cat, catIdx) => (
          <div key={cat.category} className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-800">{cat.label}</h3>
              <button
                type="button"
                onClick={() => addRecipient(catIdx)}
                className="text-sm text-blue-600 hover:text-blue-800 font-medium"
              >
                + Add Recipient
              </button>
            </div>

            {cat.recipients.length === 0 ? (
              <p className="text-sm text-gray-400 italic">No recipients configured.</p>
            ) : (
              <div className="space-y-2">
                {cat.recipients.map((recipient, rIdx) => (
                  <div key={rIdx} className="flex items-center gap-3">
                    <input
                      type="tel"
                      value={recipient.phone_number}
                      onChange={(e) => updateRecipient(catIdx, rIdx, e.target.value)}
                      placeholder="+6281234567890"
                      className={`flex-1 rounded-md border px-3 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        recipient.phone_number && !validateE164(recipient.phone_number)
                          ? 'border-red-300 bg-red-50'
                          : 'border-gray-300'
                      }`}
                      aria-label={`Phone number for ${cat.label} recipient ${rIdx + 1}`}
                    />

                    <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={recipient.is_active}
                        onChange={() => toggleRecipient(catIdx, rIdx)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-gray-600">Active</span>
                    </label>

                    <button
                      type="button"
                      onClick={() => removeRecipient(catIdx, rIdx)}
                      className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded"
                      aria-label={`Remove recipient ${rIdx + 1} from ${cat.label}`}
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
