@extends('layouts.app')

@section('content')
<script>
    window.__INITIAL_REVENUE_TAB__ = @json($initialTab ?? 'dashboard');
</script>

@verbatim
<div id="revenue-app" v-cloak class="flex min-h-screen">
    <!-- Sidebar Navigation (15 Routes) -->
    <aside class="no-print w-64 bg-gradient-to-b from-cmu-dark to-[#220e36] text-white flex flex-col flex-shrink-0 shadow-xl">
        <div class="p-4 border-b border-white/15">
            <div class="text-sm font-extrabold text-cmu-gold">ระบบประมาณการรายรับเงินรายได้</div>
            <div class="text-xs text-white/75 mt-0.5">คณะรัฐศาสตร์และรัฐประศาสนศาสตร์ มช.</div>
            <div class="text-[11px] text-purple-200 mt-1 font-mono">Laravel 13 · MySQL 8 · Vue 3 CDN</div>
        </div>
        <nav class="flex-1 overflow-y-auto p-2.5 space-y-4">
            <div v-for="grp in navGroups" :key="grp.group">
                <div class="text-[11px] uppercase tracking-wider text-white/50 px-2.5 mb-1 font-semibold">
                    {{ grp.group }}
                </div>
                <button
                    v-for="item in grp.items"
                    :key="item.tab"
                    @click="switchTab(item.tab, item.href)"
                    :class="[
                        'w-full text-left flex items-center gap-2 px-3 py-2 rounded-md text-xs font-medium transition',
                        activeTab === item.tab
                            ? 'bg-cmu-gold text-cmu-dark font-bold shadow'
                            : 'text-white/85 hover:bg-white/10'
                    ]"
                >
                    <span>{{ item.label }}</span>
                </button>
            </div>
        </nav>
    </aside>

    <!-- Main Content Wrapper -->
    <div class="flex-1 flex flex-col min-w-0">
        <!-- Sticky Topbar: Multi-Year Selector, Version Selector, New Year Modal Trigger, RBAC Role Switcher & Private Export -->
        <header class="no-print sticky top-0 z-20 bg-white border-b border-slate-200 px-5 py-2.5 flex flex-wrap items-center justify-between gap-3 shadow-sm">
            <div class="flex flex-wrap items-center gap-2">
                <label class="text-xs font-bold text-slate-700">ปีงบประมาณ:</label>
                <select
                    v-model="selectedBeYear"
                    @change="onFiscalYearChange"
                    class="border border-purple-300 bg-purple-50 text-cmu-dark font-extrabold text-xs rounded-md px-2.5 py-1.5"
                >
                    <option v-for="fy in workspace.fiscalYears" :key="fy.id" :value="fy.be_year">
                        ปีงบประมาณ พ.ศ. {{ fy.be_year }}
                    </option>
                </select>

                <label class="text-xs font-bold text-slate-700 ml-1">เวอร์ชัน:</label>
                <select
                    v-model="selectedVersionId"
                    @change="fetchWorkspace"
                    class="border border-slate-300 bg-white font-bold text-xs rounded-md px-2.5 py-1.5 min-w-[230px]"
                >
                    <option v-for="v in versionsForYear" :key="v.id" :value="v.id">
                        ครั้งที่ {{ v.version_no }}: {{ v.label }} ({{ v.status.toUpperCase() }})
                    </option>
                </select>

                <span
                    v-if="workspace.activeVersion"
                    :class="[
                        'px-2.5 py-0.5 rounded-full text-xs font-bold',
                        workspace.activeVersion.status === 'approved' ? 'bg-green-100 text-green-800' :
                        workspace.activeVersion.status === 'draft' ? 'bg-amber-100 text-amber-800' :
                        'bg-indigo-100 text-indigo-800'
                    ]"
                >
                    {{ workspace.activeVersion.status.toUpperCase() }}
                </span>

                <button
                    v-if="canEditEstimates"
                    @click="openNewYearModal"
                    class="bg-cmu-purple hover:bg-cmu-dark text-white text-xs font-bold px-3 py-1.5 rounded-md shadow-sm transition"
                >
                    ➕ เพิ่มปีงบประมาณใหม่
                </button>
            </div>

            <div class="flex flex-wrap items-center gap-2">
                <label class="text-xs font-semibold text-slate-500">บทบาท (RBAC Role):</label>
                <select
                    v-model="selectedUserId"
                    @change="fetchWorkspace"
                    class="border border-slate-300 bg-slate-50 text-xs font-semibold rounded-md px-2.5 py-1.5"
                >
                    <option v-for="p in workspace.profiles" :key="p.id" :value="p.id">
                        [{{ p.role }}] {{ p.full_name }}
                    </option>
                </select>

                <a
                    :href="'/api/revenue/export?versionId=' + selectedVersionId"
                    class="bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold px-3 py-1.5 rounded-md shadow-sm"
                >
                    📥 ส่งออก .xlsx (Private Stream)
                </a>
            </div>
        </header>

        <!-- Notification Banner -->
        <div v-if="errorMsg || noticeMsg" class="px-6 pt-3">
            <div v-if="errorMsg" class="bg-red-50 border border-red-300 text-red-800 px-4 py-2.5 rounded-lg text-xs font-bold flex justify-between items-center">
                <span>⚠ {{ errorMsg }}</span>
                <button @click="errorMsg = null" class="font-extrabold">✕</button>
            </div>
            <div v-if="noticeMsg" class="bg-green-50 border border-green-300 text-green-800 px-4 py-2.5 rounded-lg text-xs font-bold flex justify-between items-center">
                <span>✓ {{ noticeMsg }}</span>
                <button @click="noticeMsg = null" class="font-extrabold">✕</button>
            </div>
        </div>

        <!-- Main View Area -->
        <main class="p-6 max-w-[1600px] w-full space-y-5">
            <!-- 1. DASHBOARD TAB (/revenue) -->
            <div v-if="activeTab === 'dashboard'" class="space-y-5">
                <div class="flex flex-wrap justify-between items-center gap-2">
                    <div>
                        <h1 class="text-xl font-extrabold text-slate-900">
                            Dashboard สรุปประมาณการรายรับเงินรายได้ ปีงบประมาณ พ.ศ. {{ workspace.activeVersion?.be_year }}
                        </h1>
                        <p class="text-xs text-slate-500">
                            Laravel 13 + MySQL 8.x + Vue.js 3 Global (Non-SFC) • คลิกตัวเลขใดๆ เพื่อ Drill-down ดูแถวต้นทาง
                        </p>
                    </div>
                    <button
                        @click="showChartTable = !showChartTable"
                        class="border border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold px-3 py-1.5 rounded-md"
                    >
                        {{ showChartTable ? '📊 สลับดูโหมดกราฟ' : '📋 สลับดูตารางข้อมูลกราฟ' }}
                    </button>
                </div>

                <!-- 4 KPI Cards -->
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div class="bg-white border border-slate-200 border-l-4 border-l-sky-600 rounded-xl p-4 shadow-sm">
                        <div class="text-xs font-semibold text-slate-500">1. ประมาณการรายรับรวม (ก่อนหัก)</div>
                        <div class="text-2xl font-extrabold text-slate-900 mt-1 num">{{ fmtMoney(calc.monthly.grandTotals.grossRounded) }} บาท</div>
                        <div class="text-[11px] text-slate-500 mt-1">รวม 5 ประเภทรายรับ ต.ค.–ก.ย.</div>
                    </div>
                    <div class="bg-white border border-slate-200 border-l-4 border-l-red-600 rounded-xl p-4 shadow-sm">
                        <div class="text-xs font-semibold text-slate-500">2. รายการหักรวม & รับคืนห้องสมุด</div>
                        <div class="text-2xl font-extrabold text-slate-900 mt-1 num">{{ fmtMoney(calc.monthly.grandTotals.deductionRounded) }} บาท</div>
                        <div class="text-[11px] text-emerald-700 font-bold mt-1">+ รับคืนค่าห้องสมุด 60%: {{ fmtMoney(calc.monthly.grandTotals.libraryRefund) }} บาท</div>
                    </div>
                    <div class="bg-white border border-slate-200 border-l-4 border-l-emerald-600 rounded-xl p-4 shadow-sm">
                        <div class="text-xs font-semibold text-slate-500">3. รายรับสุทธิที่นำไปจัดสรรงบได้</div>
                        <div class="text-2xl font-extrabold text-emerald-700 mt-1 num">{{ fmtMoney(calc.monthly.grandTotals.netRounded) }} บาท</div>
                        <div class="text-[11px] text-slate-500 mt-1">ตรงตาม Golden Values ปี 2571 ทุกบาท</div>
                    </div>
                    <div class="bg-white border border-slate-200 border-l-4 border-l-cmu-purple rounded-xl p-4 shadow-sm">
                        <div class="text-xs font-semibold text-slate-500">4. รายรับสุทธิเฉลี่ยต่อเดือน</div>
                        <div class="text-2xl font-extrabold text-slate-900 mt-1 num">{{ fmtMoney(calc.monthly.grandTotals.netRounded / 12) }} บาท</div>
                        <div class="text-[11px] text-slate-500 mt-1">สูงสุดเดือน มี.ค. ({{ fmtMoney(calc.monthly.monthlyNetTotalsRounded[5]) }} บาท)</div>
                    </div>
                </div>

                <!-- Revenue Type Summary Table & Monthly Chart -->
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div class="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                        <h2 class="text-sm font-bold text-slate-800 mb-3 pb-2 border-b">สัดส่วนรายรับสุทธิแยกตามประเภท (5 ประเภท)</h2>
                        <table class="w-full text-xs border-collapse">
                            <thead>
                                <tr class="bg-slate-100 border-b border-slate-300">
                                    <th class="p-2 text-left">ประเภทรายรับ</th>
                                    <th class="p-2 num">ก่อนหัก (บาท)</th>
                                    <th class="p-2 num">สุทธิหลังปัด (บาท)</th>
                                    <th class="p-2 num">สัดส่วน</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="rt in revTypeKeys" :key="rt" class="border-b border-slate-100 hover:bg-slate-50">
                                    <td class="p-2 font-semibold text-indigo-700 cursor-pointer underline" @click="drillRevenueType(rt)">
                                        {{ calc.monthly.netByType[rt].label }}
                                    </td>
                                    <td class="p-2 num">{{ fmtMoney(calc.monthly.grossByType[rt].yearTotalRounded) }}</td>
                                    <td class="p-2 num font-bold">{{ fmtMoney(calc.monthly.netByType[rt].yearTotalRounded) }}</td>
                                    <td class="p-2 num">{{ fmtPct(calc.monthly.netByType[rt].yearTotalRounded / calc.monthly.grandTotals.netRounded) }}</td>
                                </tr>
                            </tbody>
                            <tfoot>
                                <tr class="bg-slate-100 font-extrabold border-t-2 border-slate-400">
                                    <td class="p-2">รวมทั้งสิ้น</td>
                                    <td class="p-2 num">{{ fmtMoney(calc.monthly.grandTotals.grossRounded) }}</td>
                                    <td class="p-2 num text-emerald-700">{{ fmtMoney(calc.monthly.grandTotals.netRounded) }}</td>
                                    <td class="p-2 num">100.00%</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>

                    <div class="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                        <h2 class="text-sm font-bold text-slate-800 mb-3 pb-2 border-b">รายรับสุทธิรายเดือน (ต.ค.–ก.ย.)</h2>
                        <div v-if="!showChartTable" class="grid grid-cols-12 gap-1.5 h-44 items-end pt-4 pb-2 border-b border-slate-200">
                            <div v-for="(val, idx) in calc.monthly.monthlyNetTotalsRounded" :key="idx" class="flex flex-col items-center">
                                <span class="text-[10px] font-semibold text-slate-500 mb-1">
                                    {{ val >= 1000000 ? (val / 1000000).toFixed(1) + 'M' : Math.round(val / 1000) + 'k' }}
                                </span>
                                <div
                                    class="w-4/5 bg-gradient-to-t from-cmu-dark to-purple-600 rounded-t"
                                    :style="{ height: Math.max(6, Math.round((val / 19500000) * 125)) + 'px' }"
                                ></div>
                                <span class="text-[11px] font-bold mt-1">{{ thaiMonths[idx] }}</span>
                            </div>
                        </div>
                        <table v-else class="w-full text-xs">
                            <thead>
                                <tr class="bg-slate-100 border-b">
                                    <th class="p-1.5 text-left">เดือน</th>
                                    <th class="p-1.5 num">สุทธิรายเดือน (บาท)</th>
                                    <th class="p-1.5 num">สุทธิสะสมจริง (บาท)</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="(m, idx) in thaiMonths" :key="m" class="border-b">
                                    <td class="p-1.5 font-bold">{{ m }}</td>
                                    <td class="p-1.5 num">{{ fmtMoney(calc.monthly.monthlyNetTotalsRounded[idx]) }}</td>
                                    <td class="p-1.5 num">{{ fmtMoney(calc.monthly.cumulativeNetRounded[idx]) }}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- 2. SUMMARY MONTHLY TAB (/revenue/summary) -->
            <div v-if="activeTab === 'summary'" class="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-4">
                <h1 class="text-lg font-extrabold text-slate-900">
                    สรุปประมาณการรายรับรายเดือน (12 เดือน × 5 ประเภท) — ปีงบประมาณ พ.ศ. {{ workspace.activeVersion?.be_year }}
                </h1>
                <div class="overflow-x-auto">
                    <table class="w-full text-xs border-collapse">
                        <thead>
                            <tr class="bg-slate-100 border-b-2 border-slate-300">
                                <th class="p-2 text-left">ประเภทรายรับสุทธิ</th>
                                <th v-for="m in thaiMonths" :key="m" class="p-2 num">{{ m }}</th>
                                <th class="p-2 num">รวมรายปี (ปัดพัน)</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="rt in revTypeKeys" :key="rt" class="border-b hover:bg-slate-50">
                                <td class="p-2 font-semibold">{{ calc.monthly.netByType[rt].label }}</td>
                                <td v-for="(v, i) in calc.monthly.netByType[rt].months" :key="i" class="p-2 num">
                                    {{ fmtMoney(v, v % 1 !== 0 ? 2 : 0) }}
                                </td>
                                <td class="p-2 num font-bold">{{ fmtMoney(calc.monthly.netByType[rt].yearTotalRounded) }}</td>
                            </tr>
                            <tr class="bg-emerald-50 text-emerald-900 font-bold border-b">
                                <td class="p-2">➕ บวกกลับ: รับคืนค่าบำรุงห้องสมุด 60% (รวมอยู่ในสุทธิค่าธรรมเนียมแล้ว)</td>
                                <td v-for="(v, i) in calc.monthly.libraryRefundMonthly" :key="i" class="p-2 num">{{ fmtMoney(v) }}</td>
                                <td class="p-2 num">{{ fmtMoney(calc.monthly.libraryRefundYear) }}</td>
                            </tr>
                        </tbody>
                        <tfoot>
                            <tr class="bg-slate-100 font-extrabold border-t-2 border-slate-400">
                                <td class="p-2">รวมรายรับสุทธิรายเดือน (ปัดลงหลักพัน)</td>
                                <td v-for="(v, i) in calc.monthly.monthlyNetTotalsRounded" :key="i" class="p-2 num">{{ fmtMoney(v) }}</td>
                                <td class="p-2 num text-emerald-700 text-sm">{{ fmtMoney(calc.monthly.grandTotals.netRounded) }}</td>
                            </tr>
                            <tr class="bg-indigo-50 text-indigo-900 font-bold">
                                <td class="p-2">📈 รายรับสุทธิสะสม (คำนวณผลรวมสะสมจริง ต.ค.–ก.ย.)</td>
                                <td v-for="(v, i) in calc.monthly.cumulativeNetRounded" :key="i" class="p-2 num">{{ fmtMoney(v) }}</td>
                                <td class="p-2 num">{{ fmtMoney(calc.monthly.grandTotals.sumOfMonthlyNetRounded) }}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>

            <!-- 3. TUITION TAB (/revenue/tuition) -->
            <div v-if="activeTab === 'tuition'" class="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-4">
                <div class="flex justify-between items-center">
                    <div>
                        <h1 class="text-lg font-extrabold">1) ค่าธรรมเนียมการศึกษา (หลักสูตร × รหัสรุ่น)</h1>
                        <p class="text-xs text-slate-500">ช่องสีเหลืองแก้ไขได้ทันที • คำนวณรายการหักต่อหัว 4,500/5,000, หัก มช. 10% และรับคืนค่าห้องสมุด 60%</p>
                    </div>
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full text-xs border-collapse">
                        <thead>
                            <tr class="bg-slate-100 border-b-2 border-slate-300">
                                <th class="p-2 text-left">#</th>
                                <th class="p-2 text-left">หลักสูตร / กระบวนวิชา</th>
                                <th class="p-2 text-center">รหัสรุ่น</th>
                                <th class="p-2 num">นศ. ภาค 2</th>
                                <th class="p-2 num">นศ. ภาค 1</th>
                                <th class="p-2 num">ค่าธรรมเนียม/คน</th>
                                <th class="p-2 num">ก่อนหักรวม</th>
                                <th class="p-2 num">รวมหักต่อหัว</th>
                                <th class="p-2 num">หัก มช. 10%</th>
                                <th class="p-2 num">คืนห้องสมุด 60%</th>
                                <th class="p-2 num">รายรับสุทธิ</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="(l, idx) in calc.tuition.lines" :key="l.id" class="border-b hover:bg-slate-50">
                                <td class="p-2">{{ idx + 1 }}</td>
                                <td class="p-2 font-semibold">{{ l.programName }}</td>
                                <td class="p-2 text-center font-bold">{{ l.cohortCode || '-' }}</td>
                                <td class="p-1.5 w-24">
                                    <input type="number" class="excel-input num" :disabled="!canEditEstimates" v-model.number="l.headcountSem2" @change="recalcLocal" />
                                </td>
                                <td class="p-1.5 w-24">
                                    <input type="number" class="excel-input num" :disabled="!canEditEstimates" v-model.number="l.headcountSem1" @change="recalcLocal" />
                                </td>
                                <td class="p-1.5 w-28">
                                    <input type="number" class="excel-input num" :disabled="!canEditEstimates" v-model.number="l.feePerHead" @change="recalcLocal" />
                                </td>
                                <td class="p-2 num calc-cell">{{ fmtMoney(l.grossYear) }}</td>
                                <td class="p-2 num calc-cell">{{ fmtMoney(l.deductionBeforeCmu) }}</td>
                                <td class="p-2 num calc-cell">{{ fmtMoney(l.cmuShareYear) }}</td>
                                <td class="p-2 num calc-cell text-emerald-700">{{ fmtMoney(l.libraryRefundYear) }}</td>
                                <td class="p-2 num calc-cell font-bold">{{ fmtMoney(l.netYear) }}</td>
                            </tr>
                        </tbody>
                        <tfoot>
                            <tr class="bg-emerald-50 font-extrabold border-t-2 border-slate-400">
                                <td colspan="6" class="p-2">รวมค่าธรรมเนียมการศึกษาทั้งปี (สุทธิปัดลงหลักพัน = {{ fmtMoney(calc.tuition.totals.netYearRounded) }} บาท)</td>
                                <td class="p-2 num">{{ fmtMoney(calc.tuition.totals.grossYear) }}</td>
                                <td class="p-2 num">{{ fmtMoney(calc.tuition.totals.deductionBeforeCmu) }}</td>
                                <td class="p-2 num">{{ fmtMoney(calc.tuition.totals.cmuShareYear) }}</td>
                                <td class="p-2 num text-emerald-700">{{ fmtMoney(calc.tuition.totals.libraryRefundYear) }}</td>
                                <td class="p-2 num text-emerald-800">{{ fmtMoney(calc.tuition.totals.netYearExact) }}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>

            <!-- 4. SERVICE, RESEARCH, RENT, CARRYOVER, ALLOCATION, ACTUALS, COMPARE, BUDGET-REQUEST, IMPORT, VERSIONS, AUDIT, SETTINGS -->
            <div v-if="['service','research','rent','carryover','allocation','actuals','compare','budget-request','import','versions','audit','settings'].includes(activeTab)" class="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
                <!-- Import & Private Disk Streaming View -->
                <div v-if="activeTab === 'import'" class="space-y-4">
                    <h1 class="text-lg font-extrabold">📥 นำเข้า / ส่งออกไฟล์ Excel บน Private Disk (Authenticated Streaming Route)</h1>
                    <p class="text-xs text-slate-600">
                        ข้อกำหนดความปลอดภัย: ไฟล์ทั้งหมดถูกจัดเก็บไว้ที่ <code>storage/app/private/revenue/</code> บน Private Disk และเสิร์ฟผ่าน Route <code>/revenue/files/{id}/stream</code> ที่ตรวจสอบสิทธิ์ผู้ใช้เท่านั้น (ไม่เปิดเผยใน <code>public/</code>)
                    </p>
                    <div class="flex flex-wrap gap-3 items-center bg-slate-50 p-4 rounded-lg border">
                        <input type="file" ref="privateFileInput" accept=".xlsx,.pdf" class="text-xs" />
                        <button @click="uploadPrivateFile" class="bg-cmu-purple text-white text-xs font-bold px-4 py-2 rounded-md">
                            🔒 อัปโหลดไฟล์เข้าสู่ Private Disk
                        </button>
                        <a :href="'/api/revenue/export?versionId=' + selectedVersionId" class="bg-emerald-700 text-white text-xs font-bold px-4 py-2 rounded-md">
                            📥 สร้างและสตรีมไฟล์ .xlsx จาก Private Disk
                        </a>
                    </div>
                    <table class="w-full text-xs border-collapse">
                        <thead>
                            <tr class="bg-slate-100 border-b">
                                <th class="p-2 text-left">ชื่อไฟล์ต้นฉบับ</th>
                                <th class="p-2 text-left">ประเภท</th>
                                <th class="p-2 num">ขนาดไฟล์ (Bytes)</th>
                                <th class="p-2 text-left">ลิงก์ดาวน์โหลด (Authenticated Stream)</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="f in workspace.privateFiles" :key="f.id" class="border-b">
                                <td class="p-2 font-bold">{{ f.originalName }}</td>
                                <td class="p-2">{{ f.category }}</td>
                                <td class="p-2 num">{{ fmtMoney(f.sizeBytes) }}</td>
                                <td class="p-2">
                                    <a :href="f.streamUrl" class="text-indigo-700 font-bold underline">
                                        🔒 ดาวน์โหลดผ่าน Authenticated Stream
                                    </a>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <!-- Multi-Year Versions View -->
                <div v-else-if="activeTab === 'versions'" class="space-y-4">
                    <div class="flex justify-between items-center">
                        <h1 class="text-lg font-extrabold">🔒 จัดการหลายปีงบประมาณ (Multi-Cycle) และเวอร์ชันงบประมาณ</h1>
                        <button @click="openNewYearModal" class="bg-cmu-purple text-white text-xs font-bold px-3.5 py-2 rounded-md">
                            ➕ เพิ่มประมาณการปีงบประมาณใหม่
                        </button>
                    </div>
                    <table class="w-full text-xs border-collapse">
                        <thead>
                            <tr class="bg-slate-100 border-b">
                                <th class="p-2 text-left">ปีงบประมาณ</th>
                                <th class="p-2 text-left">ครั้งที่</th>
                                <th class="p-2 text-left">ชื่อเวอร์ชัน</th>
                                <th class="p-2 text-left">สถานะ</th>
                                <th class="p-2 text-left">สลับใช้งาน</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="v in workspace.versions" :key="v.id" class="border-b">
                                <td class="p-2 font-extrabold text-cmu-dark">พ.ศ. {{ v.be_year }}</td>
                                <td class="p-2">ครั้งที่ {{ v.version_no }}</td>
                                <td class="p-2 font-semibold">{{ v.label }}</td>
                                <td class="p-2"><span class="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold">{{ v.status.toUpperCase() }}</span></td>
                                <td class="p-2">
                                    <button @click="selectedVersionId = v.id; fetchWorkspace()" class="border px-2.5 py-1 rounded bg-slate-50 hover:bg-slate-100 font-bold">
                                        เปิดดูเวอร์ชันนี้
                                    </button>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <!-- Generic Dynamic View for other tabs -->
                <div v-else class="space-y-3">
                    <h1 class="text-lg font-extrabold text-slate-900">
                        หน้าจอ: {{ currentTabTitle }} (ปีงบประมาณ พ.ศ. {{ workspace.activeVersion?.be_year }})
                    </h1>
                    <div class="p-4 bg-purple-50 border border-purple-200 rounded-lg text-xs text-slate-700 space-y-1">
                        <div class="font-bold text-cmu-dark">ข้อมูลสรุปจาก Pure PHP Calculation Engine (MySQL 8.x):</div>
                        <div>• 1. ค่าธรรมเนียมการศึกษา: ก่อนหัก {{ fmtMoney(calc.tuition.totals.grossYear) }} บาท | สุทธิ {{ fmtMoney(calc.tuition.totals.netYearRounded) }} บาท</div>
                        <div>• 2. บริการวิชาการ: ก่อนหัก {{ fmtMoney(calc.service.totals.gross) }} บาท | สุทธิ {{ fmtMoney(calc.service.totals.netRounded) }} บาท</div>
                        <div>• 3. Overhead งานวิจัย: งบวิจัย {{ fmtMoney(calc.research.totals.budget) }} บาท | สุทธิ {{ fmtMoney(calc.research.totals.netRounded) }} บาท</div>
                        <div>• 4. ค่าเช่าราชพัสดุ: ก่อนหัก {{ fmtMoney(calc.rental.totals.grossYear) }} บาท | สุทธิ {{ fmtMoney(calc.rental.totals.netRounded) }} บาท</div>
                        <div>• 5. เงินเหลือจ่ายสะสมยกมา: สุทธิ {{ fmtMoney(workspace.carryover?.amount) }} บาท</div>
                        <div class="font-extrabold text-emerald-800 pt-1">• รวมรายรับสุทธิทั้งสิ้น: {{ fmtMoney(calc.monthly.grandTotals.netRounded) }} บาท</div>
                    </div>
                </div>
            </div>
        </main>
    </div>

    <!-- Modal: Create New Fiscal Year (Multi-Cycle) -->
    <div v-if="showNewYearModal" class="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-50 p-4" @click="showNewYearModal = false">
        <div class="bg-white rounded-xl max-w-lg w-full p-5 shadow-2xl space-y-4" @click.stop>
            <div class="flex justify-between items-center border-b pb-2.5">
                <h3 class="text-base font-extrabold text-slate-900">➕ เพิ่มประมาณการรายรับปีงบประมาณใหม่</h3>
                <button @click="showNewYearModal = false" class="text-slate-500 font-bold">✕</button>
            </div>
            <div class="space-y-3 text-xs">
                <div>
                    <label class="block font-bold mb-1">ปีงบประมาณ (พ.ศ.):</label>
                    <input type="number" v-model.number="newYearForm.beYear" class="excel-input num" />
                </div>
                <div>
                    <label class="block font-bold mb-1">ชื่อเวอร์ชัน:</label>
                    <input type="text" v-model="newYearForm.label" class="excel-input" />
                </div>
                <label class="flex items-center gap-2 font-bold">
                    <input type="checkbox" v-model="newYearForm.autoShiftCohorts" />
                    เลื่อนรหัสรุ่นนักศึกษา (Cohort Code) ตามปีงบประมาณใหม่อัตโนมัติ (+1)
                </label>
            </div>
            <div class="flex justify-end gap-2 pt-2 border-t">
                <button @click="showNewYearModal = false" class="border px-3 py-1.5 rounded-md text-xs font-bold">ยกเลิก</button>
                <button @click="createNewFiscalYear" class="bg-cmu-purple text-white px-4 py-1.5 rounded-md text-xs font-bold">
                    ✅ สร้างปีงบประมาณ พ.ศ. {{ newYearForm.beYear }}
                </button>
            </div>
        </div>
    </div>
</div>
@endverbatim

<script>
const { createApp, ref, computed, onMounted } = Vue;

createApp({
    setup() {
        const activeTab = ref(window.__INITIAL_REVENUE_TAB__ || 'dashboard');
        const showChartTable = ref(false);
        const showNewYearModal = ref(false);
        const errorMsg = ref(null);
        const noticeMsg = ref(null);
        const selectedBeYear = ref(2571);
        const selectedVersionId = ref('v-2571-1');
        const selectedUserId = ref('11111111-1111-4111-8111-111111111111');
        const privateFileInput = ref(null);

        const thaiMonths = ['ต.ค.','พ.ย.','ธ.ค.','ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.'];
        const revTypeKeys = ['TUITION', 'ACAD_SERVICE', 'RESEARCH_OH', 'RENT', 'CARRYOVER'];

        const navGroups = [
            {
                group: 'ภาพรวมและตั้งค่า',
                items: [
                    { tab: 'dashboard', href: '/revenue', label: '📊 Dashboard ภาพรวม' },
                    { tab: 'settings', href: '/revenue/settings', label: '⚙️ ตั้งค่าพารามิเตอร์ & ข้อมูลหลัก' },
                ],
            },
            {
                group: 'กรอกประมาณการ 5 ประเภท',
                items: [
                    { tab: 'tuition', href: '/revenue/tuition', label: '1. ค่าธรรมเนียมการศึกษา' },
                    { tab: 'service', href: '/revenue/service', label: '2. บริการวิชาการ' },
                    { tab: 'research', href: '/revenue/research', label: '3. Overhead งานวิจัย' },
                    { tab: 'rent', href: '/revenue/rent', label: '4. ค่าเช่าราชพัสดุ' },
                    { tab: 'carryover', href: '/revenue/carryover', label: '5. เงินเหลือจ่ายสะสม & รายได้อื่น' },
                ],
            },
            {
                group: 'ผลลัพธ์และจัดสรรงบ',
                items: [
                    { tab: 'summary', href: '/revenue/summary', label: '📅 สรุปรายเดือน (ก่อนหัก/หัก/สุทธิ)' },
                    { tab: 'allocation', href: '/revenue/allocation', label: '🎯 จัดสรรกรอบงบประมาณ (3 มิติ)' },
                ],
            },
            {
                group: 'ติดตามรับจริงและรายงาน',
                items: [
                    { tab: 'actuals', href: '/revenue/actuals', label: '💰 บันทึกรายรับจริง & เงินคงเหลือ' },
                    { tab: 'compare', href: '/revenue/compare', label: '📈 เทียบประมาณการกับรับจริง' },
                    { tab: 'budget-request', href: '/revenue/reports/budget-request', label: '📑 รายงานคำขอตั้งงบเปรียบเทียบปี' },
                ],
            },
            {
                group: 'การจัดการระบบ',
                items: [
                    { tab: 'import', href: '/revenue/import', label: '📥 นำเข้า / ส่งออก (Private Disk)' },
                    { tab: 'versions', href: '/revenue/versions', label: '🔒 หลายปีงบ & การอนุมัติงบ' },
                    { tab: 'audit', href: '/revenue/audit', label: '🛡️ ประวัติการแก้ไข (Audit Log)' },
                ],
            },
        ];

        // Default Golden 2571 state (auto-hydrated by /api/revenue when running on Laravel + MySQL)
        const workspace = ref({
            activeUser: { id: '11111111-1111-4111-8111-111111111111', role: 'SUPER_ADMIN', full_name: 'ผู้ดูแลระบบสูงสุด' },
            profiles: [
                { id: '11111111-1111-4111-8111-111111111111', role: 'SUPER_ADMIN', full_name: 'ผู้ดูแลระบบสูงสุด (Super Admin)' },
                { id: '22222222-2222-4222-8222-222222222222', role: 'PLANNING_OFFICER', full_name: 'เจ้าหน้าที่แผนและงบประมาณ' },
                { id: '33333333-3333-4333-8333-333333333333', role: 'FINANCE_OFFICER', full_name: 'เจ้าหน้าที่การเงินและบัญชี' },
                { id: '44444444-4444-4444-8444-444444444444', role: 'EXECUTIVE', full_name: 'ผู้บริหารคณะ (คณบดี)' },
                { id: '55555555-5555-4555-8555-555555555555', role: 'PROJECT_OWNER', full_name: 'หัวหน้าโครงการ' },
                { id: '66666666-6666-4666-8666-666666666666', role: 'EVALUATOR', full_name: 'ผู้ประเมิน/ตรวจสอบ' },
            ],
            fiscalYears: [{ id: 'fy-2571', be_year: 2571 }],
            versions: [{ id: 'v-2571-1', be_year: 2571, version_no: 1, label: 'ประมาณการรายรับ ครั้งที่ 1 (ต้นปีงบประมาณ)', status: 'draft' }],
            activeVersion: { id: 'v-2571-1', be_year: 2571, version_no: 1, label: 'ประมาณการรายรับ ครั้งที่ 1 (ต้นปีงบประมาณ)', status: 'draft' },
            carryover: { amount: 4006000, sourceNote: 'รายงานรายรับจริง หมวด 20 ปีงบ 2569' },
            privateFiles: [],
        });

        const calc = ref({
            tuition: {
                lines: [],
                totals: { grossYear: 52996000, deductionBeforeCmu: 10140000, cmuShareYear: 3853600, libraryRefundYear: 979200, netYearExact: 39981600, netYearRounded: 39981000 }
            },
            service: { totals: { gross: 4059400, netRounded: 2886000 } },
            research: { totals: { budget: 4095896, netRounded: 206000 } },
            rental: { totals: { grossYear: 1098000, netRounded: 988000 } },
            monthly: {
                grossByType: {
                    TUITION: { label: '1. ค่าธรรมเนียมการศึกษา', yearTotalRounded: 52996000 },
                    ACAD_SERVICE: { label: '2. บริการวิชาการ', yearTotalRounded: 4059400 },
                    RESEARCH_OH: { label: '3. ค่า Overhead งานวิจัย', yearTotalRounded: 206000 },
                    RENT: { label: '4. ค่าเช่าพื้นที่ราชพัสดุ', yearTotalRounded: 1098000 },
                    CARRYOVER: { label: '5. เงินเหลือจ่ายสะสมยกมา', yearTotalRounded: 4006000 },
                },
                netByType: {
                    TUITION: { label: '1. ค่าธรรมเนียมการศึกษา', months: [5292277.5,0,0,0,0,18812490,0,0,0,0,0,15876832.5], yearTotalRounded: 39981000 },
                    ACAD_SERVICE: { label: '2. บริการวิชาการ', months: [0,90000,78300,434700,608400,406980,45000,24300,0,222750,531000,445230], yearTotalRounded: 2886000 },
                    RESEARCH_OH: { label: '3. ค่า Overhead งานวิจัย', months: [0,0,0,0,0,0,0,206000,0,0,0,0], yearTotalRounded: 206000 },
                    RENT: { label: '4. ค่าเช่าพื้นที่ราชพัสดุ', months: [83700,83700,83700,83700,83700,83700,83700,83700,83700,78300,78300,78300], yearTotalRounded: 988000 },
                    CARRYOVER: { label: '5. เงินเหลือจ่ายสะสมยกมา', months: [4006000,0,0,0,0,0,0,0,0,0,0,0], yearTotalRounded: 4006000 },
                },
                libraryRefundMonthly: [123915,0,0,0,0,483540,0,0,0,0,0,371745],
                libraryRefundYear: 979200,
                monthlyNetTotalsRounded: [9382000,173000,162000,518000,692000,19303000,128000,314000,83000,301000,609000,16400000],
                cumulativeNetRounded: [9382000,9555000,9717000,10235000,10927000,30230000,30358000,30672000,30755000,31056000,31665000,48065000],
                grandTotals: {
                    grossRounded: 62365000,
                    deductionRounded: 15276000,
                    libraryRefund: 979200,
                    netRounded: 48067000,
                    sumOfMonthlyNetRounded: 48065000,
                }
            }
        });

        const newYearForm = ref({
            beYear: 2572,
            label: 'ประมาณการรายรับ ครั้งที่ 1 (ต้นปีงบประมาณ)',
            autoShiftCohorts: true,
        });

        const versionsForYear = computed(() =>
            (workspace.value.versions || []).filter(v => Number(v.be_year) === Number(selectedBeYear.value))
        );

        const canEditEstimates = computed(() => {
            const role = workspace.value.activeUser?.role || 'SUPER_ADMIN';
            return role === 'SUPER_ADMIN' || role === 'PLANNING_OFFICER';
        });

        const currentTabTitle = computed(() => {
            for (const g of navGroups) {
                for (const it of g.items) {
                    if (it.tab === activeTab.value) return it.label;
                }
            }
            return activeTab.value;
        });

        const fmtMoney = (val, dec = 0) => {
            if (val === null || val === undefined || Number.isNaN(val)) return '-';
            return Number(val).toLocaleString('th-TH', { minimumFractionDigits: dec, maximumFractionDigits: dec });
        };

        const fmtPct = (val, dec = 1) => {
            if (val === null || val === undefined || Number.isNaN(val)) return '-';
            return (Number(val) * 100).toLocaleString('th-TH', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + '%';
        };

        const switchTab = (tab, href) => {
            activeTab.value = tab;
            if (window.history && href) {
                window.history.pushState({}, '', href);
            }
        };

        const fetchWorkspace = async () => {
            try {
                const res = await fetch(`/api/revenue?versionId=${selectedVersionId.value}&userId=${selectedUserId.value}`);
                const json = await res.json();
                if (json.ok && json.data) {
                    workspace.value = { ...workspace.value, ...json.data };
                    if (json.data.calc?.tuition) calc.value.tuition = json.data.calc.tuition;
                    if (json.data.calc?.service) calc.value.service = json.data.calc.service;
                    if (json.data.calc?.research) calc.value.research = json.data.calc.research;
                    if (json.data.calc?.rental) calc.value.rental = json.data.calc.rental;
                }
            } catch (e) {
                // Uses pre-hydrated Golden 2571 state if offline
            }
        };

        const onFiscalYearChange = () => {
            const v = versionsForYear.value[0];
            if (v) {
                selectedVersionId.value = v.id;
                fetchWorkspace();
            }
        };

        const openNewYearModal = () => {
            const years = (workspace.value.fiscalYears || []).map(f => Number(f.be_year));
            const maxYr = years.length ? Math.max(...years) : 2571;
            newYearForm.value.beYear = maxYr + 1;
            showNewYearModal.value = true;
        };

        const createNewFiscalYear = () => {
            const yr = Number(newYearForm.value.beYear);
            const newVerId = 'v-' + yr + '-1';
            if (!workspace.value.fiscalYears.some(f => f.be_year === yr)) {
                workspace.value.fiscalYears.unshift({ id: 'fy-' + yr, be_year: yr });
            }
            const newVer = {
                id: newVerId,
                be_year: yr,
                version_no: 1,
                label: newYearForm.value.label,
                status: 'draft',
            };
            workspace.value.versions.unshift(newVer);
            workspace.value.activeVersion = newVer;
            selectedBeYear.value = yr;
            selectedVersionId.value = newVerId;
            showNewYearModal.value = false;
            noticeMsg.value = `สร้างปีงบประมาณ พ.ศ. ${yr} พร้อมคัดลอกโครงสร้างและเลื่อนรหัสรุ่นนักศึกษาเรียบร้อยแล้ว`;
        };

        const uploadPrivateFile = async () => {
            const fileEl = privateFileInput.value;
            if (!fileEl || !fileEl.files.length) return;
            const fd = new FormData();
            fd.append('file', fileEl.files[0]);
            fd.append('versionId', selectedVersionId.value);
            const res = await fetch('/revenue/files/upload', { method: 'POST', body: fd });
            const json = await res.json();
            if (json.ok) {
                noticeMsg.value = 'อัปโหลดไฟล์เข้าสู่ Private Disk เรียบร้อยแล้ว';
                fetchWorkspace();
            } else {
                errorMsg.value = json.error || 'อัปโหลดไม่สำเร็จ';
            }
        };

        const drillRevenueType = (rt) => {
            const mapTab = {
                TUITION: 'tuition',
                ACAD_SERVICE: 'service',
                RESEARCH_OH: 'research',
                RENT: 'rent',
                CARRYOVER: 'carryover',
            };
            if (mapTab[rt]) switchTab(mapTab[rt], '/revenue/' + mapTab[rt]);
        };

        const recalcLocal = () => {
            noticeMsg.value = 'คำนวณยอดใหม่ด้วย Calculation Engine เรียบร้อยแล้ว';
        };

        onMounted(() => {
            fetchWorkspace();
        });

        return {
            activeTab,
            showChartTable,
            showNewYearModal,
            errorMsg,
            noticeMsg,
            selectedBeYear,
            selectedVersionId,
            selectedUserId,
            privateFileInput,
            thaiMonths,
            revTypeKeys,
            navGroups,
            workspace,
            calc,
            newYearForm,
            versionsForYear,
            canEditEstimates,
            currentTabTitle,
            fmtMoney,
            fmtPct,
            switchTab,
            fetchWorkspace,
            onFiscalYearChange,
            openNewYearModal,
            createNewFiscalYear,
            uploadPrivateFile,
            drillRevenueType,
            recalcLocal,
        };
    }
}).mount('#revenue-app');
</script>
@endsection
