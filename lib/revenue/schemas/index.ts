import { z } from 'zod';

export const UserRoleSchema = z.enum([
  'SUPER_ADMIN',
  'PLANNING_OFFICER',
  'FINANCE_OFFICER',
  'EXECUTIVE',
  'PROJECT_OWNER',
  'EVALUATOR',
]);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const EstimateStatusSchema = z.enum([
  'draft',
  'submitted',
  'approved',
  'locked',
]);
export type EstimateStatus = z.infer<typeof EstimateStatusSchema>;

export const RevenueTypeSchema = z.enum([
  'TUITION',
  'ACAD_SERVICE',
  'RESEARCH_OH',
  'RENT',
  'CARRYOVER',
  'OTHER',
]);
export type RevenueType = z.infer<typeof RevenueTypeSchema>;

export const ProgramLevelSchema = z.enum(['bachelor', 'master', 'doctoral']);
export type ProgramLevel = z.infer<typeof ProgramLevelSchema>;

export const ReportGroupSchema = z.enum([
  '1.1.1',
  '1.1.2',
  '1.1.3',
  '1.1.4',
  '1.1.5',
  '1.1.6',
  '1.1.7',
]);
export type ReportGroup = z.infer<typeof ReportGroupSchema>;

export const TuitionLineTypeSchema = z.enum([
  'regular',
  'gen_ed_in',
  'gen_ed_out',
]);
export type TuitionLineType = z.infer<typeof TuitionLineTypeSchema>;

export const ServiceCategorySchema = z.enum([
  'short_course',
  'usac',
  'le',
  'school_activity',
]);
export type ServiceCategory = z.infer<typeof ServiceCategorySchema>;

export const AllocationDimensionCodeSchema = z.enum([
  'plan',
  'expense_category',
  'strategic',
]);
export type AllocationDimensionCode = z.infer<typeof AllocationDimensionCodeSchema>;

export const RoundingModeSchema = z.enum(['trunc', 'round', 'floor', 'none']);
export type RoundingMode = z.infer<typeof RoundingModeSchema>;

// Server Mutation Zod Schemas (Constitution Rule 8)
export const UpdateParameterInputSchema = z.object({
  id: z.string().uuid(),
  valueNumeric: z.number().min(-1000000).max(1000000000).nullable().optional(),
  valueText: z.string().max(500).nullable().optional(),
  note: z.string().max(1000).nullable().optional(),
});

export const MonthDistributionUpdateSchema = z.object({
  versionId: z.string().uuid(),
  items: z
    .array(
      z.object({
        monthSeq: z.number().int().min(1).max(12),
        semester2Pct: z.number().min(0).max(1),
        semester1Pct: z.number().min(0).max(1),
      })
    )
    .length(12),
});

export const FeeScheduleUpdateSchema = z.object({
  id: z.string().uuid(),
  libraryFee: z.number().min(0),
  itFee: z.number().min(0),
  healthFee: z.number().min(0),
  registrationFee: z.number().min(0),
  totalDeductionPerHead: z.number().min(0),
  libraryRefundPct: z.number().min(0).max(1),
});

export const TuitionLineUpsertSchema = z
  .object({
    id: z.string().uuid().optional(),
    versionId: z.string().uuid(),
    programId: z.string().uuid(),
    cohortCode: z.string().max(10).nullable().optional(),
    lineType: TuitionLineTypeSchema,
    headcountSem2: z.number().int().min(0),
    headcountSem1: z.number().int().min(0),
    feePerHead: z.number(),
  })
  .refine(
    (data) =>
      (data.lineType === 'gen_ed_out' && data.feePerHead <= 0) ||
      (data.lineType !== 'gen_ed_out' && data.feePerHead >= 0),
    {
      message: 'อัตราค่าธรรมเนียมต้อง >= 0 (ยกเว้นรายการ Pay-out ที่ต้อง <= 0)',
      path: ['feePerHead'],
    }
  );

export const ServiceProjectUpsertSchema = z.object({
  id: z.string().uuid().optional(),
  versionId: z.string().uuid(),
  name: z.string().min(1, 'กรุณาระบุชื่อโครงการ'),
  partner: z.string().nullable().optional(),
  category: ServiceCategorySchema,
  batches: z.number().int().min(0),
  attendeesPerBatch: z.number().int().min(0),
  feePerHead: z.number().min(0),
  applyMgmtDeduction: z.boolean(),
  monthSeq: z.number().int().min(1).max(12),
  note: z.string().nullable().optional(),
});

export const ResearchProjectUpsertSchema = z.object({
  id: z.string().uuid().optional(),
  versionId: z.string().uuid(),
  name: z.string().min(1, 'กรุณาระบุชื่อโครงการวิจัย'),
  funder: z.string().nullable().optional(),
  piName: z.string().nullable().optional(),
  budget: z.number().min(0),
  overheadRateOverride: z.number().min(0).max(1).nullable().optional(),
  monthSeq: z.number().int().min(1).max(12),
  note: z.string().nullable().optional(),
});

export const RentalItemUpsertSchema = z.object({
  id: z.string().uuid().optional(),
  versionId: z.string().uuid(),
  name: z.string().min(1, 'กรุณาระบุชื่อรายการ/ผู้เช่า'),
  tenant: z.string().nullable().optional(),
  areaSqm: z.number().min(0).nullable().optional(),
  monthlyRent: z.number().min(0),
  startMonthSeq: z.number().int().min(1).max(12),
  endMonthSeq: z.number().int().min(1).max(12),
  note: z.string().nullable().optional(),
});

export const CarryoverUpdateSchema = z.object({
  versionId: z.string().uuid(),
  amount: z.number().min(0),
  sourceNote: z.string().nullable().optional(),
});

export const OtherIncomeUpsertSchema = z.object({
  id: z.string().uuid().optional(),
  versionId: z.string().uuid(),
  name: z.string().min(1),
  monthSeq: z.number().int().min(1).max(12),
  gross: z.number().min(0),
  deduction: z.number().min(0),
});

export const AllocationPctBatchUpdateSchema = z.object({
  versionId: z.string().uuid(),
  dimensionCode: AllocationDimensionCodeSchema,
  entries: z.array(
    z.object({
      itemId: z.string().uuid(),
      revenueType: RevenueTypeSchema,
      pct: z.number().min(0).max(1),
    })
  ),
});

export const RevenueActualUpsertSchema = z.object({
  id: z.string().uuid().optional(),
  fiscalYearId: z.string().uuid(),
  receivedDate: z.string().nullable().optional(),
  monthSeq: z.number().int().min(1).max(12),
  revenueType: RevenueTypeSchema,
  sourceName: z.string().min(1, 'กรุณาระบุแหล่งที่มา/รายการ'),
  refNo: z.string().nullable().optional(),
  gross: z.number().min(0),
  deduction: z.number().min(0),
  note: z.string().nullable().optional(),
});

export const ExpenditureActualUpsertSchema = z.object({
  fiscalYearId: z.string().uuid(),
  monthSeq: z.number().int().min(1).max(12),
  amount: z.number().min(0),
  note: z.string().nullable().optional(),
});

export const VersionTransitionSchema = z.object({
  versionId: z.string().uuid(),
  targetStatus: EstimateStatusSchema,
  note: z.string().optional(),
});

export const CreateFiscalYearSchema = z.object({
  beYear: z
    .number()
    .int()
    .min(2550, 'ปี พ.ศ. ต้องตั้งแต่ 2550 เป็นต้นไป')
    .max(2650, 'ปี พ.ศ. ต้องไม่เกิน 2650'),
  label: z.string().min(1).max(200).optional(),
  copyFromVersionId: z.string().uuid().nullable().optional(),
  copyEstimateLines: z.boolean().default(true),
  autoShiftCohorts: z.boolean().default(true),
});

