'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export const THAI_MONTH_NAMES = [
  'ต.ค.',
  'พ.ย.',
  'ธ.ค.',
  'ม.ค.',
  'ก.พ.',
  'มี.ค.',
  'เม.ย.',
  'พ.ค.',
  'มิ.ย.',
  'ก.ค.',
  'ส.ค.',
  'ก.ย.',
];

export function fmtMoney(val: number | null | undefined, decimals = 0): string {
  if (val === null || val === undefined || Number.isNaN(val)) return '-';
  return val.toLocaleString('th-TH', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function fmtPct(val: number | null | undefined, decimals = 2): string {
  if (val === null || val === undefined || Number.isNaN(val)) return '-';
  return `${(val * 100).toLocaleString('th-TH', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}%`;
}

export interface DrillDownState {
  title: string;
  subtitle?: string;
  columns: string[];
  rows: Array<Array<string | number>>;
  totalLabel?: string;
  totalValue?: string;
}

interface WorkspaceContextValue {
  data: any;
  loading: boolean;
  mutating: boolean;
  error: string | null;
  notice: string | null;
  selectedVersionId: string;
  selectedUserId: string;
  compareBasis: 'net' | 'gross';
  compareMonthSeq: number;
  setSelectedVersionId: (id: string) => void;
  setSelectedUserId: (id: string) => void;
  setCompareBasis: (b: 'net' | 'gross') => void;
  setCompareMonthSeq: (m: number) => void;
  refresh: () => Promise<void>;
  mutate: (action: string, payload: any, successMsg?: string) => Promise<boolean>;
  openDrillDown: (state: DrillDownState) => void;
  openNewYearModal: () => void;
  clearMessages: () => void;
  canEditEstimates: boolean;
  canEditParameters: boolean;
  canEditActuals: boolean;
  canApproveVersion: boolean;
  isVersionEditable: boolean;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function useRevenueWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useRevenueWorkspace must be used inside RevenueWorkspaceProvider');
  return ctx;
}

const NAV_GROUPS = [
  {
    group: 'ภาพรวมและตั้งค่า',
    items: [
      { href: '/revenue', label: '📊 Dashboard ภาพรวม' },
      { href: '/revenue/settings', label: '⚙️ ตั้งค่าพารามิเตอร์ & ข้อมูลหลัก' },
    ],
  },
  {
    group: 'กรอกประมาณการ 5 ประเภท',
    items: [
      { href: '/revenue/tuition', label: '1. ค่าธรรมเนียมการศึกษา' },
      { href: '/revenue/service', label: '2. บริการวิชาการ' },
      { href: '/revenue/research', label: '3. Overhead งานวิจัย' },
      { href: '/revenue/rent', label: '4. ค่าเช่าราชพัสดุ' },
      { href: '/revenue/carryover', label: '5. เงินเหลือจ่ายสะสม & รายได้อื่น' },
    ],
  },
  {
    group: 'ผลลัพธ์และจัดสรรงบ',
    items: [
      { href: '/revenue/summary', label: '📅 สรุปรายเดือน (ก่อนหัก/หัก/สุทธิ)' },
      { href: '/revenue/allocation', label: '🎯 จัดสรรกรอบงบประมาณ (3 มิติ)' },
    ],
  },
  {
    group: 'ติดตามรับจริงและรายงาน',
    items: [
      { href: '/revenue/actuals', label: '💰 บันทึกรายรับจริง & เงินคงเหลือ' },
      { href: '/revenue/compare', label: '📈 เทียบประมาณการกับรับจริง' },
      { href: '/revenue/reports/budget-request', label: '📑 รายงานคำขอตั้งงบเปรียบเทียบปี' },
    ],
  },
  {
    group: 'การจัดการระบบ',
    items: [
      { href: '/revenue/import', label: '📥 นำเข้า / ส่งออก Excel' },
      { href: '/revenue/versions', label: '🔒 เวอร์ชัน & การอนุมัติงบ' },
      { href: '/revenue/audit', label: '🛡️ ประวัติการแก้ไข (Audit Log)' },
    ],
  },
];

export function RevenueWorkspaceProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [mutating, setMutating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<string>('');
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [compareBasis, setCompareBasis] = useState<'net' | 'gross'>('net');
  const [compareMonthSeq, setCompareMonthSeq] = useState<number>(12);
  const [drillDown, setDrillDown] = useState<DrillDownState | null>(null);
  const [drillSelectedPrograms, setDrillSelectedPrograms] = useState<string[]>([]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [showNewYearModal, setShowNewYearModal] = useState<boolean>(false);
  const [newYearForm, setNewYearForm] = useState({
    beYear: 2572,
    label: 'ประมาณการรายรับ ครั้งที่ 1 (ต้นปีงบประมาณ)',
    copyFromVersionId: '',
    copyEstimateLines: true,
    autoShiftCohorts: true,
  });

  const fetchData = useCallback(
    async (verId?: string, usrId?: string, basis?: 'net' | 'gross', mSeq?: number) => {
      try {
        const params = new URLSearchParams();
        if (verId) params.set('versionId', verId);
        if (usrId) params.set('userId', usrId);
        params.set('compareBasis', basis || compareBasis);
        params.set('compareMonthSeq', String(mSeq || compareMonthSeq));

        const res = await fetch(`/api/revenue?${params.toString()}`, { cache: 'no-store' });
        const json = await res.json();
        if (!json.ok) {
          setError(json.error || 'ไม่สามารถโหลดข้อมูลได้');
        } else {
          setData(json.data);
          if (!verId && json.data.activeVersion?.id) {
            setSelectedVersionId(json.data.activeVersion.id);
          }
          if (!usrId && json.data.activeUser?.id) {
            setSelectedUserId(json.data.activeUser.id);
          }
        }
      } catch (err: any) {
        setError(err?.message || 'เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
      } finally {
        setLoading(false);
      }
    },
    [compareBasis, compareMonthSeq]
  );

  useEffect(() => {
    fetchData(selectedVersionId || undefined, selectedUserId || undefined, compareBasis, compareMonthSeq);
  }, [selectedVersionId, selectedUserId, compareBasis, compareMonthSeq, fetchData]);

  const mutate = async (action: string, payload: any, successMsg?: string): Promise<boolean> => {
    setMutating(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch('/api/revenue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: selectedUserId || data?.activeUser?.id,
          versionId: selectedVersionId || data?.activeVersion?.id,
          compareBasis,
          compareMonthSeq,
          action,
          payload,
        }),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error || 'เกิดข้อผิดพลาดในการบันทึก');
        return false;
      }
      setData(json.data);
      if (json.mutationResult?.newVersionId) {
        setSelectedVersionId(json.mutationResult.newVersionId);
      }
      setNotice(successMsg || 'บันทึกข้อมูลและบันทึก Audit Log เรียบร้อยแล้ว');
      return true;
    } catch (err: any) {
      setError(err?.message || 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้');
      return false;
    } finally {
      setMutating(false);
    }
  };

  const role = data?.activeUser?.role || 'SUPER_ADMIN';
  const versionStatus = data?.activeVersion?.status || 'draft';
  const isVersionEditable = versionStatus === 'draft' || versionStatus === 'submitted';

  const canEditEstimates =
    isVersionEditable && (role === 'SUPER_ADMIN' || role === 'PLANNING_OFFICER');
  const canEditParameters = role === 'SUPER_ADMIN';
  const canEditActuals = role === 'SUPER_ADMIN' || role === 'FINANCE_OFFICER';
  const canApproveVersion = role === 'SUPER_ADMIN' || role === 'EXECUTIVE';

  const statusBadge = (st: string) => {
    switch (st) {
      case 'draft':
        return <span className="badge badge-warn">📝 ร่าง (Draft)</span>;
      case 'submitted':
        return <span className="badge badge-info">📤 ส่งอนุมัติแล้ว (Submitted)</span>;
      case 'approved':
        return <span className="badge badge-ok">✅ อนุมัติแล้ว (Approved — ห้ามแก้ไข)</span>;
      case 'locked':
        return <span className="badge badge-err">🔒 ล็อกถาวร (Locked)</span>;
      default:
        return <span className="badge">{st}</span>;
    }
  };

  const openNewYearModal = () => {
    const existingYears = (data?.fiscalYears || []).map((f: any) => Number(f.be_year));
    const maxYear = existingYears.length > 0 ? Math.max(...existingYears) : 2571;
    setNewYearForm({
      beYear: maxYear + 1,
      label: 'ประมาณการรายรับ ครั้งที่ 1 (ต้นปีงบประมาณ)',
      copyFromVersionId: selectedVersionId || data?.activeVersion?.id || '',
      copyEstimateLines: true,
      autoShiftCohorts: true,
    });
    setShowNewYearModal(true);
  };

  const activeBeYear = data?.activeVersion?.be_year || 2571;
  const versionsForActiveYear = (data?.versions || []).filter(
    (v: any) => Number(v.be_year) === Number(activeBeYear)
  );

  const handleSelectFiscalYear = (beYear: number) => {
    const firstVerOfYear = (data?.versions || []).find(
      (v: any) => Number(v.be_year) === Number(beYear)
    );
    if (firstVerOfYear) {
      setSelectedVersionId(firstVerOfYear.id);
    }
  };

  const getDrillAvailablePrograms = (state: DrillDownState | null): string[] => {
    if (!state || state.columns[0] !== 'หลักสูตร') return [];
    const mainProgs = (data?.programs || [])
      .filter((p: any) => p.report_group !== '1.1.7')
      .map((p: any) => String(p.name_th));
    const rowProgs = state.rows.map((r) => String(r[0]));
    return Array.from(new Set([...mainProgs, ...rowProgs]));
  };

  const handleOpenDrillDown = (state: DrillDownState) => {
    if (state.columns[0] === 'หลักสูตร') {
      const progs = getDrillAvailablePrograms(state);
      setDrillSelectedPrograms(progs);
    }
    setDrillDown(state);
  };

  return (
    <WorkspaceContext.Provider
      value={{
        data,
        loading,
        mutating,
        error,
        notice,
        selectedVersionId,
        selectedUserId,
        compareBasis,
        compareMonthSeq,
        setSelectedVersionId,
        setSelectedUserId,
        setCompareBasis,
        setCompareMonthSeq,
        refresh: () => fetchData(selectedVersionId, selectedUserId, compareBasis, compareMonthSeq),
        mutate,
        openDrillDown: handleOpenDrillDown,
        openNewYearModal,
        clearMessages: () => {
          setError(null);
          setNotice(null);
        },
        canEditEstimates,
        canEditParameters,
        canEditActuals,
        canApproveVersion,
        isVersionEditable,
      }}
    >
      <div className="rev-shell">
        {/* Sidebar */}
        {!sidebarCollapsed && (
          <aside className="rev-sidebar">
            <div className="rev-brand">
              <div className="rev-brand-title">ระบบประมาณการรายรับเงินรายได้</div>
              <div className="rev-brand-sub">คณะรัฐศาสตร์และรัฐประศาสนศาสตร์ มช.</div>
            </div>
            <nav className="rev-nav">
              {NAV_GROUPS.map((g) => (
                <div key={g.group}>
                  <div className="rev-nav-group">{g.group}</div>
                  {g.items.map((item) => {
                    const isActive = pathname === item.href;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`rev-nav-link ${isActive ? 'active' : ''}`}
                      >
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              ))}
            </nav>
          </aside>
        )}

        {/* Main Panel */}
        <div className="rev-main">
          {/* Sticky Topbar with Fiscal Year, Version, New Fiscal Year Button, Role Switcher, and Export */}
          <header className="rev-topbar">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '4px 9px', fontSize: 13 }}
                onClick={() => setSidebarCollapsed((c) => !c)}
                title={sidebarCollapsed ? 'แสดงเมนูด้านซ้าย' : 'ซ่อนเมนูด้านซ้ายเพื่อขยายเต็มหน้าจอ'}
              >
                {sidebarCollapsed ? '☰ แสดงเมนู' : '☰'}
              </button>
              <label style={{ fontWeight: 700, fontSize: 13 }}>ปีงบประมาณ:</label>
              <select
                className="select-ctrl"
                value={activeBeYear}
                onChange={(e) => handleSelectFiscalYear(Number(e.target.value))}
                style={{ fontWeight: 800, color: '#3b1c57', backgroundColor: '#faf5ff' }}
              >
                {(data?.fiscalYears || []).map((fy: any) => (
                  <option key={fy.id} value={fy.be_year}>
                    ปีงบประมาณ พ.ศ. {fy.be_year}
                  </option>
                ))}
              </select>

              <label style={{ fontWeight: 700, fontSize: 13, marginLeft: 4 }}>เวอร์ชัน:</label>
              <select
                className="select-ctrl"
                value={selectedVersionId}
                onChange={(e) => setSelectedVersionId(e.target.value)}
                style={{ fontWeight: 700, minWidth: 230 }}
              >
                {versionsForActiveYear.map((v: any) => (
                  <option key={v.id} value={v.id}>
                    ครั้งที่ {v.version_no}: {v.label} ({v.status.toUpperCase()})
                  </option>
                ))}
              </select>

              {data?.activeVersion && statusBadge(data.activeVersion.status)}

              {(role === 'SUPER_ADMIN' || role === 'PLANNING_OFFICER') && (
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ padding: '5px 11px', fontSize: 12.5 }}
                  onClick={openNewYearModal}
                >
                  ➕ เพิ่มปีงบประมาณใหม่
                </button>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <label style={{ fontSize: 12.5, color: '#475569', fontWeight: 600 }}>
                สิทธิ์ผู้ใช้งาน (RLS Test Role):
              </label>
              <select
                className="select-ctrl"
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                style={{ backgroundColor: '#f8fafc', fontWeight: 600 }}
              >
                {(data?.profiles || []).map((p: any) => (
                  <option key={p.id} value={p.id}>
                    [{p.role}] {p.full_name}
                  </option>
                ))}
              </select>

              <a
                href={`/api/revenue/export?versionId=${selectedVersionId}`}
                className="btn btn-secondary"
                title="ดาวน์โหลดไฟล์ Excel สรุปรายเดือน จัดสรรงบ และคำขอตั้งงบ"
              >
                📥 ส่งออก .xlsx
              </a>
            </div>
          </header>

          {/* Status banners */}
          {(error || notice) && (
            <div style={{ padding: '10px 24px 0' }}>
              {error && (
                <div
                  style={{
                    background: '#fee2e2',
                    border: '1px solid #f87171',
                    color: '#991b1b',
                    padding: '10px 14px',
                    borderRadius: 8,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontWeight: 600,
                  }}
                >
                  <span>⚠ {error}</span>
                  <button
                    onClick={() => setError(null)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}
                  >
                    ✕
                  </button>
                </div>
              )}
              {notice && (
                <div
                  style={{
                    background: '#dcfce7',
                    border: '1px solid #4ade80',
                    color: '#166534',
                    padding: '10px 14px',
                    borderRadius: 8,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontWeight: 600,
                  }}
                >
                  <span>✓ {notice}</span>
                  <button
                    onClick={() => setNotice(null)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Page Content */}
          <main className="rev-content">
            {loading && !data ? (
              <div className="card" style={{ padding: 40, textAlign: 'center', fontWeight: 600 }}>
                กำลังโหลดข้อมูลและคำนวณผ่าน Calculation Engine...
              </div>
            ) : (
              children
            )}
          </main>
        </div>
      </div>

      {/* Create New Fiscal Year Modal */}
      {showNewYearModal && (
        <div className="modal-backdrop" onClick={() => setShowNewYearModal(false)}>
          <div className="modal-box" style={{ maxWidth: 620 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3 style={{ margin: 0, fontSize: 17 }}>
                  ➕ เพิ่มประมาณการรายรับปีงบประมาณใหม่ (Multi-Year Estimation)
                </h3>
                <div style={{ fontSize: 12.5, color: '#64748b', marginTop: 2 }}>
                  รองรับการสร้างปีงบประมาณใหม่โดยคัดลอกโครงสร้างและรายการจากปีก่อนหน้า หรือสร้างแบบตารางว่าง
                </div>
              </div>
              <button className="btn btn-secondary" onClick={() => setShowNewYearModal(false)}>
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontWeight: 700, marginBottom: 4 }}>
                      ปีงบประมาณ (พ.ศ.):
                    </label>
                    <input
                      type="number"
                      min="2550"
                      max="2650"
                      className="excel-input num"
                      value={newYearForm.beYear}
                      onChange={(e) =>
                        setNewYearForm((p) => ({ ...p, beYear: Number(e.target.value) }))
                      }
                    />
                    <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 3 }}>
                      1 ต.ค. {newYearForm.beYear - 1} – 30 ก.ย. {newYearForm.beYear}
                    </div>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontWeight: 700, marginBottom: 4 }}>
                      ชื่อเวอร์ชันประมาณการ:
                    </label>
                    <input
                      type="text"
                      className="excel-input"
                      value={newYearForm.label}
                      onChange={(e) =>
                        setNewYearForm((p) => ({ ...p, label: e.target.value }))
                      }
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontWeight: 700, marginBottom: 4 }}>
                    คัดลอกพารามิเตอร์และสัดส่วนตั้งต้นจากเวอร์ชัน:
                  </label>
                  <select
                    className="select-ctrl"
                    style={{ width: '100%' }}
                    value={newYearForm.copyFromVersionId}
                    onChange={(e) =>
                      setNewYearForm((p) => ({ ...p, copyFromVersionId: e.target.value }))
                    }
                  >
                    {(data?.versions || []).map((v: any) => (
                      <option key={v.id} value={v.id}>
                        ปีงบ {v.be_year} — ครั้งที่ {v.version_no}: {v.label} ({v.status.toUpperCase()})
                      </option>
                    ))}
                  </select>
                </div>

                <div
                  style={{
                    background: '#f8fafc',
                    border: '1px solid #cbd5e1',
                    borderRadius: 8,
                    padding: 12,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                  }}
                >
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={newYearForm.copyEstimateLines}
                      onChange={(e) =>
                        setNewYearForm((p) => ({ ...p, copyEstimateLines: e.target.checked }))
                      }
                    />
                    คัดลอกรายการประมาณการทั้ง 5 ประเภท (ค่าธรรมเนียม, บริการวิชาการ, วิจัย, ค่าเช่า, เหลือจ่ายยกมา) มาเป็นฐานตั้งต้น
                  </label>

                  {newYearForm.copyEstimateLines && (
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        marginLeft: 24,
                        fontSize: 13,
                        color: '#3b1c57',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={newYearForm.autoShiftCohorts}
                        onChange={(e) =>
                          setNewYearForm((p) => ({ ...p, autoShiftCohorts: e.target.checked }))
                        }
                      />
                      เลื่อนรหัสรุ่นนักศึกษา (Cohort Code) ตามปีงบประมาณใหม่อัตโนมัติ (รุ่นแรกเข้าปี {newYearForm.beYear} = รหัส{' '}
                      {String(newYearForm.beYear % 100).padStart(2, '0')})
                    </label>
                  )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 6 }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setShowNewYearModal(false)}
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={mutating}
                    onClick={async () => {
                      const ok = await mutate(
                        'create_fiscal_year',
                        {
                          beYear: newYearForm.beYear,
                          label: newYearForm.label,
                          copyFromVersionId: newYearForm.copyFromVersionId || null,
                          copyEstimateLines: newYearForm.copyEstimateLines,
                          autoShiftCohorts: newYearForm.autoShiftCohorts,
                        },
                        `สร้างประมาณการรายรับ ปีงบประมาณ พ.ศ. ${newYearForm.beYear} เรียบร้อยแล้ว`
                      );
                      if (ok) {
                        setShowNewYearModal(false);
                      }
                    }}
                  >
                    ✅ สร้างปีงบประมาณ พ.ศ. {newYearForm.beYear} และเปิดใช้งานทันที
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Drill-down Modal (Constitution Rule 9) */}
      {drillDown && (() => {
        const isTuitionDrill = drillDown.columns[0] === 'หลักสูตร';
        const availableProgs = isTuitionDrill ? getDrillAvailablePrograms(drillDown) : [];
        const displayedRows = isTuitionDrill
          ? drillDown.rows.filter((r) => drillSelectedPrograms.includes(String(r[0])))
          : drillDown.rows;

        const sumGross = isTuitionDrill
          ? displayedRows.reduce((acc, r) => acc + (Number(r[3]) || 0), 0)
          : 0;
        const sumNetExact = isTuitionDrill
          ? displayedRows.reduce((acc, r) => acc + (Number(r[6]) || 0), 0)
          : 0;
        const sumNetRounded = Math.trunc(sumNetExact / 1000) * 1000;

        const dynamicSubtitle = isTuitionDrill
          ? `รวมก่อนหัก ${fmtMoney(sumGross)} บาท | สุทธิหลังปัด ${fmtMoney(sumNetRounded)} บาท`
          : drillDown.subtitle;

        const dynamicTotalValue = isTuitionDrill
          ? fmtMoney(sumNetExact)
          : drillDown.totalValue;

        return (
          <div className="modal-backdrop" onClick={() => setDrillDown(null)}>
            <div className="modal-box" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <div>
                  <h3 style={{ margin: 0, fontSize: 16 }}>🔍 Drill-down: {drillDown.title}</h3>
                  {dynamicSubtitle && (
                    <div style={{ fontSize: 12.5, color: '#64748b', marginTop: 2 }}>
                      {dynamicSubtitle}
                    </div>
                  )}
                </div>
                <button className="btn btn-secondary" onClick={() => setDrillDown(null)}>
                  ปิดหน้าต่าง ✕
                </button>
              </div>
              <div className="modal-body">
                {isTuitionDrill && availableProgs.length > 0 && (
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '8px 12px',
                      alignItems: 'center',
                      padding: '10px 12px',
                      marginBottom: 12,
                      backgroundColor: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: 8,
                    }}
                  >
                    <span style={{ fontWeight: 700, fontSize: 13, color: '#3b1c57' }}>หลักสูตร:</span>
                    <label
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        fontSize: 12.5,
                        fontWeight: 700,
                        cursor: 'pointer',
                        color: '#1e293b',
                        paddingRight: 10,
                        borderRight: '1px solid #cbd5e1',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={
                          drillSelectedPrograms.length === availableProgs.length &&
                          availableProgs.length > 0
                        }
                        onChange={(e) => {
                          if (e.target.checked) {
                            setDrillSelectedPrograms(availableProgs);
                          } else {
                            setDrillSelectedPrograms([]);
                          }
                        }}
                      />
                      เลือกทั้งหมด
                    </label>
                    {availableProgs.map((progName) => {
                      const checked = drillSelectedPrograms.includes(progName);
                      const count = drillDown.rows.filter((r) => String(r[0]) === progName).length;
                      return (
                        <label
                          key={progName}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            fontSize: 12.5,
                            cursor: 'pointer',
                            padding: '4px 9px',
                            borderRadius: 6,
                            backgroundColor: checked ? '#f3e8ff' : '#ffffff',
                            border: checked ? '1px solid #c084fc' : '1px solid #cbd5e1',
                            color: checked ? '#3b1c57' : '#64748b',
                            fontWeight: checked ? 600 : 400,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setDrillSelectedPrograms((prev) => [...prev, progName]);
                              } else {
                                setDrillSelectedPrograms((prev) => prev.filter((p) => p !== progName));
                              }
                            }}
                          />
                          <span>{progName}</span>
                          {count > 0 && (
                            <span
                              style={{
                                fontSize: 11,
                                backgroundColor: checked ? '#5b2c83' : '#94a3b8',
                                color: '#fff',
                                borderRadius: 10,
                                padding: '0 6px',
                              }}
                            >
                              {count}
                            </span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                )}

                <div className="table-wrap">
                  <table className="rev-table">
                    <thead>
                      <tr>
                        {drillDown.columns.map((c, idx) => (
                          <th key={idx} className={idx >= 2 ? 'num' : ''}>
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {displayedRows.length === 0 ? (
                        <tr>
                          <td colSpan={drillDown.columns.length} style={{ textAlign: 'center', padding: 20 }}>
                            ไม่มีรายการต้นทางในหมวดนี้
                          </td>
                        </tr>
                      ) : (
                        displayedRows.map((r, rIdx) => (
                          <tr key={rIdx}>
                            {r.map((cell, cIdx) => (
                              <td key={cIdx} className={cIdx >= 2 ? 'num' : ''}>
                                {typeof cell === 'number' ? fmtMoney(cell) : cell}
                              </td>
                            ))}
                          </tr>
                        ))
                      )}
                    </tbody>
                    {drillDown.totalLabel && (
                      <tfoot>
                        <tr className="total-row">
                          <td colSpan={Math.max(1, drillDown.columns.length - 1)}>
                            {drillDown.totalLabel}
                          </td>
                          <td className="num">{dynamicTotalValue}</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </WorkspaceContext.Provider>
  );
}
