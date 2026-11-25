'use client';

import React, { useState, useEffect } from 'react';
import {
  useRevenueWorkspace,
  fmtMoney,
  fmtPct,
  THAI_MONTH_NAMES,
} from './WorkspaceContext';

const TYPE_COLORS: Record<string, string> = {
  TUITION: '#5b2c83',
  ACAD_SERVICE: '#0284c7',
  RESEARCH_OH: '#059669',
  RENT: '#d97706',
  CARRYOVER: '#4f46e5',
  OTHER: '#64748b',
};

// =============================================================================
// 1. DASHBOARD VIEW (/revenue)
// =============================================================================
export function DashboardView() {
  const { data, openDrillDown } = useRevenueWorkspace();
  const [showTableMode, setShowTableMode] = useState<boolean>(false);

  if (!data) return null;

  const { tuition, service, research, rental, monthly, allocation } = data.calc;
  const gt = monthly.grandTotals;
  const revTypes = ['TUITION', 'ACAD_SERVICE', 'RESEARCH_OH', 'RENT', 'CARRYOVER'] as const;

  const drillType = (rt: string) => {
    if (rt === 'TUITION') {
      openDrillDown({
        title: '1. ค่าธรรมเนียมการศึกษา (รายแถวหลักสูตร × รุ่น)',
        subtitle: `รวมก่อนหัก ${fmtMoney(tuition.totals.grossYear)} บาท | สุทธิหลังปัด ${fmtMoney(tuition.totals.netYearRounded)} บาท`,
        columns: ['หลักสูตร', 'รหัสรุ่น', 'นศ. รวม (คน)', 'ก่อนหัก (บาท)', 'หักรวม+มช. (บาท)', 'คืนห้องสมุด 60%', 'สุทธิ (บาท)'],
        rows: tuition.lines.map((l: any) => [
          l.programName,
          l.cohortCode || '-',
          l.totalHeadcount,
          l.grossYear,
          l.deductionYear,
          l.libraryRefundYear,
          l.netYear,
        ]),
        totalLabel: 'รวมค่าธรรมเนียมการศึกษา (ก่อนปัดหลักพัน)',
        totalValue: fmtMoney(tuition.totals.netYearExact),
      });
    } else if (rt === 'ACAD_SERVICE') {
      openDrillDown({
        title: '2. โครงการบริการวิชาการ',
        columns: ['โครงการ', 'เดือนที่รับ', 'รุ่น × คน', 'ก่อนหัก (บาท)', 'หัก 10%+40% (บาท)', 'สุทธิ (บาท)'],
        rows: service.lines.map((l: any) => [
          l.name,
          THAI_MONTH_NAMES[l.monthSeq - 1],
          l.batches * l.attendeesPerBatch,
          l.gross,
          l.totalDeduction,
          l.net,
        ]),
        totalLabel: 'รวมบริการวิชาการ (ปัดลงหลักพัน)',
        totalValue: fmtMoney(service.totals.netRounded),
      });
    } else if (rt === 'RESEARCH_OH') {
      openDrillDown({
        title: '3. โครงการวิจัย (Overhead)',
        columns: ['โครงการวิจัย', 'แหล่งทุน', 'งบวิจัย (บาท)', 'ค่า Overhead (บาท)', 'สุทธิ (บาท)'],
        rows: research.lines.map((l: any) => [
          l.name,
          l.funder || '-',
          l.budget,
          l.grossOverhead,
          l.netOverhead,
        ]),
        totalLabel: 'รวม Overhead งานวิจัย',
        totalValue: fmtMoney(research.totals.netRounded),
      });
    } else if (rt === 'RENT') {
      openDrillDown({
        title: '4. ค่าเช่าพื้นที่ราชพัสดุ',
        columns: ['ผู้เช่า/รายการ', 'ช่วงเดือน', 'ค่าเช่า/เดือน', 'ก่อนหัก (บาท)', 'หัก 10%', 'สุทธิ (บาท)'],
        rows: rental.lines.map((l: any) => [
          l.name,
          `${THAI_MONTH_NAMES[l.startMonthSeq - 1]} - ${THAI_MONTH_NAMES[l.endMonthSeq - 1]} (${l.activeMonths} ด.)`,
          l.monthlyRent,
          l.grossYear,
          l.deductionYear,
          l.netYear,
        ]),
        totalLabel: 'รวมค่าเช่าราชพัสดุ (ปัดลงหลักพัน)',
        totalValue: fmtMoney(rental.totals.netRounded),
      });
    } else if (rt === 'CARRYOVER') {
      openDrillDown({
        title: '5. เงินเหลือจ่ายสะสมยกมา',
        columns: ['รายการ', 'ที่มา / หมายเหตุ', 'จำนวนเงินสุทธิ (บาท)'],
        rows: [['เงินเหลือจ่ายสะสมยกมา (1 ต.ค.)', data.carryover.sourceNote || '-', data.carryover.amount]],
        totalLabel: 'รวมเงินเหลือจ่ายสะสมยกมา',
        totalValue: fmtMoney(data.carryover.amount),
      });
    }
  };

  const maxMonthNet = Math.max(...monthly.monthlyNetTotalsRounded, 1);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>
            Dashboard สรุปประมาณการรายรับเงินรายได้ ปีงบประมาณ พ.ศ. {data.activeVersion.be_year}
          </h1>
          <div style={{ fontSize: 13, color: '#64748b' }}>
            คลิกตัวเลขใดๆ เพื่อ Drill-down ดูแถวข้อมูลต้นทาง • คำนวณด้วย Pure Calculation Engine
          </div>
        </div>
        <button
          className="btn btn-secondary"
          onClick={() => setShowTableMode((v) => !v)}
        >
          {showTableMode ? '📊 สลับดูโหมดกราฟ (Chart View)' : '📋 สลับดูตารางข้อมูลกราฟ (Table View)'}
        </button>
      </div>

      {/* 4 KPI Cards */}
      <div className="kpi-grid">
        <div className="kpi-card" style={{ borderLeftColor: '#0284c7' }}>
          <div className="kpi-label">1. ประมาณการรายรับรวม (ก่อนหัก)</div>
          <div className="kpi-value">{fmtMoney(gt.grossRounded)} บาท</div>
          <div className="kpi-sub">รวม 5 ประเภทรายรับ ต.ค.–ก.ย.</div>
        </div>

        <div className="kpi-card" style={{ borderLeftColor: '#dc2626' }}>
          <div className="kpi-label">2. รายการหักรวม & รับคืนห้องสมุด</div>
          <div className="kpi-value">{fmtMoney(gt.deductionRounded)} บาท</div>
          <div className="kpi-sub" style={{ color: '#15803d', fontWeight: 600 }}>
            + รับคืนค่าห้องสมุด 60%: {fmtMoney(gt.libraryRefund)} บาท
          </div>
        </div>

        <div className="kpi-card" style={{ borderLeftColor: '#15803d' }}>
          <div className="kpi-label">3. รายรับสุทธิที่นำไปจัดสรรงบได้</div>
          <div className="kpi-value" style={{ color: '#15803d' }}>
            {fmtMoney(gt.netRounded)} บาท
          </div>
          <div className="kpi-sub">คิดเป็น {fmtPct(gt.netRounded / gt.grossRounded, 1)} ของรายรับก่อนหัก</div>
        </div>

        <div className="kpi-card" style={{ borderLeftColor: '#5b2c83' }}>
          <div className="kpi-label">4. รายรับสุทธิเฉลี่ยต่อเดือน</div>
          <div className="kpi-value">{fmtMoney(gt.netRounded / 12, 0)} บาท/เดือน</div>
          <div className="kpi-sub">สูงสุดเดือน มี.ค. ({fmtMoney(monthly.monthlyNetTotalsRounded[5])} บาท)</div>
        </div>
      </div>

      {/* Top Row: Revenue Type Breakdown & Monthly Bar Chart */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))', gap: 16 }}>
        {/* Card A: Proportion by Revenue Type */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">สัดส่วนรายรับสุทธิแยกตามประเภท (5 ประเภท)</h2>
            <span className="badge badge-ok">รวม {fmtMoney(gt.netRounded)} บาท</span>
          </div>
          <div className="table-wrap">
            <table className="rev-table">
              <thead>
                <tr>
                  <th>ประเภทรายรับ</th>
                  <th className="num">ก่อนหัก (บาท)</th>
                  <th className="num">สุทธิ (บาท)</th>
                  <th className="num">สัดส่วน</th>
                </tr>
              </thead>
              <tbody>
                {revTypes.map((rt) => {
                  const gRow = monthly.grossByType[rt];
                  const nRow = monthly.netByType[rt];
                  const pct = gt.netRounded > 0 ? nRow.yearTotalRounded / gt.netRounded : 0;
                  return (
                    <tr key={rt}>
                      <td>
                        <span
                          style={{
                            display: 'inline-block',
                            width: 10,
                            height: 10,
                            borderRadius: 2,
                            background: TYPE_COLORS[rt],
                            marginRight: 8,
                          }}
                        />
                        <span className="drill-link" onClick={() => drillType(rt)}>
                          {nRow.label}
                        </span>
                      </td>
                      <td className="num">{fmtMoney(gRow.yearTotalRounded)}</td>
                      <td className="num">
                        <span className="drill-link" onClick={() => drillType(rt)}>
                          {fmtMoney(nRow.yearTotalRounded)}
                        </span>
                      </td>
                      <td className="num">
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                          <div
                            style={{
                              width: 60,
                              height: 8,
                              background: '#e2e8f0',
                              borderRadius: 4,
                              overflow: 'hidden',
                            }}
                          >
                            <div
                              style={{
                                width: `${Math.min(100, pct * 100)}%`,
                                height: '100%',
                                background: TYPE_COLORS[rt],
                              }}
                            />
                          </div>
                          <span>{fmtPct(pct, 1)}</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="total-row">
                  <td>รวมทั้งสิ้น</td>
                  <td className="num">{fmtMoney(gt.grossRounded)}</td>
                  <td className="num">{fmtMoney(gt.netRounded)}</td>
                  <td className="num">100.0%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Card B: Monthly Net Bar Chart & Cumulative Curve */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">กราฟรายรับสุทธิรายเดือน และยอดสะสม (ต.ค.–ก.ย.)</h2>
            <span className="badge badge-info">12 เดือนปีงบประมาณ</span>
          </div>

          {!showTableMode ? (
            <div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(12, 1fr)',
                  gap: 6,
                  height: 190,
                  alignItems: 'end',
                  padding: '16px 8px 6px',
                  borderBottom: '1px solid #cbd5e1',
                }}
              >
                {monthly.monthlyNetTotalsRounded.map((val: number, idx: number) => {
                  const hPct = Math.max(4, Math.round((val / maxMonthNet) * 145));
                  return (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'flex-end',
                      }}
                      title={`${THAI_MONTH_NAMES[idx]}: สุทธิ ${fmtMoney(val)} บาท | สะสม ${fmtMoney(monthly.cumulativeNetRounded[idx])} บาท`}
                    >
                      <div style={{ fontSize: 10, color: '#475569', marginBottom: 3, fontWeight: 600 }}>
                        {val >= 1000000 ? `${(val / 1000000).toFixed(1)}M` : `${Math.round(val / 1000)}k`}
                      </div>
                      <div
                        style={{
                          width: '76%',
                          height: hPct,
                          background: 'linear-gradient(180deg, #5b2c83 0%, #7e22ce 100%)',
                          borderRadius: '4px 4px 0 0',
                        }}
                      />
                    </div>
                  );
                })}
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(12, 1fr)',
                  gap: 6,
                  padding: '6px 8px 0',
                  textAlign: 'center',
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                {THAI_MONTH_NAMES.map((m) => (
                  <div key={m}>{m}</div>
                ))}
              </div>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="rev-table">
                <thead>
                  <tr>
                    <th>เดือน</th>
                    <th className="num">รายรับสุทธิรายเดือน (บาท)</th>
                    <th className="num">รายรับสุทธิสะสม (บาท)</th>
                  </tr>
                </thead>
                <tbody>
                  {THAI_MONTH_NAMES.map((m, idx) => (
                    <tr key={m}>
                      <td>{m}</td>
                      <td className="num">{fmtMoney(monthly.monthlyNetTotalsRounded[idx])}</td>
                      <td className="num">{fmtMoney(monthly.cumulativeNetRounded[idx])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Allocation 3 Dimensions Overview */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">สรุปการจัดสรรกรอบงบประมาณ 3 มิติ (ฐานจัดสรร {fmtMoney(allocation.totalBase)} บาท)</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
          {(['plan', 'expense_category', 'strategic'] as const).map((dimCode) => {
            const dim = allocation.dimensions[dimCode];
            if (!dim || !dim.items) return null;
            return (
              <div key={dimCode} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 12 }}>
                <div style={{ fontWeight: 700, marginBottom: 8, color: '#3b1c57' }}>
                  {dim.dimensionName}
                </div>
                <table className="rev-table">
                  <thead>
                    <tr>
                      <th>หมวดงบประมาณ</th>
                      <th className="num">จำนวนเงิน (บาท)</th>
                      <th className="num">% ถ่วงน้ำหนัก</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dim.items.map((it: any) => (
                      <tr key={it.itemId}>
                        <td>{it.itemName}</td>
                        <td className="num">{fmtMoney(it.totalAmount)}</td>
                        <td className="num">{fmtPct(it.weightedPct, 1)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="total-row">
                      <td>รวม</td>
                      <td className="num">{fmtMoney(dim.totalAllocated)}</td>
                      <td className="num">100.0%</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tuition by Program & Scholarship 20% Table */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">
            ตารางสรุปรายรับค่าธรรมเนียมการศึกษาแยกตามหลักสูตร และวงเงินทุนการศึกษา/พัฒนานักศึกษา (ตามพารามิเตอร์ SCHOLARSHIP_PCT)
          </h2>
        </div>
        <div className="table-wrap">
          <table className="rev-table">
            <thead>
              <tr>
                <th>กลุ่มรายงาน</th>
                <th>หลักสูตร / รายการ</th>
                <th>ระดับ</th>
                <th className="num">รายรับรวมก่อนหัก</th>
                <th className="num">รวมหักต่อหัว + มช. 10%</th>
                <th className="num">รับคืนห้องสมุด 60%</th>
                <th className="num">รายรับสุทธิ</th>
                <th className="num">ทุนการศึกษาและพัฒนา นศ. (20%)</th>
              </tr>
            </thead>
            <tbody>
              {tuition.byProgram.map((p: any) => (
                <tr key={p.programCode}>
                  <td>{p.reportGroup}</td>
                  <td style={{ fontWeight: 600 }}>{p.programName}</td>
                  <td>{p.level === 'master' ? 'ปริญญาโท' : 'ปริญญาตรี'}</td>
                  <td className="num">{fmtMoney(p.grossYear)}</td>
                  <td className="num">{fmtMoney(p.deductionYear)}</td>
                  <td className="num" style={{ color: '#15803d' }}>
                    {fmtMoney(p.libraryRefundYear)}
                  </td>
                  <td className="num" style={{ fontWeight: 700 }}>
                    {fmtMoney(p.netYear)}
                  </td>
                  <td className="num" style={{ color: '#5b2c83', fontWeight: 600 }}>
                    {fmtMoney(p.scholarshipAmount)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="total-row">
                <td colSpan={3}>รวมค่าธรรมเนียมการศึกษาทั้งหมด</td>
                <td className="num">{fmtMoney(tuition.totals.grossYear)}</td>
                <td className="num">{fmtMoney(tuition.totals.totalDeductionWithCmuYear)}</td>
                <td className="num">{fmtMoney(tuition.totals.libraryRefundYear)}</td>
                <td className="num">{fmtMoney(tuition.totals.netYearExact)}</td>
                <td className="num">
                  {fmtMoney(
                    tuition.byProgram.reduce((acc: number, p: any) => acc + p.scholarshipAmount, 0)
                  )}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// 2. MONTHLY SUMMARY VIEW (/revenue/summary)
// =============================================================================
export function MonthlySummaryView() {
  const { data } = useRevenueWorkspace();
  if (!data) return null;

  const { monthly } = data.calc;
  const revTypes = ['TUITION', 'ACAD_SERVICE', 'RESEARCH_OH', 'RENT', 'CARRYOVER'] as const;

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>
          สรุปประมาณการรายรับรายเดือน (12 เดือน × 5 ประเภท) — ปีงบประมาณ พ.ศ. {data.activeVersion.be_year}
        </h1>
        <div style={{ fontSize: 13, color: '#475569' }}>
          แยกแสดง 3 ส่วน: ก. รายรับก่อนหัก · ข. รายการหักค่าใช้จ่ายและบรรทัดรับคืนค่าห้องสมุด 60% · ค. รายรับสุทธิและยอดสะสมจริง
        </div>
      </div>

      {/* Section A: Gross */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">ส่วนที่ ก. ประมาณการรายรับรวมก่อนหัก (Gross Revenue)</h2>
        </div>
        <div className="table-wrap">
          <table className="rev-table">
            <thead>
              <tr>
                <th>ประเภทรายรับ</th>
                {THAI_MONTH_NAMES.map((m) => (
                  <th key={m} className="num">
                    {m}
                  </th>
                ))}
                <th className="num">รวมทั้งปี</th>
                <th>ตรวจสอบ</th>
              </tr>
            </thead>
            <tbody>
              {revTypes.map((rt) => {
                const row = monthly.grossByType[rt];
                return (
                  <tr key={rt}>
                    <td style={{ fontWeight: 600 }}>{row.label}</td>
                    {row.months.map((v: number, i: number) => (
                      <td key={i} className="num">
                        {fmtMoney(v)}
                      </td>
                    ))}
                    <td className="num" style={{ fontWeight: 700 }}>
                      {fmtMoney(row.yearTotalRounded)}
                    </td>
                    <td>
                      {row.monthlySumCheck ? (
                        <span className="badge badge-ok">✓ ตรง</span>
                      ) : (
                        <span className="badge badge-warn">⚠ ต่าง</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="total-row">
                <td>รวมรายรับก่อนหัก</td>
                {monthly.monthlyGrossTotals.map((v: number, i: number) => (
                  <td key={i} className="num">
                    {fmtMoney(v)}
                  </td>
                ))}
                <td className="num">{fmtMoney(monthly.grandTotals.grossRounded)}</td>
                <td>
                  <span className="badge badge-ok">✓ 100%</span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Section B: Deductions + Library Refund 60% */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">
            ส่วนที่ ข. รายการหักค่าใช้จ่าย และบรรทัดรับคืนค่าบำรุงห้องสมุด 60% (เพื่อให้กระทบยอด ก่อนหัก − หัก + รับคืน = สุทธิ ลงตัว)
          </h2>
        </div>
        <div className="table-wrap">
          <table className="rev-table">
            <thead>
              <tr>
                <th>ประเภทรายการหัก</th>
                {THAI_MONTH_NAMES.map((m) => (
                  <th key={m} className="num">
                    {m}
                  </th>
                ))}
                <th className="num">รวมทั้งปี</th>
                <th>ตรวจสอบ</th>
              </tr>
            </thead>
            <tbody>
              {revTypes.map((rt) => {
                const row = monthly.deductionByType[rt];
                return (
                  <tr key={rt}>
                    <td style={{ fontWeight: 600 }}>{row.label}</td>
                    {row.months.map((v: number, i: number) => (
                      <td key={i} className="num">
                        {fmtMoney(v)}
                      </td>
                    ))}
                    <td className="num" style={{ fontWeight: 700 }}>
                      {fmtMoney(row.yearTotalRounded)}
                    </td>
                    <td>
                      {row.monthlySumCheck ? (
                        <span className="badge badge-ok">✓ ตรง</span>
                      ) : (
                        <span className="badge badge-warn">⚠ ต่าง</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              <tr className="total-row">
                <td>รวมรายการหักทั้งหมด (ก่อนหักรับคืนห้องสมุด)</td>
                {monthly.monthlyDeductionTotals.map((v: number, i: number) => (
                  <td key={i} className="num">
                    {fmtMoney(v)}
                  </td>
                ))}
                <td className="num">{fmtMoney(monthly.grandTotals.deductionRounded)}</td>
                <td>
                  <span className="badge badge-ok">✓ ตรง</span>
                </td>
              </tr>
              <tr style={{ backgroundColor: '#f0fdf4', fontWeight: 700, color: '#166534' }}>
                <td>➕ บวกกลับ: รับคืนค่าบำรุงห้องสมุด 60% (มช. คืนให้คณะ)</td>
                {monthly.libraryRefundMonthly.map((v: number, i: number) => (
                  <td key={i} className="num">
                    {fmtMoney(v)}
                  </td>
                ))}
                <td className="num">{fmtMoney(monthly.libraryRefundYear)}</td>
                <td>
                  <span className="badge badge-ok">✓ บวกกลับ</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Section C: Net Revenue + True Cumulative Net + Rounding Difference */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">ส่วนที่ ค. ประมาณการรายรับสุทธิ (Net Revenue) และยอดสะสมรายเดือน</h2>
          <span className="badge badge-ok">ยอดรวมรายปี (ปัดลงพัน) = {fmtMoney(monthly.grandTotals.netRounded)} บาท</span>
        </div>
        <div className="table-wrap">
          <table className="rev-table">
            <thead>
              <tr>
                <th>ประเภทรายรับสุทธิ</th>
                {THAI_MONTH_NAMES.map((m) => (
                  <th key={m} className="num">
                    {m}
                  </th>
                ))}
                <th className="num">รวมรายปี (ปัดลงพัน)</th>
                <th>ตรวจสอบ</th>
              </tr>
            </thead>
            <tbody>
              {revTypes.map((rt) => {
                const row = monthly.netByType[rt];
                return (
                  <tr key={rt}>
                    <td style={{ fontWeight: 600 }}>{row.label}</td>
                    {row.months.map((v: number, i: number) => (
                      <td key={i} className="num">
                        {fmtMoney(v, v % 1 !== 0 ? 2 : 0)}
                      </td>
                    ))}
                    <td className="num" style={{ fontWeight: 700 }}>
                      {fmtMoney(row.yearTotalRounded)}
                    </td>
                    <td>
                      {row.monthlySumCheck ? (
                        <span className="badge badge-ok">✓ ตรง</span>
                      ) : (
                        <span className="badge badge-warn">⚠ ต่าง</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="total-row">
                <td>รวมรายรับสุทธิรายเดือน (ปัดหลักพันตามเกณฑ์ Excel)</td>
                {monthly.monthlyNetTotalsRounded.map((v: number, i: number) => (
                  <td key={i} className="num">
                    {fmtMoney(v)}
                  </td>
                ))}
                <td className="num" style={{ color: '#15803d', fontSize: 14 }}>
                  {fmtMoney(monthly.grandTotals.netRounded)}
                </td>
                <td>
                  <span className="badge badge-info">
                    ผลรวม 12 ด. = {fmtMoney(monthly.grandTotals.sumOfMonthlyNetRounded)}
                  </span>
                </td>
              </tr>
              <tr style={{ backgroundColor: '#eff6ff', fontWeight: 700, color: '#1e40af' }}>
                <td>📈 รายรับสุทธิสะสม (คำนวณยอดสะสมจริง ต.ค.–ก.ย.)</td>
                {monthly.cumulativeNetRounded.map((v: number, i: number) => (
                  <td key={i} className="num">
                    {fmtMoney(v)}
                  </td>
                ))}
                <td className="num">{fmtMoney(monthly.grandTotals.sumOfMonthlyNetRounded)}</td>
                <td>
                  <span className="badge badge-ok">✓ สะสมจริง</span>
                </td>
              </tr>
              <tr style={{ backgroundColor: '#fefce8', fontSize: 12.5 }}>
                <td colSpan={13}>
                  หมายเหตุการกระทบยอดปัดเศษ: ยอดรวมรายปีที่นำไปจัดสรรงบ ({fmtMoney(monthly.grandTotals.netRounded)} บาท)
                  ต่างจากผลรวมของแถวรายเดือนที่ปัดหลักพันทีละเดือน ({fmtMoney(monthly.grandTotals.sumOfMonthlyNetRounded)} บาท)
                  อยู่เท่ากับ:
                </td>
                <td className="num" style={{ fontWeight: 700 }}>
                  {fmtMoney(monthly.grandTotals.roundingDifference)} บาท
                </td>
                <td>
                  <span className="badge badge-info">ส่วนต่างปัดเศษ</span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// 3. ALLOCATION VIEW (/revenue/allocation)
// =============================================================================
export function AllocationView() {
  const { data, canEditEstimates, mutate, mutating } = useRevenueWorkspace();
  const [activeDim, setActiveDim] = useState<'plan' | 'expense_category' | 'strategic'>('plan');
  const [draftPcts, setDraftPcts] = useState<Record<string, Record<string, number>>>({});

  const dim = data?.calc?.allocation?.dimensions?.[activeDim];

  useEffect(() => {
    if (!dim || !dim.items) return;
    const init: Record<string, Record<string, number>> = {};
    for (const item of dim.items) {
      init[item.itemId] = {};
      for (const rt of ['TUITION', 'ACAD_SERVICE', 'RESEARCH_OH', 'RENT', 'CARRYOVER'] as const) {
        const base = data.calc.allocation.baseAmounts[rt] || 1;
        // find current pct from item amounts / base or from allocationCalc
        const amt = item.amounts[rt] || 0;
        init[item.itemId][rt] = Number(((amt / base) * 100).toFixed(2));
      }
    }
    setDraftPcts(init);
  }, [dim, data]);

  if (!data || !dim) return null;

  const revCols = [
    { code: 'TUITION', label: '1. ค่าธรรมเนียม' },
    { code: 'ACAD_SERVICE', label: '2. บริการวิชาการ' },
    { code: 'RESEARCH_OH', label: '3. Overhead วิจัย' },
    { code: 'RENT', label: '4. ค่าเช่าราชพัสดุ' },
    { code: 'CARRYOVER', label: '5. เหลือจ่ายยกมา' },
  ] as const;

  const colSums: Record<string, number> = {};
  for (const rc of revCols) {
    colSums[rc.code] = dim.items.reduce(
      (acc: number, it: any) => acc + (draftPcts[it.itemId]?.[rc.code] ?? 0),
      0
    );
  }

  const allCols100 = revCols.every((rc) => Math.abs(colSums[rc.code] - 100) < 0.05);

  const handleSavePcts = async () => {
    const entries: Array<{ itemId: string; revenueType: string; pct: number }> = [];
    for (const it of dim.items) {
      for (const rc of revCols) {
        const valPct = (draftPcts[it.itemId]?.[rc.code] ?? 0) / 100;
        entries.push({
          itemId: it.itemId,
          revenueType: rc.code,
          pct: Number(valPct.toFixed(6)),
        });
      }
    }
    await mutate(
      'update_allocation_pcts',
      {
        versionId: data.activeVersion.id,
        dimensionCode: activeDim,
        entries,
      },
      `บันทึกสัดส่วนการจัดสรร (${dim.dimensionName}) เรียบร้อยแล้ว`
    );
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>
            การจัดสรรกรอบงบประมาณจากรายรับสุทธิ (3 มุมมอง)
          </h1>
          <div style={{ fontSize: 13, color: '#475569' }}>
            แก้ไขสัดส่วน % ได้เฉพาะ PLANNING_OFFICER / SUPER_ADMIN • ทุกคอลัมน์ต้องรวมเท่ากับ 100% และแสดงสัดส่วนเฉลี่ยแบบถ่วงน้ำหนักจริง
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {(
            [
              { code: 'plan', label: '1. มิติแผนงาน (6 รายการ)' },
              { code: 'expense_category', label: '2. มิติหมวดรายจ่าย (5 รายการ)' },
              { code: 'strategic', label: '3. มิติหมวดงบเชิงยุทธศาสตร์ (5 รายการ)' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.code}
              className={`btn ${activeDim === tab.code ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setActiveDim(tab.code)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Base Net Revenue Bar */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">ฐานรายรับสุทธิที่นำไปจัดสรรได้ (ปัดตามกฎ: ค่าธรรมเนียมปัดพัน ประเภทอื่นปัดร้อย)</h2>
          <span className="badge badge-ok">รวมฐานจัดสรร {fmtMoney(data.calc.allocation.totalBase)} บาท</span>
        </div>
        <div className="table-wrap">
          <table className="rev-table">
            <thead>
              <tr>
                {revCols.map((rc) => (
                  <th key={rc.code} className="num">
                    {rc.label}
                  </th>
                ))}
                <th className="num">รวมรายรับสุทธิที่จัดสรรได้</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ fontWeight: 700 }}>
                {revCols.map((rc) => (
                  <td key={rc.code} className="num">
                    {fmtMoney(data.calc.allocation.baseAmounts[rc.code])}
                  </td>
                ))}
                <td className="num" style={{ color: '#15803d', fontSize: 15 }}>
                  {fmtMoney(data.calc.allocation.totalBase)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Table 1: Allocation Percentage Matrix */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">ตารางที่ 1: สัดส่วนการจัดสรร (% ของรายรับสุทธิแต่ละประเภท) — {dim.dimensionName}</h2>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {allCols100 ? (
              <span className="badge badge-ok">✓ ทุกคอลัมน์รวมครบ 100%</span>
            ) : (
              <span className="badge badge-err">⚠ มีคอลัมน์ที่รวมไม่เท่ากับ 100%</span>
            )}
            <button
              className="btn btn-primary"
              disabled={!canEditEstimates || !allCols100 || mutating}
              onClick={handleSavePcts}
            >
              💾 บันทึกสัดส่วน %
            </button>
          </div>
        </div>
        <div className="table-wrap">
          <table className="rev-table">
            <thead>
              <tr>
                <th>#</th>
                <th>หมวดงบประมาณ ({dim.dimensionName})</th>
                {revCols.map((rc) => (
                  <th key={rc.code} className="num">
                    {rc.label} (%)
                  </th>
                ))}
                <th className="num">สัดส่วนถ่วงน้ำหนักรวม (%)</th>
              </tr>
            </thead>
            <tbody>
              {dim.items.map((it: any, idx: number) => (
                <tr key={it.itemId}>
                  <td>{idx + 1}</td>
                  <td style={{ fontWeight: 600 }}>{it.itemName}</td>
                  {revCols.map((rc) => (
                    <td key={rc.code} className="num" style={{ width: 130 }}>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="100"
                        className="excel-input num"
                        disabled={!canEditEstimates}
                        value={draftPcts[it.itemId]?.[rc.code] ?? 0}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          setDraftPcts((prev) => ({
                            ...prev,
                            [it.itemId]: {
                              ...(prev[it.itemId] || {}),
                              [rc.code]: v,
                            },
                          }));
                        }}
                      />
                    </td>
                  ))}
                  <td className="num calc-cell" style={{ fontWeight: 700 }}>
                    {fmtPct(it.weightedPct, 2)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="total-row">
                <td colSpan={2}>รวมสัดส่วน (%)</td>
                {revCols.map((rc) => (
                  <td key={rc.code} className="num">
                    {(colSums[rc.code] ?? 0).toFixed(1)}%
                  </td>
                ))}
                <td className="num">100.00%</td>
              </tr>
              <tr>
                <td colSpan={2} style={{ fontWeight: 700 }}>
                  การตรวจสอบ (ต้องรวม = 100%)
                </td>
                {revCols.map((rc) => {
                  const ok = Math.abs((colSums[rc.code] ?? 0) - 100) < 0.05;
                  return (
                    <td key={rc.code} className="num">
                      {ok ? (
                        <span className="badge badge-ok">✓ 100%</span>
                      ) : (
                        <span className="badge badge-err">⚠ ต้องรวม 100%</span>
                      )}
                    </td>
                  );
                })}
                <td className="num">
                  <span className="badge badge-ok">✓ ถ่วงน้ำหนัก</span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Table 2: Allocated Amounts + Historical Usage 2565-2569 */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">
            ตารางที่ 2: จำนวนเงินจัดสรร (บาท) และเปรียบเทียบผลการใช้งบประมาณ พ.ศ. 2565–2569 — {dim.dimensionName}
          </h2>
          {dim.isFullyAllocated ? (
            <span className="badge badge-ok">✓ จัดสรรครบทุกบาท (ส่วนต่าง = 0)</span>
          ) : (
            <span className="badge badge-err">⚠ ส่วนต่าง = {fmtMoney(dim.differenceFromBase)} บาท</span>
          )}
        </div>
        <div className="table-wrap">
          <table className="rev-table">
            <thead>
              <tr>
                <th>#</th>
                <th>หมวดงบประมาณ</th>
                {revCols.map((rc) => (
                  <th key={rc.code} className="num">
                    {rc.label}
                  </th>
                ))}
                <th className="num">รวมทุกประเภท (บาท)</th>
                <th className="num">% ถ่วงน้ำหนัก</th>
                <th className="num">ใช้จริง 2565</th>
                <th className="num">ใช้จริง 2566</th>
                <th className="num">ใช้จริง 2567</th>
                <th className="num">ใช้จริง 2568</th>
                <th className="num">ใช้จริง 2569</th>
                <th className="num">เฉลี่ย 5 ปี</th>
              </tr>
            </thead>
            <tbody>
              {dim.items.map((it: any, idx: number) => (
                <tr key={it.itemId}>
                  <td>{idx + 1}</td>
                  <td style={{ fontWeight: 600 }}>{it.itemName}</td>
                  {revCols.map((rc) => (
                    <td key={rc.code} className="num">
                      {fmtMoney(it.amounts[rc.code])}
                    </td>
                  ))}
                  <td className="num" style={{ fontWeight: 800, color: '#0f172a' }}>
                    {fmtMoney(it.totalAmount)}
                  </td>
                  <td className="num">{fmtPct(it.weightedPct, 2)}</td>
                  {[2565, 2566, 2567, 2568, 2569].map((yr) => (
                    <td key={yr} className="num" style={{ color: '#475569' }}>
                      {it.historicalUsage?.[yr] !== null && it.historicalUsage?.[yr] !== undefined
                        ? fmtMoney(it.historicalUsage[yr], 0)
                        : '-'}
                    </td>
                  ))}
                  <td className="num" style={{ fontWeight: 600, color: '#3b1c57' }}>
                    {it.historicalAverage !== null && it.historicalAverage !== undefined
                      ? fmtMoney(it.historicalAverage, 0)
                      : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="total-row">
                <td colSpan={2}>รวมจัดสรรทั้งสิ้น</td>
                {revCols.map((rc) => (
                  <td key={rc.code} className="num">
                    {fmtMoney(dim.columnSums[rc.code]?.amount)}
                  </td>
                ))}
                <td className="num" style={{ color: '#15803d', fontSize: 14 }}>
                  {fmtMoney(dim.totalAllocated)}
                </td>
                <td className="num">100.00%</td>
                <td colSpan={6} className="num">
                  ส่วนต่างจากรายรับสุทธิ = {fmtMoney(dim.differenceFromBase)} บาท (✓ จัดสรรครบทุกบาท)
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
