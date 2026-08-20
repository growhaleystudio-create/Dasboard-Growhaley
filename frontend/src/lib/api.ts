const API_URL = typeof window !== 'undefined' ? '' : (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000');
export const AUTH_UNAUTHORIZED_EVENT = 'auth:unauthorized';

interface ErrorPayload {
  error?: string;
  message?: string;
  messages?: string[];
  code?: string;
  errorCode?: string;
  details?: unknown;
}

export class AppError extends Error {
  public code: string;
  public errorCode: string;
  public status: number;
  public details?: unknown;
  public rawMessage: string;
  public category?: string;

  constructor(message: string, code: string, status: number, details?: unknown, category?: string) {
    super(`[${code} / HTTP ${status}] ${message}`);
    this.name = 'AppError';
    this.rawMessage = message;
    this.code = code;
    this.errorCode = code;
    this.status = status;
    this.details = details;
    if (category !== undefined) this.category = category;
  }
}

export async function fetchApi<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_URL}${endpoint}`;
  
  const headers = new Headers(options.headers);
  // Only set the JSON content-type when there is a body to send. An empty body
  // with Content-Type: application/json makes Fastify reject the request with
  // FST_ERR_CTP_EMPTY_JSON_BODY, which breaks bodyless POSTs (e.g. survey
  // publish/unpublish/close). FormData sets its own multipart boundary.
  const hasBody = options.body !== undefined && options.body !== null;
  if (hasBody && !headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  // Include credentials (cookies) to send the session token automatically
  options.credentials = 'include';

  // Attach session token from localStorage if available, or fallback to permanent master session
  if (typeof window !== 'undefined') {
    const sessionId = localStorage.getItem('sessionId') || 'master-admin-session-growhaley';
    if (!headers.has('x-session-id')) {
      headers.set('x-session-id', sessionId);
      headers.set('Authorization', `Bearer ${sessionId}`);
    }
  }

  options.headers = headers;

  const response = await fetch(url, options);

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    if (!response.ok) {
      throw new AppError('Response body is not valid JSON.', `API_RESPONSE_PARSE_FAILED_${response.status}`, response.status);
    }
    return null as T;
  }

  if (!response.ok) {
    const payload = isErrorPayload(data) ? data : {};
    const category = payload.code;
    const code = payload.errorCode ?? payload.code ?? `API_HTTP_${response.status}`;
    const message = payload.message ?? payload.messages?.join(', ') ?? payload.error ?? 'Unknown error';
    throw new AppError(
      message,
      code,
      response.status,
      payload.details,
      category
    );
  }

  return data as T;
}

function isErrorPayload(value: unknown): value is ErrorPayload {
  return typeof value === 'object' && value !== null;
}
