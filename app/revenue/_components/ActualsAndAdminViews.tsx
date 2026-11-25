'use client';

import React, { useState } from 'react';
import {
  useRevenueWorkspace,
  fmtMoney,
  fmtPct,
  THAI_MONTH_NAMES,
} from './WorkspaceContext';

const REV_TYPE_LABELS: Record<string, string> = {
  TUITION: '1. ค่าธรรมเนียมการศึกษา',
  ACAD_SERVICE: '2. บริการวิชาการ',
  RESEARCH_OH: '3. ค่า Overhead งานวิจัย',
  RENT: '4. ค่าเช่าพื้นที่ราชพัสดุ',
  CARRYOVER: '5. เงินเหลือจ่ายสะสม',
  OTHER: '6. รายได้อื่น',
};

// =============================================================================
// 1. ACTUALS & CARRYOVER TRACKER VIEW (/revenue/actuals & /revenue/carryover-tracker) — PROMPT 6
// =============================================================================
export function ActualsAndTrackerView() {
  const { data, canEditActuals, mutate, mutating } = useRevenueWorkspace();
  const [newAct, setNewAct] = useState({
    receivedDate: '',
    monthSeq: 1,
    revenueType: 'RENT',
    sourceName: '',
    refNo: '',
    gross: 0,
    deduction: 0,
    note: '',
  });

  if (!data) return null;
  const tracker = data.calc.carryoverTracker;

  // Date vs fiscal month mismatch helper (Case 11 in D4)
  const checkDateMismatch = (dateStr: string | null, monthSeq: number): string | null => {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return null;
    const calMonth = d.getMonth() + 1; // 1=Jan..12=Dec
    // Fiscal monthSeq 1=Oct(10), 2=Nov(11), 3=Dec(12), 4=Jan(1)...12=Sep(9)
    const expectedCalMonth = ((monthSeq + 8) % 12) + 1;
    if (calMonth !== expectedCalMonth) {
      return `⚠ วันที่รับเงิน (${dateStr}) ไม่ตรงกับเดือนปีงบประมาณที่เลือก (${THAI_MONTH_NAMES[monthSeq - 1]})`;
    }
    return null;
  };

  const liveDateWarning = checkDateMismatch(newAct.receivedDate, newAct.monthSeq);

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>
          บันทึกรายรับจริง และติดตามเงินเหลือจ่ายสะสมรายเดือน — ปีงบประมาณ พ.ศ. {data.activeVersion.be_year}
        </h1>
        <div style={{ fontSize: 13, color: '#475569' }}>
          สิทธิ์บันทึก: FINANCE_OFFICER / SUPER_ADMIN • คำนวณยอดคงเหลือสิ้นเดือนอัตโนมัติ = ยอดยกมา + รับสุทธิจริงสะสม − รายจ่ายจริงสะสม
        </div>
      </div>

      {/* Add Actual Revenue Form */}
      {canEditActuals && (
        <div className="card" style={{ backgroundColor: '#f0fdf4' }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>➕ บันทึกรายการรายรับจริง</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              type="date"
              className="input-ctrl"
              value={newAct.receivedDate}
              onChange={(e) => setNewAct((p) => ({ ...p, receivedDate: e.target.value }))}
            />
            <select
              className="select-ctrl"
              value={newAct.monthSeq}
              onChange={(e) => setNewAct((p) => ({ ...p, monthSeq: Number(e.target.value) }))}
            >
              {THAI_MONTH_NAMES.map((m, i) => (
                <option key={m} value={i + 1}>
                  เดือนปีงบ: {m}
                </option>
              ))}
            </select>
            <select
              className="select-ctrl"
              value={newAct.revenueType}
              onChange={(e) => setNewAct((p) => ({ ...p, revenueType: e.target.value }))}
            >
              {Object.entries(REV_TYPE_LABELS).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder="แหล่งที่มา / รายการ..."
              className="input-ctrl"
              style={{ minWidth: 200 }}
              value={newAct.sourceName}
              onChange={(e) => setNewAct((p) => ({ ...p, sourceName: e.target.value }))}
            />
            <input
              type="text"
              placeholder="เลขที่ใบเสร็จ"
              className="input-ctrl"
              style={{ width: 120 }}
              value={newAct.refNo}
              onChange={(e) => setNewAct((p) => ({ ...p, refNo: e.target.value }))}
            />
            <input
              type="number"
              placeholder="ก่อนหัก (บาท)"
              className="input-ctrl num"
              style={{ width: 125 }}
              value={newAct.gross}
              onChange={(e) => setNewAct((p) => ({ ...p, gross: Number(e.target.value) }))}
            />
            <input
              type="number"
              placeholder="ยอดหักจริง"
              className="input-ctrl num"
              style={{ width: 115 }}
              value={newAct.deduction}
              onChange={(e) => setNewAct((p) => ({ ...p, deduction: Number(e.target.value) }))}
            />
            <button
              className="btn btn-primary"
              disabled={!newAct.sourceName.trim() || mutating}
              onClick={async () => {
                const ok = await mutate(
                  'upsert_revenue_actual',
                  {
                    fiscalYearId: data.activeVersion.fiscal_year_id,
                    ...newAct,
                  },
                  'บันทึกรายการรายรับจริงเรียบร้อยแล้ว'
                );
                if (ok) setNewAct((p) => ({ ...p, sourceName: '', refNo: '', gross: 0, deduction: 0 }));
              }}
            >
              ➕ บันทึกรับจริง
            </button>
          </div>
          {liveDateWarning && (
            <div style={{ marginTop: 8, color: '#b45309', fontWeight: 700, fontSize: 12.5 }}>
              {liveDateWarning}
            </div>
          )}
        </div>
      )}

      {/* Carryover Monthly Tracker */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">
            ตารางติดตามเงินเหลือจ่ายสะสมรายเดือน (ยอดยกมาต้นปี = {fmtMoney(tracker.openingBalance)} บาท)
          </h2>
          {tracker.hasAnyExpenditureRecorded ? (
            <span className="badge badge-ok">{tracker.statusMessage}</span>
          ) : (
            <span className="badge badge-warn">{tracker.statusMessage}</span>
          )}
        </div>
        <div className="table-wrap">
          <table className="rev-table">
            <thead>
              <tr>
                <th>ลำดับ</th>
                <th>เดือน</th>
                <th>พ.ศ.</th>
                <th className="num">รายรับสุทธิจริงในเดือน (ไม่รวมยกมา)</th>
                <th className="num">รายจ่ายจริงในเดือน (กรอกช่องสีเหลือง)</th>
                <th className="num">เงินเหลือจ่ายสะสมสิ้นเดือน (บาท)</th>
              </tr>
            </thead>
            <tbody>
              {tracker.months.map((m: any, idx: number) => {
                const monthBe = m.monthSeq <= 3 ? data.activeVersion.be_year - 1 : data.activeVersion.be_year;
                return (
                  <tr key={m.monthSeq}>
                    <td>{m.monthSeq}</td>
                    <td style={{ fontWeight: 700 }}>{THAI_MONTH_NAMES[idx]}</td>
                    <td>{monthBe}</td>
                    <td className="num calc-cell">{fmtMoney(m.actualNetInMonth)}</td>
                    <td className="num" style={{ width: 200 }}>
                      <input
                        type="number"
                        min="0"
                        className="excel-input num"
                        disabled={!canEditActuals}
                        defaultValue={m.expenditureInMonth}
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (v !== m.expenditureInMonth) {
                            mutate(
                              'upsert_expenditure_actual',
                              {
                                fiscalYearId: data.activeVersion.fiscal_year_id,
                                monthSeq: m.monthSeq,
                                amount: v,
                              },
                              `บันทึกรายจ่ายจริงเดือน ${THAI_MONTH_NAMES[idx]} เรียบร้อยแล้ว`
                            );
                          }
                        }}
                      />
                    </td>
                    <td className="num calc-cell" style={{ fontWeight: 700, color: '#0f172a' }}>
                      {fmtMoney(m.closingBalance)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="total-row">
                <td colSpan={3}>สรุปทั้งปีงบประมาณ</td>
                <td className="num">{fmtMoney(tracker.totalActualNetWithoutCarryover)}</td>
                <td className="num">{fmtMoney(tracker.totalExpenditure)}</td>
                <td className="num" style={{ color: '#15803d', fontSize: 15 }}>
                  {fmtMoney(tracker.yearEndClosingBalance)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Actual Revenue Lines List */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">รายการบันทึกรายรับจริงทั้งหมด ({data.revenueActuals.length} รายการ)</h2>
        </div>
        <div className="table-wrap">
          <table className="rev-table">
            <thead>
              <tr>
                <th>#</th>
                <th>วันที่รับ</th>
                <th>เดือนปีงบ</th>
                <th>ประเภทรายรับ</th>
                <th>แหล่งที่มา / รายการ</th>
                <th>เลขที่ใบเสร็จ</th>
                <th className="num">ก่อนหัก (บาท)</th>
                <th className="num">ยอดหักจริง</th>
                <th className="num">รายรับสุทธิจริง</th>
                <th>ตรวจสอบ</th>
                {canEditActuals && <th>ลบ</th>}
              </tr>
            </thead>
            <tbody>
              {data.revenueActuals.length === 0 ? (
                <tr>
                  <td colSpan={11} style={{ textAlign: 'center', padding: 20, color: '#64748b' }}>
                    ยังไม่มีรายการบันทึกรายรับจริงในปีงบประมาณนี้ — สามารถเพิ่มรายการจากแบบฟอร์มด้านบน
                  </td>
                </tr>
              ) : (
                data.revenueActuals.map((a: any, idx: number) => {
                  const warn = checkDateMismatch(a.receivedDate, a.monthSeq);
                  return (
                    <tr key={a.id}>
                      <td>{idx + 1}</td>
                      <td>{a.receivedDate || '-'}</td>
                      <td style={{ fontWeight: 700 }}>{THAI_MONTH_NAMES[a.monthSeq - 1]}</td>
                      <td>{REV_TYPE_LABELS[a.revenueType] || a.revenueType}</td>
                      <td style={{ fontWeight: 600 }}>{a.sourceName}</td>
                      <td>{a.refNo || '-'}</td>
                      <td className="num">{fmtMoney(a.gross)}</td>
                      <td className="num">{fmtMoney(a.deduction)}</td>
                      <td className="num" style={{ fontWeight: 700 }}>
                        {fmtMoney(a.net)}
                      </td>
                      <td>
                        {warn ? (
                          <span className="badge badge-warn" title={warn}>
                            ⚠ วันที่ไม่ตรงเดือน
                          </span>
                        ) : (
                          <span className="badge badge-ok">✓ ปกติ</span>
                        )}
                      </td>
                      {canEditActuals && (
                        <td>
                          <button
                            className="btn btn-danger"
                            style={{ padding: '3px 7px', fontSize: 11 }}
                            onClick={() =>
                              mutate('soft_delete_row', { table: 'revenue_actuals', id: a.id })
                            }
                          >
                            ลบ
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// 2. COMPARE ESTIMATE VS ACTUAL VIEW (/revenue/compare) — PROMPT 6 Task 3
// =============================================================================
export function CompareView() {
  const {
    data,
    compareBasis,
    compareMonthSeq,
    setCompareBasis,
    setCompareMonthSeq,
  } = useRevenueWorkspace();

  if (!data) return null;
  const cmp = data.calc.compare;
  const revTypes = ['TUITION', 'ACAD_SERVICE', 'RESEARCH_OH', 'RENT', 'CARRYOVER', 'OTHER'] as const;

  const statusBadge = (status: string, label: string) => {
    if (status === 'HIT') return <span className="badge badge-ok">✓ {label}</span>;
    if (status === 'NEAR') return <span className="badge badge-warn">◐ {label}</span>;
    if (status === 'MISS') return <span className="badge badge-err">⚠ {label}</span>;
    return <span className="badge">{label}</span>;
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>
            เปรียบเทียบประมาณการกับรายรับจริง (สะสมถึงเดือนที่รายงาน)
          </h1>
          <div style={{ fontSize: 13, color: '#475569' }}>
            เกณฑ์สถานะตามพารามิเตอร์: ≥ 100% ถึงเป้าหมาย · ≥ 90% ใกล้เป้าหมาย · ต่ำกว่า 90% ต่ำกว่าเป้าหมาย
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <label style={{ fontWeight: 700 }}>เกณฑ์คำนวณ:</label>
          <select
            className="select-ctrl"
            value={compareBasis}
            onChange={(e) => setCompareBasis(e.target.value as 'net' | 'gross')}
          >
            <option value="net">รายรับสุทธิ (Net)</option>
            <option value="gross">รายรับก่อนหัก (Gross)</option>
          </select>

          <label style={{ fontWeight: 700 }}>สะสมถึงเดือน:</label>
          <select
            className="select-ctrl"
            value={compareMonthSeq}
            onChange={(e) => setCompareMonthSeq(Number(e.target.value))}
          >
            {THAI_MONTH_NAMES.map((m, idx) => (
              <option key={m} value={idx + 1}>
                เดือนที่ {idx + 1}: {m}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 4 Summary Cards */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label">1. ประมาณการทั้งปี ({compareBasis === 'net' ? 'สุทธิ' : 'ก่อนหัก'})</div>
          <div className="kpi-value">{fmtMoney(cmp.totals.annualEstimate)} บาท</div>
        </div>
        <div className="kpi-card" style={{ borderLeftColor: '#0284c7' }}>
          <div className="kpi-label">
            2. ประมาณการสะสม (ต.ค. – {THAI_MONTH_NAMES[compareMonthSeq - 1]})
          </div>
          <div className="kpi-value">{fmtMoney(cmp.totals.cumulativeEstimate)} บาท</div>
        </div>
        <div className="kpi-card" style={{ borderLeftColor: '#15803d' }}>
          <div className="kpi-label">
            3. รายรับจริงสะสม (ต.ค. – {THAI_MONTH_NAMES[compareMonthSeq - 1]})
          </div>
          <div className="kpi-value">{fmtMoney(cmp.totals.cumulativeActual)} บาท</div>
        </div>
        <div className="kpi-card" style={{ borderLeftColor: cmp.totals.difference >= 0 ? '#15803d' : '#dc2626' }}>
          <div className="kpi-label">4. ผลต่างสะสม (รับจริง − ประมาณการ)</div>
          <div className="kpi-value">
            {cmp.totals.difference >= 0 ? '+' : ''}
            {fmtMoney(cmp.totals.difference)} บาท
          </div>
          <div className="kpi-sub">
            คิดเป็น {cmp.totals.achievementPct !== null ? fmtPct(cmp.totals.achievementPct, 1) : '-'} ของเป้าสะสม
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">
            ตารางเปรียบเทียบรายประเภทรายรับ (สะสมถึงเดือน {THAI_MONTH_NAMES[compareMonthSeq - 1]})
          </h2>
          {statusBadge(cmp.totals.status, cmp.totals.statusLabelTh)}
        </div>
        <div className="table-wrap">
          <table className="rev-table">
            <thead>
              <tr>
                <th>ประเภทรายรับ</th>
                <th className="num">ประมาณการทั้งปี</th>
                <th className="num">ประมาณการสะสม (1..{compareMonthSeq})</th>
                <th className="num">รับจริงสะสม (1..{compareMonthSeq})</th>
                <th className="num">ผลต่าง (รับจริง − ประมาณการ)</th>
                <th className="num">% เทียบเป้าสะสม</th>
                <th>สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {revTypes.map((rt) => {
                const row = cmp.byType[rt];
                return (
                  <tr key={rt}>
                    <td style={{ fontWeight: 600 }}>{row.label}</td>
                    <td className="num">{fmtMoney(row.annualEstimate)}</td>
                    <td className="num">{fmtMoney(row.cumulativeEstimate)}</td>
                    <td className="num" style={{ fontWeight: 700 }}>
                      {fmtMoney(row.cumulativeActual)}
                    </td>
                    <td
                      className="num"
                      style={{
                        color: row.difference >= 0 ? '#15803d' : '#b91c1c',
                        fontWeight: 700,
                      }}
                    >
                      {row.difference >= 0 ? '+' : ''}
                      {fmtMoney(row.difference)}
                    </td>
                    <td className="num">
                      {row.achievementPct !== null ? fmtPct(row.achievementPct, 1) : '-'}
                    </td>
                    <td>{statusBadge(row.status, row.statusLabelTh)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="total-row">
                <td>รวมทุกประเภท</td>
                <td className="num">{fmtMoney(cmp.totals.annualEstimate)}</td>
                <td className="num">{fmtMoney(cmp.totals.cumulativeEstimate)}</td>
                <td className="num">{fmtMoney(cmp.totals.cumulativeActual)}</td>
                <td className="num">
                  {cmp.totals.difference >= 0 ? '+' : ''}
                  {fmtMoney(cmp.totals.difference)}
                </td>
                <td className="num">
                  {cmp.totals.achievementPct !== null ? fmtPct(cmp.totals.achievementPct, 1) : '-'}
                </td>
                <td>{statusBadge(cmp.totals.status, cmp.totals.statusLabelTh)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// 3. BUDGET REQUEST COMPARISON REPORT (/revenue/reports/budget-request) — PROMPT 7 Task 4
// =============================================================================
export function BudgetRequestReportView() {
  const { data } = useRevenueWorkspace();
  if (!data) return null;

  const p = data.priorYearComparison;
  const { tuition, service, research, rental, monthly, allocation } = data.calc;

  const t2571 = tuition.totals.netYearRounded;
  const s2571 = service.totals.netRounded;
  const r2571 = rental.totals.netRounded;
  const oh2571 = research.totals.netRounded;
  const asset2571 = r2571 + oh2571;
  const carry2571 = data.carryover.amount;
  const grand2571 = monthly.grandTotals.netRounded;

  const rows1 = [
    {
      code: '1.1',
      title: 'รายรับจากค่าธรรมเนียมการศึกษา',
      isHeader: true,
      y70v1: p.v1.tuitionTotal,
      y71: t2571,
      y70v2: p.v2.tuitionTotal,
    },
    {
      code: '1.1.1',
      title: 'หลักสูตรการเมืองการปกครอง ระดับปริญญาตรี',
      y70v1: p.v1.groups['1.1.1'],
      y71: tuition.byReportGroup['1.1.1'],
      y70v2: p.v2.groups['1.1.1'],
    },
    {
      code: '1.1.2',
      title: 'หลักสูตรรัฐประศาสนศาสตร์ ระดับปริญญาตรี',
      y70v1: p.v1.groups['1.1.2'],
      y71: tuition.byReportGroup['1.1.2'],
      y70v2: p.v2.groups['1.1.2'],
    },
    {
      code: '1.1.3',
      title: 'หลักสูตรการระหว่างประเทศ ระดับปริญญาตรี',
      y70v1: p.v1.groups['1.1.3'],
      y71: tuition.byReportGroup['1.1.3'],
      y70v2: p.v2.groups['1.1.3'],
    },
    {
      code: '1.1.4',
      title: 'หลักสูตรวิทยาศาสตรบัณฑิต (ศาสตร์แห่งความยั่งยืน)',
      y70v1: p.v1.groups['1.1.4'],
      y71: tuition.byReportGroup['1.1.4'],
      y70v2: p.v2.groups['1.1.4'],
    },
    {
      code: '1.1.5',
      title: 'หลักสูตรการเมืองการปกครอง ระดับบัณฑิตศึกษา',
      y70v1: p.v1.groups['1.1.5'],
      y71: tuition.byReportGroup['1.1.5'],
      y70v2: p.v2.groups['1.1.5'],
    },
    {
      code: '1.1.6',
      title: 'หลักสูตรรัฐประศาสนศาสตร์ ระดับบัณฑิตศึกษา',
      y70v1: p.v1.groups['1.1.6'],
      y71: tuition.byReportGroup['1.1.6'],
      y70v2: p.v2.groups['1.1.6'],
    },
    {
      code: '1.1.7',
      title: 'กระบวนวิชาศึกษาทั่วไป (แก้ไขป้ายจาก 1.17 เป็น 1.1.7)',
      y70v1: p.v1.groups['1.1.7'],
      y71: tuition.byReportGroup['1.1.7'],
      y70v2: p.v2.groups['1.1.7'],
    },
    {
      code: '1.2',
      title: 'รายได้จากการบริการวิชาการ',
      isHeader: true,
      y70v1: p.v1.serviceTotal,
      y71: s2571,
      y70v2: p.v2.serviceTotal,
    },
    {
      code: '1.2.1',
      title: 'ค่าอบรมหลักสูตรระยะสั้นแบบหารายได้',
      y70v1: p.v1.serviceCategories['1.2.1'],
      y71: service.byReportCategory.shortCourse_1_2_1,
      y70v2: p.v2.serviceCategories['1.2.1'],
    },
    {
      code: '1.2.2',
      title: 'ค่าบริหารจัดการโครงการ USAC',
      y70v1: p.v1.serviceCategories['1.2.2'],
      y71: service.byReportCategory.usac_1_2_2,
      y70v2: p.v2.serviceCategories['1.2.2'],
    },
    {
      code: '1.2.3',
      title: 'ค่าอบรมวิชาระยะสั้น (หลักสูตร LE และกิจกรรมโรงเรียน)',
      y70v1: p.v1.serviceCategories['1.2.3'],
      y71: service.byReportCategory.le_1_2_3,
      y70v2: p.v2.serviceCategories['1.2.3'],
    },
    {
      code: '1.3',
      title: 'รายได้อื่น/ผลประโยชน์จากการบริหารทรัพย์สิน',
      isHeader: true,
      y70v1: p.v1.otherAssetTotal,
      y71: asset2571,
      y70v2: p.v2.otherAssetTotal,
    },
    {
      code: '1.3.1',
      title: 'รายได้จากการใช้ที่ราชพัสดุ (ค่าเช่าสถานที่)',
      y70v1: p.v1.rent_1_3_1,
      y71: r2571,
      y70v2: p.v2.rent_1_3_1,
    },
    {
      code: '1.3.2',
      title: 'เงินอุดหนุน (Overhead) งานวิจัยภายนอก',
      y70v1: p.v1.overhead_1_3_2,
      y71: oh2571,
      y70v2: p.v2.overhead_1_3_2,
    },
    {
      code: '1.4',
      title: 'เงินเหลือจ่ายสะสมยกมา',
      isHeader: true,
      y70v1: p.v1.carryover_1_4,
      y71: carry2571,
      y70v2: p.v2.carryover_1_4,
    },
  ];

  return (
    <div>
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>
            รายงานสรุปคำขอตั้งงบประมาณเปรียบเทียบปีต่อปี (ปีงบประมาณ พ.ศ. {data.activeVersion.be_year})
          </h1>
          <div style={{ fontSize: 13, color: '#475569' }}>
            ดึงข้อมูลปีก่อน (พ.ศ. {p.beYear} ครั้งที่ 1 และ ครั้งที่ 2) จากฐานข้อมูลภายใน ไม่พึ่งลิงก์ไฟล์ภายนอก `[1]`
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={() => window.print()}>
            🖨️ พิมพ์รายงาน / บันทึก PDF
          </button>
          <a
            href={`/api/revenue/export?versionId=${data.activeVersion.id}`}
            className="btn btn-primary"
          >
            📥 ส่งออก Excel (.xlsx)
          </a>
        </div>
      </div>

      <div className="card">
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 17, fontWeight: 800 }}>
            สรุปคำขอตั้งงบประมาณรายจ่ายเงินรายได้ คณะรัฐศาสตร์และรัฐประศาสนศาสตร์ มหาวิทยาลัยเชียงใหม่
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#3b1c57' }}>
            ประจำปีงบประมาณ พ.ศ. {data.activeVersion.be_year} (เปรียบเทียบงบประมาณ พ.ศ. {p.beYear} ครั้งที่ 1 และ ครั้งที่ 2)
          </div>
        </div>

        <div className="table-wrap">
          <table className="rev-table">
            <thead>
              <tr>
                <th>รหัส</th>
                <th>1. ประมาณการรายรับ</th>
                <th className="num">ปีงบ {p.beYear} (ครั้งที่ 1)</th>
                <th className="num">ปีงบ {data.activeVersion.be_year} (ครั้งที่ 1)</th>
                <th className="num">สัดส่วนปี {data.activeVersion.be_year} (%)</th>
                <th className="num">ปีงบ {p.beYear} (ครั้งที่ 2)</th>
                <th className="num">เพิ่ม / (ลด) เทียบปี {p.beYear}</th>
                <th className="num">ร้อยละเพิ่ม / (ลด)</th>
              </tr>
            </thead>
            <tbody>
              {rows1.map((r) => {
                const diff = r.y71 - r.y70v1;
                const diffPct = r.y70v1 !== 0 ? (diff / r.y70v1) * 100 : 0;
                const share71 = grand2571 > 0 ? (r.y71 / grand2571) * 100 : 0;
                return (
                  <tr
                    key={r.code}
                    style={
                      r.isHeader
                        ? { backgroundColor: '#f8fafc', fontWeight: 700 }
                        : undefined
                    }
                  >
                    <td style={{ fontWeight: r.isHeader ? 800 : 500 }}>{r.code}</td>
                    <td style={{ paddingLeft: r.isHeader ? 10 : 24 }}>{r.title}</td>
                    <td className="num">{fmtMoney(r.y70v1)}</td>
                    <td className="num" style={{ fontWeight: 700 }}>
                      {fmtMoney(r.y71)}
                    </td>
                    <td className="num">{share71.toFixed(2)}%</td>
                    <td className="num">{fmtMoney(r.y70v2)}</td>
                    <td
                      className="num"
                      style={{ color: diff >= 0 ? '#15803d' : '#b91c1c', fontWeight: 700 }}
                    >
                      {diff >= 0 ? '+' : ''}
                      {fmtMoney(diff)}
                    </td>
                    <td
                      className="num"
                      style={{ color: diff >= 0 ? '#15803d' : '#b91c1c', fontWeight: 600 }}
                    >
                      {diff >= 0 ? '+' : ''}
                      {diffPct.toFixed(2)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="total-row" style={{ backgroundColor: '#dcfce7' }}>
                <td colSpan={2}>รวมประมาณการรายรับทั้งสิ้น</td>
                <td className="num">{fmtMoney(p.v1.grandTotal)}</td>
                <td className="num" style={{ color: '#15803d', fontSize: 15 }}>
                  {fmtMoney(grand2571)}
                </td>
                <td className="num">100.00%</td>
                <td className="num">{fmtMoney(p.v2.grandTotal)}</td>
                <td className="num" style={{ color: '#15803d' }}>
                  +{fmtMoney(grand2571 - p.v1.grandTotal)}
                </td>
                <td className="num" style={{ color: '#15803d' }}>
                  +{(((grand2571 - p.v1.grandTotal) / p.v1.grandTotal) * 100).toFixed(2)}%
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Section 2: Expenditure Allocation Comparison */}
        <h3 style={{ marginTop: 22, marginBottom: 10 }}>
          2. ประมาณการรายจ่าย (เชื่อมจากผลการจัดสรรกรอบงบประมาณ ปี {data.activeVersion.be_year} เทียบปี {p.beYear})
        </h3>
        <div className="table-wrap">
          <table className="rev-table">
            <thead>
              <tr>
                <th>หมวดแผนงาน / หมวดรายจ่าย</th>
                <th className="num">ตั้งงบปี {p.beYear} (บาท)</th>
                <th className="num">จัดสรรตั้งงบปี {data.activeVersion.be_year} (บาท)</th>
                <th className="num">สัดส่วนปี {data.activeVersion.be_year} (%)</th>
                <th className="num">เพิ่ม / (ลด) บาท</th>
                <th className="num">ร้อยละเพิ่ม / (ลด)</th>
              </tr>
            </thead>
            <tbody>
              {(allocation.dimensions.plan?.items || []).map((it: any, idx: number) => {
                const oldVal = (p.v1.plans as any)[it.itemName] || 0;
                const diff = it.totalAmount - oldVal;
                const pct = oldVal !== 0 ? (diff / oldVal) * 100 : 0;
                return (
                  <tr key={it.itemId}>
                    <td style={{ fontWeight: 600 }}>
                      2.1.{idx + 1} {it.itemName}
                    </td>
                    <td className="num">{fmtMoney(oldVal)}</td>
                    <td className="num" style={{ fontWeight: 700 }}>
                      {fmtMoney(it.totalAmount)}
                    </td>
                    <td className="num">{fmtPct(it.weightedPct, 2)}</td>
                    <td className="num" style={{ color: diff >= 0 ? '#15803d' : '#b91c1c' }}>
                      {diff >= 0 ? '+' : ''}
                      {fmtMoney(diff)}
                    </td>
                    <td className="num">
                      {diff >= 0 ? '+' : ''}
                      {pct.toFixed(2)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// 4. IMPORT / EXPORT EXCEL VIEW (/revenue/import) — PROMPT 7 Task 1-2
// =============================================================================
export function ImportExportView() {
  const { data, refresh } = useRevenueWorkspace();
  const [dryRunResult, setDryRunResult] = useState<any | null>(null);
  const [running, setRunning] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  if (!data) return null;

  const runImport = async (mode: 'dry_run' | 'commit') => {
    setRunning(true);
    try {
      let res: Response;
      if (selectedFile) {
        const fd = new FormData();
        fd.append('mode', mode);
        fd.append('file', selectedFile);
        res = await fetch('/api/revenue/import', { method: 'POST', body: fd });
      } else {
        res = await fetch('/api/revenue/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode }),
        });
      }
      const json = await res.json();
      setDryRunResult(json);
      if (mode === 'commit' && json.ok) {
        await refresh();
      }
    } finally {
      setRunning(false);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>
          นำเข้าและส่งออกไฟล์ Excel (.xlsx) — ระบบตรวจสอบ Dry-Run ก่อนบันทึกจริง
        </h1>
        <div style={{ fontSize: 13, color: '#475569' }}>
          ไม่เชื่อถือสูตรที่ฝังในไฟล์ Excel • นำเข้าเฉพาะค่า Input แล้วคำนวณใหม่ด้วย Calculation Engine ทั้งหมด • หากมีแถวผิดพลาดจะไม่บันทึกบางส่วน (All-or-Nothing Transaction)
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 16 }}>
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">1. นำเข้าไฟล์ Excel ต้นแบบ (Dry-Run & Commit)</h2>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontWeight: 700, marginBottom: 6 }}>
              เลือกไฟล์ .xlsx (หรือเว้นว่างเพื่อทดสอบกับไฟล์ต้นฉบับ Revenue_Estimate_Template2571.xlsx):
            </label>
            <input
              type="file"
              accept=".xlsx"
              className="input-ctrl"
              onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
            />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              className="btn btn-secondary"
              disabled={running}
              onClick={() => runImport('dry_run')}
            >
              🔍 1. ทดสอบนำเข้า (Dry-Run Preview)
            </button>
            <button
              className="btn btn-primary"
              disabled={running || !dryRunResult?.ok || dryRunResult?.summary?.errorCount > 0}
              onClick={() => runImport('commit')}
            >
              ✅ 2. ยืนยันบันทึกข้อมูลเข้าฐานข้อมูล
            </button>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="card-title">2. ส่งออกรายงาน Excel (.xlsx)</h2>
          </div>
          <p style={{ margin: '0 0 12px', color: '#475569' }}>
            ส่งออกข้อมูลสรุปรายเดือน (ก่อนหัก/หัก/รับคืนห้องสมุด/สุทธิ), ตารางจัดสรรกรอบงบประมาณ 3 มิติ และรายงานคำขอตั้งงบเปรียบเทียบปี
          </p>
          <a
            href={`/api/revenue/export?versionId=${data.activeVersion.id}`}
            className="btn btn-success"
          >
            📥 ดาวน์โหลดไฟล์ Excel (.xlsx) ของเวอร์ชันปัจจุบัน
          </a>
        </div>
      </div>

      {dryRunResult && (
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">
              ผลการตรวจสอบไฟล์ Excel ({dryRunResult.mode === 'commit' ? 'บันทึกจริงแล้ว' : 'โหมด Dry-Run'})
            </h2>
            {dryRunResult.ok ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <span className="badge badge-ok">
                  ✓ แถวถูกต้องพร้อมนำเข้า: {dryRunResult.summary.validCount} แถว
                </span>
                <span className="badge badge-info">
                  แถวว่างที่ข้าม: {dryRunResult.summary.skippedCount} แถว
                </span>
                <span className="badge badge-err">
                  ข้อผิดพลาด: {dryRunResult.summary.errorCount} แถว
                </span>
              </div>
            ) : (
              <span className="badge badge-err">⚠ {dryRunResult.error}</span>
            )}
          </div>

          {dryRunResult.previewRows && (
            <div className="table-wrap" style={{ maxHeight: 420, overflowY: 'auto' }}>
              <table className="rev-table">
                <thead>
                  <tr>
                    <th>แผ่นงาน (Sheet)</th>
                    <th>แถวที่</th>
                    <th>รายการ Input</th>
                    <th>รายละเอียดค่าที่อ่านได้</th>
                    <th>สถานะ</th>
                  </tr>
                </thead>
                <tbody>
                  {dryRunResult.previewRows.map((r: any, idx: number) => (
                    <tr key={idx}>
                      <td style={{ fontWeight: 700 }}>{r.sheet}</td>
                      <td>{r.rowNo}</td>
                      <td style={{ fontWeight: 600 }}>{r.title}</td>
                      <td>{r.detail}</td>
                      <td>
                        {r.status === 'VALID' ? (
                          <span className="badge badge-ok">✓ VALID</span>
                        ) : (
                          <span className="badge badge-err">⚠ {r.status}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// 5. VERSIONS & APPROVAL WORKFLOW VIEW (/revenue/versions) — PROMPT 7 Task 3
// =============================================================================
export function VersionsWorkflowView() {
  const {
    data,
    canEditEstimates,
    canApproveVersion,
    canEditParameters,
    mutate,
    mutating,
    setSelectedVersionId,
    openNewYearModal,
  } = useRevenueWorkspace();

  if (!data) return null;
  const ver = data.activeVersion;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>
            การจัดการหลายปีงบประมาณ เวอร์ชันงบประมาณ และขั้นตอนการอนุมัติ
          </h1>
          <div style={{ fontSize: 13, color: '#475569' }}>
            รองรับการจัดทำประมาณการรายรับหลายปีงบประมาณ (พ.ศ.) และหลายครั้งต่อปี (ครั้งที่ 1 / ครั้งที่ 2) พร้อมเปรียบเทียบข้ามปี
          </div>
        </div>
        <button className="btn btn-primary" onClick={openNewYearModal}>
          ➕ เพิ่มประมาณการปีงบประมาณใหม่
        </button>
      </div>

      {/* Current Version Action Panel */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">
            เวอร์ชันที่เลือกอยู่: ปีงบ {ver.be_year} — ครั้งที่ {ver.version_no}: {ver.label}
          </h2>
          <span className="badge badge-info">สถานะปัจจุบัน: {ver.status.toUpperCase()}</span>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {ver.status === 'draft' && (
            <button
              className="btn btn-primary"
              disabled={!canEditEstimates || mutating}
              onClick={() =>
                mutate(
                  'transition_version_status',
                  { versionId: ver.id, targetStatus: 'submitted' },
                  'ส่งเวอร์ชันประมาณการให้ผู้บริหารอนุมัติ (Submitted) เรียบร้อยแล้ว'
                )
              }
            >
              📤 1. ส่งขออนุมัติ (Submit for Approval)
            </button>
          )}

          {(ver.status === 'submitted' || ver.status === 'draft') && (
            <button
              className="btn btn-success"
              disabled={!canApproveVersion || mutating}
              onClick={() =>
                mutate(
                  'transition_version_status',
                  { versionId: ver.id, targetStatus: 'approved' },
                  'อนุมัติเวอร์ชันและบันทึก Frozen Snapshot เรียบร้อยแล้ว (ล็อกการแก้ไข)'
                )
              }
            >
              ✅ 2. อนุมัติเวอร์ชัน (Approve & Freeze Snapshot — เฉพาะ EXECUTIVE / SUPER_ADMIN)
            </button>
          )}

          {ver.status === 'submitted' && (
            <button
              className="btn btn-secondary"
              disabled={!canApproveVersion || mutating}
              onClick={() =>
                mutate(
                  'transition_version_status',
                  { versionId: ver.id, targetStatus: 'draft' },
                  'ส่งกลับให้เจ้าหน้าที่แผนแก้ไข (Return to Draft) เรียบร้อยแล้ว'
                )
              }
            >
              ↩ ส่งกลับไปแก้ไข (Return to Draft)
            </button>
          )}

          {(ver.status === 'approved' || ver.status === 'locked') && canEditParameters && (
            <button
              className="btn btn-danger"
              disabled={mutating}
              onClick={() =>
                mutate(
                  'transition_version_status',
                  { versionId: ver.id, targetStatus: 'draft' },
                  'ปลดล็อกเวอร์ชันเป็น Draft โดย SUPER_ADMIN เรียบร้อยแล้ว'
                )
              }
            >
              🔓 ปลดล็อกเวอร์ชัน (Unlock — เฉพาะ SUPER_ADMIN)
            </button>
          )}

          <button
            className="btn btn-secondary"
            disabled={mutating}
            onClick={() =>
              mutate(
                'create_next_version',
                { sourceVersionId: ver.id },
                'คัดลอกและสร้างเวอร์ชันใหม่ (ครั้งที่ถัดไป) เรียบร้อยแล้ว'
              )
            }
          >
            📑 คัดลอกเป็นเวอร์ชันใหม่ (สร้าง "ครั้งที่ {ver.version_no + 1}")
          </button>
        </div>
      </div>

      {/* Multi-Year Summary Comparison Table */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">
            ตารางเปรียบเทียบประมาณการรายรับทุกปีงบประมาณและทุกเวอร์ชันในระบบ ({(data.multiYearSummaries || []).length} เวอร์ชัน)
          </h2>
          <span className="badge badge-info">
            มีทั้งหมด {(data.fiscalYears || []).length} ปีงบประมาณ
          </span>
        </div>
        <div className="table-wrap">
          <table className="rev-table">
            <thead>
              <tr>
                <th>ปีงบประมาณ</th>
                <th>ครั้งที่</th>
                <th>ชื่อเวอร์ชัน</th>
                <th>สถานะ</th>
                <th className="num">1. ค่าธรรมเนียม (ก่อนหัก)</th>
                <th className="num">2. บริการวิชาการ (ก่อนหัก)</th>
                <th className="num">3. งบวิจัยรวม</th>
                <th className="num">4. ค่าเช่ารวม</th>
                <th className="num">5. เหลือจ่ายยกมา</th>
                <th>เลือกเปิดใช้งาน</th>
              </tr>
            </thead>
            <tbody>
              {(data.multiYearSummaries || []).map((s: any) => (
                <tr
                  key={s.versionId}
                  style={
                    s.versionId === ver.id
                      ? { backgroundColor: '#faf5ff', fontWeight: 700 }
                      : undefined
                  }
                >
                  <td style={{ fontWeight: 800, color: '#3b1c57' }}>พ.ศ. {s.beYear}</td>
                  <td>ครั้งที่ {s.versionNo}</td>
                  <td>{s.label}</td>
                  <td>
                    <span
                      className={`badge ${
                        s.status === 'approved'
                          ? 'badge-ok'
                          : s.status === 'draft'
                          ? 'badge-warn'
                          : 'badge-info'
                      }`}
                    >
                      {s.status.toUpperCase()}
                    </span>
                  </td>
                  <td className="num">
                    {fmtMoney(s.tuitionGross)} ({s.tuitionCount} แถว)
                  </td>
                  <td className="num">
                    {fmtMoney(s.serviceGross)} ({s.serviceCount} โครงการ)
                  </td>
                  <td className="num">
                    {fmtMoney(s.researchBudget)} ({s.researchCount} โครงการ)
                  </td>
                  <td className="num">
                    {fmtMoney(s.rentalGross)} ({s.rentalCount} รายการ)
                  </td>
                  <td className="num">{fmtMoney(s.carryoverAmount)}</td>
                  <td>
                    {s.versionId === ver.id ? (
                      <span className="badge badge-ok">✓ กำลังเปิดอยู่</span>
                    ) : (
                      <button
                        className="btn btn-secondary"
                        style={{ padding: '4px 10px', fontSize: 12 }}
                        onClick={() => setSelectedVersionId(s.versionId)}
                      >
                        สลับไปปี {s.beYear} (ครั้งที่ {s.versionNo})
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* All Versions Table */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">รายการเวอร์ชันทั้งหมดในระบบ</h2>
        </div>
        <div className="table-wrap">
          <table className="rev-table">
            <thead>
              <tr>
                <th>ปีงบประมาณ</th>
                <th>ครั้งที่</th>
                <th>ชื่อเวอร์ชัน</th>
                <th>สถานะ</th>
                <th>อนุมัติเมื่อ</th>
                <th>สร้างเมื่อ</th>
                <th>เลือกใช้งาน</th>
              </tr>
            </thead>
            <tbody>
              {data.versions.map((v: any) => (
                <tr
                  key={v.id}
                  style={v.id === ver.id ? { backgroundColor: '#faf5ff', fontWeight: 700 } : undefined}
                >
                  <td>พ.ศ. {v.be_year}</td>
                  <td>ครั้งที่ {v.version_no}</td>
                  <td>{v.label}</td>
                  <td>
                    <span
                      className={`badge ${
                        v.status === 'approved'
                          ? 'badge-ok'
                          : v.status === 'draft'
                          ? 'badge-warn'
                          : 'badge-info'
                      }`}
                    >
                      {v.status.toUpperCase()}
                    </span>
                  </td>
                  <td>{v.approved_at ? new Date(v.approved_at).toLocaleString('th-TH') : '-'}</td>
                  <td>{new Date(v.created_at).toLocaleString('th-TH')}</td>
                  <td>
                    {v.id === ver.id ? (
                      <span className="badge badge-ok">✓ กำลังเปิดอยู่</span>
                    ) : (
                      <button
                        className="btn btn-secondary"
                        style={{ padding: '4px 10px', fontSize: 12 }}
                        onClick={() => setSelectedVersionId(v.id)}
                      >
                        สลับไปเวอร์ชันนี้
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// 6. AUDIT LOG VIEW (/revenue/audit) — PROMPT 7 Task 5
// =============================================================================
export function AuditLogView() {
  const { data } = useRevenueWorkspace();
  const [tableFilter, setTableFilter] = useState<string>('ALL');
  const [actionFilter, setActionFilter] = useState<string>('ALL');
  const [selectedLog, setSelectedLog] = useState<any | null>(null);

  if (!data) return null;

  const tables = Array.from(new Set((data.auditLogs || []).map((l: any) => l.table_name))) as string[];
  const filtered = (data.auditLogs || []).filter((l: any) => {
    if (tableFilter !== 'ALL' && l.table_name !== tableFilter) return false;
    if (actionFilter !== 'ALL' && l.action !== actionFilter) return false;
    return true;
  });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>
            ประวัติการแก้ไขข้อมูลการเงิน (Financial Audit Logs)
          </h1>
          <div style={{ fontSize: 13, color: '#475569' }}>
            Constitution ข้อ 5: บันทึกทุกการ INSERT, UPDATE, SOFT_DELETE, APPROVE, UNLOCK พร้อมค่าเก่า ค่าใหม่ ผู้ใช้ และเวลาที่ระดับ Database Trigger
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select
            className="select-ctrl"
            value={tableFilter}
            onChange={(e) => setTableFilter(e.target.value)}
          >
            <option value="ALL">ทุกตารางข้อมูล (All Tables)</option>
            {tables.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          <select
            className="select-ctrl"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
          >
            <option value="ALL">ทุกการกระทำ (All Actions)</option>
            <option value="INSERT">INSERT</option>
            <option value="UPDATE">UPDATE</option>
            <option value="SOFT_DELETE">SOFT_DELETE</option>
            <option value="APPROVE">APPROVE</option>
            <option value="UNLOCK">UNLOCK</option>
          </select>
        </div>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table className="rev-table">
            <thead>
              <tr>
                <th>วัน-เวลา</th>
                <th>การกระทำ (Action)</th>
                <th>ตาราง (Table)</th>
                <th>ผู้ดำเนินการ (User & Role)</th>
                <th>รหัสแถว (Record ID)</th>
                <th>ดูค่าเก่า / ค่าใหม่</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((log: any) => (
                <tr key={log.id}>
                  <td style={{ whiteSpace: 'nowrap', fontSize: 12.5 }}>
                    {new Date(log.performed_at).toLocaleString('th-TH')}
                  </td>
                  <td>
                    <span
                      className={`badge ${
                        log.action === 'APPROVE' || log.action === 'INSERT'
                          ? 'badge-ok'
                          : log.action === 'SOFT_DELETE' || log.action === 'UNLOCK'
                          ? 'badge-err'
                          : 'badge-info'
                      }`}
                    >
                      {log.action}
                    </span>
                  </td>
                  <td style={{ fontFamily: 'monospace', fontWeight: 700 }}>{log.table_name}</td>
                  <td>
                    {log.performer_name || 'System'} ({log.performer_role || 'SUPER_ADMIN'})
                  </td>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>
                    {log.record_id.slice(0, 8)}...
                  </td>
                  <td>
                    <button
                      className="btn btn-secondary"
                      style={{ padding: '3px 9px', fontSize: 12 }}
                      onClick={() => setSelectedLog(log)}
                    >
                      🔍 ดู JSON Diff
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selectedLog && (
        <div className="modal-backdrop" onClick={() => setSelectedLog(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3 style={{ margin: 0 }}>
                  รายละเอียด Audit Log: [{selectedLog.action}] ตาราง {selectedLog.table_name}
                </h3>
                <div style={{ fontSize: 12, color: '#64748b' }}>
                  เวลา: {new Date(selectedLog.performed_at).toLocaleString('th-TH')} | โดย:{' '}
                  {selectedLog.performer_name} ({selectedLog.performer_role})
                </div>
              </div>
              <button className="btn btn-secondary" onClick={() => setSelectedLog(null)}>
                ปิด ✕
              </button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 700, marginBottom: 4, color: '#b91c1c' }}>
                    ค่าเก่า (old_data):
                  </div>
                  <pre
                    style={{
                      background: '#f8fafc',
                      padding: 12,
                      borderRadius: 8,
                      border: '1px solid #cbd5e1',
                      fontSize: 12,
                      overflowX: 'auto',
                    }}
                  >
                    {selectedLog.old_data
                      ? JSON.stringify(selectedLog.old_data, null, 2)
                      : '(ไม่มี - เป็นการสร้างแถวใหม่)'}
                  </pre>
                </div>
                <div>
                  <div style={{ fontWeight: 700, marginBottom: 4, color: '#15803d' }}>
                    ค่าใหม่ (new_data):
                  </div>
                  <pre
                    style={{
                      background: '#f0fdf4',
                      padding: 12,
                      borderRadius: 8,
                      border: '1px solid #86efac',
                      fontSize: 12,
                      overflowX: 'auto',
                    }}
                  >
                    {selectedLog.new_data
                      ? JSON.stringify(selectedLog.new_data, null, 2)
                      : '(ไม่มี)'}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
