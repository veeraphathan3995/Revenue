import { NextRequest, NextResponse } from 'next/server';
import { getRevenueWorkspaceData, mutateRevenueData } from '@/lib/revenue/services/repository';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const versionId = searchParams.get('versionId') || undefined;
    const userId = searchParams.get('userId') || undefined;
    const compareBasis = (searchParams.get('compareBasis') as 'net' | 'gross') || 'net';
    const compareMonthSeq = searchParams.get('compareMonthSeq')
      ? Number(searchParams.get('compareMonthSeq'))
      : 12;

    const data = await getRevenueWorkspaceData({
      versionId,
      userId,
      compareBasis,
      compareMonthSeq,
    });
    return NextResponse.json({ ok: true, data });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || 'ไม่สามารถดึงข้อมูลระบบได้' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, action, payload, versionId, compareBasis, compareMonthSeq } = body;

    const result = await mutateRevenueData(userId, action, payload);
    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }

    const targetVersionId = result.data?.newVersionId || versionId;
    const workspace = await getRevenueWorkspaceData({
      versionId: targetVersionId,
      userId,
      compareBasis,
      compareMonthSeq,
    });

    return NextResponse.json({
      ok: true,
      mutationResult: result.data,
      data: workspace,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || 'เกิดข้อผิดพลาดในการประมวลผลคำสั่ง' },
      { status: 500 }
    );
  }
}
