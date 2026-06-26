const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const ALLOWED_PAGE_SIZES = [10, 25, 50] as const;

export interface PaginationParams {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

/**
 * Parses `page` and `pageSize` from URL search params with safe bounds.
 *
 * @param searchParams - Request query parameters.
 * @param defaults - Optional default page and page size.
 * @returns Normalized pagination values including Prisma `skip`/`take`.
 */
export function parsePaginationParams(
  searchParams: URLSearchParams,
  defaults: { page?: number; pageSize?: number } = {},
): PaginationParams {
  const rawPage = Number.parseInt(searchParams.get('page') ?? '', 10);
  const page = Number.isFinite(rawPage) && rawPage > 0
    ? rawPage
    : (defaults.page ?? DEFAULT_PAGE);

  const rawPageSize = Number.parseInt(searchParams.get('pageSize') ?? '', 10);
  let pageSize = Number.isFinite(rawPageSize) && rawPageSize > 0
    ? rawPageSize
    : (defaults.pageSize ?? DEFAULT_PAGE_SIZE);

  if (!(ALLOWED_PAGE_SIZES as readonly number[]).includes(pageSize)) {
    pageSize = defaults.pageSize ?? DEFAULT_PAGE_SIZE;
  }

  pageSize = Math.min(pageSize, MAX_PAGE_SIZE);

  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    take: pageSize,
  };
}

/**
 * Builds a consistent paginated API response envelope.
 *
 * @param data - Current page of records.
 * @param total - Total matching record count.
 * @param params - Parsed pagination params.
 * @returns Paginated result with metadata.
 */
export function paginatedResponse<T>(
  data: T[],
  total: number,
  params: PaginationParams,
): PaginatedResult<T> {
  const totalPages = total === 0 ? 0 : Math.ceil(total / params.pageSize);

  return {
    data,
    pagination: {
      page: params.page,
      pageSize: params.pageSize,
      total,
      totalPages,
      hasNextPage: params.page < totalPages,
      hasPreviousPage: params.page > 1 && totalPages > 0,
    },
  };
}
