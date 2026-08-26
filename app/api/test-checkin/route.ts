import { NextResponse } from 'next/server';
import { checkIn } from '@/app/actions/switch';

export async function GET() {
  try {
    const result = await checkIn('15db6a03-02a7-4f43-a1af-1710edaca632');
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}