import type { LoaderFunctionArgs } from 'react-router';
import { baseMedusaConfig } from '@libs/util/server/client.server';
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const params = new URLSearchParams({ experience_id: url.searchParams.get('experience_id') || '' });
  if (url.searchParams.get('month')) params.set('month', url.searchParams.get('month')!);
  try {
    const response = await fetch(`${baseMedusaConfig.baseUrl}/store/availability/calendar?${params}`, {
      headers: { 'x-publishable-api-key': baseMedusaConfig.publishableKey || '' },
      signal: AbortSignal.timeout(20000),
    });
    return Response.json(await response.json(), { status: response.status, headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json(
      { message: 'The calendar could not be checked. Please retry.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
