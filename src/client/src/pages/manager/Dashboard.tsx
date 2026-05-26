import { useState, useEffect } from 'react';
import { getAccessToken } from '../../services/auth';

/**
 * Manager Dashboard Page (Module 16.1)
 *
 * Simple dashboard with summary stats and placeholder chart areas.
 * In production, Recharts would be used for actual chart rendering.
 */

interface DashboardStats {
  totalLots: number;
  pendingQC: number;
  passedLots: number;
  rejectedLots: number;
  readyToStore: number;
  activeBreaches: number;
}

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    totalLots: 0,
    pendingQC: 0,
    passedLots: 0,
    rejectedLots: 0,
    readyToStore: 0,
    activeBreaches: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  async function fetchStats() {
    setLoading(true);
    try {
      const token = getAccessToken();
      const res = await fetch('/api/lots', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const lots = Array.isArray(data) ? data : data.lots || [];
        setStats({
          totalLots: lots.length,
          pendingQC: lots.filter((l: { status: string }) => l.status === 'pending_qc').length,
          passedLots: lots.filter((l: { status: string }) => l.status === 'passed').length,
          rejectedLots: lots.filter((l: { status: string }) => l.status === 'rejected').length,
          readyToStore: lots.filter((l: { status: string }) => l.status === 'ready_to_store').length,
          activeBreaches: 0,
        });
      }

      // Fetch active breaches
      const breachRes = await fetch('/api/temperature/breaches', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (breachRes.ok) {
        const breachData = await breachRes.json();
        const breaches = Array.isArray(breachData) ? breachData : breachData.breaches || [];
        setStats((prev) => ({ ...prev, activeBreaches: breaches.length }));
      }
    } catch {
      // Stats will show 0
    } finally {
      setLoading(false);
    }
  }

  const statCards = [
    { label: 'Total Lots', value: stats.totalLots, color: 'bg-blue-500' },
    { label: 'Pending QC', value: stats.pendingQC, color: 'bg-yellow-500' },
    { label: 'Passed', value: stats.passedLots, color: 'bg-green-500' },
    { label: 'Rejected', value: stats.rejectedLots, color: 'bg-red-500' },
    { label: 'Ready to Store', value: stats.readyToStore, color: 'bg-indigo-500' },
    { label: 'Active Breaches', value: stats.activeBreaches, color: stats.activeBreaches > 0 ? 'bg-red-600' : 'bg-gray-400' },
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-gray-900">Factory Manager Dashboard</h2>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {statCards.map((card) => (
          <div key={card.label} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className={`w-2 h-2 rounded-full ${card.color} mb-2`} />
            <p className="text-2xl font-bold text-gray-900">
              {loading ? '—' : card.value}
            </p>
            <p className="text-xs text-gray-500 mt-1">{card.label}</p>
          </div>
        ))}
      </div>

      {/* Placeholder Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-sm font-medium text-gray-700 mb-4">Lot Status Distribution</h3>
          {/* Placeholder for Recharts PieChart */}
          <div className="h-48 flex items-center justify-center bg-gray-50 rounded-md border-2 border-dashed border-gray-200">
            <div className="text-center text-gray-400">
              <svg className="h-10 w-10 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
              </svg>
              <p className="text-sm">Pie Chart (Recharts)</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-sm font-medium text-gray-700 mb-4">Daily Intake Trend</h3>
          {/* Placeholder for Recharts LineChart */}
          <div className="h-48 flex items-center justify-center bg-gray-50 rounded-md border-2 border-dashed border-gray-200">
            <div className="text-center text-gray-400">
              <svg className="h-10 w-10 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
              </svg>
              <p className="text-sm">Line Chart (Recharts)</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-sm font-medium text-gray-700 mb-4">Temperature Zones Overview</h3>
          {/* Placeholder for Recharts BarChart */}
          <div className="h-48 flex items-center justify-center bg-gray-50 rounded-md border-2 border-dashed border-gray-200">
            <div className="text-center text-gray-400">
              <svg className="h-10 w-10 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              <p className="text-sm">Bar Chart (Recharts)</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-sm font-medium text-gray-700 mb-4">QC Pass Rate (Weekly)</h3>
          {/* Placeholder for Recharts AreaChart */}
          <div className="h-48 flex items-center justify-center bg-gray-50 rounded-md border-2 border-dashed border-gray-200">
            <div className="text-center text-gray-400">
              <svg className="h-10 w-10 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
              <p className="text-sm">Area Chart (Recharts)</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
