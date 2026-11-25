<?php

namespace App\Http\Controllers\Revenue;

use App\Models\AllocationDimension;
use App\Models\AllocationItem;
use App\Models\AllocationPct;
use App\Models\AuditLog;
use App\Models\Carryover;
use App\Models\EstimateVersion;
use App\Models\ExpenditureActual;
use App\Models\FeeSchedule;
use App\Models\FiscalYear;
use App\Models\HistoricalUsage;
use App\Models\MonthDistribution;
use App\Models\OtherIncomeLine;
use App\Models\Parameter;
use App\Models\PrivateFile;
use App\Models\Profile;
use App\Models\Program;
use App\Models\RentalItem;
use App\Models\ResearchProject;
use App\Models\RevenueActual;
use App\Models\RoundingRule;
use App\Models\ServiceProject;
use App\Models\TuitionLine;
use App\Models\VersionSnapshot;
use App\Services\Revenue\RevenueCalculationService;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;
use RuntimeException;

class RevenueController extends Controller
{
    public function __construct(
        protected RevenueCalculationService $calcService
    ) {}

    /**
     * Render Laravel Blade + Vue.js 3 (Global/CDN, Non-SFC) page for any of the 15 routes
     */
    public function showPage(Request $request, string $tab = 'dashboard')
    {
        return view('revenue.index', [
            'initialTab' => $tab,
        ]);
    }

    /**
     * GET /api/revenue — Load full workspace data from MySQL 8.x & compute via Pure Calculation Service
     */
    public function getWorkspace(Request $request)
    {
        $userId = $request->query('userId');
        $versionId = $request->query('versionId');
        $compareBasis = $request->query('compareBasis', 'net') === 'gross' ? 'gross' : 'net';
        $compareMonthSeq = max(1, min(12, (int) $request->query('compareMonthSeq', 12)));

        $profiles = Profile::orderBy('role')->get();
        $activeUser = ($userId ? $profiles->firstWhere('id', $userId) : null)
            ?? $profiles->firstWhere('role', 'SUPER_ADMIN')
            ?? $profiles->first();

        $fiscalYears = FiscalYear::orderByDesc('be_year')->get();
        $versions = EstimateVersion::with('fiscalYear')
            ->get()
            ->sortByDesc(fn ($v) => ($v->fiscalYear->be_year * 100) + $v->version_no)
            ->values()
            ->map(fn ($v) => [
                'id' => $v->id,
                'fiscal_year_id' => $v->fiscal_year_id,
                'be_year' => $v->fiscalYear->be_year,
                'version_no' => $v->version_no,
                'label' => $v->label,
                'status' => $v->status,
                'parent_version_id' => $v->parent_version_id,
                'approved_by' => $v->approved_by,
                'approved_at' => $v->approved_at?->toISOString(),
                'created_at' => $v->created_at?->toISOString(),
                'updated_at' => $v->updated_at?->toISOString(),
            ]);

        $activeVersion = ($versionId ? $versions->firstWhere('id', $versionId) : null)
            ?? $versions->first();

        if (!$activeVersion) {
            return response()->json(['ok' => false, 'error' => 'ไม่พบข้อมูลเวอร์ชันงบประมาณในระบบ'], 404);
        }

        $verId = $activeVersion['id'];
        $fyId = $activeVersion['fiscal_year_id'];
        $beYear = (int) $activeVersion['be_year'];

        // Parameters
        $paramsRows = Parameter::where('version_id', $verId)
            ->orWhere(function ($q) use ($beYear) {
                $q->whereNull('version_id')->where('effective_be_year', $beYear);
            })
            ->orderBy('key')
            ->get();

        $paramNum = function (string $key, float $fallback) use ($paramsRows): float {
            $r = $paramsRows->firstWhere('key', $key);
            return ($r && $r->value_numeric !== null) ? (float) $r->value_numeric : $fallback;
        };
        $paramStr = function (string $key, string $fallback) use ($paramsRows): string {
            $r = $paramsRows->firstWhere('key', $key);
            return ($r && $r->value_text !== null) ? (string) $r->value_text : $fallback;
        };

        // Month Distribution
        $distRows = MonthDistribution::where('version_id', $verId)->get();
        $monthDistribution = [];
        for ($m = 1; $m <= 12; $m++) {
            $s2 = $distRows->first(fn ($r) => (int) $r->month_seq === $m && (int) $r->semester === 2);
            $s1 = $distRows->first(fn ($r) => (int) $r->month_seq === $m && (int) $r->semester === 1);
            $monthDistribution[] = [
                'monthSeq' => $m,
                'semester2Pct' => $s2 ? (float) $s2->pct : 0.0,
                'semester1Pct' => $s1 ? (float) $s1->pct : 0.0,
            ];
        }

        // Fee Schedules
        $feeRows = FeeSchedule::where('effective_be_year', $beYear)->get();
        $feeSchedulesMap = [];
        foreach ($feeRows as $fr) {
            $feeSchedulesMap[$fr->level] = [
                'id' => $fr->id,
                'level' => $fr->level,
                'libraryFee' => (float) $fr->library_fee,
                'itFee' => (float) $fr->it_fee,
                'healthFee' => (float) $fr->health_fee,
                'registrationFee' => (float) $fr->registration_fee,
                'totalDeductionPerHead' => (float) $fr->total_deduction_per_head,
                'libraryRefundPct' => (float) $fr->library_refund_pct,
                'effectiveBeYear' => (int) $fr->effective_be_year,
            ];
        }

        $programs = Program::orderBy('report_group')->orderBy('code')->get();

        // 1. Tuition Lines
        $tuitionRows = TuitionLine::with('program')->where('version_id', $verId)->orderBy('created_at')->get();
        $tuitionInputs = $tuitionRows->map(fn ($tl) => [
            'id' => $tl->id,
            'programId' => $tl->program_id,
            'programCode' => $tl->program->code,
            'programName' => $tl->program->name_th,
            'level' => $tl->program->level,
            'reportGroup' => $tl->program->report_group,
            'cohortCode' => $tl->cohort_code,
            'lineType' => $tl->line_type,
            'headcountSem2' => (int) $tl->headcount_sem2,
            'headcountSem1' => (int) $tl->headcount_sem1,
            'feePerHead' => (float) $tl->fee_per_head,
        ])->toArray();

        $tuitionCalc = $this->calcService->calculateTuition($tuitionInputs, [
            'beYear' => $beYear,
            'cmuPct' => $paramNum('CMU_PCT', 0.10),
            'scholarshipPct' => $paramNum('SCHOLARSHIP_PCT', 0.20),
            'feeSchedules' => $feeSchedulesMap,
        ]);

        // 2. Service Projects
        $serviceRows = ServiceProject::where('version_id', $verId)->orderBy('created_at')->get();
        $serviceInputs = $serviceRows->map(fn ($sp) => [
            'id' => $sp->id,
            'name' => $sp->name,
            'partner' => $sp->partner,
            'category' => $sp->category,
            'batches' => (int) $sp->batches,
            'attendeesPerBatch' => (int) $sp->attendees_per_batch,
            'feePerHead' => (float) $sp->fee_per_head,
            'applyMgmtDeduction' => (bool) $sp->apply_mgmt_deduction,
            'monthSeq' => (int) $sp->month_seq,
            'note' => $sp->note,
        ])->toArray();

        $serviceCalc = $this->calcService->calculateService($serviceInputs, [
            'serviceDeduct1' => $paramNum('SERVICE_DEDUCT_1', 0.10),
            'serviceDeduct2' => $paramNum('SERVICE_DEDUCT_2', 0.40),
            'serviceDeduct2Base' => $paramStr('SERVICE_DEDUCT_2_BASE', 'after_d1'),
        ]);

        // 3. Research Projects
        $researchRows = ResearchProject::where('version_id', $verId)->orderBy('created_at')->get();
        $researchInputs = $researchRows->map(fn ($rp) => [
            'id' => $rp->id,
            'name' => $rp->name,
            'funder' => $rp->funder,
            'piName' => $rp->pi_name,
            'budget' => (float) $rp->budget,
            'overheadRateOverride' => $rp->overhead_rate_override !== null ? (float) $rp->overhead_rate_override : null,
            'monthSeq' => (int) $rp->month_seq,
            'note' => $rp->note,
        ])->toArray();

        $researchCalc = $this->calcService->calculateResearch($researchInputs, [
            'ohDefaultRate' => $paramNum('OH_DEFAULT_RATE', 0.0),
            'ohCentralPct' => $paramNum('OH_CENTRAL_PCT', 0.0),
        ]);

        // 4. Rental Items
        $rentalRows = RentalItem::where('version_id', $verId)->orderBy('created_at')->get();
        $rentalInputs = $rentalRows->map(fn ($ri) => [
            'id' => $ri->id,
            'name' => $ri->name,
            'tenant' => $ri->tenant,
            'areaSqm' => $ri->area_sqm !== null ? (float) $ri->area_sqm : null,
            'monthlyRent' => (float) $ri->monthly_rent,
            'startMonthSeq' => (int) $ri->start_month_seq,
            'endMonthSeq' => (int) $ri->end_month_seq,
            'note' => $ri->note,
        ])->toArray();

        $rentalCalc = $this->calcService->calculateRental($rentalInputs, [
            'rentDeductPct' => $paramNum('RENT_DEDUCT', 0.10),
        ]);

        // 5. Carryover & Other Income
        $carryRow = Carryover::where('version_id', $verId)->first();
        $carryoverAmount = $carryRow ? (float) $carryRow->amount : 0.0;

        $otherRows = OtherIncomeLine::where('version_id', $verId)->orderBy('month_seq')->get();

        // Private Files list (served via authenticated streaming route)
        $privateFiles = PrivateFile::orderByDesc('created_at')->limit(50)->get()->map(fn ($pf) => [
            'id' => $pf->id,
            'originalName' => $pf->original_name,
            'category' => $pf->category,
            'sizeBytes' => $pf->size_bytes,
            'createdAt' => $pf->created_at?->toISOString(),
            'streamUrl' => route('revenue.files.stream', ['id' => $pf->id]),
        ]);

        $auditLogs = AuditLog::with('performer')
            ->orderByDesc('performed_at')
            ->limit(150)
            ->get()
            ->map(fn ($al) => [
                'id' => $al->id,
                'table_name' => $al->table_name,
                'record_id' => $al->record_id,
                'action' => $al->action,
                'old_data' => $al->old_data,
                'new_data' => $al->new_data,
                'performed_by' => $al->performed_by,
                'performer_name' => $al->performer?->full_name ?? 'System',
                'performer_role' => $al->performer?->role ?? 'SUPER_ADMIN',
                'performed_at' => $al->performed_at?->toISOString(),
            ]);

        return response()->json([
            'ok' => true,
            'data' => [
                'activeUser' => $activeUser,
                'profiles' => $profiles,
                'fiscalYears' => $fiscalYears,
                'versions' => $versions,
                'activeVersion' => $activeVersion,
                'parameters' => $paramsRows,
                'monthDistribution' => $monthDistribution,
                'feeSchedules' => array_values($feeSchedulesMap),
                'programs' => $programs,
                'carryover' => [
                    'id' => $carryRow?->id ?? '',
                    'amount' => $carryoverAmount,
                    'sourceNote' => $carryRow?->source_note ?? '',
                ],
                'otherIncomeLines' => $otherRows,
                'privateFiles' => $privateFiles,
                'calc' => [
                    'tuition' => $tuitionCalc,
                    'service' => $serviceCalc,
                    'research' => $researchCalc,
                    'rental' => $rentalCalc,
                ],
                'auditLogs' => $auditLogs,
            ],
        ]);
    }

    /**
     * Export Excel report to Private Disk ('private') and stream via Authenticated Streaming Route
     */
    public function exportAndStreamPrivateExcel(Request $request)
    {
        $versionId = $request->query('versionId');
        $ver = $versionId
            ? EstimateVersion::with('fiscalYear')->findOrFail($versionId)
            : EstimateVersion::with('fiscalYear')->firstOrFail();

        $spreadsheet = new Spreadsheet();
        $sheet = $spreadsheet->getActiveSheet();
        $sheet->setTitle('สรุปรายรับ');
        $sheet->setCellValue('A1', "ประมาณการรายรับเงินรายได้ ปีงบประมาณ พ.ศ. {$ver->fiscalYear->be_year} ({$ver->label})");

        $fileId = (string) Str::uuid();
        $fileName = "Revenue_Estimate_{$ver->fiscalYear->be_year}_v{$ver->version_no}.xlsx";
        $relativePath = "revenue/exports/{$fileId}.xlsx";

        $fullPrivatePath = Storage::disk('private')->path($relativePath);
        if (!is_dir(dirname($fullPrivatePath))) {
            mkdir(dirname($fullPrivatePath), 0775, true);
        }

        $writer = new Xlsx($spreadsheet);
        $writer->save($fullPrivatePath);

        $record = PrivateFile::create([
            'id' => $fileId,
            'version_id' => $ver->id,
            'original_name' => $fileName,
            'disk_path' => $relativePath,
            'mime_type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'size_bytes' => filesize($fullPrivatePath) ?: 0,
            'category' => 'excel_export',
        ]);

        // Redirect to the Authenticated Private Streaming Route
        return redirect()->route('revenue.files.stream', ['id' => $record->id]);
    }
}
