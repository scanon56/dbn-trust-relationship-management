// src/utils/errors.ts
/**
 * Base error class for Trust Management service
 */
export class TrustManagementError extends Error {
  public readonly code: string;
  public readonly details?: Record<string, unknown>;
  public readonly statusCode: number;

  constructor(
    message: string,
    code: string,
    details?: Record<string, unknown>,
    statusCode: number = 500
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.details = details;
    this.statusCode = statusCode;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Connection-related errors
 */
export class ConnectionError extends TrustManagementError {
  constructor(message: string, code: string, details?: Record<string, unknown>) {
    super(message, code, details, 400);
    this.name = 'ConnectionError';
  }
}

/**
 * Message-related errors
 */
export class MessageError extends TrustManagementError {
  constructor(message: string, code: string, details?: Record<string, unknown>) {
    super(message, code, details, 400);
    this.name = 'MessageError';
  }
}

/**
 * Protocol-related errors
 */
export class ProtocolError extends TrustManagementError {
  constructor(message: string, code: string, details?: Record<string, unknown>) {
    super(message, code, details, 400);
    this.name = 'ProtocolError';
  }
}

/**
 * Phase 4 API integration errors
 */
export class Phase4Error extends TrustManagementError {
  constructor(message: string, code: string, details?: Record<string, unknown>) {
    super(message, code, details, 502); // Bad Gateway - external service error
    this.name = 'Phase4Error';
  }
}

/**
 * Database-related errors
 */
export class DatabaseError extends TrustManagementError {
  constructor(message: string, code: string, details?: Record<string, unknown>) {
    super(message, code, details, 500);
    this.name = 'DatabaseError';
  }
}

/**
 * Validation errors
 */
export class ValidationError extends TrustManagementError {
  constructor(message: string, code: string, details?: Record<string, unknown>) {
    super(message, code, details, 400);
    this.name = 'ValidationError';
  }
}

/**
 * Not found errors
 */
export class NotFoundError extends TrustManagementError {
  constructor(message: string, code: string, details?: Record<string, unknown>) {
    super(message, code, details, 404);
    this.name = 'NotFoundError';
  }
}

/**
 * Unauthorized errors
 */
export class UnauthorizedError extends TrustManagementError {
  constructor(message: string, code: string, details?: Record<string, unknown>) {
    super(message, code, details, 401);
    this.name = 'UnauthorizedError';
  }
}

/**
 * Forbidden errors
 */
export class ForbiddenError extends TrustManagementError {
  constructor(message: string, code: string, details?: Record<string, unknown>) {
    super(message, code, details, 403);
    this.name = 'ForbiddenError';
  }
}

/**
 * Conflict errors (e.g., duplicate resources)
 */
export class ConflictError extends TrustManagementError {
  constructor(message: string, code: string, details?: Record<string, unknown>) {
    super(message, code, details, 409);
    this.name = 'ConflictError';
  }
}