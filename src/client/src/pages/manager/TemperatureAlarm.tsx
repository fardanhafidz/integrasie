import { useState, useEffect } from 'react';
import { getSocket } from '../../services/socket';

/**
 * TemperatureAlarm Page (Module 16.5)
 *
 * Red flashing banner displayed when there is an active temperature breach.
 * Listens to Socket.IO 'temperature:breach' and 'temperature:breach_resolved' events.
 *
 * Validates: Requirements 5.4, 5.5
 */

interface ActiveBreach {
  zone_name: string;
  temperature: number;
  timestamp: string;
}

export default function TemperatureAlarm() {
  const [activeBreaches, setActiveBreaches] = useState<ActiveBreach[]>([]);
  const [acknowledged, setAcknowledged] = useState<Set<string>>(new Set());

  useEffect(() => {
    const socket = getSocket();

    socket.on('temperature:breach', (data: { zone: { name: string }; reading: { temperature_celsius: number; recorded_at: string } }) => {
      const breach: ActiveBreach = {
        zone_name: data.zone?.name || 'Unknown Zone',
        temperature: data.reading?.temperature_celsius || 0,
        timestamp: data.reading?.recorded_at || new Date().toISOString(),
      };

      setActiveBreaches((prev) => {
        // Replace existing breach for same zone or add new
        const filtered = prev.filter((b) => b.zone_name !== breach.zone_name);
        return [breach, ...filtered];
      });
    });

    socket.on('temperature:breach_resolved', (data: { zone?: { name: string }; zone_name?: string }) => {
      const zoneName = data.zone?.name || data.zone_name || '';
      if (zoneName) {
        setActiveBreaches((prev) => prev.filter((b) => b.zone_name !== zoneName));
        setAcknowledged((prev) => {
          const next = new Set(prev);
          next.delete(zoneName);
          return next;
        });
      }
    });

    return () => {
      socket.off('temperature:breach');
      socket.off('temperature:breach_resolved');
    };
  }, []);

  function handleAcknowledge(zoneName: string) {
    setAcknowledged((prev) => new Set(prev).add(zoneName));
  }

  const unacknowledgedBreaches = activeBreaches.filter(
    (b) => !acknowledged.has(b.zone_name)
  );

  if (unacknowledgedBreaches.length === 0) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-gray-900">Temperature Alarm</h2>
        <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
          <svg className="h-12 w-12 mx-auto text-green-500 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-green-800 font-medium">All Clear</p>
          <p className="text-green-600 text-sm mt-1">
            No active temperature breaches detected.
          </p>
          {activeBreaches.length > 0 && (
            <p className="text-gray-500 text-xs mt-3">
              {activeBreaches.length} breach(es) acknowledged
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-gray-900">Temperature Alarm</h2>

      {/* Flashing alarm banner */}
      <div className="animate-pulse">
        <div className="bg-red-600 rounded-lg p-4 shadow-lg border-2 border-red-700">
          <div className="flex items-center gap-3">
            <span className="text-3xl" role="img" aria-label="alarm">🚨</span>
            <div className="flex-1">
              <p className="text-white font-bold text-lg">
                TEMPERATURE BREACH ACTIVE
              </p>
              <p className="text-red-100 text-sm">
                {unacknowledgedBreaches.length} zone(s) exceeding safe threshold (&gt; -4.0°C)
              </p>
            </div>
            <span className="text-3xl" role="img" aria-label="alarm">🚨</span>
          </div>
        </div>
      </div>

      {/* Individual breach cards */}
      <div className="space-y-3">
        {unacknowledgedBreaches.map((breach) => (
          <div
            key={breach.zone_name}
            className="bg-red-50 border-2 border-red-300 rounded-lg p-4 animate-[pulse_2s_ease-in-out_infinite]"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-red-900 font-semibold">{breach.zone_name}</h3>
                <p className="text-red-700 text-2xl font-bold mt-1">
                  {breach.temperature.toFixed(1)}°C
                </p>
                <p className="text-red-600 text-xs mt-1">
                  Detected at {new Date(breach.timestamp).toLocaleTimeString()}
                </p>
              </div>
              <button
                onClick={() => handleAcknowledge(breach.zone_name)}
                className="px-4 py-2 bg-red-700 text-white text-sm font-medium rounded-md hover:bg-red-800 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
              >
                Acknowledge
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Acknowledged breaches (still active but acknowledged) */}
      {activeBreaches.length > unacknowledgedBreaches.length && (
        <div className="mt-6">
          <h3 className="text-sm font-medium text-gray-700 mb-2">Acknowledged (still active)</h3>
          <div className="space-y-2">
            {activeBreaches
              .filter((b) => acknowledged.has(b.zone_name))
              .map((breach) => (
                <div
                  key={breach.zone_name}
                  className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex items-center justify-between"
                >
                  <div>
                    <span className="text-yellow-800 font-medium text-sm">{breach.zone_name}</span>
                    <span className="ml-3 text-yellow-700 font-bold">
                      {breach.temperature.toFixed(1)}°C
                    </span>
                  </div>
                  <span className="text-xs text-yellow-600">Acknowledged</span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
