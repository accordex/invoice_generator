import { NextRequest } from 'next/server';

export interface PaginationParams {
  page: number;
  pageSize: number;
  skip: number;
}

export interface PaginatedMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: PaginatedMeta;
}

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;

/**
 * Parses `page` and `pageSize` query params with safe bounds.
 */
export function parsePagination(req: NextRequest): PaginationParams {
  const { searchParams } = req.nextUrl;
  const page = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1);
  const rawSize = Number.parseInt(searchParams.get('pageSize') ?? String(DEFAULT_PAGE_SIZE), 10);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, rawSize || DEFAULT_PAGE_SIZE));
  return { page, pageSize, skip: (page - 1) * pageSize };
}

/**
 * Builds a standard paginated response envelope.
 */
export function paginated<T>(data: T[], total: number, params: PaginationParams): PaginatedResult<T> {
  return {
    data,
    meta: {
      page: params.page,
      pageSize: params.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / params.pageSize)),
    },
  };
}
