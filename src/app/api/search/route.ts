import { NextResponse } from 'next/server';
import { searchPersonas } from '@/lib/searchPersonas';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  try {
    const result = await searchPersonas({
      q: searchParams.get('q') || '',
      hospital: searchParams.get('hospital') || '',
      page: parseInt(searchParams.get('page') || '1', 10),
      pageSize: parseInt(searchParams.get('pageSize') || '20', 10),
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error('Unexpected error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
