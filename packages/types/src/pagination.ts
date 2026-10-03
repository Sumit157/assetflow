export type SortDirection = 'asc' | 'desc';

export interface PaginationQuery {
  page: number;
  limit: number;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
