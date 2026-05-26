import { useState, useEffect, useCallback } from 'react';
import { DataTable, StatusBadge } from '../../components/common';
import type { Column } from '../../components/common';
import type { LotStatus } from '../../components/common/StatusBadge';
import { getAccessToken } from '../../services/auth';

/**
 * LotQueue Page
 *
 * Displays a table of lots with status filtering.
 * Warehouse operators can view all lots and filter by status.
 *
 * Validates: Requirements 2.3, 4.1
 */

interface Lot {
  id: string;
  lot_number: string;
  status: LotStatus;
  material_group_code: string;
  is_temperature_sensitive: boolean;
  is_hazardous: boolean;
  hazard_class: string | null;
  created_at: string;
  updated_at: string;
}

type StatusFilter = 'all' | LotStatus;

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All Statuses' },
  { value: 'pending_qc', label: 'Pending QC' },
  { value: 'passed', label: 'Passed' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'ready_to_store', label: 'Ready to Store' },
];

export default function LotQueue() {
  const [lots, setLots] = useState<Lot[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [error, setError] = useState('');

  const fetchLots = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const token = getAccessToken();
      const params = new URLSearchParams();
      if (statusFilter !== 'all') {
        params.set('status', statusFilter);
      }

      const url = `/api/lots${params.toString() ? `?${params.toString()}` : ''}`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setLots(Array.isArray(data) ? data : data.lots || []);
      } else {
        setError(`Failed to fetch lots (${response.status})`);
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchLots();
  }, [fetchLots]);

  const columns: Column<Lot>[] = [
    {
      key: 'lot_number',
      header: 'Lot Number',
      sortable: true,
    },
    {
      key: 'status',
      header: 'Status',
      render: (lot) => <StatusBadge status={lot.status} />,
    },
    {
      key: 'material_group_code',
      header: 'Material Code',
      sortable: true,
    },
    {
      key: 'is_temperature_sensitive',
      header: 'Cold Chain',
      render: (lot) => (
        <span className={`text-xs font-medium ${lot.is_temperature_sensitive ? 'text-blue-600' : 'text-gray-400'}`}>
          {lot.is_temperature_sensitive ? '❄️ Yes' : 'No'}
        </span>
      ),
    },
    {
      key: 'is_hazardous',
      header: 'Hazardous',
      render: (lot) => (
        <span className={`text-xs font-medium ${lot.is_hazardous ? 'text-orange-600' : 'text-gray-400'}`}>
          {lot.is_hazardous ? `⚠️ ${lot.hazard_class || 'Yes'}` : 'No'}
        </span>
      ),
    },
    {
      key: 'created_at',
      header: 'Created',
      sortable: true,
      render: (lot) => new Date(lot.created_at).toLocaleDateString(),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h2 className="text-xl font-semibold text-gray-900">Lot Queue</h2>

        <div className="flex items-center gap-3">
          <label htmlFor="status-filter" className="text-sm font-medium text-gray-700">
            Filter:
          </label>
          <select
            id="status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          <button
            onClick={fetchLots}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Refresh lot list"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <DataTable<Lot>
        columns={columns}
        data={lots}
        loading={loading}
        keyExtractor={(lot) => lot.id}
        emptyMessage="No lots found matching the selected filter."
        caption="Lot queue table"
      />
    </div>
  );
}
