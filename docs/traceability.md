# ตารางตรวจสอบความครบถ้วนของข้อกำหนด (Traceability Matrix & QA Report)

## 1. Traceability Matrix (เทียบข้อกำหนด B0.1–B0.10 และ C1–C8 กับไฟล์โค้ดและชุดทดสอบ)

| รหัสข้อกำหนด | รายละเอียดข้อกำหนด | ไฟล์โค้ดที่รองรับ (Implementation) | ชุดทดสอบยืนยัน (Verification Test) | สถานะ |
| --- | --- | --- | --- | --- |
| **Constitution 1** | ไม่มี Mock UI ที่ไม่มีฐานข้อมูลจริงรองรับ | `lib/revenue/services/repository.ts`, `supabase/migrations/0002_revenue_schema.sql` | `tests/phase3-to-8-integration.test.ts` | ✅ ผ่าน |
| **Constitution 2** | ไม่ hard-code กฎธุรกิจ อัตราหักทุกตัวอยู่ใน `parameters` / `fee_schedules` / `rounding_rules` | `lib/revenue/calc/*.ts`, `lib/revenue/services/seed.ts` | `tests/phase3-to-8-integration.test.ts` (Grep & Dynamic Param Test) | ✅ ผ่าน |
| **Constitution 3** | Soft delete ด้วย `deleted_at` ห้ามลบจริง (`prevent_hard_delete` trigger) | `supabase/migrations/0001_shared_profiles_audit.sql` | `tests/phase1-db-rls.test.ts` (Criterion ค) | ✅ ผ่าน |
| **Constitution 4** | เปิด RLS ทุกตาราง ใช้ security-definer helper ตรวจ 6 roles | `supabase/migrations/0003_revenue_rls.sql` | `tests/phase1-db-rls.test.ts` (Criterion ก) | ✅ ผ่าน |
| **Constitution 5** | ใช้ `profiles` และ `audit_logs` ร่วมกัน บันทึกทุก INSERT/UPDATE/SOFT_DELETE/APPROVE/UNLOCK | `supabase/migrations/0001_shared_profiles_audit.sql`, `app/revenue/audit/page.tsx` | `tests/phase1-db-rls.test.ts` (Criterion ค) | ✅ ผ่าน |
| **Constitution 6** | ตัวเลขเงินใช้ `numeric(14,2)` ใน DB และ `decimal.js` ใน TypeScript ห้ามใช้ float | `lib/revenue/calc/rounding.ts`, `lib/revenue/calc/*.ts` | `tests/phase2-calc-engine.test.ts` | ✅ ผ่าน |
| **Constitution 7** | Business logic เป็น pure function ใน `/lib/revenue/calc` | `lib/revenue/calc/{tuition,service,overhead,rent,carryover,monthly,allocation,compare,rounding}.ts` | `tests/phase2-calc-engine.test.ts` | ✅ ผ่าน |
| **Constitution 8** | ทุกการเขียนข้อมูลผ่าน Zod validation ฝั่ง server | `lib/revenue/schemas/index.ts`, `lib/revenue/services/repository.ts` | `tests/phase3-to-8-integration.test.ts` | ✅ ผ่าน |
| **Constitution 9** | ทุกตัวเลขบนจอ drill-down กลับถึงแถวต้นทางได้ | `app/revenue/_components/WorkspaceContext.tsx`, `DashboardAndSummaryViews.tsx` | UI Drill-down Modal | ✅ ผ่าน |
| **Constitution 10** | เวอร์ชันที่อนุมัติแล้วแก้ไม่ได้ ต้องสร้างเวอร์ชันใหม่ (ครั้งที่ 2) | `supabase/migrations/0002_revenue_schema.sql`, `app/revenue/versions/page.tsx` | `tests/phase1-db-rls.test.ts`, `tests/phase3-to-8-integration.test.ts` | ✅ ผ่าน |
| **Golden Values D1–D4** | ตัวเลขปีงบ 2571 ตรงกับ Excel ต้นฉบับทุกจุด (รวมสุทธิ 48,067,000 บาท) | `fixtures/golden-2571.json`, `lib/revenue/calc/*` | `tests/phase2-calc-engine.test.ts` (21/21 ข้อ) | ✅ ผ่าน |

---

## 2. คู่มือผู้ใช้ย่อ (User Guide) แทนแผ่น "คู่มือ" เดิม
1. **การเลือกปีงบประมาณและเวอร์ชัน:** ใช้แถบด้านบนสุดเพื่อสลับปีงบประมาณหรือสลับระหว่าง "ครั้งที่ 1 (ต้นปี)" กับ "ครั้งที่ 2 (ปรับปรุงระหว่างปี)"
2. **การกรอกข้อมูลประมาณการ 5 ประเภท:**
   - ช่องพื้นหลัง **สีเหลืองอ่อน** คือช่องที่อนุญาตให้กรอกข้อมูล (เมื่อเวอร์ชันอยู่ในสถานะ `DRAFT` หรือ `SUBMITTED` และผู้ใช้มีสิทธิ์ `PLANNING_OFFICER` หรือ `SUPER_ADMIN`)
   - ช่องพื้นหลัง **สีเทาอ่อน** คือช่องที่ระบบคำนวณให้อัตโนมัติจาก Calculation Engine (อ่านอย่างเดียว)
3. **การตรวจสอบความถูกต้อง (Validation):**
   - สัดส่วนรายเดือนในหน้า `/revenue/settings` ต้องรวมได้ `100%` ทั้งภาคเรียนที่ 2 และภาคเรียนที่ 1
   - สัดส่วนจัดสรรงบในหน้า `/revenue/allocation` ทุกคอลัมน์ประเภทรายรับต้องรวมได้ `100%` ระบบจะบล็อกการส่งอนุมัติหากไม่ครบ
4. **การอนุมัติและล็อกเวอร์ชัน:**
   - เจ้าหน้าที่แผน (`PLANNING_OFFICER`) กดส่งขออนุมัติ (`SUBMITTED`)
   - ผู้บริหาร (`EXECUTIVE`) ตรวจสอบและกดอนุมัติ (`APPROVED`) ระบบจะแช่แข็งผลคำนวณลง `version_snapshots` และล็อกไม่ให้แก้ไขข้อมูลในเวอร์ชันนั้นอีก
   - หากต้องการปรับปรุงงบประมาณระหว่างปี ให้กดปุ่ม **"คัดลอกเป็นเวอร์ชันใหม่ (ครั้งที่ 2)"** ในหน้า `/revenue/versions`
