import { useState, useEffect, useCallback } from 'react';
import { AlertBanner } from '../../components/common';
import { getAccessToken } from '../../services/auth';

/**
 * SmartSlotting Page
 *
 * For lots with "ready_to_store" status, shows 1-5 slot recommendations.
 * Operators can confirm a recommended slot or override with justification.
 *
 * Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5
 */

interface Lot {
  id: string;
  lot_number: string;
  material_group_code: string;
  is_temperature_sensitive: boolean;
  is_hazardous: boolean;
  hazard_class: string | null;
}

interface SlotRecommendation {
  id: string;
  coordinate: string;
  zone_name: string;
  zone_type: string;
  row: number;
  level: number;
  position: number;
  score?: number;
  reason?: string;
}

export default function SmartSlotting() {
  const [lots, setLots] = useState<Lot[]>([]);
  const [selectedLot, setSelectedLot] = useState<Lot | null>(null);
  const [recommendations, setRecommendations] = useState<SlotRecommendation[]>([]);
  const [loadingLots, setLoadingLots] = useState(true);
  const [loadingRecs, setLoadingRecs] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [showOverride, setShowOverride] = useState(false);
  const [overrideSlotId, setOverrideSlotId] = useState('');
  const [justification, setJustification] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const fetchReadyLots = useCallback(async () => {
    setLoadingLots(true);
    try {
      const token = getAccessToken();
      const response = await fetch('/api/lots?status=ready_to_store', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setLots(Array.isArray(data) ? data : data.lots || []);
      }
    } catch {
      // Silent fail, lots will be empty
    } finally {
      setLoadingLots(false);
    }
  }, []);

  useEffect(() => {
    fetchReadyLots();
  }, [fetchReadyLots]);

  async function fetchRecommendations(lot: Lot) {
    setSelectedLot(lot);
    setRecommendations([]);
    setLoadingRecs(true);
    setSuccessMessage('');
    setErrorMessage('');
    setShowOverride(false);

    try {
      const token = getAccessToken();
      const response = await fetch(`/api/slotting/${lot.id}/recommendations`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setRecommendations(Array.isArray(data) ? data : data.recommendations || []);
      } else {
        setErrorMessage('Failed to fetch slot recommendations.');
      }
    } catch {
      setErrorMessage('Network error fetching recommendations.');
    } finally {
      setLoadingRecs(false);
    }
  }

  async function handleAssign(slotId: string) {
    if (!selectedLot) return;
    setAssigning(true);
    setSuccessMessage('');
    setErrorMessage('');

    try {
      const token = getAccessToken();
      const response = await fetch(`/api/slotting/${selectedLot.id}/assign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ slotId }),
      });

      if (response.ok) {
        setSuccessMessage(`Lot ${selectedLot.lot_number} assigned to slot successfully.`);
        setSelectedLot(null);
        setRecommendations([]);
        fetchReadyLots();
      } else {
        const errData = await response.json().catch(() => null);
        setErrorMessage(errData?.message || 'Failed to assign slot.');
      }
    } catch {
      setErrorMessage('Network error. Please try again.');
    } finally {
      setAssigning(false);
    }
  }

  async function handleOverride() {
    if (!selectedLot || !overrideSlotId.trim() || !justification.trim()) return;
    setAssigning(true);
    setSuccessMessage('');
    setErrorMessage('');

    try {
      const token = getAccessToken();
      const response = await fetch(`/api/slotting/${selectedLot.id}/override`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          slotId: overrideSlotId.trim(),
          justification: justification.trim(),
        }),
      });

      if (response.ok) {
        setSuccessMessage(`Lot ${selectedLot.lot_number} override placement recorded.`);
        setSelectedLot(null);
        setRecommendations([]);
        setShowOverride(false);
        setOverrideSlotId('');
        setJustification('');
        fetchReadyLots();
      } else {
        const errData = await response.json().catch(() => null);
        setErrorMessage(errData?.message || 'Failed to override slot.');
      }
    } catch {
      setErrorMessage('Network error. Please try again.');
    } finally {
      setAssigning(false);
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-gray-900">Smart Slotting</h2>

      {successMessage && (
        <AlertBanner type="info" message={successMessage} onDismiss={() => setSuccessMessage('')} />
      )}
      {errorMessage && (
        <AlertBanner type="error" message={errorMessage} onDismiss={() => setErrorMessage('')} />
      )}

      {/* Lot Selection */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <h3 className="text-sm font-medium text-gray-700 mb-3">
          Lots Ready to Store ({lots.length})
        </h3>

        {loadingLots ? (
          <div className="flex items-center gap-2 text-sm text-gray-500 py-4">
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Loading lots...
          </div>
        ) : lots.length === 0 ? (
          <p className="text-sm text-gray-500 py-4">No lots are currently ready to store.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {lots.map((lot) => (
              <button
                key={lot.id}
                onClick={() => fetchRecommendations(lot)}
                className={`text-left p-3 rounded-lg border transition-colors ${
                  selectedLot?.id === lot.id
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                }`}
              >
                <p className="text-sm font-medium text-gray-900">{lot.lot_number}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {lot.material_group_code}
                  {lot.is_temperature_sensitive && ' • ❄️ Cold Chain'}
                  {lot.is_hazardous && ` • ⚠️ ${lot.hazard_class || 'Hazardous'}`}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Recommendations */}
      {selectedLot && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-gray-700">
              Recommendations for <span className="text-blue-600">{selectedLot.lot_number}</span>
            </h3>
            <button
              onClick={() => setShowOverride(!showOverride)}
              className="text-xs font-medium text-orange-600 hover:text-orange-700 underline"
            >
              {showOverride ? 'Cancel Override' : 'Override Placement'}
            </button>
          </div>

          {loadingRecs ? (
            <div className="flex items-center gap-2 text-sm text-gray-500 py-4">
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Calculating recommendations...
            </div>
          ) : recommendations.length === 0 ? (
            <p className="text-sm text-gray-500 py-4">No available slots found for this lot.</p>
          ) : (
            <div className="space-y-2">
              {recommendations.map((rec, index) => (
                <div
                  key={rec.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-gray-200 hover:bg-gray-50"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold">
                      {index + 1}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{rec.coordinate}</p>
                      <p className="text-xs text-gray-500">
                        {rec.zone_name} • Row {rec.row}, Level {rec.level}, Pos {rec.position}
                        {rec.reason && ` • ${rec.reason}`}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleAssign(rec.id)}
                    disabled={assigning}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {assigning ? '...' : 'Confirm'}
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Override Section */}
          {showOverride && (
            <div className="mt-4 pt-4 border-t border-gray-200 space-y-3">
              <h4 className="text-sm font-medium text-orange-700">Override Placement</h4>
              <div>
                <label htmlFor="override-slot" className="block text-xs font-medium text-gray-600 mb-1">
                  Slot ID or Coordinate
                </label>
                <input
                  id="override-slot"
                  type="text"
                  value={overrideSlotId}
                  onChange={(e) => setOverrideSlotId(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="Enter slot ID"
                />
              </div>
              <div>
                <label htmlFor="justification" className="block text-xs font-medium text-gray-600 mb-1">
                  Justification <span className="text-red-500">*</span>
                </label>
                <textarea
                  id="justification"
                  value={justification}
                  onChange={(e) => setJustification(e.target.value)}
                  rows={3}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="Explain why you are overriding the recommendation..."
                />
              </div>
              <button
                onClick={handleOverride}
                disabled={assigning || !overrideSlotId.trim() || !justification.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-orange-600 rounded-md hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {assigning ? 'Submitting...' : 'Submit Override'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
