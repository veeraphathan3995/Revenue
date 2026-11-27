'use client';

import React, { useState, useEffect } from 'react';
import {
  useRevenueWorkspace,
  fmtMoney,
  fmtPct,
  THAI_MONTH_NAMES,
} from './WorkspaceContext';

// =============================================================================
// 1. SETTINGS & MASTER DATA VIEW (/revenue/settings) — PROMPT 3
// =============================================================================
export function SettingsView() {
  const {
    data,
    canEditParameters,
    canEditEstimates,
    mutate,
    mutating,
    openNewYearModal,
  } = useRevenueWorkspace();

  const [distDraft, setDistDraft] = useState<
    Array<{ monthSeq: number; semester2Pct: number; semester1Pct: number }>
  >([]);

  useEffect(() => {
    if (data?.monthDistribution) {
      setDistDraft(
        data.monthDistribution.map((d: any) => ({
          monthSeq: d.monthSeq,
          semester2Pct: Number((Number(d.semester2Pct) * 100).toFixed(2)),
          semester1Pct: Number((Number(d.semester1Pct) * 100).toFixed(2)),
        }))
      );
    }
  }, [data?.monthDistribution]);

  if (!data) return null;

  const sumSem2 = distDraft.reduce((acc, d) => acc + d.semester2Pct, 0);
  const sumSem1 = distDraft.reduce((acc, d) => acc + d.semester1Pct, 0);
  const sem2Ok = Math.abs(sumSem2 - 100) < 0.05;
  const sem1Ok = Math.abs(sumSem1 - 100) < 0.05;

  const saveMonthDist = async () => {
    await mutate(
      'update_month_distribution',
      {
        versionId: data.activeVersion.id,
        items: distDraft.map((d) => ({
          monthSeq: d.monthSeq,
          semester2Pct: Number((d.semester2Pct / 100).toFixed(6)),
          semester1Pct: Number((d.semester1Pct / 100).toFixed(6)),
        })),
      },
      'บันทึกตารางสัดส่วนการรับเงินรายเดือน (ภาค 2 และ ภาค 1) เรียบร้อยแล้ว'
    );
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>
            ตั้งค่าพื้นฐาน พารามิเตอร์ และข้อมูลหลัก — ปีงบประมาณ พ.ศ. {data.activeVersion.be_year}
          </h1>
          <div style={{ fontSize: 13, color: '#475569' }}>
            Constitution ข้อ 2: ไม่ hard-code กฎธุรกิจ อัตราหักทุกตัวเก็บในตารางพารามิเตอร์ที่ผูกปีงบประมาณและบันทึก Audit Log ทุกครั้งที่แก้ไข
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" onClick={openNewYearModal}>
            ➕ สร้างปีงบประมาณใหม่ / คัดลอกจากปีก่อน
          </button>
          <button
            className="btn btn-secondary"
            disabled={mutating}
            onClick={() =>
              mutate(
                'create_next_version',
                { sourceVersionId: data.activeVersion.id },
                'สร้างเวอร์ชันใหม่ (ครั้งที่ถัดไป) เรียบร้อยแล้ว'
              )
            }
          >
            📑 สร้างเวอร์ชัน "ครั้งที่ {data.activeVersion.version_no + 1}"
          </button>
        </div>
      </div>

      {/* 1. Business Parameters Table */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">1. พารามิเตอร์และอัตราหักค่าใช้จ่าย (แก้ไขได้เฉพาะ SUPER_ADMIN)</h2>
          {canEditParameters ? (
            <span className="badge badge-ok">✓ สิทธิ์ SUPER_ADMIN: แก้ไขได้</span>
          ) : (
            <span className="badge badge-warn">🔒 สิทธิ์ปัจจุบัน ({data.activeUser.role}): อ่านอย่างเดียว</span>
          )}
        </div>
        <div className="table-wrap">
          <table className="rev-table">
            <thead>
              <tr>
                <th>รหัสพารามิเตอร์ (Key)</th>
                <th>ค่าตัวเลข (Numeric)</th>
                <th>ค่าข้อความ (Text)</th>
                <th>คำอธิบาย / หมายเหตุ</th>
                <th>อัปเดตล่าสุด</th>
              </tr>
            </thead>
            <tbody>
              {data.parameters.map((p: any) => (
                <tr key={p.id}>
                  <td style={{ fontWeight: 700, fontFamily: 'monospace', color: '#3b1c57' }}>
                    {p.key}
                  </td>
                  <td style={{ width: 150 }}>
                    {p.value_numeric !== null ? (
                      <input
                        type="number"
                        step="0.01"
                        className="excel-input num"
                        disabled={!canEditParameters || mutating}
                        defaultValue={p.value_numeric}
                        onBlur={(e) => {
                          const newVal = Number(e.target.value);
                          if (newVal !== p.value_numeric) {
                            mutate(
                              'update_parameter',
                              { id: p.id, valueNumeric: newVal, valueText: p.value_text },
                              `อัปเดตพารามิเตอร์ ${p.key} = ${newVal} สำเร็จ`
                            );
                          }
                        }}
                      />
                    ) : (
                      <span style={{ color: '#94a3b8' }}>-</span>
                    )}
                  </td>
                  <td style={{ width: 220 }}>
                    {p.value_text !== null ? (
                      <input
                        type="text"
                        className="excel-input"
                        disabled={!canEditParameters || mutating}
                        defaultValue={p.value_text}
                        onBlur={(e) => {
                          const newTxt = e.target.value.trim();
                          if (newTxt !== p.value_text) {
                            mutate(
                              'update_parameter',
                              { id: p.id, valueNumeric: p.value_numeric, valueText: newTxt },
                              `อัปเดตพารามิเตอร์ ${p.key} = "${newTxt}" สำเร็จ`
                            );
                          }
                        }}
                      />
                    ) : (
                      <span style={{ color: '#94a3b8' }}>-</span>
                    )}
                  </td>
                  <td>{p.note}</td>
                  <td style={{ fontSize: 12, color: '#64748b' }}>
                    {new Date(p.updated_at).toLocaleString('th-TH')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 2. Month Distribution (Semester 2 & Semester 1) */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">
            2. สัดส่วนการรับเงินค่าธรรมเนียมการศึกษารายเดือน (ผลรวมแต่ละภาคเรียนต้องเท่ากับ 100%)
          </h2>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {sem2Ok && sem1Ok ? (
              <span className="badge badge-ok">✓ ทั้ง 2 ภาคเรียนรวมครบ 100%</span>
            ) : (
              <span className="badge badge-err">⚠ ผลรวมต้องเท่ากับ 100% จึงจะบันทึกได้</span>
            )}
            <button
              className="btn btn-primary"
              disabled={!canEditEstimates || !sem2Ok || !sem1Ok || mutating}
              onClick={saveMonthDist}
            >
              💾 บันทึกสัดส่วนรายเดือน
            </button>
          </div>
        </div>
        <div className="table-wrap">
          <table className="rev-table">
            <thead>
              <tr>
                <th>ลำดับเดือน</th>
                <th>เดือน</th>
                <th>พ.ศ.</th>
                <th className="num">ภาคเรียนที่ 2/70 (%)</th>
                <th className="num">ภาคเรียนที่ 1/71 (%)</th>
              </tr>
            </thead>
            <tbody>
              {distDraft.map((d, idx) => {
                const monthBe = d.monthSeq <= 3 ? data.activeVersion.be_year - 1 : data.activeVersion.be_year;
                return (
                  <tr key={d.monthSeq}>
                    <td>{d.monthSeq}</td>
                    <td style={{ fontWeight: 700 }}>{THAI_MONTH_NAMES[idx]}</td>
                    <td>{monthBe}</td>
                    <td className="num" style={{ width: 180 }}>
                      <input
                        type="number"
                        step="1"
                        min="0"
                        max="100"
                        className="excel-input num"
                        disabled={!canEditEstimates}
                        value={d.semester2Pct}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          setDistDraft((prev) =>
                            prev.map((item) =>
                              item.monthSeq === d.monthSeq ? { ...item, semester2Pct: v } : item
                            )
                          );
                        }}
                      />
                    </td>
                    <td className="num" style={{ width: 180 }}>
                      <input
                        type="number"
                        step="1"
                        min="0"
                        max="100"
                        className="excel-input num"
                        disabled={!canEditEstimates}
                        value={d.semester1Pct}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          setDistDraft((prev) =>
                            prev.map((item) =>
                              item.monthSeq === d.monthSeq ? { ...item, semester1Pct: v } : item
                            )
                          );
                        }}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="total-row">
                <td colSpan={3}>รวมทั้งสิ้น</td>
                <td className="num">{sumSem2.toFixed(2)}%</td>
                <td className="num">{sumSem1.toFixed(2)}%</td>
              </tr>
              <tr>
                <td colSpan={3} style={{ fontWeight: 700 }}>
                  ตรวจสอบผลรวม (ต้อง = 100%)
                </td>
                <td className="num">
                  {sem2Ok ? (
                    <span className="badge badge-ok">✓ 100%</span>
                  ) : (
                    <span className="badge badge-err">⚠ ≠100%</span>
                  )}
                </td>
                <td className="num">
                  {sem1Ok ? (
                    <span className="badge badge-ok">✓ 100%</span>
                  ) : (
                    <span className="badge badge-err">⚠ ≠100%</span>
                  )}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* 3. Fee Schedules (Bachelor & Master) */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">
            3. อัตราหักค่าใช้จ่ายค่าธรรมเนียมการศึกษาต่อคนต่อภาคเรียน (Fee Schedules)
          </h2>
        </div>
        <div className="table-wrap">
          <table className="rev-table">
            <thead>
              <tr>
                <th>ระดับการศึกษา</th>
                <th className="num">ค่าบำรุงห้องสมุด</th>
                <th className="num">ค่าธรรมเนียม IT</th>
                <th className="num">ค่าบำรุงสุขภาพ</th>
                <th className="num">ค่าลงทะเบียนแรกเข้า (รหัส 71)</th>
                <th className="num">ยอดหักรวมต่อคน/ภาค</th>
                <th className="num">% มช. คืนค่าห้องสมุดให้คณะ</th>
              </tr>
            </thead>
            <tbody>
              {data.feeSchedules.map((fs: any) => (
                <tr key={fs.id}>
                  <td style={{ fontWeight: 700 }}>
                    {fs.level === 'bachelor' ? 'ปริญญาตรี (Bachelor)' : 'ปริญญาโท (Master)'}
                  </td>
                  <td className="num">{fmtMoney(fs.libraryFee)}</td>
                  <td className="num">{fmtMoney(fs.itFee)}</td>
                  <td className="num">{fmtMoney(fs.healthFee)}</td>
                  <td className="num">{fmtMoney(fs.registrationFee)}</td>
                  <td className="num" style={{ fontWeight: 700 }}>
                    {fmtMoney(fs.totalDeductionPerHead)}
                  </td>
                  <td className="num" style={{ color: '#15803d', fontWeight: 700 }}>
                    {fmtPct(fs.libraryRefundPct, 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. Rounding Rules Policy Table */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">4. ตารางนโยบายการปัดเศษ (Rounding Rules)</h2>
        </div>
        <div className="table-wrap">
          <table className="rev-table">
            <thead>
              <tr>
                <th>ขอบเขตการปัดเศษ (Scope)</th>
                <th>โหมด (Mode)</th>
                <th className="num">หลักทศนิยม / หลักพัน (Digits)</th>
              </tr>
            </thead>
            <tbody>
              {data.roundingRules.map((r: any) => (
                <tr key={r.id}>
                  <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{r.scope}</td>
                  <td>
                    <span className="badge badge-info">{r.mode.toUpperCase()}</span>
                  </td>
                  <td className="num">
                    {r.digits} ({r.digits === -3 ? 'หลักพัน' : r.digits === -2 ? 'หลักร้อย' : 'เต็มหน่วย'})
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 5. Database Maintenance & Clear Section */}
      <div className="card" style={{ border: '1px solid #fed7aa', backgroundColor: '#fffaf5' }}>
        <div className="card-header">
          <h2 className="card-title" style={{ color: '#9a3412' }}>
            5. การจัดการและเคลียร์ฐานข้อมูล (Database Management)
          </h2>
        </div>
        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <p style={{ margin: 0, fontSize: '14px', color: '#7c2d12' }}>
            คุณสามารถเคลียร์ข้อมูลรายการประมาณการและรายรับจริงทั้งหมดในฐานข้อมูลเพื่อเริ่มต้นปีงบประมาณว่างเปล่า (ยอด 0.00 บาท)
            หรือโหลดข้อมูลตัวอย่างจากไฟล์ Excel ต้นแบบ 2571 เพื่อทดสอบระบบได้
          </p>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn"
              style={{ backgroundColor: '#dc2626', color: '#fff', border: 'none' }}
              disabled={mutating || !canEditParameters}
              onClick={async () => {
                if (window.confirm('⚠️ คำเตือน: คุณต้องการล้างข้อมูลในฐานข้อมูลทั้งหมดใช่หรือไม่?\n\n- รายการประมาณการทุกประเภท (ค่าธรรมเนียม, บริการวิชาการ, ค่าเช่า, วิจัย, รายได้อื่น, เงินเหลือจ่าย) จะถูกเคลียร์ทั้งหมด\n- ข้อมูลจริง (Actuals) และ Audit Log จะถูกล้าง\n- ระบบจะตั้งต้นปีงบประมาณ 2571 ฉบับร่างที่มียอดเป็น 0.00 บาท')) {
                  await mutate('clear_database', { beYear: data.activeVersion?.be_year || 2571 }, 'เคลียร์ข้อมูลในฐานข้อมูลทั้งหมดเรียบร้อยแล้ว ยอดรวมทุกประเภทเป็น 0.00 บาท');
                }
              }}
            >
              🗑️ เคลียร์ข้อมูลในฐานข้อมูลทั้งหมด (Reset to 0.00 บาท)
            </button>
            <button
              type="button"
              className="btn btn-outline"
              disabled={mutating || !canEditParameters}
              onClick={async () => {
                if (window.confirm('คุณต้องการโหลดข้อมูลตัวอย่างจาก Excel 2571 ใช่หรือไม่? ข้อมูลปัจจุบันจะถูกแทนที่ด้วยชุดข้อมูลต้นแบบ')) {
                  await mutate('load_sample_data', {}, 'โหลดข้อมูลตัวอย่างจาก Excel 2571 สำเร็จ');
                }
              }}
            >
              📥 โหลดข้อมูลตัวอย่างต้นแบบ (Excel 2571)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// 2. TUITION GRID VIEW (/revenue/tuition) — PROMPT 4 Task 1
// =============================================================================
export function TuitionGridView() {
  const { data, canEditEstimates, mutate, mutating } = useRevenueWorkspace();
  const [filterText, setFilterText] = useState('');
  const [lastUndo, setLastUndo] = useState<any | null>(null);
  const [newRow, setNewRow] = useState({
    programId: '',
    cohortCode: '71',
    lineType: 'regular' as 'regular' | 'gen_ed_in' | 'gen_ed_out',
    headcountSem2: 0,
    headcountSem1: 50,
    feePerHead: 18000,
  });

  useEffect(() => {
    if (data?.programs?.[0] && !newRow.programId) {
      setNewRow((prev) => ({ ...prev, programId: data.programs[0].id }));
    }
  }, [data?.programs, newRow.programId]);

  if (!data) return null;

  const { tuition } = data.calc;
  const filteredLines = tuition.lines.filter(
    (l: any) =>
      l.programName.toLowerCase().includes(filterText.toLowerCase()) ||
      (l.cohortCode || '').includes(filterText)
  );

  const handleUpdateLine = async (line: any, field: string, value: number | string) => {
    setLastUndo({
      id: line.id,
      versionId: data.activeVersion.id,
      programId: line.programId,
      cohortCode: line.cohortCode,
      lineType: line.lineType,
      headcountSem2: line.headcountSem2,
      headcountSem1: line.headcountSem1,
      feePerHead: line.feePerHead,
    });

    await mutate(
      'upsert_tuition_line',
      {
        id: line.id,
        versionId: data.activeVersion.id,
        programId: line.programId,
        cohortCode: field === 'cohortCode' ? String(value) || null : line.cohortCode,
        lineType: line.lineType,
        headcountSem2: field === 'headcountSem2' ? Number(value) : line.headcountSem2,
        headcountSem1: field === 'headcountSem1' ? Number(value) : line.headcountSem1,
        feePerHead: field === 'feePerHead' ? Number(value) : line.feePerHead,
      },
      `อัปเดตแถว ${line.programName} (รุ่น ${line.cohortCode || '-'}) เรียบร้อยแล้ว`
    );
  };

  const handleAddLine = async () => {
    if (!newRow.programId) return;
    await mutate(
      'upsert_tuition_line',
      {
        versionId: data.activeVersion.id,
        ...newRow,
      },
      'เพิ่มแถวประมาณการค่าธรรมเนียมการศึกษาเรียบร้อยแล้ว'
    );
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>
            1) ประมาณการรายรับจากค่าธรรมเนียมการศึกษา (2 ภาคเรียน/ปีงบประมาณ)
          </h1>
          <div style={{ fontSize: 13, color: '#475569' }}>
            ช่องสีเหลือง = ช่องกรอกข้อมูล (นศ.ภาคเรียนที่ 2, นศ.ภาคเรียนที่ 1, ค่าธรรมเนียม/คน/ภาค) • ช่องสีเทา = คำนวณอัตโนมัติจาก Calculation Engine
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="text"
            placeholder="🔍 กรองชื่อหลักสูตร หรือรหัสรุ่น..."
            className="input-ctrl"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
          />
          {lastUndo && canEditEstimates && (
            <button
              className="btn btn-secondary"
              onClick={async () => {
                await mutate('upsert_tuition_line', lastUndo, 'ย้อนกลับค่าเดิม (Undo) สำเร็จ');
                setLastUndo(null);
              }}
            >
              ↩ Undo แก้ไขล่าสุด
            </button>
          )}
        </div>
      </div>

      {/* Add new row bar */}
      {canEditEstimates && (
        <div className="card" style={{ backgroundColor: '#faf5ff' }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>➕ เพิ่มแถวหลักสูตร / กระบวนวิชาศึกษาทั่วไป</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>หลักสูตร / กระบวนวิชา</label>
              <select
                className="select-ctrl"
                value={newRow.programId}
                onChange={(e) => setNewRow((p) => ({ ...p, programId: e.target.value }))}
              >
                {data.programs.map((prog: any) => (
                  <option key={prog.id} value={prog.id}>
                    [{prog.report_group}] {prog.name_th}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>รหัสนักศึกษา</label>
              <input
                type="text"
                placeholder="รหัสนักศึกษา (เช่น 71)"
                className="input-ctrl"
                style={{ width: 110 }}
                value={newRow.cohortCode}
                onChange={(e) => setNewRow((p) => ({ ...p, cohortCode: e.target.value }))}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>ประเภท</label>
              <select
                className="select-ctrl"
                value={newRow.lineType}
                onChange={(e) =>
                  setNewRow((p) => ({
                    ...p,
                    lineType: e.target.value as any,
                    feePerHead: e.target.value === 'gen_ed_out' ? -540 : e.target.value === 'gen_ed_in' ? 540 : 18000,
                  }))
                }
              >
                <option value="regular">หลักสูตรปกติ (Regular)</option>
                <option value="gen_ed_in">วิชาศึกษาทั่วไป Pay-in (+)</option>
                <option value="gen_ed_out">วิชาศึกษานอกคณะ Pay-out (-)</option>
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>ภาคเรียนที่ 2</label>
              <input
                type="number"
                placeholder="ภาคเรียนที่ 2"
                className="input-ctrl num"
                style={{ width: 100 }}
                value={newRow.headcountSem2}
                onChange={(e) => setNewRow((p) => ({ ...p, headcountSem2: Number(e.target.value) }))}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>ภาคเรียนที่ 1</label>
              <input
                type="number"
                placeholder="ภาคเรียนที่ 1"
                className="input-ctrl num"
                style={{ width: 100 }}
                value={newRow.headcountSem1}
                onChange={(e) => setNewRow((p) => ({ ...p, headcountSem1: Number(e.target.value) }))}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>ค่าธรรมเนียมการศึกษา</label>
              <input
                type="number"
                placeholder="ค่าธรรมเนียมการศึกษา"
                className="input-ctrl num"
                style={{ width: 140 }}
                value={newRow.feePerHead}
                onChange={(e) => setNewRow((p) => ({ ...p, feePerHead: Number(e.target.value) }))}
              />
            </div>
            <button className="btn btn-primary" disabled={mutating} onClick={handleAddLine}>
              ➕ เพิ่มแถว
            </button>
          </div>
        </div>
      )}

      {/* Main Tuition Grid */}
      <div className="card">
        <div className="table-wrap">
          <table className="rev-table">
            <thead>
              <tr>
                <th>#</th>
                <th>หลักสูตร / กระบวนวิชา</th>
                <th>รหัส นศ.</th>
                <th>ระดับ</th>
                <th className="num">นศ.ภาคเรียนที่ 2</th>
                <th className="num">นศ.ภาคเรียนที่ 1</th>
                <th className="num">ค่าธรรมเนียม/คน</th>
                <th className="num">ห้องสมุด</th>
                <th className="num">IT</th>
                <th className="num">สุขภาพ</th>
                <th className="num">ลงทะเบียน(71)</th>
                <th className="num">พัฒนามหาวิทยาลัย</th>
                <th className="num">รวมหักต่อหัว</th>
                <th className="num">ก่อนหักรวมทั้งปี</th>
                <th className="num">หัก มช. 10%</th>
                <th className="num">คืนห้องสมุด 60%</th>
                <th className="num">รายรับสุทธิทั้งปี</th>
                {canEditEstimates && <th>ลบ</th>}
              </tr>
            </thead>
            <tbody>
              {filteredLines.map((l: any, idx: number) => (
                <tr key={l.id}>
                  <td>{idx + 1}</td>
                  <td style={{ fontWeight: 600 }}>{l.programName}</td>
                  <td style={{ textAlign: 'center', fontWeight: 700 }}>{l.cohortCode || '-'}</td>
                  <td>{l.level === 'master' ? 'ปริญญาโท' : 'ปริญญาตรี'}</td>
                  <td className="num" style={{ width: 95 }}>
                    <input
                      type="number"
                      min="0"
                      className="excel-input num"
                      disabled={!canEditEstimates}
                      defaultValue={l.headcountSem2}
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (v !== l.headcountSem2) handleUpdateLine(l, 'headcountSem2', v);
                      }}
                    />
                  </td>
                  <td className="num" style={{ width: 95 }}>
                    <input
                      type="number"
                      min="0"
                      className="excel-input num"
                      disabled={!canEditEstimates}
                      defaultValue={l.headcountSem1}
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (v !== l.headcountSem1) handleUpdateLine(l, 'headcountSem1', v);
                      }}
                    />
                  </td>
                  <td className="num" style={{ width: 115 }}>
                    <input
                      type="number"
                      className="excel-input num"
                      disabled={!canEditEstimates}
                      defaultValue={l.feePerHead}
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (v !== l.feePerHead) handleUpdateLine(l, 'feePerHead', v);
                      }}
                    />
                  </td>
                  <td className="num calc-cell">{fmtMoney(l.libraryFeeTotal)}</td>
                  <td className="num calc-cell">{fmtMoney(l.itFeeTotal)}</td>
                  <td className="num calc-cell">{fmtMoney(l.healthFeeTotal)}</td>
                  <td className="num calc-cell">{fmtMoney(l.registrationFeeTotal)}</td>
                  <td className="num calc-cell">{fmtMoney(l.developmentFeeTotal)}</td>
                  <td className="num calc-cell">{fmtMoney(l.deductionBeforeCmu)}</td>
                  <td className="num calc-cell" style={{ fontWeight: 600 }}>
                    {fmtMoney(l.grossYear)}
                  </td>
                  <td className="num calc-cell">{fmtMoney(l.cmuShareYear)}</td>
                  <td className="num calc-cell" style={{ color: '#15803d' }}>
                    {fmtMoney(l.libraryRefundYear)}
                  </td>
                  <td className="num calc-cell" style={{ fontWeight: 800, color: '#0f172a' }}>
                    {fmtMoney(l.netYear)}
                  </td>
                  {canEditEstimates && (
                    <td>
                      <button
                        className="btn btn-danger"
                        style={{ padding: '3px 7px', fontSize: 11 }}
                        onClick={() =>
                          mutate(
                            'soft_delete_row',
                            { table: 'tuition_lines', id: l.id },
                            `ลบแถว ${l.programName} (Soft Delete) เรียบร้อยแล้ว`
                          )
                        }
                      >
                        ลบ
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="total-row">
                <td colSpan={4}>รวมทั้งสิ้น (ก่อนปัดหลักพัน)</td>
                <td className="num">{fmtMoney(tuition.totals.headcountSem2)}</td>
                <td className="num">{fmtMoney(tuition.totals.headcountSem1)}</td>
                <td className="num">-</td>
                <td className="num">{fmtMoney(tuition.totals.libraryFeeTotal)}</td>
                <td className="num">{fmtMoney(tuition.totals.itFeeTotal)}</td>
                <td className="num">{fmtMoney(tuition.totals.healthFeeTotal)}</td>
                <td className="num">{fmtMoney(tuition.totals.registrationFeeTotal)}</td>
                <td className="num">{fmtMoney(tuition.totals.developmentFeeTotal)}</td>
                <td className="num">{fmtMoney(tuition.totals.deductionBeforeCmu)}</td>
                <td className="num">{fmtMoney(tuition.totals.grossYear)}</td>
                <td className="num">{fmtMoney(tuition.totals.cmuShareYear)}</td>
                <td className="num" style={{ color: '#15803d' }}>
                  {fmtMoney(tuition.totals.libraryRefundYear)}
                </td>
                <td className="num">{fmtMoney(tuition.totals.netYearExact)}</td>
                {canEditEstimates && <td />}
              </tr>
              <tr className="total-row" style={{ backgroundColor: '#dcfce7' }}>
                <td colSpan={16}>
                  รายรับสุทธิค่าธรรมเนียมการศึกษาทั้งปี (ปัดลงหลักพันตามเกณฑ์ TRUNC -3 เพื่อนำไปจัดสรรงบ)
                </td>
                <td className="num" style={{ color: '#15803d', fontSize: 15 }}>
                  {fmtMoney(tuition.totals.netYearRounded)}
                </td>
                {canEditEstimates && <td />}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// 3. SERVICE PROJECTS GRID VIEW (/revenue/service) — PROMPT 4 Task 2
// =============================================================================
export function ServiceGridView() {
  const { data, canEditEstimates, mutate, mutating } = useRevenueWorkspace();
  const [newProj, setNewProj] = useState({
    name: '',
    category: 'short_course' as 'short_course' | 'usac' | 'le' | 'school_activity',
    batches: 1,
    attendeesPerBatch: 30,
    feePerHead: 5000,
    applyMgmtDeduction: true,
    monthSeq: 3,
  });

  if (!data) return null;
  const { service } = data.calc;
  const canPropose = canEditEstimates || (data.activeUser.role === 'PROJECT_OWNER' && data.activeVersion.status === 'draft');

  const updateRow = async (row: any, patch: Record<string, any>) => {
    await mutate(
      'upsert_service_project',
      {
        id: row.id,
        versionId: data.activeVersion.id,
        name: row.name,
        partner: row.partner,
        category: row.category,
        batches: row.batches,
        attendeesPerBatch: row.attendeesPerBatch,
        feePerHead: row.feePerHead,
        applyMgmtDeduction: row.applyMgmtDeduction,
        monthSeq: row.monthSeq,
        note: row.note,
        ...patch,
      },
      `อัปเดตโครงการ "${row.name}" เรียบร้อยแล้ว`
    );
  };

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>
          2) ประมาณการรายรับจากการบริการวิชาการ (อบรมระยะสั้น / USAC / LE)
        </h1>
        <div style={{ fontSize: 13, color: '#475569' }}>
          เลือกเปิด/ปิด "หักบริหารจัดการ 40%" รายโครงการได้ • จัดกลุ่มรายงานอัตโนมัติเป็น 1.2.1 อบรมระยะสั้น, 1.2.2 USAC, 1.2.3 LE
        </div>
      </div>

      {canPropose && (
        <div className="card" style={{ backgroundColor: '#f0f9ff' }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>➕ เพิ่มโครงการบริการวิชาการ</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              type="text"
              placeholder="ชื่อโครงการ / หลักสูตรอบรม..."
              className="input-ctrl"
              style={{ minWidth: 260 }}
              value={newProj.name}
              onChange={(e) => setNewProj((p) => ({ ...p, name: e.target.value }))}
            />
            <select
              className="select-ctrl"
              value={newProj.category}
              onChange={(e) => setNewProj((p) => ({ ...p, category: e.target.value as any }))}
            >
              <option value="short_course">1.2.1 อบรมระยะสั้นหารายได้</option>
              <option value="usac">1.2.2 โครงการ USAC</option>
              <option value="le">1.2.3 หลักสูตร LE</option>
              <option value="school_activity">1.2.3 กิจกรรมโรงเรียน</option>
            </select>
            <input
              type="number"
              placeholder="จำนวนรุ่น"
              className="input-ctrl num"
              style={{ width: 90 }}
              value={newProj.batches}
              onChange={(e) => setNewProj((p) => ({ ...p, batches: Number(e.target.value) }))}
            />
            <input
              type="number"
              placeholder="คน/รุ่น"
              className="input-ctrl num"
              style={{ width: 90 }}
              value={newProj.attendeesPerBatch}
              onChange={(e) => setNewProj((p) => ({ ...p, attendeesPerBatch: Number(e.target.value) }))}
            />
            <input
              type="number"
              placeholder="ค่าลงทะเบียน/คน"
              className="input-ctrl num"
              style={{ width: 130 }}
              value={newProj.feePerHead}
              onChange={(e) => setNewProj((p) => ({ ...p, feePerHead: Number(e.target.value) }))}
            />
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 600 }}>
              <input
                type="checkbox"
                checked={newProj.applyMgmtDeduction}
                onChange={(e) => setNewProj((p) => ({ ...p, applyMgmtDeduction: e.target.checked }))}
              />
              หักบริหาร 40%
            </label>
            <select
              className="select-ctrl"
              value={newProj.monthSeq}
              onChange={(e) => setNewProj((p) => ({ ...p, monthSeq: Number(e.target.value) }))}
            >
              {THAI_MONTH_NAMES.map((m, idx) => (
                <option key={m} value={idx + 1}>
                  เดือน {m}
                </option>
              ))}
            </select>
            <button
              className="btn btn-primary"
              disabled={!newProj.name.trim() || mutating}
              onClick={async () => {
                const ok = await mutate('upsert_service_project', {
                  versionId: data.activeVersion.id,
                  ...newProj,
                });
                if (ok) setNewProj((p) => ({ ...p, name: '' }));
              }}
            >
              ➕ เพิ่มโครงการ
            </button>
          </div>
        </div>
      )}

      <div className="card">
        <div className="table-wrap">
          <table className="rev-table">
            <thead>
              <tr>
                <th>#</th>
                <th>โครงการ / หลักสูตรอบรม</th>
                <th>กลุ่มรายงาน</th>
                <th className="num">จำนวนรุ่น</th>
                <th className="num">คน/รุ่น</th>
                <th className="num">ค่าลงทะเบียน/คน</th>
                <th style={{ textAlign: 'center' }}>หักบริหาร 40%?</th>
                <th>เดือนที่รับ</th>
                <th className="num">รายรับรวม (ก่อนหัก)</th>
                <th className="num">หัก 10% (ส่วนกลาง)</th>
                <th className="num">หัก 40% (บริหารจัดการ)</th>
                <th className="num">รายรับสุทธิ</th>
                {canEditEstimates && <th>ลบ</th>}
              </tr>
            </thead>
            <tbody>
              {service.lines.map((l: any, idx: number) => (
                <tr key={l.id}>
                  <td>{idx + 1}</td>
                  <td style={{ fontWeight: 600 }}>{l.name}</td>
                  <td>
                    <select
                      className="excel-input"
                      disabled={!canEditEstimates}
                      value={l.category}
                      onChange={(e) => updateRow(l, { category: e.target.value })}
                    >
                      <option value="short_course">1.2.1 อบรมระยะสั้น</option>
                      <option value="usac">1.2.2 USAC</option>
                      <option value="le">1.2.3 LE</option>
                      <option value="school_activity">1.2.3 โรงเรียน</option>
                    </select>
                  </td>
                  <td className="num" style={{ width: 80 }}>
                    <input
                      type="number"
                      min="0"
                      className="excel-input num"
                      disabled={!canEditEstimates}
                      defaultValue={l.batches}
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (v !== l.batches) updateRow(l, { batches: v });
                      }}
                    />
                  </td>
                  <td className="num" style={{ width: 85 }}>
                    <input
                      type="number"
                      min="0"
                      className="excel-input num"
                      disabled={!canEditEstimates}
                      defaultValue={l.attendeesPerBatch}
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (v !== l.attendeesPerBatch) updateRow(l, { attendeesPerBatch: v });
                      }}
                    />
                  </td>
                  <td className="num" style={{ width: 115 }}>
                    <input
                      type="number"
                      min="0"
                      className="excel-input num"
                      disabled={!canEditEstimates}
                      defaultValue={l.feePerHead}
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (v !== l.feePerHead) updateRow(l, { feePerHead: v });
                      }}
                    />
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      disabled={!canEditEstimates}
                      checked={l.applyMgmtDeduction}
                      onChange={(e) => updateRow(l, { applyMgmtDeduction: e.target.checked })}
                    />
                  </td>
                  <td>
                    <select
                      className="excel-input"
                      disabled={!canEditEstimates}
                      value={l.monthSeq}
                      onChange={(e) => updateRow(l, { monthSeq: Number(e.target.value) })}
                    >
                      {THAI_MONTH_NAMES.map((m, i) => (
                        <option key={m} value={i + 1}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="num calc-cell">{fmtMoney(l.gross)}</td>
                  <td className="num calc-cell">{fmtMoney(l.centralDeduction)}</td>
                  <td className="num calc-cell">{fmtMoney(l.mgmtDeduction)}</td>
                  <td className="num calc-cell" style={{ fontWeight: 700 }}>
                    {fmtMoney(l.net)}
                  </td>
                  {canEditEstimates && (
                    <td>
                      <button
                        className="btn btn-danger"
                        style={{ padding: '3px 7px', fontSize: 11 }}
                        onClick={() =>
                          mutate('soft_delete_row', { table: 'service_projects', id: l.id })
                        }
                      >
                        ลบ
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="total-row">
                <td colSpan={8}>รวมบริการวิชาการ (ก่อนปัดหลักพัน)</td>
                <td className="num">{fmtMoney(service.totals.gross)}</td>
                <td className="num">{fmtMoney(service.totals.centralDeduction)}</td>
                <td className="num">{fmtMoney(service.totals.mgmtDeduction)}</td>
                <td className="num">{fmtMoney(service.totals.netExact)}</td>
                {canEditEstimates && <td />}
              </tr>
              <tr className="total-row" style={{ backgroundColor: '#dcfce7' }}>
                <td colSpan={11}>
                  รายรับสุทธิบริการวิชาการทั้งปี (ปัดลงหลักพัน ROUNDDOWN -3) • แยกกลุ่ม: 1.2.1 ={' '}
                  {fmtMoney(service.byReportCategory.shortCourse_1_2_1)} | 1.2.2 USAC ={' '}
                  {fmtMoney(service.byReportCategory.usac_1_2_2)} | 1.2.3 LE ={' '}
                  {fmtMoney(service.byReportCategory.le_1_2_3)}
                </td>
                <td className="num" style={{ color: '#15803d', fontSize: 15 }}>
                  {fmtMoney(service.totals.netRounded)}
                </td>
                {canEditEstimates && <td />}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// 4. RESEARCH OVERHEAD GRID VIEW (/revenue/research) — PROMPT 4 Task 3
// =============================================================================
export function ResearchGridView() {
  const { data, canEditEstimates, mutate, mutating } = useRevenueWorkspace();
  const [newRes, setNewRes] = useState({
    name: '',
    funder: 'กองทุน ววน.',
    piName: '',
    budget: 1000000,
    overheadRatePct: '6.37',
    monthSeq: 8,
  });

  if (!data) return null;
  const { research } = data.calc;

  const updateRow = async (row: any, patch: Record<string, any>) => {
    await mutate(
      'upsert_research_project',
      {
        id: row.id,
        versionId: data.activeVersion.id,
        name: row.name,
        funder: row.funder,
        piName: row.piName,
        budget: row.budget,
        overheadRateOverride: row.overheadRateOverride,
        monthSeq: row.monthSeq,
        note: row.note,
        ...patch,
      },
      'อัปเดตข้อมูลโครงการวิจัยเรียบร้อยแล้ว'
    );
  };

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>
          3) ประมาณการรายรับจากค่า Overhead งานวิจัย
        </h1>
        <div style={{ fontSize: 13, color: '#475569' }}>
          ช่องอัตรา Overhead เฉพาะโครงการ: หากเว้นว่างจะใช้อัตราเริ่มต้นจากพารามิเตอร์ OH_DEFAULT_RATE • ปัดเศษระดับโครงการตามสูตร ROUND(..., -3)
        </div>
      </div>

      {canEditEstimates && (
        <div className="card" style={{ backgroundColor: '#f0fdf4' }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>➕ เพิ่มโครงการวิจัย</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              type="text"
              placeholder="ชื่อโครงการวิจัย..."
              className="input-ctrl"
              style={{ minWidth: 260 }}
              value={newRes.name}
              onChange={(e) => setNewRes((p) => ({ ...p, name: e.target.value }))}
            />
            <input
              type="text"
              placeholder="แหล่งทุน"
              className="input-ctrl"
              style={{ width: 130 }}
              value={newRes.funder}
              onChange={(e) => setNewRes((p) => ({ ...p, funder: e.target.value }))}
            />
            <input
              type="text"
              placeholder="หัวหน้าโครงการ"
              className="input-ctrl"
              style={{ width: 160 }}
              value={newRes.piName}
              onChange={(e) => setNewRes((p) => ({ ...p, piName: e.target.value }))}
            />
            <input
              type="number"
              placeholder="งบวิจัย (บาท)"
              className="input-ctrl num"
              style={{ width: 130 }}
              value={newRes.budget}
              onChange={(e) => setNewRes((p) => ({ ...p, budget: Number(e.target.value) }))}
            />
            <input
              type="number"
              step="0.01"
              placeholder="% Overhead (เว้นว่าง=ค่าตั้งต้น)"
              className="input-ctrl num"
              style={{ width: 120 }}
              value={newRes.overheadRatePct}
              onChange={(e) => setNewRes((p) => ({ ...p, overheadRatePct: e.target.value }))}
            />
            <select
              className="select-ctrl"
              value={newRes.monthSeq}
              onChange={(e) => setNewRes((p) => ({ ...p, monthSeq: Number(e.target.value) }))}
            >
              {THAI_MONTH_NAMES.map((m, i) => (
                <option key={m} value={i + 1}>
                  เดือน {m}
                </option>
              ))}
            </select>
            <button
              className="btn btn-primary"
              disabled={!newRes.name.trim() || mutating}
              onClick={async () => {
                const rateVal =
                  newRes.overheadRatePct.trim() === ''
                    ? null
                    : Number(newRes.overheadRatePct) / 100;
                const ok = await mutate('upsert_research_project', {
                  versionId: data.activeVersion.id,
                  name: newRes.name,
                  funder: newRes.funder,
                  piName: newRes.piName,
                  budget: newRes.budget,
                  overheadRateOverride: rateVal,
                  monthSeq: newRes.monthSeq,
                });
                if (ok) setNewRes((p) => ({ ...p, name: '' }));
              }}
            >
              ➕ เพิ่มโครงการวิจัย
            </button>
          </div>
        </div>
      )}

      <div className="card">
        <div className="table-wrap">
          <table className="rev-table">
            <thead>
              <tr>
                <th>#</th>
                <th>ชื่อโครงการวิจัย</th>
                <th>แหล่งทุน</th>
                <th>หัวหน้าโครงการ</th>
                <th className="num">งบวิจัย (บาท)</th>
                <th className="num">อัตราเฉพาะโครงการ (%)</th>
                <th>เดือนที่รับ</th>
                <th className="num">ค่า Overhead (ปัดพัน)</th>
                <th className="num">หักส่งส่วนกลาง</th>
                <th className="num">รายรับสุทธิ (บาท)</th>
                {canEditEstimates && <th>ลบ</th>}
              </tr>
            </thead>
            <tbody>
              {research.lines.map((l: any, idx: number) => (
                <tr key={l.id}>
                  <td>{idx + 1}</td>
                  <td style={{ fontWeight: 600, maxWidth: 380 }}>{l.name}</td>
                  <td>{l.funder || '-'}</td>
                  <td>{l.piName || '-'}</td>
                  <td className="num" style={{ width: 135 }}>
                    <input
                      type="number"
                      min="0"
                      className="excel-input num"
                      disabled={!canEditEstimates}
                      defaultValue={l.budget}
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (v !== l.budget) updateRow(l, { budget: v });
                      }}
                    />
                  </td>
                  <td className="num" style={{ width: 120 }}>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      placeholder="ใช้ค่าตั้งต้น"
                      className="excel-input num"
                      disabled={!canEditEstimates}
                      defaultValue={
                        l.overheadRateOverride !== null
                          ? Number((l.overheadRateOverride * 100).toFixed(4))
                          : ''
                      }
                      onBlur={(e) => {
                        const raw = e.target.value.trim();
                        const newRate = raw === '' ? null : Number(raw) / 100;
                        updateRow(l, { overheadRateOverride: newRate });
                      }}
                    />
                  </td>
                  <td>
                    <select
                      className="excel-input"
                      disabled={!canEditEstimates}
                      value={l.monthSeq}
                      onChange={(e) => updateRow(l, { monthSeq: Number(e.target.value) })}
                    >
                      {THAI_MONTH_NAMES.map((m, i) => (
                        <option key={m} value={i + 1}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="num calc-cell">{fmtMoney(l.grossOverhead)}</td>
                  <td className="num calc-cell">{fmtMoney(l.centralDeduction)}</td>
                  <td className="num calc-cell" style={{ fontWeight: 700 }}>
                    {fmtMoney(l.netOverhead)}
                  </td>
                  {canEditEstimates && (
                    <td>
                      <button
                        className="btn btn-danger"
                        style={{ padding: '3px 7px', fontSize: 11 }}
                        onClick={() =>
                          mutate('soft_delete_row', { table: 'research_projects', id: l.id })
                        }
                      >
                        ลบ
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="total-row" style={{ backgroundColor: '#dcfce7' }}>
                <td colSpan={4}>รวม Overhead งานวิจัยทั้งสิ้น</td>
                <td className="num">{fmtMoney(research.totals.budget)}</td>
                <td colSpan={2} />
                <td className="num">{fmtMoney(research.totals.grossOverhead)}</td>
                <td className="num">{fmtMoney(research.totals.centralDeduction)}</td>
                <td className="num" style={{ color: '#15803d', fontSize: 15 }}>
                  {fmtMoney(research.totals.netRounded)}
                </td>
                {canEditEstimates && <td />}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// 5. RENTAL ITEMS GRID VIEW (/revenue/rent) — PROMPT 4 Task 4
// =============================================================================
export function RentalGridView() {
  const { data, canEditEstimates, mutate, mutating } = useRevenueWorkspace();
  const [newRent, setNewRent] = useState({
    name: '',
    monthlyRent: 2500,
    startMonthSeq: 1,
    endMonthSeq: 12,
  });

  if (!data) return null;
  const { rental } = data.calc;

  const updateRow = async (row: any, patch: Record<string, any>) => {
    await mutate(
      'upsert_rental_item',
      {
        id: row.id,
        versionId: data.activeVersion.id,
        name: row.name,
        tenant: row.tenant,
        areaSqm: row.areaSqm,
        monthlyRent: row.monthlyRent,
        startMonthSeq: row.startMonthSeq,
        endMonthSeq: row.endMonthSeq,
        note: row.note,
        ...patch,
      },
      'อัปเดตรายการค่าเช่าพื้นที่ราชพัสดุเรียบร้อยแล้ว'
    );
  };

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>
          4) ประมาณการรายรับจากค่าเช่าพื้นที่ราชพัสดุ
        </h1>
        <div style={{ fontSize: 13, color: '#475569' }}>
          ระบุเดือนเริ่มและเดือนสิ้นสุดในปีงบประมาณ (ต.ค.–ก.ย.) • หากเดือนสิ้นสุดก่อนเดือนเริ่ม ระบบจะคำนวณเป็น 0 เดือนพร้อมแสดงคำเตือน ⚠
        </div>
      </div>

      {canEditEstimates && (
        <div className="card" style={{ backgroundColor: '#fffbeb' }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>➕ เพิ่มรายการผู้เช่าพื้นที่ราชพัสดุ</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              type="text"
              placeholder="ชื่อร้านค้า / ผู้เช่า..."
              className="input-ctrl"
              style={{ minWidth: 240 }}
              value={newRent.name}
              onChange={(e) => setNewRent((p) => ({ ...p, name: e.target.value }))}
            />
            <input
              type="number"
              placeholder="ค่าเช่า/เดือน (บาท)"
              className="input-ctrl num"
              style={{ width: 140 }}
              value={newRent.monthlyRent}
              onChange={(e) => setNewRent((p) => ({ ...p, monthlyRent: Number(e.target.value) }))}
            />
            <select
              className="select-ctrl"
              value={newRent.startMonthSeq}
              onChange={(e) => setNewRent((p) => ({ ...p, startMonthSeq: Number(e.target.value) }))}
            >
              {THAI_MONTH_NAMES.map((m, i) => (
                <option key={m} value={i + 1}>
                  เริ่ม: {m}
                </option>
              ))}
            </select>
            <select
              className="select-ctrl"
              value={newRent.endMonthSeq}
              onChange={(e) => setNewRent((p) => ({ ...p, endMonthSeq: Number(e.target.value) }))}
            >
              {THAI_MONTH_NAMES.map((m, i) => (
                <option key={m} value={i + 1}>
                  สิ้นสุด: {m}
                </option>
              ))}
            </select>
            <button
              className="btn btn-primary"
              disabled={!newRent.name.trim() || mutating}
              onClick={async () => {
                const ok = await mutate('upsert_rental_item', {
                  versionId: data.activeVersion.id,
                  ...newRent,
                });
                if (ok) setNewRent((p) => ({ ...p, name: '' }));
              }}
            >
              ➕ เพิ่มรายการค่าเช่า
            </button>
          </div>
        </div>
      )}

      <div className="card">
        <div className="table-wrap">
          <table className="rev-table">
            <thead>
              <tr>
                <th>#</th>
                <th>รายการ / ผู้เช่า</th>
                <th className="num">ค่าเช่า/เดือน (บาท)</th>
                <th>เดือนเริ่ม</th>
                <th>เดือนสิ้นสุด</th>
                <th className="num">จำนวนเดือน</th>
                <th className="num">รายรับรวม (บาท)</th>
                <th className="num">หัก 10%</th>
                <th className="num">รายรับสุทธิ (บาท)</th>
                {canEditEstimates && <th>ลบ</th>}
              </tr>
            </thead>
            <tbody>
              {rental.lines.map((l: any, idx: number) => (
                <tr key={l.id}>
                  <td>{idx + 1}</td>
                  <td style={{ fontWeight: 600 }}>{l.name}</td>
                  <td className="num" style={{ width: 130 }}>
                    <input
                      type="number"
                      min="0"
                      className="excel-input num"
                      disabled={!canEditEstimates}
                      defaultValue={l.monthlyRent}
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (v !== l.monthlyRent) updateRow(l, { monthlyRent: v });
                      }}
                    />
                  </td>
                  <td>
                    <select
                      className="excel-input"
                      disabled={!canEditEstimates}
                      value={l.startMonthSeq}
                      onChange={(e) => updateRow(l, { startMonthSeq: Number(e.target.value) })}
                    >
                      {THAI_MONTH_NAMES.map((m, i) => (
                        <option key={m} value={i + 1}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      className="excel-input"
                      disabled={!canEditEstimates}
                      value={l.endMonthSeq}
                      onChange={(e) => updateRow(l, { endMonthSeq: Number(e.target.value) })}
                    >
                      {THAI_MONTH_NAMES.map((m, i) => (
                        <option key={m} value={i + 1}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="num calc-cell" style={{ fontWeight: 700 }}>
                    {l.isValidMonthRange ? (
                      `${l.activeMonths} เดือน`
                    ) : (
                      <span className="badge badge-err" title={l.warning}>
                        ⚠ 0 ด. ({l.warning})
                      </span>
                    )}
                  </td>
                  <td className="num calc-cell">{fmtMoney(l.grossYear)}</td>
                  <td className="num calc-cell">{fmtMoney(l.deductionYear)}</td>
                  <td className="num calc-cell" style={{ fontWeight: 700 }}>
                    {fmtMoney(l.netYear)}
                  </td>
                  {canEditEstimates && (
                    <td>
                      <button
                        className="btn btn-danger"
                        style={{ padding: '3px 7px', fontSize: 11 }}
                        onClick={() =>
                          mutate('soft_delete_row', { table: 'rental_items', id: l.id })
                        }
                      >
                        ลบ
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="total-row">
                <td colSpan={2}>รวมค่าเช่าราชพัสดุ (ก่อนปัดหลักพัน)</td>
                <td className="num">{fmtMoney(rental.totals.monthlyRentSum)}</td>
                <td colSpan={3} />
                <td className="num">{fmtMoney(rental.totals.grossYear)}</td>
                <td className="num">{fmtMoney(rental.totals.deductionYear)}</td>
                <td className="num">{fmtMoney(rental.totals.netExact)}</td>
                {canEditEstimates && <td />}
              </tr>
              <tr className="total-row" style={{ backgroundColor: '#dcfce7' }}>
                <td colSpan={8}>รายรับสุทธิค่าเช่าราชพัสดุทั้งปี (ปัดลงหลักพัน ROUNDDOWN -3)</td>
                <td className="num" style={{ color: '#15803d', fontSize: 15 }}>
                  {fmtMoney(rental.totals.netRounded)}
                </td>
                {canEditEstimates && <td />}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// 6. CARRYOVER & OTHER INCOME VIEW (/revenue/carryover) — PROMPT 4 Task 5
// =============================================================================
export function CarryoverAndOtherView() {
  const { data, canEditEstimates, canEditActuals, isVersionEditable, mutate, mutating } =
    useRevenueWorkspace();

  const [carryAmt, setCarryAmt] = useState<number>(0);
  const [carryNote, setCarryNote] = useState<string>('');
  const [newOther, setNewOther] = useState({
    name: '',
    monthSeq: 1,
    gross: 0,
    deduction: 0,
  });

  useEffect(() => {
    if (data?.carryover) {
      setCarryAmt(data.carryover.amount);
      setCarryNote(data.carryover.sourceNote);
    }
  }, [data?.carryover]);

  if (!data) return null;

  const canEditCarryover = isVersionEditable && (canEditEstimates || canEditActuals);

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>
          5) เงินเหลือจ่ายสะสมยกมา และ 6) ประมาณการรายได้อื่น
        </h1>
        <div style={{ fontSize: 13, color: '#475569' }}>
          เงินเหลือจ่ายสะสมยกมาลงเดือนที่ 1 (ต.ค.) ไม่มีรายการหัก (ก่อนหัก = สุทธิ) • แหล่งข้อมูลเดียวในระบบเพื่อป้องกันตัวเลขไม่ตรงกัน
        </div>
      </div>

      {/* Carryover Card */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">5. เงินเหลือจ่ายสะสมยกมา (1 ต.ค. ต้นปีงบประมาณ)</h2>
          <span className="badge badge-ok">สุทธิ {fmtMoney(data.carryover.amount)} บาท</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr auto', gap: 12, alignItems: 'end' }}>
          <div>
            <label style={{ display: 'block', fontWeight: 700, marginBottom: 4 }}>
              ยอดเงินเหลือจ่ายสะสมยกมา (บาท):
            </label>
            <input
              type="number"
              min="0"
              className="excel-input num"
              disabled={!canEditCarryover}
              value={carryAmt}
              onChange={(e) => setCarryAmt(Number(e.target.value))}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontWeight: 700, marginBottom: 4 }}>
              แหล่งที่มา / หมายเหตุอ้างอิง:
            </label>
            <input
              type="text"
              className="excel-input"
              disabled={!canEditCarryover}
              value={carryNote}
              onChange={(e) => setCarryNote(e.target.value)}
            />
          </div>
          <button
            className="btn btn-primary"
            disabled={!canEditCarryover || mutating}
            onClick={() =>
              mutate(
                'update_carryover',
                {
                  versionId: data.activeVersion.id,
                  amount: carryAmt,
                  sourceNote: carryNote,
                },
                'บันทึกยอดเงินเหลือจ่ายสะสมยกมาเรียบร้อยแล้ว'
              )
            }
          >
            💾 บันทึกยอดยกมา
          </button>
        </div>
      </div>

      {/* Other Income Lines (Type 6) */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">6. ประมาณการรายได้อื่น (Other Income Lines — ประเภทที่ 6)</h2>
        </div>

        {canEditEstimates && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            <input
              type="text"
              placeholder="ชื่อรายการรายได้อื่น (เช่น ดอกเบี้ยเงินฝาก)..."
              className="input-ctrl"
              style={{ minWidth: 240 }}
              value={newOther.name}
              onChange={(e) => setNewOther((p) => ({ ...p, name: e.target.value }))}
            />
            <select
              className="select-ctrl"
              value={newOther.monthSeq}
              onChange={(e) => setNewOther((p) => ({ ...p, monthSeq: Number(e.target.value) }))}
            >
              {THAI_MONTH_NAMES.map((m, i) => (
                <option key={m} value={i + 1}>
                  เดือน {m}
                </option>
              ))}
            </select>
            <input
              type="number"
              placeholder="ก่อนหัก (บาท)"
              className="input-ctrl num"
              style={{ width: 130 }}
              value={newOther.gross}
              onChange={(e) => setNewOther((p) => ({ ...p, gross: Number(e.target.value) }))}
            />
            <input
              type="number"
              placeholder="ค่าหัก (บาท)"
              className="input-ctrl num"
              style={{ width: 130 }}
              value={newOther.deduction}
              onChange={(e) => setNewOther((p) => ({ ...p, deduction: Number(e.target.value) }))}
            />
            <button
              className="btn btn-primary"
              disabled={!newOther.name.trim() || mutating}
              onClick={async () => {
                const ok = await mutate('upsert_other_income', {
                  versionId: data.activeVersion.id,
                  ...newOther,
                });
                if (ok) setNewOther({ name: '', monthSeq: 1, gross: 0, deduction: 0 });
              }}
            >
              ➕ เพิ่มรายได้อื่น
            </button>
          </div>
        )}

        <div className="table-wrap">
          <table className="rev-table">
            <thead>
              <tr>
                <th>#</th>
                <th>รายการรายได้อื่น</th>
                <th>เดือนที่รับ</th>
                <th className="num">ก่อนหัก (บาท)</th>
                <th className="num">ค่าหัก (บาท)</th>
                <th className="num">สุทธิ (บาท)</th>
                {canEditEstimates && <th>ลบ</th>}
              </tr>
            </thead>
            <tbody>
              {data.otherIncomeLines.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: 16, color: '#64748b' }}>
                    ไม่มีรายการประมาณการรายได้อื่นในปีงบประมาณนี้ (0 บาท)
                  </td>
                </tr>
              ) : (
                data.otherIncomeLines.map((o: any, idx: number) => (
                  <tr key={o.id}>
                    <td>{idx + 1}</td>
                    <td style={{ fontWeight: 600 }}>{o.name}</td>
                    <td>{THAI_MONTH_NAMES[o.monthSeq - 1]}</td>
                    <td className="num">{fmtMoney(o.gross)}</td>
                    <td className="num">{fmtMoney(o.deduction)}</td>
                    <td className="num" style={{ fontWeight: 700 }}>
                      {fmtMoney(o.net)}
                    </td>
                    {canEditEstimates && (
                      <td>
                        <button
                          className="btn btn-danger"
                          style={{ padding: '3px 7px', fontSize: 11 }}
                          onClick={() =>
                            mutate('soft_delete_row', { table: 'other_income_lines', id: o.id })
                          }
                        >
                          ลบ
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
