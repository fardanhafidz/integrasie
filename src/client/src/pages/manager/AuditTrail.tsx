import { useState, useEffect, useCallback } from 'react';
import { DataTable, FormField } from '../../components/common';
import type { Column, PaginationConfig } from '../../components/common';
import { getAccessToken } from '../../services/auth';

/**
 * AuditTrail Page (Module 16.3)
 *
 * DataTable with date/user/action/lot filters.
 * GET /api/audit with query parameters.
 *
 * Validates: Requirements 6.1, 6.2, 6.4
 */

interface AuditEntry {
  id: string;
  user_id: string;
  user_name?: string;
  action: string;
  entity_type: string;
  entity_id: string;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown>;
  timestamp: string;
}

interface AuditFilters {
  startDate: string;
  endDate: string;
  userId: string;
  action: string;
  entityType: string;
}

export default function AuditTrail() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pagination, setPagination] = useState<PaginationConfig>({
    currentPage: 1,
    totalPages: 1,
    totalItems: 0,
    pageSize: 20,
  });
  const [filters, setFilters] = useState<AuditFilters>({
    startDate: '',
    endDate: '',
    userId: '',
    action: '',
    entityType: '',
  });

  const fetchAudit = useCallback(async (page = 1) => {
    setLoading(true);
    setError('');
    try {
      const token = getAccessToken();
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(pagination.pageSize));

      if (filters.startDate) params.set('startDate', filters.startDate);
      if (filters.endDate) params.set('endDate', filters.endDate);
      if (filters.userId) params.set('userId', filters.userId);
      if (filters.action) params.set('action', filters.action);
      if (filters.entityType) params.set('entityType', filters.entityType);

      const res = await fetch(`/api/audit?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        const items = Array.isArray(data) ? data : data.entries || data.data || [];
        const total = data.total || data.totalItems || items.length;
        setEntries(items);
        setPagination((prev) => ({
          ...prev,
          currentPage: page,
          totalItems: total,
          totalPages: Math.ceil(total / prev.pageSize) || 1,
        }));
      } else {
        setError(`Failed to fetch audit trail (${res.status})`);
      }
    } catch {
      setError('Network error loading audit trail.');
    } finally {
      setLoading(false);
    }
  }, [filters, pagination.pageSize]);

  useEffect(() => {
    fetchAudit(1);
  }, [fetchAudit]);

  function handleFilterChange(field: keyof AuditFilters, value: string) {
    setFilters((prev) => ({ ...prev, [field]: value }));
  }

  function handleClearFilters() {
    setFilters({ startDate: '', endDate: '', userId: '', action: '', entityType: '' });
  }

  const columns: Column<AuditEntry>[] = [
    {
      key: 'timestamp',
      header: 'Date/Time',
      sortable: true,
      render: (entry) => new Date(entry.timestamp).toLocaleString(),
      width: '180px',
    },
    {
      key: 'user_name',
      header: 'User',
      render: (entry) => entry.user_name || entry.user_id?.slice(0, 8) || '—',
    },
    { key: 'action', header: 'Action', sortable: true },
    { key: 'entity_type', header: 'Entity Type' },
    {
      key: 'entity_id',
      header: 'Entity ID',
      render: (entry) => (
        <span className="font-mono text-xs">{entry.entity_id?.slice(0, 8)}...</span>
      ),
    },
    {
      key: 'old_value',
      header: 'Changes',
      render: (entry) => (
        <span className="text-xs text-gray-500">
          {entry.old_value ? 'Modified' : 'Created'}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-gray-900">Audit Trail</h2>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <FormField label="Start Date" htmlFor="filter-start-date">
            <input
              id="filter-start-date"
              type="date"
              value={filters.startDate}
              onChange={(e) => handleFilterChange('startDate', e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </FormField>

          <FormField label="End Date" htmlFor="filter-end-date">
            <input
              id="filter-end-date"
              type="date"
              value={filters.endDate}
              onChange={(e) => handleFilterChange('endDate', e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </FormField>

          <FormField label="User ID" htmlFor="filter-user">
            <input
              id="filter-user"
              type="text"
              value={filters.userId}
              onChange={(e) => handleFilterChange('userId', e.target.value)}
              placeholder="User ID or name"
              className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </FormField>

          <FormField label="Action" htmlFor="filter-action">
            <select
              id="filter-action"
              value={filters.action}
              onChange={(e) => handleFilterChange('action', e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Actions</option>
              <option value="status_change">Status Change</option>
              <option value="lot_created">Lot Created</option>
              <option value="qc_result">QC Result</option>
              <option value="slot_assigned">Slot Assigned</option>
              <option value="slot_override">Slot Override</option>
              <option value="work_order_created">Work Order Created</option>
            </select>
          </FormField>

          <FormField label="Entity Type" htmlFor="filter-entity">
            <select
              id="filter-entity"
              value={filters.entityType}
              onChange={(e) => handleFilterChange('entityType', e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Types</option>
              <option value="lot">Lot</option>
              <option value="drum">Drum</option>
              <option value="intake">Intake</option>
              <option value="work_order">Work Order</option>
              <option value="schedule">Schedule</option>
            </select>
          </FormField>
        </div>

        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={handleClearFilters}
            className="text-sm text-gray-600 hover:text-gray-800 font-medium"
          >
            Clear Filters
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <DataTable<AuditEntry>
        columns={columns}
        data={entries}
        loading={loading}
        keyExtractor={(entry) => entry.id}
        pagination={pagination}
        onPageChange={(page) => fetchAudit(page)}
        emptyMessage="No audit entries found matching the selected filters."
        caption="Audit trail table"
      />
    </div>
  );
}
