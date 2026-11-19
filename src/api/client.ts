/**
 * Unified API Client for Datify AI Agent.
 * Handles request execution, error parsing, and offline network error catching.
 */
import type { ErrorResponse } from '../types/contract';
import { vi } from '../i18n/vi';

export class ApiError extends Error {
  public code: string;
  public messageVi: string;
  public details: Record<string, unknown>;
  public status: number;

  constructor(code: string, messageVi: string, details: Record<string, unknown> = {}, status: number = 400) {
    super(messageVi);
    this.name = 'ApiError';
    this.code = code;
    this.messageVi = messageVi;
    this.details = details;
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(options.headers || {}),
      },
    });
  } catch (_networkErr) {
    throw new ApiError(
      'NETWORK_ERROR',
      vi.errors.networkFailed,
      {},
      0
    );
  }

  if (!response.ok) {
    let errorData: ErrorResponse;
    try {
      errorData = await response.json();
    } catch (_parseErr) {
      errorData = {
        code: 'INTERNAL',
        message_vi: vi.errors.internal,
        details: { status: response.status, statusText: response.statusText },
      };
    }
    throw new ApiError(
      errorData.code || 'UNKNOWN_ERROR',
      errorData.message_vi || vi.errors.internal,
      errorData.details || {},
      response.status
    );
  }

  return response.json() as Promise<T>;
}

export async function apiGet<T>(path: string): Promise<T> {
  return request<T>(path, { method: 'GET' });
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

export async function apiDelete<T>(path: string): Promise<T> {
  return request<T>(path, { method: 'DELETE' });
}

