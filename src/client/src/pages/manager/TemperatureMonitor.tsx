import { useState, useEffect } from 'react';
import { AlertBanner } from '../../components/common';
import { getAccessToken } from '../../services/auth';
import { getSocket } from '../../services/socket';

/**
 * TemperatureMonitor Page (Module 16.2)
 *
 * Displays current temperatures per zone.
 * Socket.IO listener for 'temperature:update' and 'temperature:breach'.
 * Shows breach alerts prominently.
 *
 * Validates: Requirements 5.1, 5.2, 5.3, 5.4
 */

interface ZoneReading {
  zone_id: string;
  zone_name: string;
  zone_type: string;
  temperature_celsius: number;
  is_breach: boolean;
  recorded_at: string;
}

interface BreachAlert {
  zone_name: string;
  temperature: number;
  timestamp: string;
}

export default function TemperatureMonitor() {
  const [readings, setReadings] = useState<ZoneReading[]>([]);
  const [breachAlerts, setBreachAlerts] = useState<BreachAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchCurrentReadings();

    const socket = getSocket();

    socket.on('temperature:update', (data: ZoneReading | ZoneReading[]) => {
      const updates = Array.isArray(data) ? data : [data];
      setReadings((prev) => {
        const updated = [...prev];
        updates.forEach((u) => {
          const idx = updated.findIndex((r) => r.zone_id === u.zone_id);
          if (idx >= 0) {
            updated[idx] = u;
          } else {
            updated.push(u);
          }
        });
        return updated;
      });
    });

    socket.on('temperature:breach', (data: { zone: { name: string }; reading: { temperature_celsius: number; recorded_at: string } }) => {
      setBreachAlerts((prev) => [
        {
          zone_name: data.zone?.name || 'Unknown Zone',
          temperature: data.reading?.temperature_celsius || 0,
          timestamp: data.reading?.recorded_at || new Date().toISOString(),
        },
        ...prev.slice(0, 9), // Keep last 10 alerts
      ]);
    });

    return () => {
      socket.off('temperature:update');
      socket.off('temperature:breach');
    };
  }, []);

  async function fetchCurrentReadings() {
    setLoading(true);
    try {
      const token = getAccessToken();
      const res = await fetch('/api/temperature/current', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setReadings(Array.isArray(data) ? data : data.readings || []);
      } else {
        setError('Failed to load temperature data.');
      }
    } catch {
      setError('Network error loading temperature data.');
    } finally {
      setLoading(false);
    }
  }

  function getTemperatureColor(temp: number, isBreach: boolean): string {
    if (isBreach) return 'text-red-600 bg-red-50 border-red-200';
    if (temp <= -10) return 'text-blue-700 bg-blue-50 border-blue-200';
    if (temp <= -4) return 'text-green-700 bg-green-50 border-green-200';
    return 'text-yellow-700 bg-yellow-50 border-yellow-200';
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">Temperature Monitoring</h2>
        <button
          onClick={fetchCurrentReadings}
          className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
        >
          Refresh
        </button>
      </div>

      {error && <AlertBanner type="error" message={error} onDismiss={() => setError('')} />}

      {/* Breach Alerts */}
      {breachAlerts.length > 0 && (
        <div className="space-y-2">
          {breachAlerts.map((alert, idx) => (
            <AlertBanner
              key={idx}
              type="error"
              message={`🚨 BREACH: ${alert.zone_name} — ${alert.temperature.toFixed(1)}°C at ${new Date(alert.timestamp).toLocaleTimeString()}`}
              onDismiss={() => setBreachAlerts((prev) => prev.filter((_, i) => i !== idx))}
            />
          ))}
        </div>
      )}

      {/* Zone Temperature Cards */}
      {loading ? (
        <div className="text-center py-8 text-gray-500">Loading temperature data...</div>
      ) : readings.length === 0 ? (
        <div className="text-center py-8 text-gray-500">No temperature zones configured.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {readings.map((reading) => (
            <div
              key={reading.zone_id}
              className={`rounded-lg border p-4 ${getTemperatureColor(reading.temperature_celsius, reading.is_breach)}`}
            >
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium truncate">{reading.zone_name}</h3>
                {reading.is_breach && (
                  <span className="flex-shrink-0 inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-800 animate-pulse">
                    BREACH
                  </span>
                )}
              </div>
              <p className="text-3xl font-bold">
                {reading.temperature_celsius.toFixed(1)}°C
              </p>
              <div className="mt-2 flex items-center justify-between text-xs opacity-75">
                <span className="capitalize">{reading.zone_type?.replace(/_/g, ' ')}</span>
                <span>{new Date(reading.recorded_at).toLocaleTimeString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Safe threshold indicator */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <h3 className="text-sm font-medium text-gray-700 mb-2">Temperature Thresholds</h3>
        <div className="flex items-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-green-500" />
            <span className="text-gray-600">Safe (≤ -4.0°C)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-red-500" />
            <span className="text-gray-600">Breach (&gt; -4.0°C)</span>
          </div>
        </div>
      </div>
    </div>
  );
}
