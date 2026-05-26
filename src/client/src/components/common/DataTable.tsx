import React, { useCallback } from 'react';

export interface Column<T> {
  key: string;
  header: string;
  render?: (item: T) => React.ReactNode;
  sortable?: boolean;
  width?: string;
}

export interface PaginationConfig {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
}

export interface SortConfig {
  key: string;
  direction: 'asc' | 'desc';
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  pagination?: PaginationConfig;
  onPageChange?: (page: number) => void;
  sort?: SortConfig;
  onSortChange?: (sort: SortConfig) => void;
  keyExtractor?: (item: T) => string;
  emptyMessage?: string;
  loading?: boolean;
  caption?: string;
}

export function DataTable<T>({
  columns,
  data,
  pagination,
  onPageChange,
  sort,
  onSortChange,
  keyExtractor,
  emptyMessage = 'No data available',
  loading = false,
  caption,
}: DataTableProps<T>) {
  const getKey = useCallback(
    (item: T, index: number) => {
      if (keyExtractor) return keyExtractor(item);
      const record = item as Record<string, unknown>;
      if (record.id) return String(record.id);
      return String(index);
    },
    [keyExtractor]
  );

  const handleSort = (column: Column<T>) => {
    if (!column.sortable || !onSortChange) return;
    const direction =
      sort?.key === column.key && sort.direction === 'asc' ? 'desc' : 'asc';
    onSortChange({ key: column.key, direction });
  };

  const getSortIcon = (column: Column<T>) => {
    if (!column.sortable) return null;
    if (sort?.key !== column.key) {
      return (
        <span className="ml-1 text-gray-400" aria-hidden="true">
          ↕
        </span>
      );
    }
    return (
      <span className="ml-1 text-primary-600" aria-hidden="true">
        {sort.direction === 'asc' ? '↑' : '↓'}
      </span>
    );
  };

  const getCellValue = (item: T, column: Column<T>) => {
    if (column.render) return column.render(item);
    const record = item as Record<string, unknown>;
    const value = record[column.key];
    return value != null ? String(value) : '';
  };

  return (
    <div className="w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table
          className="min-w-full divide-y divide-gray-200"
          role="table"
          aria-label={caption || 'Data table'}
        >
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead className="bg-gray-50">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 ${
                    column.sortable ? 'cursor-pointer select-none hover:bg-gray-100' : ''
                  }`}
                  style={column.width ? { width: column.width } : undefined}
                  onClick={() => handleSort(column)}
                  aria-sort={
                    sort?.key === column.key
                      ? sort.direction === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : undefined
                  }
                  tabIndex={column.sortable ? 0 : undefined}
                  onKeyDown={(e) => {
                    if (column.sortable && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault();
                      handleSort(column);
                    }
                  }}
                >
                  <span className="inline-flex items-center">
                    {column.header}
                    {getSortIcon(column)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {loading ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-8 text-center text-sm text-gray-500"
                >
                  <div className="flex items-center justify-center gap-2" role="status" aria-label="Loading">
                    <svg
                      className="h-5 w-5 animate-spin text-primary-600"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                    <span>Loading...</span>
                  </div>
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-8 text-center text-sm text-gray-500"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              data.map((item, index) => (
                <tr
                  key={getKey(item, index)}
                  className="transition-colors hover:bg-gray-50"
                >
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className="whitespace-nowrap px-4 py-3 text-sm text-gray-700"
                    >
                      {getCellValue(item, column)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pagination && pagination.totalPages > 1 && (
        <nav
          className="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3"
          aria-label="Table pagination"
        >
          <div className="text-sm text-gray-600">
            Showing{' '}
            <span className="font-medium">
              {(pagination.currentPage - 1) * pagination.pageSize + 1}
            </span>{' '}
            to{' '}
            <span className="font-medium">
              {Math.min(
                pagination.currentPage * pagination.pageSize,
                pagination.totalItems
              )}
            </span>{' '}
            of <span className="font-medium">{pagination.totalItems}</span> results
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onPageChange?.(pagination.currentPage - 1)}
              disabled={pagination.currentPage <= 1}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Previous page"
            >
              Previous
            </button>
            {generatePageNumbers(pagination.currentPage, pagination.totalPages).map(
              (page, idx) =>
                page === '...' ? (
                  <span key={`ellipsis-${idx}`} className="px-2 text-gray-400">
                    ...
                  </span>
                ) : (
                  <button
                    key={page}
                    onClick={() => onPageChange?.(page as number)}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                      pagination.currentPage === page
                        ? 'bg-primary-600 text-white'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                    aria-label={`Page ${page}`}
                    aria-current={pagination.currentPage === page ? 'page' : undefined}
                  >
                    {page}
                  </button>
                )
            )}
            <button
              onClick={() => onPageChange?.(pagination.currentPage + 1)}
              disabled={pagination.currentPage >= pagination.totalPages}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Next page"
            >
              Next
            </button>
          </div>
        </nav>
      )}
    </div>
  );
}

function generatePageNumbers(
  current: number,
  total: number
): (number | '...')[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const pages: (number | '...')[] = [1];

  if (current > 3) {
    pages.push('...');
  }

  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);

  for (let i = start; i <= end; i++) {
    pages.push(i);
  }

  if (current < total - 2) {
    pages.push('...');
  }

  pages.push(total);

  return pages;
}

export default DataTable;
