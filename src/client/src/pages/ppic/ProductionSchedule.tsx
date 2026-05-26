import { useState, useEffect } from 'react';
import { FormField, AlertBanner } from '../../components/common';
import { getAccessToken } from '../../services/auth';

/**
 * ProductionSchedule Page (Module 15.2)
 *
 * Form to create production schedules with title, date, and lot selection + quantity.
 * POST /api/ppic/schedules
 *
 * Validates: Requirements 8.3, 8.4, 8.6
 */

interface AvailableLot {
  id: string;
  lot_number: string;
  material_group_code: string;
  quantity: number;
  unit: string;
}

interface LotSelection {
  lot_id: string;
  quantity_required: number;
}

export default function ProductionSchedule() {
  const [title, setTitle] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [lotSelections, setLotSelections] = useState<LotSelection[]>([
    { lot_id: '', quantity_required: 0 },
  ]);
  const [availableLots, setAvailableLots] = useState<AvailableLot[]>([]);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchAvailableLots();
  }, []);

  async function fetchAvailableLots() {
    try {
      const token = getAccessToken();
      const res = await fetch('/api/ppic/stock', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setAvailableLots(Array.isArray(data) ? data : data.stock || []);
      }
    } catch {
      // Silently fail — lots dropdown will be empty
    }
  }

  function addLotRow() {
    setLotSelections((prev) => [...prev, { lot_id: '', quantity_required: 0 }]);
  }

  function removeLotRow(index: number) {
    setLotSelections((prev) => prev.filter((_, i) => i !== index));
  }

  function updateLotSelection(index: number, field: keyof LotSelection, value: string | number) {
    setLotSelections((prev) =>
      prev.map((sel, i) => (i === index ? { ...sel, [field]: value } : sel))
    );
  }

  function validate(): boolean {
    const errors: Record<string, string> = {};

    if (!title.trim()) errors.title = 'Title is required.';
    if (!scheduledDate) errors.scheduledDate = 'Scheduled date is required.';

    const validLots = lotSelections.filter((s) => s.lot_id && s.quantity_required > 0);
    if (validLots.length === 0) {
      errors.lots = 'At least one lot with quantity is required.';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!validate()) return;

    setLoading(true);
    try {
      const token = getAccessToken();
      const validLots = lotSelections.filter((s) => s.lot_id && s.quantity_required > 0);

      const res = await fetch('/api/ppic/schedules', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: title.trim(),
          scheduled_date: scheduledDate,
          lots: validLots,
        }),
      });

      if (res.ok) {
        setSuccess('Production schedule created successfully.');
        setTitle('');
        setScheduledDate('');
        setLotSelections([{ lot_id: '', quantity_required: 0 }]);
        setFieldErrors({});
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.message || `Failed to create schedule (${res.status})`);
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-gray-900">Create Production Schedule</h2>

      {success && <AlertBanner type="info" message={success} onDismiss={() => setSuccess('')} />}
      {error && <AlertBanner type="error" message={error} onDismiss={() => setError('')} />}

      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-5">
        <FormField label="Schedule Title" required error={fieldErrors.title} htmlFor="schedule-title">
          <input
            id="schedule-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., Weekly Production Batch #12"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </FormField>

        <FormField label="Scheduled Date" required error={fieldErrors.scheduledDate} htmlFor="scheduled-date">
          <input
            id="scheduled-date"
            type="date"
            value={scheduledDate}
            onChange={(e) => setScheduledDate(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </FormField>

        {/* Lot Selections */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium text-gray-700">
              Lots & Quantities <span className="text-red-500">*</span>
            </label>
            <button
              type="button"
              onClick={addLotRow}
              className="text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              + Add Lot
            </button>
          </div>

          {fieldErrors.lots && (
            <p className="text-xs text-red-600">{fieldErrors.lots}</p>
          )}

          {lotSelections.map((sel, index) => (
            <div key={index} className="flex items-center gap-3">
              <select
                value={sel.lot_id}
                onChange={(e) => updateLotSelection(index, 'lot_id', e.target.value)}
                className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                aria-label={`Select lot ${index + 1}`}
              >
                <option value="">Select a lot...</option>
                {availableLots.map((lot) => (
                  <option key={lot.id} value={lot.id}>
                    {lot.lot_number} — {lot.material_group_code} ({lot.quantity} {lot.unit})
                  </option>
                ))}
              </select>

              <input
                type="number"
                min="0"
                step="0.01"
                value={sel.quantity_required || ''}
                onChange={(e) => updateLotSelection(index, 'quantity_required', parseFloat(e.target.value) || 0)}
                placeholder="Qty"
                className="w-28 rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                aria-label={`Quantity for lot ${index + 1}`}
              />

              {lotSelections.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeLotRow(index)}
                  className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded"
                  aria-label={`Remove lot ${index + 1}`}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="pt-4 border-t border-gray-200">
          <button
            type="submit"
            disabled={loading}
            className="w-full sm:w-auto px-6 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Creating...' : 'Create Schedule'}
          </button>
        </div>
      </form>
    </div>
  );
}
