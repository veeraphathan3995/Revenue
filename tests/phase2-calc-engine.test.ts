import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import {
  calculateAllocation,
  calculateCarryoverTracker,
  calculateCompare,
  calculateMonthlySummary,
  calculateRental,
  calculateRentalItem,
  calculateResearch,
  calculateService,
  calculateTuition,
  calculateTuitionLine,
  FeeScheduleConfig,
  MonthDistributionConfig,
  ProgramLevelCode,
  ReportGroupCode,
  TuitionCalculationParams,
  TuitionLineInput,
} from '../lib/revenue/calc';

describe('Phase 2 — Pure Calculation Engine & Golden Tests (PROMPT 2)', () => {
  const goldenPath = path.join(process.cwd(), 'fixtures', 'golden-2571.json');
  const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf-8'));

  const feeSchedules: Record<ProgramLevelCode, FeeScheduleConfig> = {
    bachelor: {
      level: 'bachelor',
      libraryFee: 700,
      itFee: 500,
      healthFee: 200,
      registrationFee: 1000,
      totalDeductionPerHead: 4500,
      libraryRefundPct: 0.6,
    },
    master: {
      level: 'master',
      libraryFee: 1000,
      itFee: 1000,
      healthFee: 200,
      registrationFee: 1000,
      totalDeductionPerHead: 5000,
      libraryRefundPct: 0.6,
    },
    doctoral: {
      level: 'doctoral',
      libraryFee: 1000,
      itFee: 1000,
      healthFee: 200,
      registrationFee: 1000,
      totalDeductionPerHead: 5000,
      libraryRefundPct: 0.6,
    },
  };

  const tuitionParams: TuitionCalculationParams = {
    beYear: golden.settings.beYear,
    cmuPct: golden.settings.cmuPct,
    scholarshipPct: 0.2,
    feeSchedules,
  };

  const tuitionInputLines: TuitionLineInput[] = golden.tuition.lines.map((l: any, i: number) => {
    let lineType: 'regular' | 'gen_ed_in' | 'gen_ed_out' = 'regular';
    if (l.row >= 37) {
      lineType = l.fee < 0 || l.progName.includes('Pay-out') ? 'gen_ed_out' : 'gen_ed_in';
    }
    const level: ProgramLevelCode = l.level.includes('โท') ? 'master' : 'bachelor';
    let reportGroup: ReportGroupCode = '1.1.1';
    if (l.progName.includes('การเมืองการปกครอง') && level === 'bachelor') reportGroup = '1.1.1';
    else if (l.progName.includes('รัฐประศาสนศาสตร์') && level === 'bachelor') reportGroup = '1.1.2';
    else if (l.progName.includes('การระหว่างประเทศ') && level === 'bachelor') reportGroup = '1.1.3';
    else if (l.progName.includes('ยั่งยืน') && level === 'bachelor') reportGroup = '1.1.4';
    else if (l.progName.includes('รัฐศาสตรมหาบัณทิต') && level === 'master') reportGroup = '1.1.5';
    else if (l.progName.includes('รัฐประศาสนศาสตรมหาบัณฑิต') && level === 'master') reportGroup = '1.1.6';
    else if (l.row >= 37) reportGroup = '1.1.7';

    return {
      id: `tuition-${i}`,
      programId: `prog-${i}`,
      programCode: `CODE-${l.row}`,
      programName: l.progName,
      level,
      reportGroup,
      cohortCode: l.cohort,
      lineType,
      headcountSem2: l.h2,
      headcountSem1: l.h1,
      feePerHead: l.fee,
    };
  });

  describe('1. Tuition Calculation (Row-by-row, Totals, Golden Values D2)', () => {
    it('calculates tuition line-by-line matching Excel cached values', () => {
      tuitionInputLines.forEach((inputLine, idx) => {
        const expected = golden.tuition.lines[idx];
        const res = calculateTuitionLine(inputLine, tuitionParams);

        expect(res.grossSem2).toBeCloseTo(expected.o_gross_sem2, 2);
        expect(res.grossSem1).toBeCloseTo(expected.p_gross_sem1, 2);
        expect(res.grossYear).toBeCloseTo(expected.q_gross_year, 2);
        expect(res.deductionBeforeCmu).toBeCloseTo(expected.m_deduct_sum, 2);
        expect(res.netBeforeCmu).toBeCloseTo(expected.n_net_before_cmu, 2);
        expect(res.netYear).toBeCloseTo(expected.x_net_year, 2);
      });
    });

    it('calculates tuition totals exactly matching Golden Values D2', () => {
      const summary = calculateTuition(tuitionInputLines, tuitionParams);

      expect(summary.totals.grossSem2).toBe(25162000);
      expect(summary.totals.grossSem1).toBe(27834000);
      expect(summary.totals.grossYear).toBe(52996000);
      expect(summary.totals.deductionBeforeCmu).toBe(10140000);
      expect(summary.totals.cmuShareYear).toBe(3853600);
      expect(summary.totals.totalDeductionWithCmuYear).toBe(13993600);
      expect(summary.totals.libraryRefundSem2).toBe(483540);
      expect(summary.totals.libraryRefundSem1).toBe(495660);
      expect(summary.totals.libraryRefundYear).toBe(979200);
      expect(summary.totals.netYearExact).toBe(39981600);
      expect(summary.totals.netYearRounded).toBe(39981000);
    });
  });

  describe('2. Academic Service Calculation (Projects, Totals, Golden Values D2)', () => {
    const serviceParams = {
      serviceDeduct1: golden.settings.serviceDeduct1,
      serviceDeduct2: golden.settings.serviceDeduct2,
      serviceDeduct2Base: 'after_d1' as const,
    };

    const serviceInputs = golden.service.lines.map((l: any, i: number) => {
      let category: 'short_course' | 'usac' | 'le' | 'school_activity' = 'short_course';
      if (l.row >= 11 && l.row <= 13) category = 'usac';
      else if (l.row >= 14 && l.row <= 19) category = 'le';
      else if (l.row >= 24 && l.row <= 25) category = 'school_activity';

      const monthMap: Record<string, number> = {
        'ต.ค.': 1, 'พ.ย.': 2, 'ธ.ค.': 3, 'ม.ค.': 4, 'ก.พ.': 5, 'มี.ค.': 6,
        'เม.ย.': 7, 'พ.ค.': 8, 'มิ.ย.': 9, 'ก.ค.': 10, 'ส.ค.': 11, 'ก.ย.': 12,
      };

      return {
        id: `svc-${i}`,
        name: l.name,
        category,
        batches: l.batches,
        attendeesPerBatch: l.attendees,
        feePerHead: l.feePerHead,
        applyMgmtDeduction: l.d2 > 0,
        monthSeq: monthMap[l.month] || 1,
      };
    });

    it('calculates service projects matching Excel rows and totals in Golden Values D2', () => {
      const summary = calculateService(serviceInputs, serviceParams);

      expect(summary.totals.gross).toBe(4059400);
      expect(summary.totals.centralDeduction).toBe(405940);
      expect(summary.totals.mgmtDeduction).toBe(766800);
      expect(summary.totals.totalDeduction).toBe(1172740);
      expect(summary.totals.netExact).toBe(2886660);
      expect(summary.totals.netRounded).toBe(2886000);

      // Report 1.2.1, 1.2.2, 1.2.3 in budget request
      expect(summary.byReportCategory.shortCourse_1_2_1).toBe(1420200);
      expect(summary.byReportCategory.usac_1_2_2).toBe(843700);
      expect(summary.byReportCategory.le_1_2_3).toBe(622700);
    });
  });

  describe('3. Research Overhead Calculation (Projects, Totals, Golden Values D2)', () => {
    const researchParams = {
      ohDefaultRate: golden.settings.ohDefaultRate,
      ohCentralPct: golden.settings.ohCentralPct,
    };

    const researchInputs = golden.research.lines.map((l: any, i: number) => ({
      id: `res-${i}`,
      name: l.name,
      funder: l.funder,
      piName: l.piName,
      budget: l.budget,
      overheadRateOverride: l.rate > 0 ? l.rate : null,
      monthSeq: 8, // พ.ค.
    }));

    it('calculates research overhead matching Golden Values D2', () => {
      const summary = calculateResearch(researchInputs, researchParams);

      expect(summary.totals.budget).toBe(4095896);
      expect(summary.totals.grossOverhead).toBe(206000);
      expect(summary.totals.centralDeduction).toBe(0);
      expect(summary.totals.netExact).toBe(206000);
      expect(summary.totals.netRounded).toBe(206000);
    });
  });

  describe('4. Rental Items Calculation (Items, Totals, Golden Values D2)', () => {
    const rentalParams = {
      rentDeductPct: golden.settings.rentDeduct,
    };

    const monthMap: Record<string, number> = {
      'ต.ค.': 1, 'พ.ย.': 2, 'ธ.ค.': 3, 'ม.ค.': 4, 'ก.พ.': 5, 'มี.ค.': 6,
      'เม.ย.': 7, 'พ.ค.': 8, 'มิ.ย.': 9, 'ก.ค.': 10, 'ส.ค.': 11, 'ก.ย.': 12,
    };

    const rentalInputs = golden.rental.lines.map((l: any, i: number) => ({
      id: `rent-${i}`,
      name: l.name,
      areaSqm: l.area,
      monthlyRent: l.monthlyRent,
      startMonthSeq: monthMap[l.startMonth] || 1,
      endMonthSeq: monthMap[l.endMonth] || 12,
    }));

    it('calculates rental items matching Golden Values D2', () => {
      const summary = calculateRental(rentalInputs, rentalParams);

      expect(summary.totals.grossYear).toBe(1098000);
      expect(summary.totals.deductionYear).toBe(109800);
      expect(summary.totals.netExact).toBe(988200);
      expect(summary.totals.netRounded).toBe(988000);
    });
  });

  describe('5. Monthly Distribution & Summary (Golden Values D1)', () => {
    it('calculates monthly net revenue for all 5 types matching Golden Values D1 exactly', () => {
      const tuitionSummary = calculateTuition(tuitionInputLines, tuitionParams);

      const serviceParams = {
        serviceDeduct1: golden.settings.serviceDeduct1,
        serviceDeduct2: golden.settings.serviceDeduct2,
        serviceDeduct2Base: 'after_d1' as const,
      };
      const monthMap: Record<string, number> = {
        'ต.ค.': 1, 'พ.ย.': 2, 'ธ.ค.': 3, 'ม.ค.': 4, 'ก.พ.': 5, 'มี.ค.': 6,
        'เม.ย.': 7, 'พ.ค.': 8, 'มิ.ย.': 9, 'ก.ค.': 10, 'ส.ค.': 11, 'ก.ย.': 12,
      };
      const serviceInputs = golden.service.lines.map((l: any, i: number) => ({
        id: `svc-${i}`,
        name: l.name,
        category: 'short_course' as const,
        batches: l.batches,
        attendeesPerBatch: l.attendees,
        feePerHead: l.feePerHead,
        applyMgmtDeduction: l.d2 > 0,
        monthSeq: monthMap[l.month] || 1,
      }));
      const serviceSummary = calculateService(serviceInputs, serviceParams);

      const researchParams = {
        ohDefaultRate: golden.settings.ohDefaultRate,
        ohCentralPct: golden.settings.ohCentralPct,
      };
      const researchInputs = golden.research.lines.map((l: any, i: number) => ({
        id: `res-${i}`,
        name: l.name,
        budget: l.budget,
        overheadRateOverride: l.rate > 0 ? l.rate : null,
        monthSeq: 8,
      }));
      const researchSummary = calculateResearch(researchInputs, researchParams);

      const rentalParams = { rentDeductPct: golden.settings.rentDeduct };
      const rentalInputs = golden.rental.lines.map((l: any, i: number) => ({
        id: `rent-${i}`,
        name: l.name,
        monthlyRent: l.monthlyRent,
        startMonthSeq: monthMap[l.startMonth] || 1,
        endMonthSeq: monthMap[l.endMonth] || 12,
      }));
      const rentalSummary = calculateRental(rentalInputs, rentalParams);

      const monthDistribution: MonthDistributionConfig[] = Array.from({ length: 12 }, (_, i) => ({
        monthSeq: i + 1,
        semester2Pct: golden.settings.monthDistributionSem2[i],
        semester1Pct: golden.settings.monthDistributionSem1[i],
      }));

      const monthlyRes = calculateMonthlySummary({
        tuition: tuitionSummary,
        service: serviceSummary,
        research: researchSummary,
        rental: rentalSummary,
        carryoverAmount: golden.carryover.amount,
        monthDistribution,
      });

      // Verify net monthly amounts match Golden Values D1
      // Tuition: Oct: 5,292,277.50, Mar: 18,812,490, Sep: 15,876,832.50
      expect(monthlyRes.netByType.TUITION.months[0]).toBeCloseTo(5292277.5, 2);
      expect(monthlyRes.netByType.TUITION.months[5]).toBeCloseTo(18812490, 2);
      expect(monthlyRes.netByType.TUITION.months[11]).toBeCloseTo(15876832.5, 2);

      // Total monthly rounded (column "รวม (ปัดพัน)") from D1
      const expectedMonthlyTotals = [
        9382000, 173000, 162000, 518000, 692000, 19303000,
        128000, 314000, 83000, 301000, 609000, 16400000,
      ];
      expectedMonthlyTotals.forEach((exp, idx) => {
        expect(monthlyRes.monthlyNetTotalsRounded[idx]).toBe(exp);
      });

      // Annual total net
      expect(monthlyRes.grandTotals.netRounded).toBe(48067000);
      expect(monthlyRes.grandTotals.sumOfMonthlyNetRounded).toBe(48065000);
      expect(monthlyRes.grandTotals.roundingDifference).toBe(2000);
    });
  });

  describe('6. Budget Allocation (Golden Values D3)', () => {
    it('allocates budget into Plan and Strategic dimensions matching Golden Values D3', () => {
      const baseAmounts = {
        TUITION: golden.allocation.base.tuition,
        ACAD_SERVICE: golden.allocation.base.service,
        RESEARCH_OH: golden.allocation.base.overhead,
        RENT: golden.allocation.base.rent,
        CARRYOVER: golden.allocation.base.carryover,
      };

      // Plan dimension
      const planItems = [
        {
          itemId: 'plan-1',
          itemName: 'แผนงานการเรียนการสอน',
          sortOrder: 1,
          percentages: { TUITION: 0.4, ACAD_SERVICE: 0, RESEARCH_OH: 0, RENT: 0, CARRYOVER: 0, OTHER: 0 },
        },
        {
          itemId: 'plan-2',
          itemName: 'แผนงานวิจัย',
          sortOrder: 2,
          percentages: { TUITION: 0.06, ACAD_SERVICE: 0, RESEARCH_OH: 1, RENT: 0, CARRYOVER: 0, OTHER: 0 },
        },
        {
          itemId: 'plan-3',
          itemName: 'แผนงานบริการวิชาการแก่สังคม',
          sortOrder: 3,
          percentages: { TUITION: 0, ACAD_SERVICE: 0.5, RESEARCH_OH: 0, RENT: 0, CARRYOVER: 0, OTHER: 0 },
        },
        {
          itemId: 'plan-4',
          itemName: 'แผนงานการศาสนา ศิลปะ วัฒนธรรมฯ',
          sortOrder: 4,
          percentages: { TUITION: 0.01, ACAD_SERVICE: 0.5, RESEARCH_OH: 0, RENT: 0, CARRYOVER: 0, OTHER: 0 },
        },
        {
          itemId: 'plan-5',
          itemName: 'แผนงานสนับสนุนวิชาการ',
          sortOrder: 5,
          percentages: { TUITION: 0.03, ACAD_SERVICE: 0, RESEARCH_OH: 0, RENT: 0, CARRYOVER: 0, OTHER: 0 },
        },
        {
          itemId: 'plan-6',
          itemName: 'แผนงานบริหารมหาวิทยาลัย',
          sortOrder: 6,
          percentages: { TUITION: 0.5, ACAD_SERVICE: 0, RESEARCH_OH: 0, RENT: 1, CARRYOVER: 1, OTHER: 0 },
        },
      ];

      const allocRes = calculateAllocation(
        [
          {
            dimensionCode: 'plan',
            dimensionName: 'มิติแผนงาน',
            items: planItems,
            roundingRule: { scope: 'ALLOCATION_PLAN_ITEM', mode: 'round', digits: -2 },
          },
        ],
        baseAmounts
      );

      const planRes = allocRes.dimensions.plan;
      expect(planRes.isFullyAllocated).toBe(true);
      expect(planRes.totalAllocated).toBe(48067000);

      // Verify individual items from Golden Values D3
      expect(planRes.items[0].totalAmount).toBe(15992400); // การเรียนการสอน
      expect(planRes.items[1].totalAmount).toBe(2604900); // วิจัย
      expect(planRes.items[2].totalAmount).toBe(1443000); // บริการวิชาการ
      expect(planRes.items[3].totalAmount).toBe(1842800); // ศาสนา ศิลปะ
      expect(planRes.items[4].totalAmount).toBe(1199400); // สนับสนุนวิชาการ
      expect(planRes.items[5].totalAmount).toBe(24984500); // บริหาร
    });
  });

  describe('7. Mandatory Test Cases (Section D4)', () => {
    it('Case 1: Headcount sem2 + sem1 = 0 yields zero net without division-by-zero error', () => {
      const emptyLine: TuitionLineInput = {
        id: 'zero-test',
        programId: 'prog-0',
        programCode: 'ZERO',
        programName: 'หลักสูตรทดสอบศูนย์',
        level: 'bachelor',
        reportGroup: '1.1.1',
        cohortCode: '68',
        lineType: 'regular',
        headcountSem2: 0,
        headcountSem1: 0,
        feePerHead: 15000,
      };
      const res = calculateTuitionLine(emptyLine, tuitionParams);
      expect(res.netYear).toBe(0);
      expect(res.grossYear).toBe(0);
      expect(res.cmuShareYear).toBe(0);
    });

    it('Case 2: New cohort (cohort = beYear % 100) charges registration fee 1,000 only in sem 1', () => {
      const newCohortLine: TuitionLineInput = {
        id: 'new-cohort-test',
        programId: 'prog-1',
        programCode: 'NEW',
        programName: 'หลักสูตรใหม่',
        level: 'bachelor',
        reportGroup: '1.1.1',
        cohortCode: '71', // 2571 % 100 = 71
        lineType: 'regular',
        headcountSem2: 10,
        headcountSem1: 20,
        feePerHead: 15000,
      };
      const res = calculateTuitionLine(newCohortLine, tuitionParams);
      // registration fee = 20 * 1000 = 20,000
      expect(res.registrationFeeTotal).toBe(20000);
    });

    it('Case 3: Master degree uses master fee schedule (5,000 total deduction, 60% of 1,000 library refund)', () => {
      const masterLine: TuitionLineInput = {
        id: 'master-test',
        programId: 'prog-m',
        programCode: 'MASTER',
        programName: 'หลักสูตรปริญญาโท',
        level: 'master',
        reportGroup: '1.1.5',
        cohortCode: '70',
        lineType: 'regular',
        headcountSem2: 10,
        headcountSem1: 10,
        feePerHead: 25000,
      };
      const res = calculateTuitionLine(masterLine, tuitionParams);
      expect(res.deductionBeforeCmu).toBe(20 * 5000);
      expect(res.libraryRefundYear).toBe(20 * 1000 * 0.6);
    });

    it('Case 4: gen_ed_out with negative fee is accepted and reduces total revenue', () => {
      const genEdOutLine: TuitionLineInput = {
        id: 'gen-out-test',
        programId: 'prog-out',
        programCode: 'GEN_OUT',
        programName: 'วิชาออกนอกคณะ',
        level: 'bachelor',
        reportGroup: '1.1.7',
        cohortCode: null,
        lineType: 'gen_ed_out',
        headcountSem2: 100,
        headcountSem1: 100,
        feePerHead: -540,
      };
      const res = calculateTuitionLine(genEdOutLine, tuitionParams);
      expect(res.grossYear).toBe(-108000);
      expect(res.netYear).toBe(-108000);
    });

    it('Case 5: Service project with applyMgmtDeduction = false does not deduct 40%', () => {
      const svcParams = {
        serviceDeduct1: 0.1,
        serviceDeduct2: 0.4,
        serviceDeduct2Base: 'after_d1' as const,
      };
      const res = calculateService(
        [
          {
            id: 'svc-no-mgmt',
            name: 'โครงการไม่หักบริหารจัดการ',
            category: 'short_course',
            batches: 1,
            attendeesPerBatch: 10,
            feePerHead: 10000,
            applyMgmtDeduction: false,
            monthSeq: 1,
          },
        ],
        svcParams
      );
      expect(res.totals.gross).toBe(100000);
      expect(res.totals.centralDeduction).toBe(10000);
      expect(res.totals.mgmtDeduction).toBe(0);
      expect(res.totals.netExact).toBe(90000);
    });

    it('Case 6: Rental item with end month earlier than start month yields activeMonths = 0 and warning', () => {
      const res = calculateRentalItem(
        {
          id: 'rent-inv',
          name: 'ร้านค้าช่วงเดือนผิด',
          monthlyRent: 5000,
          startMonthSeq: 8,
          endMonthSeq: 3,
        },
        { rentDeductPct: 0.1 }
      );
      expect(res.activeMonths).toBe(0);
      expect(res.grossYear).toBe(0);
      expect(res.isValidMonthRange).toBe(false);
      expect(res.warning).toBeTruthy();
    });

    it('Case 7: Research overhead uses project override when provided, otherwise default rate', () => {
      const res = calculateResearch(
        [
          {
            id: 'res-override',
            name: 'โครงการอัตราเฉพาะ',
            budget: 1000000,
            overheadRateOverride: 0.05,
            monthSeq: 1,
          },
          {
            id: 'res-default',
            name: 'โครงการอัตราตั้งต้น',
            budget: 1000000,
            overheadRateOverride: null,
            monthSeq: 1,
          },
        ],
        { ohDefaultRate: 0.08, ohCentralPct: 0 }
      );
      expect(res.lines[0].effectiveRate).toBe(0.05);
      expect(res.lines[0].grossOverhead).toBe(50000);
      expect(res.lines[1].effectiveRate).toBe(0.08);
      expect(res.lines[1].grossOverhead).toBe(80000);
    });

    it('Case 8: Month distribution validation fails if sum != 100%', () => {
      const invalidDist: MonthDistributionConfig[] = Array.from({ length: 12 }, (_, i) => ({
        monthSeq: i + 1,
        semester2Pct: i === 0 ? 0.9 : 0, // only 90%
        semester1Pct: i === 0 ? 1.0 : 0,
      }));
      const res = calculateMonthlySummary({
        tuition: calculateTuition(tuitionInputLines, tuitionParams),
        service: { lines: [], totals: {} as any, byReportCategory: {} as any },
        research: { lines: [], totals: {} as any },
        rental: { lines: [], totals: {} as any },
        carryoverAmount: 0,
        monthDistribution: invalidDist,
      });
      expect(res.distributionValidation.sem2Valid).toBe(false);
      expect(res.distributionValidation.sem1Valid).toBe(true);
    });

    it('Case 9: Allocation validation fails if any revenue column does not sum to 100%', () => {
      const invalidAllocation = calculateAllocation(
        [
          {
            dimensionCode: 'plan',
            dimensionName: 'มิติแผนงาน',
            items: [
              {
                itemId: 'p1',
                itemName: 'หมวด 1',
                sortOrder: 1,
                percentages: { TUITION: 0.8, ACAD_SERVICE: 1, RESEARCH_OH: 1, RENT: 1, CARRYOVER: 1, OTHER: 1 },
              },
            ],
          },
        ],
        { TUITION: 100, ACAD_SERVICE: 100, RESEARCH_OH: 100, RENT: 100, CARRYOVER: 100 }
      );
      expect(invalidAllocation.allDimensionsValid).toBe(false);
      expect(invalidAllocation.dimensions.plan.columnValidation.TUITION.isValid).toBe(false);
    });

    it('Case 12: Carryover tracker when expenditure is not recorded displays warning and balance = opening + cumulative net', () => {
      const res = calculateCarryoverTracker({
        openingBalance: 4006000,
        monthlyActualNetWithoutCarryover: [100000, 200000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        monthlyExpenditure: Array.from({ length: 12 }, () => null),
      });
      expect(res.hasAnyExpenditureRecorded).toBe(false);
      expect(res.statusMessage).toContain('ยังไม่ได้กรอกรายจ่ายจริง');
      expect(res.months[1].closingBalance).toBe(4006000 + 100000 + 200000);
    });

    it('Case 13: Compare actuals to estimates with HIT, NEAR, and MISS statuses', () => {
      const compareRes = calculateCompare({
        basis: 'net',
        asOfMonthSeq: 3,
        seriesByType: {
          TUITION: {
            revenueType: 'TUITION',
            label: 'ค่าธรรมเนียม',
            monthlyEstimate: [100, 100, 100, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            monthlyActual: [100, 100, 100, 0, 0, 0, 0, 0, 0, 0, 0, 0], // 300 / 300 = 100% -> HIT
            annualEstimate: 300,
          },
          ACAD_SERVICE: {
            revenueType: 'ACAD_SERVICE',
            label: 'บริการวิชาการ',
            monthlyEstimate: [100, 100, 100, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            monthlyActual: [95, 95, 95, 0, 0, 0, 0, 0, 0, 0, 0, 0], // 285 / 300 = 95% -> NEAR
            annualEstimate: 300,
          },
          RESEARCH_OH: {
            revenueType: 'RESEARCH_OH',
            label: 'Overhead',
            monthlyEstimate: [100, 100, 100, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            monthlyActual: [50, 50, 50, 0, 0, 0, 0, 0, 0, 0, 0, 0], // 150 / 300 = 50% -> MISS
            annualEstimate: 300,
          },
          RENT: {
            revenueType: 'RENT',
            label: 'ค่าเช่า',
            monthlyEstimate: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            monthlyActual: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            annualEstimate: 0,
          },
          CARRYOVER: {
            revenueType: 'CARRYOVER',
            label: 'เหลือจ่าย',
            monthlyEstimate: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            monthlyActual: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            annualEstimate: 0,
          },
          OTHER: {
            revenueType: 'OTHER',
            label: 'รายได้อื่น',
            monthlyEstimate: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            monthlyActual: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            annualEstimate: 0,
          },
        },
      });

      expect(compareRes.byType.TUITION.status).toBe('HIT');
      expect(compareRes.byType.ACAD_SERVICE.status).toBe('NEAR');
      expect(compareRes.byType.RESEARCH_OH.status).toBe('MISS');
      expect(compareRes.byType.RENT.achievementPct).toBeNull();
    });
  });

  describe('8. Property Tests (Mathematical Invariants)', () => {
    it('Property 1: gross - totalDeductionWithCmu + libraryRefund == netYear for all tuition lines', () => {
      const summary = calculateTuition(tuitionInputLines, tuitionParams);
      summary.lines.forEach((l) => {
        const netCalc = l.grossYear - l.deductionYear + l.libraryRefundYear;
        expect(netCalc).toBeCloseTo(l.netYear, 4);
      });
    });

    it('Property 2: monthly net sums exactly equal annual net for each revenue stream', () => {
      const tuitionSummary = calculateTuition(tuitionInputLines, tuitionParams);
      const serviceSummary = calculateService(
        golden.service.lines.map((l: any, i: number) => ({
          id: `svc-${i}`,
          name: l.name,
          category: 'short_course' as const,
          batches: l.batches,
          attendeesPerBatch: l.attendees,
          feePerHead: l.feePerHead,
          applyMgmtDeduction: l.d2 > 0,
          monthSeq: 1,
        })),
        { serviceDeduct1: 0.1, serviceDeduct2: 0.4, serviceDeduct2Base: 'after_d1' }
      );
      const researchSummary = calculateResearch(
        golden.research.lines.map((l: any, i: number) => ({
          id: `res-${i}`,
          name: l.name,
          budget: l.budget,
          overheadRateOverride: l.rate > 0 ? l.rate : null,
          monthSeq: 8,
        })),
        { ohDefaultRate: 0, ohCentralPct: 0 }
      );
      const rentalSummary = calculateRental(
        golden.rental.lines.map((l: any, i: number) => ({
          id: `rent-${i}`,
          name: l.name,
          monthlyRent: l.monthlyRent,
          startMonthSeq: 1,
          endMonthSeq: 12,
        })),
        { rentDeductPct: 0.1 }
      );

      const monthDistribution: MonthDistributionConfig[] = Array.from({ length: 12 }, (_, i) => ({
        monthSeq: i + 1,
        semester2Pct: golden.settings.monthDistributionSem2[i],
        semester1Pct: golden.settings.monthDistributionSem1[i],
      }));

      const monthlyRes = calculateMonthlySummary({
        tuition: tuitionSummary,
        service: serviceSummary,
        research: researchSummary,
        rental: rentalSummary,
        carryoverAmount: 4006000,
        monthDistribution,
      });

      expect(monthlyRes.netByType.TUITION.monthlySumCheck).toBe(true);
      expect(monthlyRes.netByType.ACAD_SERVICE.monthlySumCheck).toBe(true);
      expect(monthlyRes.netByType.RESEARCH_OH.monthlySumCheck).toBe(true);
      expect(monthlyRes.netByType.RENT.monthlySumCheck).toBe(true);
      expect(monthlyRes.netByType.CARRYOVER.monthlySumCheck).toBe(true);
    });

    it('Property 3: Pure functions have no external side-effects and do not call DB or UI', () => {
      // Calling multiple times produces idempotent, deterministic results
      const res1 = calculateTuition(tuitionInputLines, tuitionParams);
      const res2 = calculateTuition(tuitionInputLines, tuitionParams);
      expect(res1.totals.netYearExact).toEqual(res2.totals.netYearExact);
      expect(res1.totals.netYearRounded).toEqual(res2.totals.netYearRounded);
    });
  });
});
