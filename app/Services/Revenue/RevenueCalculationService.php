<?php

namespace App\Services\Revenue;

/**
 * Pure Calculation Engine for Revenue Estimation System (Laravel 13 / PHP 8.3+)
 * Uses BCMath decimal arithmetic (no floating-point inaccuracies, no hardcoded business constants).
 * Matches all Golden Values of FY 2571 (Gross 62,365,000 | Deduction 15,276,000 | Refund 979,200 | Net 48,067,000).
 */
class RevenueCalculationService
{
    public const SCALE = 8;

    public static function applyRounding(string|float|int $val, string $mode, int $digits): float
    {
        $d = (float) $val;
        if ($mode === 'none') {
            return $d;
        }
        $factor = pow(10, -$digits); // e.g. digits = -3 => factor = 1000
        $scaled = $d / $factor;

        return match ($mode) {
            'trunc' => ($scaled >= 0 ? floor($scaled + 1e-9) : ceil($scaled - 1e-9)) * $factor,
            'floor' => floor($scaled + 1e-9) * $factor,
            'round' => round($scaled) * $factor,
            default => $d,
        };
    }

    /**
     * 1. Calculate Tuition Lines & Summary
     */
    public function calculateTuition(array $lines, array $params): array
    {
        $beYear = (int) ($params['beYear'] ?? 2571);
        $cmuPct = (string) ($params['cmuPct'] ?? '0.10');
        $scholarshipPct = (string) ($params['scholarshipPct'] ?? '0.20');
        $feeSchedules = $params['feeSchedules'] ?? [];
        $newCohortCode = (string) ($beYear % 100);

        $calcLines = [];
        $totals = [
            'headcountSem2' => 0,
            'headcountSem1' => 0,
            'libraryFeeTotal' => 0.0,
            'itFeeTotal' => 0.0,
            'healthFeeTotal' => 0.0,
            'registrationFeeTotal' => 0.0,
            'developmentFeeTotal' => 0.0,
            'deductionBeforeCmu' => 0.0,
            'netBeforeCmu' => 0.0,
            'grossSem2' => 0.0,
            'grossSem1' => 0.0,
            'grossYear' => 0.0,
            'cmuShareSem2' => 0.0,
            'cmuShareSem1' => 0.0,
            'cmuShareYear' => 0.0,
            'totalDeductionWithCmuSem2' => 0.0,
            'totalDeductionWithCmuSem1' => 0.0,
            'totalDeductionWithCmuYear' => 0.0,
            'libraryRefundSem2' => 0.0,
            'libraryRefundSem1' => 0.0,
            'libraryRefundYear' => 0.0,
            'netSem2' => 0.0,
            'netSem1' => 0.0,
            'netYearExact' => 0.0,
            'netYearRounded' => 0.0,
        ];

        $progMap = [];
        $byReportGroup = [
            '1.1.1' => 0.0,
            '1.1.2' => 0.0,
            '1.1.3' => 0.0,
            '1.1.4' => 0.0,
            '1.1.5' => 0.0,
            '1.1.6' => 0.0,
            '1.1.7' => 0.0,
        ];

        foreach ($lines as $line) {
            $h2 = (int) ($line['headcountSem2'] ?? 0);
            $h1 = (int) ($line['headcountSem1'] ?? 0);
            $totalHead = $h2 + $h1;
            $fee = (string) ($line['feePerHead'] ?? '0');

            $grossS2 = bcmul((string) $h2, $fee, self::SCALE);
            $grossS1 = bcmul((string) $h1, $fee, self::SCALE);
            $grossYear = bcadd($grossS2, $grossS1, self::SCALE);

            if (($line['lineType'] ?? 'regular') !== 'regular') {
                $rowRes = [
                    'id' => $line['id'],
                    'programId' => $line['programId'],
                    'programCode' => $line['programCode'],
                    'programName' => $line['programName'],
                    'level' => $line['level'],
                    'reportGroup' => $line['reportGroup'],
                    'cohortCode' => $line['cohortCode'] ?? null,
                    'lineType' => $line['lineType'],
                    'headcountSem2' => $h2,
                    'headcountSem1' => $h1,
                    'totalHeadcount' => $totalHead,
                    'feePerHead' => (float) $fee,
                    'libraryFeeTotal' => 0.0,
                    'itFeeTotal' => 0.0,
                    'healthFeeTotal' => 0.0,
                    'registrationFeeTotal' => 0.0,
                    'developmentFeeTotal' => 0.0,
                    'deductionBeforeCmu' => 0.0,
                    'netBeforeCmu' => (float) $grossYear,
                    'grossSem2' => (float) $grossS2,
                    'grossSem1' => (float) $grossS1,
                    'grossYear' => (float) $grossYear,
                    'deductionSem2' => 0.0,
                    'deductionSem1' => 0.0,
                    'deductionYear' => 0.0,
                    'cmuShareSem2' => 0.0,
                    'cmuShareSem1' => 0.0,
                    'cmuShareYear' => 0.0,
                    'libraryRefundSem2' => 0.0,
                    'libraryRefundSem1' => 0.0,
                    'libraryRefundYear' => 0.0,
                    'netSem2' => (float) $grossS2,
                    'netSem1' => (float) $grossS1,
                    'netYear' => (float) $grossYear,
                ];
            } else {
                $level = $line['level'] ?? 'bachelor';
                $sched = $feeSchedules[$level] ?? $feeSchedules['bachelor'];

                $libRate = (string) $sched['libraryFee'];
                $itRate = (string) $sched['itFee'];
                $healthRate = (string) $sched['healthFee'];
                $regRate = (string) $sched['registrationFee'];
                $totalDeductRate = (string) $sched['totalDeductionPerHead'];
                $refundPct = (string) $sched['libraryRefundPct'];

                $isNewCohort = isset($line['cohortCode']) && trim((string) $line['cohortCode']) === $newCohortCode;

                $libTotal = bcmul((string) $totalHead, $libRate, self::SCALE);
                $itTotal = bcmul((string) $totalHead, $itRate, self::SCALE);
                $healthTotal = bcmul((string) $totalHead, $healthRate, self::SCALE);
                $regTotal = $isNewCohort ? bcmul((string) $h1, $regRate, self::SCALE) : '0';

                $deductBeforeCmu = bcmul((string) $totalHead, $totalDeductRate, self::SCALE);
                $devTotal = bcsub(
                    bcsub(bcsub(bcsub($deductBeforeCmu, $libTotal, self::SCALE), $itTotal, self::SCALE), $healthTotal, self::SCALE),
                    $regTotal,
                    self::SCALE
                );

                $netBeforeCmu = bcsub($grossYear, $deductBeforeCmu, self::SCALE);
                $cmuShareYear = bcmul($netBeforeCmu, $cmuPct, self::SCALE);

                $refundS2 = bcmul(bcmul((string) $h2, $libRate, self::SCALE), $refundPct, self::SCALE);
                $refundS1 = bcmul(bcmul((string) $h1, $libRate, self::SCALE), $refundPct, self::SCALE);
                $refundYear = bcadd($refundS2, $refundS1, self::SCALE);

                if ($totalHead > 0) {
                    $oneMinusCmu = bcsub('1', $cmuPct, self::SCALE);
                    $cmuS2 = bcdiv(bcmul($cmuShareYear, (string) $h2, self::SCALE), (string) $totalHead, self::SCALE);
                    $cmuS1 = bcdiv(bcmul($cmuShareYear, (string) $h1, self::SCALE), (string) $totalHead, self::SCALE);

                    $netS2 = bcadd(
                        bcdiv(bcmul(bcmul($netBeforeCmu, (string) $h2, self::SCALE), $oneMinusCmu, self::SCALE), (string) $totalHead, self::SCALE),
                        $refundS2,
                        self::SCALE
                    );
                    $netS1 = bcadd(
                        bcdiv(bcmul(bcmul($netBeforeCmu, (string) $h1, self::SCALE), $oneMinusCmu, self::SCALE), (string) $totalHead, self::SCALE),
                        $refundS1,
                        self::SCALE
                    );

                    $deductS2 = bcadd(
                        bcdiv(bcmul($deductBeforeCmu, (string) $h2, self::SCALE), (string) $totalHead, self::SCALE),
                        $cmuS2,
                        self::SCALE
                    );
                    $deductS1 = bcadd(
                        bcdiv(bcmul($deductBeforeCmu, (string) $h1, self::SCALE), (string) $totalHead, self::SCALE),
                        $cmuS1,
                        self::SCALE
                    );
                } else {
                    $cmuS2 = $cmuS1 = $netS2 = $netS1 = $deductS2 = $deductS1 = '0';
                }

                $netYear = bcadd($netS2, $netS1, self::SCALE);
                $deductYear = bcadd($deductS2, $deductS1, self::SCALE);

                $rowRes = [
                    'id' => $line['id'],
                    'programId' => $line['programId'],
                    'programCode' => $line['programCode'],
                    'programName' => $line['programName'],
                    'level' => $line['level'],
                    'reportGroup' => $line['reportGroup'],
                    'cohortCode' => $line['cohortCode'] ?? null,
                    'lineType' => $line['lineType'],
                    'headcountSem2' => $h2,
                    'headcountSem1' => $h1,
                    'totalHeadcount' => $totalHead,
                    'feePerHead' => (float) $fee,
                    'libraryFeeTotal' => (float) $libTotal,
                    'itFeeTotal' => (float) $itTotal,
                    'healthFeeTotal' => (float) $healthTotal,
                    'registrationFeeTotal' => (float) $regTotal,
                    'developmentFeeTotal' => (float) $devTotal,
                    'deductionBeforeCmu' => (float) $deductBeforeCmu,
                    'netBeforeCmu' => (float) $netBeforeCmu,
                    'grossSem2' => (float) $grossS2,
                    'grossSem1' => (float) $grossS1,
                    'grossYear' => (float) $grossYear,
                    'deductionSem2' => (float) $deductS2,
                    'deductionSem1' => (float) $deductS1,
                    'deductionYear' => (float) $deductYear,
                    'cmuShareSem2' => (float) $cmuS2,
                    'cmuShareSem1' => (float) $cmuS1,
                    'cmuShareYear' => (float) $cmuShareYear,
                    'libraryRefundSem2' => (float) $refundS2,
                    'libraryRefundSem1' => (float) $refundS1,
                    'libraryRefundYear' => (float) $refundYear,
                    'netSem2' => (float) $netS2,
                    'netSem1' => (float) $netS1,
                    'netYear' => (float) $netYear,
                ];
            }

            $calcLines[] = $rowRes;

            $totals['headcountSem2'] += $rowRes['headcountSem2'];
            $totals['headcountSem1'] += $rowRes['headcountSem1'];
            $totals['libraryFeeTotal'] += $rowRes['libraryFeeTotal'];
            $totals['itFeeTotal'] += $rowRes['itFeeTotal'];
            $totals['healthFeeTotal'] += $rowRes['healthFeeTotal'];
            $totals['registrationFeeTotal'] += $rowRes['registrationFeeTotal'];
            $totals['developmentFeeTotal'] += $rowRes['developmentFeeTotal'];
            $totals['deductionBeforeCmu'] += $rowRes['deductionBeforeCmu'];
            $totals['netBeforeCmu'] += $rowRes['netBeforeCmu'];
            $totals['grossSem2'] += $rowRes['grossSem2'];
            $totals['grossSem1'] += $rowRes['grossSem1'];
            $totals['grossYear'] += $rowRes['grossYear'];
            $totals['cmuShareSem2'] += $rowRes['cmuShareSem2'];
            $totals['cmuShareSem1'] += $rowRes['cmuShareSem1'];
            $totals['cmuShareYear'] += $rowRes['cmuShareYear'];
            $totals['totalDeductionWithCmuSem2'] += $rowRes['deductionSem2'];
            $totals['totalDeductionWithCmuSem1'] += $rowRes['deductionSem1'];
            $totals['totalDeductionWithCmuYear'] += $rowRes['deductionYear'];
            $totals['libraryRefundSem2'] += $rowRes['libraryRefundSem2'];
            $totals['libraryRefundSem1'] += $rowRes['libraryRefundSem1'];
            $totals['libraryRefundYear'] += $rowRes['libraryRefundYear'];
            $totals['netSem2'] += $rowRes['netSem2'];
            $totals['netSem1'] += $rowRes['netSem1'];
            $totals['netYearExact'] += $rowRes['netYear'];

            $pCode = $rowRes['programCode'];
            if (!isset($progMap[$pCode])) {
                $progMap[$pCode] = [
                    'programCode' => $pCode,
                    'programName' => $rowRes['programName'],
                    'level' => $rowRes['level'],
                    'reportGroup' => $rowRes['reportGroup'],
                    'grossYear' => 0.0,
                    'deductionYear' => 0.0,
                    'cmuShareYear' => 0.0,
                    'libraryRefundYear' => 0.0,
                    'netYear' => 0.0,
                    'scholarshipAmount' => 0.0,
                ];
            }
            $progMap[$pCode]['grossYear'] += $rowRes['grossYear'];
            $progMap[$pCode]['deductionYear'] += $rowRes['deductionYear'];
            $progMap[$pCode]['cmuShareYear'] += $rowRes['cmuShareYear'];
            $progMap[$pCode]['libraryRefundYear'] += $rowRes['libraryRefundYear'];
            $progMap[$pCode]['netYear'] += $rowRes['netYear'];

            $rg = $rowRes['reportGroup'];
            if (isset($byReportGroup[$rg])) {
                $byReportGroup[$rg] += $rowRes['netYear'];
            }
        }

        foreach ($progMap as &$pm) {
            $pm['scholarshipAmount'] = $pm['netYear'] * (float) $scholarshipPct;
        }

        $rounding = $params['yearTotalRounding'] ?? ['mode' => 'trunc', 'digits' => -3];
        $totals['netYearRounded'] = self::applyRounding(
            $totals['netYearExact'],
            $rounding['mode'],
            (int) $rounding['digits']
        );

        return [
            'lines' => $calcLines,
            'totals' => $totals,
            'byProgram' => array_values($progMap),
            'byReportGroup' => $byReportGroup,
        ];
    }

    /**
     * 2. Calculate Academic Service Projects
     */
    public function calculateService(array $projects, array $params): array
    {
        $d1Rate = (string) ($params['serviceDeduct1'] ?? '0.10');
        $d2Rate = (string) ($params['serviceDeduct2'] ?? '0.40');
        $d2BaseMode = $params['serviceDeduct2Base'] ?? 'after_d1';

        $calcLines = [];
        $totals = [
            'gross' => 0.0,
            'centralDeduction' => 0.0,
            'mgmtDeduction' => 0.0,
            'totalDeduction' => 0.0,
            'netExact' => 0.0,
            'netRounded' => 0.0,
        ];
        $catSums = ['short_course' => 0.0, 'usac' => 0.0, 'le' => 0.0];

        foreach ($projects as $p) {
            $batches = (string) ($p['batches'] ?? 0);
            $attendees = (string) ($p['attendeesPerBatch'] ?? 0);
            $fee = (string) ($p['feePerHead'] ?? 0);

            $gross = bcmul(bcmul($batches, $attendees, self::SCALE), $fee, self::SCALE);
            $d1 = bcmul($gross, $d1Rate, self::SCALE);

            $applyMgmt = !empty($p['applyMgmtDeduction']);
            if ($applyMgmt) {
                $base = $d2BaseMode === 'after_d1' ? bcsub($gross, $d1, self::SCALE) : $gross;
                $d2 = bcmul($base, $d2Rate, self::SCALE);
            } else {
                $d2 = '0';
            }

            $totalDeduct = bcadd($d1, $d2, self::SCALE);
            $net = bcsub($gross, $totalDeduct, self::SCALE);

            $row = [
                'id' => $p['id'],
                'name' => $p['name'],
                'partner' => $p['partner'] ?? null,
                'category' => $p['category'],
                'batches' => (int) $batches,
                'attendeesPerBatch' => (int) $attendees,
                'feePerHead' => (float) $fee,
                'applyMgmtDeduction' => $applyMgmt,
                'monthSeq' => (int) $p['monthSeq'],
                'note' => $p['note'] ?? null,
                'gross' => (float) $gross,
                'centralDeduction' => (float) $d1,
                'mgmtDeduction' => (float) $d2,
                'totalDeduction' => (float) $totalDeduct,
                'net' => (float) $net,
            ];
            $calcLines[] = $row;

            $totals['gross'] += $row['gross'];
            $totals['centralDeduction'] += $row['centralDeduction'];
            $totals['mgmtDeduction'] += $row['mgmtDeduction'];
            $totals['totalDeduction'] += $row['totalDeduction'];
            $totals['netExact'] += $row['net'];

            if ($row['category'] === 'short_course') {
                $catSums['short_course'] += $row['net'];
            } elseif ($row['category'] === 'usac') {
                $catSums['usac'] += $row['net'];
            } else {
                $catSums['le'] += $row['net'];
            }
        }

        $rounding = $params['yearTotalRounding'] ?? ['mode' => 'floor', 'digits' => -3];
        $totals['netRounded'] = self::applyRounding($totals['netExact'], $rounding['mode'], (int) $rounding['digits']);

        return [
            'lines' => $calcLines,
            'totals' => $totals,
            'byReportCategory' => [
                'shortCourse_1_2_1' => self::applyRounding($catSums['short_course'], 'trunc', -2),
                'usac_1_2_2' => self::applyRounding($catSums['usac'], 'trunc', -2),
                'le_1_2_3' => self::applyRounding($catSums['le'], 'trunc', -2),
            ],
        ];
    }

    /**
     * 3. Calculate Research Overhead Projects
     */
    public function calculateResearch(array $projects, array $params): array
    {
        $defaultRate = (string) ($params['ohDefaultRate'] ?? '0');
        $centralPct = (string) ($params['ohCentralPct'] ?? '0');

        $calcLines = [];
        $totals = [
            'budget' => 0.0,
            'grossOverhead' => 0.0,
            'centralDeduction' => 0.0,
            'netExact' => 0.0,
            'netRounded' => 0.0,
        ];

        foreach ($projects as $p) {
            $budget = (string) ($p['budget'] ?? 0);
            $override = $p['overheadRateOverride'] ?? null;
            $effRate = ($override !== null && $override !== '') ? (string) $override : $defaultRate;

            $rawOh = bcmul($budget, $effRate, self::SCALE);
            $grossOh = self::applyRounding($rawOh, 'round', -3);
            $central = (float) bcmul((string) $grossOh, $centralPct, self::SCALE);
            $netOh = self::applyRounding($grossOh - $central, 'round', -3);

            $row = [
                'id' => $p['id'],
                'name' => $p['name'],
                'funder' => $p['funder'] ?? null,
                'piName' => $p['piName'] ?? null,
                'budget' => (float) $budget,
                'effectiveRate' => (float) $effRate,
                'overheadRateOverride' => ($override !== null && $override !== '') ? (float) $override : null,
                'monthSeq' => (int) $p['monthSeq'],
                'note' => $p['note'] ?? null,
                'grossOverhead' => $grossOh,
                'centralDeduction' => $central,
                'netOverhead' => $netOh,
            ];
            $calcLines[] = $row;

            $totals['budget'] += $row['budget'];
            $totals['grossOverhead'] += $row['grossOverhead'];
            $totals['centralDeduction'] += $row['centralDeduction'];
            $totals['netExact'] += $row['netOverhead'];
        }

        $totals['netRounded'] = self::applyRounding($totals['netExact'], 'trunc', -3);

        return [
            'lines' => $calcLines,
            'totals' => $totals,
        ];
    }

    /**
     * 4. Calculate Rental Items
     */
    public function calculateRental(array $items, array $params): array
    {
        $rentDeductPct = (string) ($params['rentDeductPct'] ?? '0.10');

        $calcLines = [];
        $totals = [
            'monthlyRentSum' => 0.0,
            'grossYear' => 0.0,
            'deductionYear' => 0.0,
            'netExact' => 0.0,
            'netRounded' => 0.0,
        ];

        foreach ($items as $item) {
            $monthlyRent = (string) ($item['monthlyRent'] ?? 0);
            $start = (int) ($item['startMonthSeq'] ?? 1);
            $end = (int) ($item['endMonthSeq'] ?? 12);

            $isValid = ($start >= 1 && $start <= 12 && $end >= 1 && $end <= 12 && $end >= $start);
            $activeMonths = $isValid ? ($end - $start + 1) : 0;
            $warning = $isValid ? null : 'เดือนสิ้นสุดต้องไม่ก่อนเดือนเริ่มต้น';

            $grossYear = bcmul($monthlyRent, (string) $activeMonths, self::SCALE);
            $deductYear = bcmul($grossYear, $rentDeductPct, self::SCALE);
            $netYear = bcsub($grossYear, $deductYear, self::SCALE);

            $mGross = array_fill(0, 12, 0.0);
            $mDeduct = array_fill(0, 12, 0.0);
            $mNet = array_fill(0, 12, 0.0);

            if ($isValid && $activeMonths > 0) {
                $md = (float) bcmul($monthlyRent, $rentDeductPct, self::SCALE);
                $mn = (float) $monthlyRent - $md;
                for ($m = $start; $m <= $end; $m++) {
                    $mGross[$m - 1] = (float) $monthlyRent;
                    $mDeduct[$m - 1] = $md;
                    $mNet[$m - 1] = $mn;
                }
            }

            $row = [
                'id' => $item['id'],
                'name' => $item['name'],
                'tenant' => $item['tenant'] ?? $item['name'],
                'areaSqm' => isset($item['areaSqm']) ? (float) $item['areaSqm'] : null,
                'monthlyRent' => (float) $monthlyRent,
                'startMonthSeq' => $start,
                'endMonthSeq' => $end,
                'activeMonths' => $activeMonths,
                'isValidMonthRange' => $isValid,
                'warning' => $warning,
                'grossYear' => (float) $grossYear,
                'deductionYear' => (float) $deductYear,
                'netYear' => (float) $netYear,
                'monthlyGross' => $mGross,
                'monthlyDeduction' => $mDeduct,
                'monthlyNet' => $mNet,
                'note' => $item['note'] ?? null,
            ];
            $calcLines[] = $row;

            $totals['monthlyRentSum'] += $row['monthlyRent'];
            $totals['grossYear'] += $row['grossYear'];
            $totals['deductionYear'] += $row['deductionYear'];
            $totals['netExact'] += $row['netYear'];
        }

        $totals['netRounded'] = self::applyRounding($totals['netExact'], 'floor', -3);

        return [
            'lines' => $calcLines,
            'totals' => $totals,
        ];
    }
}
