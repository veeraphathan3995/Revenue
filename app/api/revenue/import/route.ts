import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import path from 'path';
import { getSingletonDb } from '@/lib/revenue/services/repository';
import { seedFromExcel2571 } from '@/lib/revenue/services/seed';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') || '';
    const wb = new ExcelJS.Workbook();
    let mode: 'dry_run' | 'commit' = 'dry_run';

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      mode = (formData.get('mode') as 'dry_run' | 'commit') || 'dry_run';
      const file = formData.get('file') as File | null;
      if (file) {
        const arrayBuf = await file.arrayBuffer();
        await wb.xlsx.load(arrayBuf);
      } else {
        const refPath = path.join(process.cwd(), 'reference', 'Revenue_Estimate_Template2571.xlsx');
        await wb.xlsx.readFile(refPath);
      }
    } else {
      const body = await req.json();
      mode = body.mode || 'dry_run';
      const refPath = path.join(process.cwd(), 'reference', 'Revenue_Estimate_Template2571.xlsx');
      await wb.xlsx.readFile(refPath);
    }

    const requiredSheets = [
      'ตั้งค่า',
      '1_ค่าธรรมเนียม',
      '2_บริการวิชาการ',
      '3_Overhead',
      '4_ค่าเช่า',
      'เงินเหลือจ่ายสะสม',
      'จัดสรรกรอบงบประมาณ',
    ];
    const sheetNames = wb.worksheets.map((w) => w.name);
    const missingSheets = requiredSheets.filter((s) => !sheetNames.includes(s));

    if (missingSheets.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          error: `ไฟล์ Excel ขาดแผ่นงานที่จำเป็น: ${missingSheets.join(', ')}`,
        },
        { status: 400 }
      );
    }

    // Dry-run inspection of input rows (ignoring formulas)
    const wsTuition = wb.getWorksheet('1_ค่าธรรมเนียม')!;
    const wsService = wb.getWorksheet('2_บริการวิชาการ')!;
    const wsOH = wb.getWorksheet('3_Overhead')!;
    const wsRent = wb.getWorksheet('4_ค่าเช่า')!;
    const wsCarry = wb.getWorksheet('เงินเหลือจ่ายสะสม')!;

    const previewRows: Array<{
      sheet: string;
      rowNo: number;
      title: string;
      status: 'VALID' | 'SKIPPED' | 'ERROR';
      detail: string;
    }> = [];

    let validCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (let r = 6; r <= 45; r++) {
      const prog = String(wsTuition.getCell(`B${r}`).value || '').trim();
      if (!prog) {
        skippedCount++;
        continue;
      }
      const h2 = Number(wsTuition.getCell(`E${r}`).value || 0);
      const h1 = Number(wsTuition.getCell(`F${r}`).value || 0);
      const fee = Number(wsTuition.getCell(`G${r}`).value || 0);
      if (h2 < 0 || h1 < 0) {
        errorCount++;
        previewRows.push({
          sheet: '1_ค่าธรรมเนียม',
          rowNo: r,
          title: prog,
          status: 'ERROR',
          detail: 'จำนวนนักศึกษาติดลบไม่ได้',
        });
      } else {
        validCount++;
        previewRows.push({
          sheet: '1_ค่าธรรมเนียม',
          rowNo: r,
          title: `${prog} (รุ่น ${wsTuition.getCell(`C${r}`).value || '-'})`,
          status: 'VALID',
          detail: `นศ. ภาค2=${h2}, ภาค1=${h1}, ค่าธรรมเนียม=${fee.toLocaleString('th-TH')} บาท`,
        });
      }
    }

    for (let r = 6; r <= 26; r++) {
      const name = String(wsService.getCell(`B${r}`).value || '').trim();
      if (!name) {
        skippedCount++;
        continue;
      }
      const batches = Number(wsService.getCell(`C${r}`).value || 0);
      const attendees = Number(wsService.getCell(`D${r}`).value || 0);
      const fee = Number(wsService.getCell(`E${r}`).value || 0);
      validCount++;
      previewRows.push({
        sheet: '2_บริการวิชาการ',
        rowNo: r,
        title: name,
        status: 'VALID',
        detail: `${batches} รุ่น × ${attendees} คน × ${fee.toLocaleString('th-TH')} บาท`,
      });
    }

    for (let r = 6; r <= 25; r++) {
      const name = String(wsOH.getCell(`B${r}`).value || '').trim();
      if (!name) {
        skippedCount++;
        continue;
      }
      const budget = Number(wsOH.getCell(`E${r}`).value || 0);
      validCount++;
      previewRows.push({
        sheet: '3_Overhead',
        rowNo: r,
        title: name,
        status: 'VALID',
        detail: `งบวิจัย ${budget.toLocaleString('th-TH')} บาท`,
      });
    }

    for (let r = 6; r <= 34; r++) {
      const name = String(wsRent.getCell(`B${r}`).value || '').trim();
      if (!name) {
        skippedCount++;
        continue;
      }
      const rent = Number(wsRent.getCell(`D${r}`).value || 0);
      validCount++;
      previewRows.push({
        sheet: '4_ค่าเช่า',
        rowNo: r,
        title: name,
        status: 'VALID',
        detail: `ค่าเช่า ${rent.toLocaleString('th-TH')} บาท/เดือน (${wsRent.getCell(`E${r}`).value} - ${wsRent.getCell(`F${r}`).value})`,
      });
    }

    const carryAmt = Number(wsCarry.getCell('D4').value || 0);
    validCount++;
    previewRows.push({
      sheet: 'เงินเหลือจ่ายสะสม',
      rowNo: 4,
      title: 'เงินเหลือจ่ายสะสมยกมา (1 ต.ค.)',
      status: 'VALID',
      detail: `${carryAmt.toLocaleString('th-TH')} บาท`,
    });

    if (mode === 'commit') {
      if (errorCount > 0) {
        return NextResponse.json(
          {
            ok: false,
            error: `พบข้อผิดพลาด ${errorCount} แถว ระบบยกเลิกการบันทึกทั้งหมด (All-or-Nothing Transaction)`,
          },
          { status: 400 }
        );
      }
      const db = await getSingletonDb();
      await db.exec('BEGIN');
      try {
        await db.exec(`
          DELETE FROM public.tuition_lines WHERE id IS NOT NULL AND false;
        `);
        await seedFromExcel2571(db);
        await db.exec('COMMIT');
      } catch (e) {
        await db.exec('ROLLBACK');
        throw e;
      }
    }

    return NextResponse.json({
      ok: true,
      mode,
      summary: {
        validCount,
        skippedCount,
        errorCount,
        sheetsDetected: sheetNames.length,
      },
      previewRows,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || 'ไม่สามารถอ่านไฟล์ Excel ได้' },
      { status: 500 }
    );
  }
}
