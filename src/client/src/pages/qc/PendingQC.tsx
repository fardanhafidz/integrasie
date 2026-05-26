import { useState, useEffect, useCallback } from 'react';
import { FormField, AlertBanner } from '../../components/common';
import { getAccessToken } from '../../services/auth';

/**
 * PendingQC Page
 *
 * Displays a chronological list of lots pending QC on the left panel.
 * When a lot is selected, shows a QC result form on the right panel
 * with dynamic quality parameters, Pass/Reject decision, and conditional
 * rejection reason field.
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.7
 */

interface PendingLot {
  id: string;
  lot_number: string;
  material_group_code: string;
  is_temperature_sensitive: boolean;
  is_hazardous: boolean;
  hazard_class: string | null;
  created_at: string;
  supplier_intake?: {
    supplier_name: string;
    material_group: string;
    quantity: number;
    unit: string;
    delivery_date: string;
  };
}

interface QualityParameter {
  key: string;
  value: string;
}

type QCDecision = 'passed' | 'rejected' | '';

export default function PendingQC() {
  // Lot list state
  const [lots, setLots] = useState<PendingLot[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');

  // Selected lot
  const [selectedLot, setSelectedLot] = useState<PendingLot | null>(null);

  // QC form state
  const [parameters, setParameters] = useState<QualityParameter[]>([
    { key: '', value: '' },
  ]);
  const [decision, setDecision] = useState<QCDecision>('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState('');

  // Validation errors
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Fetch pending QC lots
  const fetchPendingLots = useCallback(async () => {
    setLoading(true);
    setFetchError('');

    try {
      const token = getAccessToken();
      const response = await fetch('/api/lots/pending-qc', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setLots(Array.isArray(data) ? data : data.lots || []);
      } else {
        setFetchError(`Failed to fetch pending QC lots (${response.status})`);
      }
    } catch {
      setFetchError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPendingLots();
  }, [fetchPendingLots]);

  // Reset form when selecting a new lot
  const handleSelectLot = (lot: PendingLot) => {
    setSelectedLot(lot);
    setParameters([{ key: '', value: '' }]);
    setDecision('');
    setRejectionReason('');
    setSubmitError('');
    setSubmitSuccess('');
    setFormErrors({});
  };

  // Parameter management
  const addParameter = () => {
    setParameters([...parameters, { key: '', value: '' }]);
  };

  const removeParameter = (index: number) => {
    if (parameters.length <= 1) return;
    setParameters(parameters.filter((_, i) => i !== index));
  };

  const updateParameter = (index: number, field: 'key' | 'value', val: string) => {
    const updated = [...parameters];
    updated[index] = { ...updated[index], [field]: val };
    setParameters(updated);
  };

  // Validate form
  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    // Check parameters - at least one complete key-value pair
    const validParams = parameters.filter((p) => p.key.trim() && p.value.trim());
    if (validParams.length === 0) {
      errors.parameters = 'At least one quality parameter with key and value is required.';
    }

    // Check decision
    if (!decision) {
      errors.decision = 'A QC decision (Pass or Reject) is required.';
    }

    // Check rejection reason when rejected
    if (decision === 'rejected') {
      if (!rejectionReason.trim()) {
        errors.rejectionReason = 'Rejection reason is required when decision is Rejected.';
      } else if (rejectionReason.trim().length < 10) {
        errors.rejectionReason = 'Rejection reason must be at least 10 characters.';
      } else if (rejectionReason.trim().length > 500) {
        errors.rejectionReason = 'Rejection reason must not exceed 500 characters.';
      }
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Submit QC result
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');
    setSubmitSuccess('');

    if (!validateForm() || !selectedLot) return;

    setSubmitting(true);

    // Build parameters object from key-value pairs
    const parametersObj: Record<string, string> = {};
    parameters.forEach((p) => {
      if (p.key.trim() && p.value.trim()) {
        parametersObj[p.key.trim()] = p.value.trim();
      }
    });

    const body: {
      parameters: Record<string, string>;
      decision: string;
      rejection_reason?: string;
    } = {
      parameters: parametersObj,
      decision,
    };

    if (decision === 'rejected') {
      body.rejection_reason = rejectionReason.trim();
    }

    try {
      const token = getAccessToken();
      const response = await fetch(`/api/qc/${selectedLot.id}/result`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        setSubmitSuccess(
          `QC result submitted successfully. Lot ${selectedLot.lot_number} marked as "${decision}".`
        );
        // Remove the lot from the pending list
        setLots((prev) => prev.filter((l) => l.id !== selectedLot.id));
        setSelectedLot(null);
        // Reset form
        setParameters([{ key: '', value: '' }]);
        setDecision('');
        setRejectionReason('');
        setFormErrors({});
      } else {
        const errData = await response.json().catch(() => null);
        setSubmitError(
          errData?.message || errData?.error || `Submission failed (${response.status})`
        );
      }
    } catch {
      setSubmitError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-gray-900">Pending QC Queue</h2>

      {/* Success/Error banners */}
      {submitSuccess && (
        <AlertBanner
          type="info"
          message={submitSuccess}
          onDismiss={() => setSubmitSuccess('')}
        />
      )}
      {submitError && (
        <AlertBanner
          type="error"
          message={submitError}
          onDismiss={() => setSubmitError('')}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left panel - Lot list */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-sm font-medium text-gray-700">
                Pending Lots ({lots.length})
              </h3>
              <button
                onClick={fetchPendingLots}
                className="text-sm text-blue-600 hover:text-blue-800 focus:outline-none focus:underline"
                aria-label="Refresh pending lots"
              >
                Refresh
              </button>
            </div>

            {fetchError && (
              <div className="px-4 py-3">
                <AlertBanner type="error" message={fetchError} />
              </div>
            )}

            {loading ? (
              <div className="px-4 py-8 text-center text-sm text-gray-500">
                Loading pending lots...
              </div>
            ) : lots.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-gray-500">
                No lots pending QC inspection.
              </div>
            ) : (
              <ul className="divide-y divide-gray-100 max-h-[600px] overflow-y-auto">
                {lots.map((lot) => (
                  <li key={lot.id}>
                    <button
                      onClick={() => handleSelectLot(lot)}
                      className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors focus:outline-none focus:bg-blue-50 ${
                        selectedLot?.id === lot.id
                          ? 'bg-blue-50 border-l-4 border-blue-500'
                          : ''
                      }`}
                      aria-current={selectedLot?.id === lot.id ? 'true' : undefined}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-900">
                          {lot.lot_number}
                        </span>
                        <span className="text-xs text-gray-500">
                          {lot.material_group_code}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
                        {lot.supplier_intake && (
                          <span>{lot.supplier_intake.supplier_name}</span>
                        )}
                        {lot.is_temperature_sensitive && (
                          <span className="text-blue-600">❄️</span>
                        )}
                        {lot.is_hazardous && (
                          <span className="text-orange-600">⚠️</span>
                        )}
                      </div>
                      {lot.supplier_intake?.delivery_date && (
                        <div className="mt-0.5 text-xs text-gray-400">
                          Delivered:{' '}
                          {new Date(lot.supplier_intake.delivery_date).toLocaleDateString()}
                        </div>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Right panel - QC Form */}
        <div className="lg:col-span-2">
          {!selectedLot ? (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
              <p className="text-gray-500">
                Select a lot from the list to begin QC inspection.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              {/* Lot details header */}
              <div className="mb-6 pb-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">
                  QC Inspection: {selectedLot.lot_number}
                </h3>
                {selectedLot.supplier_intake && (
                  <div className="mt-2 grid grid-cols-2 gap-2 text-sm text-gray-600">
                    <div>
                      <span className="font-medium">Supplier:</span>{' '}
                      {selectedLot.supplier_intake.supplier_name}
                    </div>
                    <div>
                      <span className="font-medium">Material:</span>{' '}
                      {selectedLot.supplier_intake.material_group}
                    </div>
                    <div>
                      <span className="font-medium">Quantity:</span>{' '}
                      {selectedLot.supplier_intake.quantity} {selectedLot.supplier_intake.unit}
                    </div>
                    <div>
                      <span className="font-medium">Delivery:</span>{' '}
                      {new Date(selectedLot.supplier_intake.delivery_date).toLocaleDateString()}
                    </div>
                  </div>
                )}
              </div>

              {/* QC Form */}
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Quality Parameters */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-700">
                      Quality Parameters <span className="text-red-500">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={addParameter}
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 bg-blue-50 rounded hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Add Parameter
                    </button>
                  </div>

                  <div className="space-y-2">
                    {parameters.map((param, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <input
                          type="text"
                          placeholder="Parameter name"
                          value={param.key}
                          onChange={(e) => updateParameter(index, 'key', e.target.value)}
                          className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          aria-label={`Parameter ${index + 1} name`}
                        />
                        <input
                          type="text"
                          placeholder="Value"
                          value={param.value}
                          onChange={(e) => updateParameter(index, 'value', e.target.value)}
                          className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          aria-label={`Parameter ${index + 1} value`}
                        />
                        <button
                          type="button"
                          onClick={() => removeParameter(index)}
                          disabled={parameters.length <= 1}
                          className="p-2 text-gray-400 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-red-500 rounded"
                          aria-label={`Remove parameter ${index + 1}`}
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>

                  {formErrors.parameters && (
                    <p className="mt-1 text-xs text-red-600" role="alert">
                      {formErrors.parameters}
                    </p>
                  )}
                </div>

                {/* QC Decision */}
                <FormField
                  label="QC Decision"
                  required
                  error={formErrors.decision}
                >
                  <div className="flex items-center gap-6 mt-1">
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="qc-decision"
                        value="passed"
                        checked={decision === 'passed'}
                        onChange={() => {
                          setDecision('passed');
                          setRejectionReason('');
                          setFormErrors((prev) => {
                            const { decision: _, rejectionReason: __, ...rest } = prev;
                            return rest;
                          });
                        }}
                        className="h-4 w-4 text-green-600 border-gray-300 focus:ring-green-500"
                      />
                      <span className="text-sm font-medium text-green-700">Pass</span>
                    </label>
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="qc-decision"
                        value="rejected"
                        checked={decision === 'rejected'}
                        onChange={() => {
                          setDecision('rejected');
                          setFormErrors((prev) => {
                            const { decision: _, ...rest } = prev;
                            return rest;
                          });
                        }}
                        className="h-4 w-4 text-red-600 border-gray-300 focus:ring-red-500"
                      />
                      <span className="text-sm font-medium text-red-700">Reject</span>
                    </label>
                  </div>
                </FormField>

                {/* Rejection Reason (conditional) */}
                {decision === 'rejected' && (
                  <FormField
                    label="Rejection Reason"
                    required
                    error={formErrors.rejectionReason}
                    hint={`${rejectionReason.length}/500 characters (minimum 10)`}
                  >
                    <textarea
                      value={rejectionReason}
                      onChange={(e) => {
                        setRejectionReason(e.target.value);
                        if (formErrors.rejectionReason) {
                          setFormErrors((prev) => {
                            const { rejectionReason: _, ...rest } = prev;
                            return rest;
                          });
                        }
                      }}
                      rows={4}
                      maxLength={500}
                      placeholder="Describe the reason for rejection (10-500 characters)..."
                      className={`w-full rounded-md border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                        formErrors.rejectionReason
                          ? 'border-red-300 focus:ring-red-500 focus:border-red-500'
                          : 'border-gray-300'
                      }`}
                      aria-invalid={!!formErrors.rejectionReason}
                    />
                    <div className="mt-1 text-right text-xs text-gray-400">
                      {rejectionReason.length} / 500
                    </div>
                  </FormField>
                )}

                {/* Submit button */}
                <div className="flex justify-end pt-4 border-t border-gray-200">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {submitting ? (
                      <>
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Submitting...
                      </>
                    ) : (
                      'Submit QC Result'
                    )}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
