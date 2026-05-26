export type LotStatus = 'pending_qc' | 'passed' | 'rejected' | 'ready_to_store';

export interface StatusBadgeProps {
  status: LotStatus;
  className?: string;
}

const STATUS_CONFIG: Record<
  LotStatus,
  { label: string; bgColor: string; textColor: string; dotColor: string }
> = {
  pending_qc: {
    label: 'Pending QC',
    bgColor: 'bg-yellow-50',
    textColor: 'text-yellow-800',
    dotColor: 'bg-yellow-500',
  },
  passed: {
    label: 'Passed',
    bgColor: 'bg-green-50',
    textColor: 'text-green-800',
    dotColor: 'bg-green-500',
  },
  rejected: {
    label: 'Rejected',
    bgColor: 'bg-red-50',
    textColor: 'text-red-800',
    dotColor: 'bg-red-500',
  },
  ready_to_store: {
    label: 'Ready to Store',
    bgColor: 'bg-blue-50',
    textColor: 'text-blue-800',
    dotColor: 'bg-blue-500',
  },
};

export function StatusBadge({ status, className = '' }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status];

  if (!config) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium bg-gray-100 text-gray-800 ${className}`}
        role="status"
        aria-label={`Status: ${status}`}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-gray-500" aria-hidden="true" />
        {status}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${config.bgColor} ${config.textColor} ${className}`}
      role="status"
      aria-label={`Status: ${config.label}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${config.dotColor}`}
        aria-hidden="true"
      />
      {config.label}
    </span>
  );
}

export default StatusBadge;
