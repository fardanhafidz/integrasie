import { useState, useEffect } from 'react';
import { FormField, AlertBanner } from '../../components/common';
import { getAccessToken } from '../../services/auth';

/**
 * WorkOrders Page (Module 15.3)
 *
 * Form to create work orders with schedule dropdown, operator assignment, and instructions.
 * POST /api/ppic/work-orders
 *
 * Validates: Requirements 8.5
 */

interface Schedule {
  id: string;
  title: string;
  scheduled_date: string;
  status: string;
}

interface Operator {
  id: string;
  full_name: string;
  email: string;
}

export default function WorkOrders() {
  const [scheduleId, setScheduleId] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [instructions, setInstructions] = useState('');
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchSchedules();
    fetchOperators();
  }, []);

  async function fetchSchedules() {
    try {
      const token = getAccessToken();
      const res = await fetch('/api/ppic/schedules', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setSchedules(Array.isArray(data) ? data : data.schedules || []);
      }
    } catch {
      // Silently fail
    }
  }

  async function fetchOperators() {
    try {
      const token = getAccessToken();
      // Fetch users with warehouse_operator role for assignment
      const res = await fetch('/api/users?role=warehouse_operator', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setOperators(Array.isArray(data) ? data : data.users || []);
      }
    } catch {
      // Silently fail
    }
  }

  function validate(): boolean {
    const errors: Record<string, string> = {};

    if (!scheduleId) errors.scheduleId = 'Please select a production schedule.';
    if (!assignedTo) errors.assignedTo = 'Please assign an operator.';
    if (!instructions.trim()) errors.instructions = 'Instructions are required.';

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
      const res = await fetch('/api/ppic/work-orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          schedule_id: scheduleId,
          assigned_to: assignedTo,
          instructions: instructions.trim(),
        }),
      });

      if (res.ok) {
        setSuccess('Work order created successfully.');
        setScheduleId('');
        setAssignedTo('');
        setInstructions('');
        setFieldErrors({});
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.message || `Failed to create work order (${res.status})`);
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-gray-900">Create Work Order</h2>

      {success && <AlertBanner type="info" message={success} onDismiss={() => setSuccess('')} />}
      {error && <AlertBanner type="error" message={error} onDismiss={() => setError('')} />}

      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-5">
        <FormField label="Production Schedule" required error={fieldErrors.scheduleId} htmlFor="schedule-select">
          <select
            id="schedule-select"
            value={scheduleId}
            onChange={(e) => setScheduleId(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">Select a schedule...</option>
            {schedules.map((schedule) => (
              <option key={schedule.id} value={schedule.id}>
                {schedule.title} — {new Date(schedule.scheduled_date).toLocaleDateString()} ({schedule.status})
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="Assign Operator" required error={fieldErrors.assignedTo} htmlFor="operator-select">
          <select
            id="operator-select"
            value={assignedTo}
            onChange={(e) => setAssignedTo(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">Select an operator...</option>
            {operators.map((op) => (
              <option key={op.id} value={op.id}>
                {op.full_name} ({op.email})
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="Instructions" required error={fieldErrors.instructions} htmlFor="instructions-input">
          <textarea
            id="instructions-input"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            rows={5}
            placeholder="Enter detailed work order instructions..."
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-y"
          />
        </FormField>

        <div className="pt-4 border-t border-gray-200">
          <button
            type="submit"
            disabled={loading}
            className="w-full sm:w-auto px-6 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Creating...' : 'Create Work Order'}
          </button>
        </div>
      </form>
    </div>
  );
}
