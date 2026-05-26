import { useState, FormEvent } from 'react';
import { FormField, AlertBanner } from '../../components/common';
import { getAccessToken } from '../../services/auth';

/**
 * SupplierIntake Page
 *
 * Form for warehouse operators to record incoming supplier deliveries.
 * On submit, creates an intake record and auto-generates a lot number.
 *
 * Fields: supplier_name, material_group, material_group_code, quantity,
 *         unit, delivery_date, truck_reference
 *
 * Validates: Requirements 2.1, 2.2, 2.4
 */

interface IntakeFormData {
  supplier_name: string;
  material_group: string;
  material_group_code: string;
  quantity: string;
  unit: string;
  delivery_date: string;
  truck_reference: string;
}

interface FormErrors {
  [key: string]: string;
}

const MATERIAL_GROUPS = [
  { label: 'Raw Chemical', code: 'RC' },
  { label: 'Solvent', code: 'SV' },
  { label: 'Polymer Resin', code: 'PR' },
  { label: 'Pigment', code: 'PG' },
  { label: 'Additive', code: 'AD' },
  { label: 'Packaging Material', code: 'PM' },
];

const UNITS = ['kg', 'liters', 'drums', 'bags', 'pallets', 'tons'];

const initialFormData: IntakeFormData = {
  supplier_name: '',
  material_group: '',
  material_group_code: '',
  quantity: '',
  unit: '',
  delivery_date: new Date().toISOString().split('T')[0],
  truck_reference: '',
};

export default function SupplierIntake() {
  const [formData, setFormData] = useState<IntakeFormData>(initialFormData);
  const [errors, setErrors] = useState<FormErrors>({});
  const [duplicateWarning, setDuplicateWarning] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  function handleChange(field: keyof IntakeFormData, value: string) {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Clear field error on change
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
    // Clear duplicate warning when truck_reference changes
    if (field === 'truck_reference') {
      setDuplicateWarning('');
    }
  }

  function handleMaterialGroupChange(value: string) {
    const group = MATERIAL_GROUPS.find((g) => g.label === value);
    setFormData((prev) => ({
      ...prev,
      material_group: value,
      material_group_code: group?.code || '',
    }));
    if (errors.material_group) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next.material_group;
        return next;
      });
    }
  }

  function validate(): boolean {
    const newErrors: FormErrors = {};

    if (!formData.supplier_name.trim()) {
      newErrors.supplier_name = 'Supplier name is required';
    }
    if (!formData.material_group) {
      newErrors.material_group = 'Material group is required';
    }
    if (!formData.material_group_code) {
      newErrors.material_group_code = 'Material group code is required';
    }
    if (!formData.quantity || parseFloat(formData.quantity) <= 0) {
      newErrors.quantity = 'Quantity must be greater than 0';
    }
    if (!formData.unit) {
      newErrors.unit = 'Unit is required';
    }
    if (!formData.delivery_date) {
      newErrors.delivery_date = 'Delivery date is required';
    }
    if (!formData.truck_reference.trim()) {
      newErrors.truck_reference = 'Truck reference is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function checkDuplicate(): Promise<boolean> {
    try {
      const token = getAccessToken();
      const res = await fetch(
        `/api/intakes/check-duplicate?truck_reference=${encodeURIComponent(formData.truck_reference)}&date=${formData.delivery_date}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      if (res.ok) {
        const data = await res.json();
        if (data.isDuplicate) {
          setDuplicateWarning(
            `Warning: Truck reference "${formData.truck_reference}" was already used today. Are you sure you want to proceed?`
          );
          return true;
        }
      }
    } catch {
      // If check fails, allow submission
    }
    return false;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSuccessMessage('');
    setErrorMessage('');

    if (!validate()) return;

    // Check for duplicate truck reference
    if (!duplicateWarning) {
      const isDuplicate = await checkDuplicate();
      if (isDuplicate) return; // Show warning, user must submit again to confirm
    }

    setSubmitting(true);

    try {
      const token = getAccessToken();
      const response = await fetch('/api/intakes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          supplier_name: formData.supplier_name.trim(),
          material_group: formData.material_group,
          material_group_code: formData.material_group_code,
          quantity: parseFloat(formData.quantity),
          unit: formData.unit,
          delivery_date: formData.delivery_date,
          truck_reference: formData.truck_reference.trim(),
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const lotNumber = data.lot?.lot_number || data.lotNumber || 'N/A';
        setSuccessMessage(`Intake recorded successfully. Generated Lot Number: ${lotNumber}`);
        setFormData(initialFormData);
        setDuplicateWarning('');
        setErrors({});
      } else {
        const errData = await response.json().catch(() => null);
        setErrorMessage(errData?.message || `Failed to create intake (${response.status})`);
      }
    } catch (err) {
      setErrorMessage('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass = (field: string) =>
    `w-full rounded-md border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
      errors[field] ? 'border-red-300 focus:ring-red-500' : 'border-gray-300'
    }`;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-6">Supplier Intake</h2>

        {successMessage && (
          <AlertBanner
            type="info"
            message={successMessage}
            onDismiss={() => setSuccessMessage('')}
            className="mb-4"
          />
        )}

        {errorMessage && (
          <AlertBanner
            type="error"
            message={errorMessage}
            onDismiss={() => setErrorMessage('')}
            className="mb-4"
          />
        )}

        {duplicateWarning && (
          <AlertBanner
            type="warning"
            message={duplicateWarning}
            onDismiss={() => setDuplicateWarning('')}
            className="mb-4"
          />
        )}

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <FormField label="Supplier Name" required error={errors.supplier_name} htmlFor="supplier_name">
            <input
              id="supplier_name"
              type="text"
              value={formData.supplier_name}
              onChange={(e) => handleChange('supplier_name', e.target.value)}
              className={inputClass('supplier_name')}
              placeholder="Enter supplier name"
              aria-invalid={!!errors.supplier_name}
            />
          </FormField>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Material Group" required error={errors.material_group} htmlFor="material_group">
              <select
                id="material_group"
                value={formData.material_group}
                onChange={(e) => handleMaterialGroupChange(e.target.value)}
                className={inputClass('material_group')}
                aria-invalid={!!errors.material_group}
              >
                <option value="">Select material group</option>
                {MATERIAL_GROUPS.map((g) => (
                  <option key={g.code} value={g.label}>
                    {g.label}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField label="Material Group Code" required error={errors.material_group_code} htmlFor="material_group_code">
              <input
                id="material_group_code"
                type="text"
                value={formData.material_group_code}
                onChange={(e) => handleChange('material_group_code', e.target.value.toUpperCase())}
                className={inputClass('material_group_code')}
                placeholder="e.g. RC"
                maxLength={5}
                aria-invalid={!!errors.material_group_code}
              />
            </FormField>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Quantity" required error={errors.quantity} htmlFor="quantity">
              <input
                id="quantity"
                type="number"
                min="0.01"
                step="0.01"
                value={formData.quantity}
                onChange={(e) => handleChange('quantity', e.target.value)}
                className={inputClass('quantity')}
                placeholder="0.00"
                aria-invalid={!!errors.quantity}
              />
            </FormField>

            <FormField label="Unit" required error={errors.unit} htmlFor="unit">
              <select
                id="unit"
                value={formData.unit}
                onChange={(e) => handleChange('unit', e.target.value)}
                className={inputClass('unit')}
                aria-invalid={!!errors.unit}
              >
                <option value="">Select unit</option>
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </FormField>
          </div>

          <FormField label="Delivery Date" required error={errors.delivery_date} htmlFor="delivery_date">
            <input
              id="delivery_date"
              type="date"
              value={formData.delivery_date}
              onChange={(e) => handleChange('delivery_date', e.target.value)}
              className={inputClass('delivery_date')}
              aria-invalid={!!errors.delivery_date}
            />
          </FormField>

          <FormField label="Truck Reference" required error={errors.truck_reference} htmlFor="truck_reference">
            <input
              id="truck_reference"
              type="text"
              value={formData.truck_reference}
              onChange={(e) => handleChange('truck_reference', e.target.value)}
              className={inputClass('truck_reference')}
              placeholder="e.g. TRK-2024-001"
              aria-invalid={!!errors.truck_reference}
            />
          </FormField>

          <div className="pt-4">
            <button
              type="submit"
              disabled={submitting}
              className="w-full sm:w-auto px-6 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? 'Submitting...' : duplicateWarning ? 'Confirm & Submit' : 'Submit Intake'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
