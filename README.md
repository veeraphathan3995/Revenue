# ระบบประมาณการรายรับเงินรายได้ (Revenue Estimation System)
**คณะรัฐศาสตร์และรัฐประศาสนศาสตร์ มหาวิทยาลัยเชียงใหม่**

ระบบเว็บแอปพลิเคชันสำหรับจัดทำประมาณการรายรับเงินรายได้ 5 ประเภท จัดสรรกรอบงบประมาณ 3 มิติ บันทึกรายรับจริง/รายจ่ายจริง ติดตามเงินเหลือจ่ายสะสมรายเดือน และออกรายงานคำขอตั้งงบประมาณเปรียบเทียบปีต่อปี (รองรับหลายปีงบประมาณ พ.ศ. และหลายเวอร์ชัน ครั้งที่ 1 / ครั้งที่ 2)

---

## โครงสร้างโปรเจกต์และฐานข้อมูล (Code & DB)

```text
revenue-estimate/
├── app/
│   ├── api/revenue/                 # REST API (Workspace Data, Mutations, Excel Import/Export)
│   └── revenue/                     # หน้าจอเว็บแอปพลิเคชันครบทั้ง 15 Routes
├── lib/revenue/
│   ├── calc/                        # Pure Calculation Engine (Decimal.js — ตรงตาม Golden Values 100%)
│   ├── schemas/                     # Zod Server Validation Schemas
│   └── services/                    # Database Service (PGlite / Postgres), Seed & Repository
├── supabase/
│   ├── migrations/
│   │   ├── 0001_shared_profiles_audit.sql   # ตาราง profiles, audit_logs, security-definer helpers & triggers
│   │   ├── 0002_revenue_schema.sql          # ตารางโมดูลรายรับ 20 ตาราง, constraints & version-lock triggers
│   │   └── 0003_revenue_rls.sql             # Row-Level Security (RLS) ครบทั้ง 6 บทบาท (Roles)
│   ├── seed.sql                     # ข้อมูลตั้งต้นปีงบประมาณ 2571 (SQL INSERT ครบทุกตาราง)
│   └── full_database_dump.sql       # ไฟล์รวม Schema + RLS + Triggers + Seed Data สำหรับรันบน Supabase/Postgres
├── fixtures/
│   └── golden-2571.json             # Golden Values ที่สกัดจากไฟล์ Excel ต้นฉบับปี 2571
├── reference/
│   └── Revenue_Estimate_Template2571.xlsx   # ไฟล์ Excel ต้นฉบับปีงบประมาณ 2571
├── docs/
│   ├── erd.md                       # แผนภาพฐานข้อมูล Mermaid ERD
│   ├── golden-values.md             # ตัวเลขอ้างอิงและกรณีทดสอบบังคับ 15 ข้อ
│   ├── known-differences.md         # บันทึกจุดที่ระบบแก้ไขข้อผิดพลาดของสูตร Excel เดิม
│   └── traceability.md              # ตารางตรวจสอบความครบถ้วนของข้อกำหนด (Traceability Matrix)
└── tests/                           # ชุดทดสอบ Vitest (38/38 tests passed)
```

---

## วิธีติดตั้งและรันระบบ (Local Development)

1. ติดตั้งแพ็กเกจ:
   ```bash
   npm install
   ```
2. รีเซ็ตและ Seed ฐานข้อมูลจากไฟล์ Excel ต้นฉบับ:
   ```bash
   npm run db:reset
   npm run db:seed
   ```
3. รันชุดทดสอบอัตโนมัติ (38 ข้อ: DB/RLS, Calculation Engine, Multi-Year & Security QA):
   ```bash
   npm test
   ```
4. เปิดเซิร์ฟเวอร์ใช้งาน:
   ```bash
   npm run dev
   ```
   เข้าใช้งานที่ http://localhost:3000/revenue

---

## วิธีนำฐานข้อมูล (DB) ไปรันบน Supabase หรือ PostgreSQL
- **วิธีที่ 1 (ผ่าน Supabase SQL Editor):** เปิดไฟล์ `supabase/full_database_dump.sql` แล้วรันใน SQL Editor ของ Supabase ได้ทันที (สร้างทั้งตาราง, RLS 6 บทบาท, Triggers Audit Log และข้อมูลปีงบ 2571 ครบในไฟล์เดียว)
- **วิธีที่ 2 (ผ่าน Supabase CLI):** ใช้โฟลเดอร์ `supabase/migrations/` และ `supabase/seed.sql` ร่วมกับคำสั่ง `supabase db push` หรือ `supabase db reset`
