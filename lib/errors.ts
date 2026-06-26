import { NextResponse } from 'next/server';

/** Standard JSON error body returned by API route handlers. */
export interface ApiErrorBody {
  error: string;
  code?: string;
  details?: unknown;
  status?: string;
  message?: string;
}

/**
 * Application error with HTTP status and optional machine-readable code.
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Serializes the error to the standard API response shape. */
  toJSON(): ApiErrorBody {
    return {
      error: this.message,
      code: this.code,
      ...(this.details !== undefined ? { details: this.details } : {}),
    };
  }
}

/** Creates a 400 Bad Request error. */
export function badRequest(message: string, details?: unknown): ApiError {
  return new ApiError(400, 'BAD_REQUEST', message, details);
}

/** Creates a 401 Unauthorized error. */
export function unauthorized(message = 'Unauthorized'): ApiError {
  return new ApiError(401, 'UNAUTHORIZED', message);
}

/** Creates a 403 Forbidden error. */
export function forbidden(message = 'Forbidden', code = 'FORBIDDEN'): ApiError {
  return new ApiError(403, code, message);
}

/** Creates a 404 Not Found error. */
export function notFound(resource: string): ApiError {
  return new ApiError(404, 'NOT_FOUND', `${resource} not found`);
}

/** Creates a 409 Conflict error. */
export function conflict(message: string, details?: unknown): ApiError {
  return new ApiError(409, 'CONFLICT', message, details);
}

/** Creates a 422 Unprocessable Entity error for validation failures. */
export function validationError(message: string, details?: unknown): ApiError {
  return new ApiError(422, 'VALIDATION_ERROR', message, details);
}

/** Creates a 202 Accepted response for approval-queued actions. */
export function pendingApproval(message = 'Action queued for approval'): NextResponse<ApiErrorBody> {
  return NextResponse.json(
    { status: 'PENDING_APPROVAL', message, error: message },
    { status: 202 },
  );
}

/** Creates a 500 Internal Server Error. */
export function internalError(message = 'Internal server error'): ApiError {
  return new ApiError(500, 'INTERNAL_ERROR', message);
}

/**
 * Converts any thrown value into a consistent NextResponse JSON error.
 *
 * @param error - Caught error from a route handler.
 * @returns JSON error response with appropriate HTTP status.
 */
export function toErrorResponse(error: unknown): NextResponse<ApiErrorBody> {
  if (error instanceof ApiError) {
    return NextResponse.json(error.toJSON(), { status: error.status });
  }

  if (error instanceof Error) {
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { error: 'Internal server error', code: 'INTERNAL_ERROR' },
    { status: 500 },
  );
}

/**
 * Wraps a route handler to catch errors and return consistent API error shapes.
 *
 * @param handler - Async route handler function.
 * @returns Wrapped handler with centralized error handling.
 */
export function withErrorHandling<T extends unknown[]>(
  handler: (...args: T) => Promise<NextResponse>,
): (...args: T) => Promise<NextResponse> {
  return async (...args: T) => {
    try {
      return await handler(...args);
    } catch (error) {
      if (error instanceof ApiError) {
        console.error('[api]', error.code, error.message);
      } else {
        console.error('[api] unhandled error', error);
      }
      return toErrorResponse(error);
    }
  };
}
