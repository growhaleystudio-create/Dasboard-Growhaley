import { NextRequest, NextResponse } from 'next/server';
import { getActiveBackendUrl } from '@/lib/tunnelResolver';

async function handleProxy(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  try {
    const path = params.path.join('/');
    const backendBase = (await getActiveBackendUrl()).replace(/\/+$/, '');
    const targetUrl = new URL(`${backendBase}/api/${path}`);

    // Forward query parameters
    request.nextUrl.searchParams.forEach((value, key) => {
      targetUrl.searchParams.append(key, value);
    });

    const requestHeaders = new Headers(request.headers);
    try {
      requestHeaders.set('host', new URL(backendBase).host);
    } catch {
      // ignore
    }
    requestHeaders.set('ngrok-skip-browser-warning', 'true');

    const options: RequestInit = {
      method: request.method,
      headers: requestHeaders,
      redirect: 'manual',
    };

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      const body = await request.arrayBuffer();
      if (body.byteLength > 0) {
        options.body = body;
      }
    }

    const response = await fetch(targetUrl.toString(), options);

    const responseHeaders = new Headers();
    response.headers.forEach((value, key) => {
      if (key.toLowerCase() !== 'content-encoding') {
        responseHeaders.append(key, value);
      }
    });

    // Forward Set-Cookie headers properly to client
    const setCookies = response.headers.getSetCookie?.() || [];
    if (setCookies.length > 0) {
      responseHeaders.delete('set-cookie');
      setCookies.forEach((cookie) => {
        responseHeaders.append('set-cookie', cookie);
      });
    }

    const responseBody = await response.arrayBuffer();
    return new NextResponse(responseBody, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (error: any) {
    console.error('[API Proxy Error]:', error);
    return NextResponse.json(
      { error: 'Backend unreachable', message: error?.message || 'Proxy error' },
      { status: 502 }
    );
  }
}

export const GET = handleProxy;
export const POST = handleProxy;
export const PUT = handleProxy;
export const PATCH = handleProxy;
export const DELETE = handleProxy;
export const OPTIONS = handleProxy;
export const HEAD = handleProxy;
