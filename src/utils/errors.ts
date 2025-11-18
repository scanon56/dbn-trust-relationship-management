// src/utils/errors.ts
export class TrustManagementError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'TrustManagementError';
  }
}

export class ConnectionError extends TrustManagementError {
  constructor(message: string, code: string, details?: Record<string, unknown>) {
    super(message, code, 400, details);
    this.name = 'ConnectionError';
  }
}

export class MessageError extends TrustManagementError {
  constructor(message: string, code: string, details?: Record<string, unknown>) {
    super(message, code, 400, details);
    this.name = 'MessageError';
  }
}

export class ProtocolError extends TrustManagementError {
  constructor(message: string, code: string, details?: Record<string, unknown>) {
    super(message, code, 400, details);
    this.name = 'ProtocolError';
  }
}