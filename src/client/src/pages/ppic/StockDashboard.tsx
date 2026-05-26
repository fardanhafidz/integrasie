import { useState, useEffect } from 'react';
import { DataTable } from '../../components/common';
import type { Column } from '../../components/common';
import { getAccessToken } from '../../services/auth';
import { getSocket } from '../../services/socket';

/**
 * StockDashboard Page (Module 15.1)
 *
 * Displays available stock from GET /api/ppic/stock.
 * Socket.IO 'ppic:stock_update' event triggers auto-refresh.
 *
 * Validates: Requirements 8.1, 8.2
 */

interface StockItem {
  id: string;
  lot_number: string;
  material_group_code: string;
  quantity: number;
  unit: string;
  zone_name: string | null;
  coordinate: string | null;
  supplier_name: string | null;
  delivery_date: string;
}

export default function StockDashboard() {
  const [stock, setStock] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchStock();

    const socket = getSocket();

    socket.on('ppic:stock_update', () => {
      fetchStock();
    });

    return () => {
      socket.off('ppic:stock_update');
    };
  }, []);

  async function fetchStock() {
    setLoading(true);
    setError('');
    try {
      const token = getAccessToken();
      const res = await fetch('/api/ppic/stock', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setStock(Array.isArray(data) ? data : data.stock || []);
      } else {
        setError(`Failed to fetch stock data (${res.status})`);
      }
    } catch {
      setError('Network error loading stock data.');
    } finally {
      setLoading(false);
    }
  }

  const columns: Column<StockItem>[] = [
    { key: 'lot_number', header: 'Lot Number', sortable: true },
    { key: 'material_group_code', header: 'Material Code', sortable: true },
    {
      key: 'quantity',
      header: 'Quantity',
      sortable: true,
      render: (item) => `${item.quantity} ${item.unit}`,
    },
    {
      key: 'supplier_name',
      header: 'Supplier',
      render: (item) => item.supplier_name || '—',
    },
    {
      key: 'zone_name',
      header: 'Zone',
      render: (item) => item.zone_name || '—',
    },
    {
      key: 'coordinate',
      header: 'Location',
      render: (item) => item.coordinate || 'Unassigned',
    },
    {
      key: 'delivery_date',
      header: 'Delivery Date',
      sortable: true,
      render: (item) => new Date(item.delivery_date).toLocaleDateString(),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">Stock Dashboard</h2>
        <button
          onClick={fetchStock}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label="Refresh stock data"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <DataTable<StockItem>
        columns={columns}
        data={stock}
        loading={loading}
        keyExtractor={(item) => item.id}
        emptyMessage="No stock available. Lots with status 'Ready to Store' will appear here."
        caption="Available stock table"
      />
    </div>
  );
}
