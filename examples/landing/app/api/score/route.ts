import { NextRequest, NextResponse } from 'next/server';
import { scoreUrl } from '@/lib/score';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('url');
  if (!raw) {
    return NextResponse.json({ error: 'Missing ?url=' }, { status: 400 });
  }
  try {
    const report = await scoreUrl(raw);
    return NextResponse.json(report, {
      headers: {
        'cache-control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=600',
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Score failed';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
