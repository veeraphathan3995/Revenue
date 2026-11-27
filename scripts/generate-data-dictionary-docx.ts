import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

interface ColumnDef {
  name: string;
  type: string;
  nullable: string;
  key: string;
  defaultVal: string;
  description: string;
}

interface TableDef {
  no: number;
  tableName: string;
  titleTh: string;
  description: string;
  columns: ColumnDef[];
}

const TABLES: TableDef[] = [
  {
    no: 1,
    tableName: 'profiles',
    titleTh: 'ตารางข้อมูลผู้ใช้งานและสิทธิ์การเข้าถึง (User Profiles & RBAC Roles)',
    description:
      'เก็บข้อมูลบัญชีผู้ใช้งานระบบและบทบาทสิทธิ์ 6 ระดับ ตามข้อกำหนดระบบ (Constitution 0.7) ใช้ร่วมกับ Row-Level Security (RLS)',
    columns: [
      { name: 'id', type: 'UUID', nullable: 'NOT NULL', key: 'PK', defaultVal: 'gen_random_uuid()', description: 'รหัสอ้างอิงผู้ใช้งาน (Primary Key)' },
      { name: 'email', type: 'TEXT / VARCHAR(255)', nullable: 'NOT NULL', key: 'UNIQUE', defaultVal: '-', description: 'อีเมลผู้ใช้งาน (ห้ามซ้ำ)' },
      { name: 'full_name', type: 'TEXT / VARCHAR(255)', nullable: 'NOT NULL', key: '-', defaultVal: '-', description: 'ชื่อ-นามสกุล หรือชื่อตำแหน่งผู้ใช้งาน' },
      { name: 'role', type: 'TEXT / VARCHAR(50)', nullable: 'NOT NULL', key: 'CHECK', defaultVal: '-', description: 'สิทธิ์ผู้ใช้งาน: SUPER_ADMIN, PLANNING_OFFICER, FINANCE_OFFICER, EXECUTIVE, PROJECT_OWNER, EVALUATOR' },
      { name: 'created_at', type: 'TIMESTAMPTZ', nullable: 'NOT NULL', key: '-', defaultVal: 'now()', description: 'วันเวลาที่สร้างรายการ' },
      { name: 'updated_at', type: 'TIMESTAMPTZ', nullable: 'NOT NULL', key: '-', defaultVal: 'now()', description: 'วันเวลาที่แก้ไขรายการล่าสุด' },
      { name: 'created_by', type: 'UUID', nullable: 'NULL', key: 'FK', defaultVal: 'NULL', description: 'รหัสผู้สร้างรายการ (อ้างอิง profiles.id)' },
      { name: 'deleted_at', type: 'TIMESTAMPTZ', nullable: 'NULL', key: '-', defaultVal: 'NULL', description: 'วันเวลาที่ลบข้อมูลแบบ Soft Delete (NULL = ใช้งานปกติ)' },
    ],
  },
  {
    no: 2,
    tableName: 'audit_logs',
    titleTh: 'ตารางบันทึกประวัติการเปลี่ยนแปลงข้อมูลการเงิน (Financial Audit Trail)',
    description:
      'บันทึกทุกการเพิ่ม แก้ไข ลบ (Soft Delete) อนุมัติ และปลดล็อกข้อมูลทางการเงิน พร้อมค่าเก่า (old_data) และค่าใหม่ (new_data) ตามกฎ Constitution ข้อ 5',
    columns: [
      { name: 'id', type: 'UUID', nullable: 'NOT NULL', key: 'PK', defaultVal: 'gen_random_uuid()', description: 'รหัสอ้างอิงรายการ Audit Log' },
      { name: 'table_name', type: 'TEXT / VARCHAR(100)', nullable: 'NOT NULL', key: 'IDX', defaultVal: '-', description: 'ชื่อตารางที่มีการเปลี่ยนแปลงข้อมูล' },
      { name: 'record_id', type: 'UUID', nullable: 'NOT NULL', key: 'IDX', defaultVal: '-', description: 'รหัสแถวข้อมูล (id) ในตารางต้นทางที่ถูกแก้ไข' },
      { name: 'action', type: 'TEXT / VARCHAR(30)', nullable: 'NOT NULL', key: 'CHECK', defaultVal: '-', description: 'ประเภทการกระทำ: INSERT, UPDATE, SOFT_DELETE, DELETE, APPROVE, UNLOCK' },
      { name: 'old_data', type: 'JSONB / JSON', nullable: 'NULL', key: '-', defaultVal: 'NULL', description: 'ข้อมูลทั้งหมดของแถวก่อนการแก้ไขในรูปแบบ JSON' },
      { name: 'new_data', type: 'JSONB / JSON', nullable: 'NULL', key: '-', defaultVal: 'NULL', description: 'ข้อมูลทั้งหมดของแถวหลังการแก้ไขในรูปแบบ JSON' },
      { name: 'performed_by', type: 'UUID', nullable: 'NULL', key: 'IDX', defaultVal: 'auth.uid()', description: 'รหัสผู้ใช้งานที่ดำเนินการ (อ้างอิง profiles.id)' },
      { name: 'performed_at', type: 'TIMESTAMPTZ', nullable: 'NOT NULL', key: 'IDX', defaultVal: 'now()', description: 'วันเวลาที่ดำเนินการ' },
    ],
  },
  {
    no: 3,
    tableName: 'fiscal_years',
    titleTh: 'ตารางปีงบประมาณ (Fiscal Years)',
    description:
      'เก็บข้อมูลปีงบประมาณ พ.ศ. (เริ่ม 1 ตุลาคม ของปี พ.ศ.-1 ถึง 30 กันยายน ของปี พ.ศ.) รองรับการประมาณการหลายปีงบประมาณ',
    columns: [
      { name: 'id', type: 'UUID', nullable: 'NOT NULL', key: 'PK', defaultVal: 'gen_random_uuid()', description: 'รหัสอ้างอิงปีงบประมาณ' },
      { name: 'be_year', type: 'INTEGER', nullable: 'NOT NULL', key: 'UNIQUE', defaultVal: '-', description: 'ปีงบประมาณ พ.ศ. (เช่น 2571, 2572) ค่าอยู่ระหว่าง 2550–2650' },
      { name: 'start_date', type: 'DATE', nullable: 'NOT NULL', key: '-', defaultVal: '-', description: 'วันเริ่มต้นปีงบประมาณ (1 ต.ค.)' },
      { name: 'end_date', type: 'DATE', nullable: 'NOT NULL', key: '-', defaultVal: '-', description: 'วันสิ้นสุดปีงบประมาณ (30 ก.ย.)' },
      { name: 'created_at', type: 'TIMESTAMPTZ', nullable: 'NOT NULL', key: '-', defaultVal: 'now()', description: 'วันเวลาที่สร้างรายการ' },
      { name: 'updated_at', type: 'TIMESTAMPTZ', nullable: 'NOT NULL', key: '-', defaultVal: 'now()', description: 'วันเวลาที่แก้ไขรายการล่าสุด' },
      { name: 'created_by', type: 'UUID', nullable: 'NULL', key: 'FK', defaultVal: 'NULL', description: 'รหัสผู้สร้างรายการ (อ้างอิง profiles.id)' },
      { name: 'deleted_at', type: 'TIMESTAMPTZ', nullable: 'NULL', key: '-', defaultVal: 'NULL', description: 'วันเวลาที่ลบข้อมูลแบบ Soft Delete' },
    ],
  },
  {
    no: 4,
    tableName: 'estimate_versions',
    titleTh: 'ตารางเวอร์ชันการประมาณการรายรับ (Estimate Versions)',
    description:
      'เก็บรอบ/ครั้งที่ของการประมาณการในแต่ละปีงบประมาณ (เช่น ครั้งที่ 1 ต้นปี, ครั้งที่ 2 ปรับปรุงระหว่างปี) พร้อมสถานะ Workflow การอนุมัติ',
    columns: [
      { name: 'id', type: 'UUID', nullable: 'NOT NULL', key: 'PK', defaultVal: 'gen_random_uuid()', description: 'รหัสอ้างอิงเวอร์ชันประมาณการ' },
      { name: 'fiscal_year_id', type: 'UUID', nullable: 'NOT NULL', key: 'FK, UQ', defaultVal: '-', description: 'รหัสปีงบประมาณ (อ้างอิง fiscal_years.id)' },
      { name: 'version_no', type: 'INTEGER', nullable: 'NOT NULL', key: 'UQ', defaultVal: '-', description: 'ครั้งที่ของการประมาณการ (>= 1) ห้ามซ้ำในปีงบเดียวกัน' },
      { name: 'label', type: 'TEXT / VARCHAR(255)', nullable: 'NOT NULL', key: '-', defaultVal: '-', description: 'ชื่อกำกับเวอร์ชัน (เช่น ประมาณการรายรับ ครั้งที่ 1 ต้นปีงบประมาณ)' },
      { name: 'status', type: 'TEXT / VARCHAR(30)', nullable: 'NOT NULL', key: 'CHECK', defaultVal: "'draft'", description: 'สถานะเวอร์ชัน: draft (ร่าง), submitted (เสนออนุมัติ), approved (อนุมัติแล้ว), locked (ล็อก)' },
      { name: 'parent_version_id', type: 'UUID', nullable: 'NULL', key: 'FK', defaultVal: 'NULL', description: 'รหัสเวอร์ชันต้นทางกรณีคัดลอก/ปรับปรุงเป็นครั้งที่ 2 (อ้างอิง estimate_versions.id)' },
      { name: 'approved_by', type: 'UUID', nullable: 'NULL', key: 'FK', defaultVal: 'NULL', description: 'รหัสผู้อนุมัติเวอร์ชัน (อ้างอิง profiles.id)' },
      { name: 'approved_at', type: 'TIMESTAMPTZ', nullable: 'NULL', key: '-', defaultVal: 'NULL', description: 'วันเวลาที่อนุมัติเวอร์ชัน' },
      { name: 'created_at', type: 'TIMESTAMPTZ', nullable: 'NOT NULL', key: '-', defaultVal: 'now()', description: 'วันเวลาที่สร้างรายการ' },
      { name: 'updated_at', type: 'TIMESTAMPTZ', nullable: 'NOT NULL', key: '-', defaultVal: 'now()', description: 'วันเวลาที่แก้ไขรายการล่าสุด' },
      { name: 'created_by', type: 'UUID', nullable: 'NULL', key: 'FK', defaultVal: 'NULL', description: 'รหัสผู้สร้างรายการ (อ้างอิง profiles.id)' },
      { name: 'deleted_at', type: 'TIMESTAMPTZ', nullable: 'NULL', key: '-', defaultVal: 'NULL', description: 'วันเวลาที่ลบข้อมูลแบบ Soft Delete' },
    ],
  },
  {
    no: 5,
    tableName: 'parameters',
    titleTh: 'ตารางพารามิเตอร์และอัตราหักทางธุรกิจ (System & Business Parameters)',
    description:
      'เก็บค่าพารามิเตอร์และอัตราหักทุกตัวตามกฎ Constitution ข้อ 2 (เช่น CMU_PCT 10%, SERVICE_DEDUCT_1 10%, SERVICE_DEDUCT_2 40%, RENT_DEDUCT 10%, SCHOLARSHIP_PCT 20%) ห้าม Hard-code ในโค้ด',
    columns: [
      { name: 'id', type: 'UUID', nullable: 'NOT NULL', key: 'PK', defaultVal: 'gen_random_uuid()', description: 'รหัสอ้างอิงพารามิเตอร์' },
      { name: 'version_id', type: 'UUID', nullable: 'NULL', key: 'FK, IDX', defaultVal: 'NULL', description: 'รหัสเวอร์ชันประมาณการ (อ้างอิง estimate_versions.id)' },
      { name: 'key', type: 'TEXT / VARCHAR(100)', nullable: 'NOT NULL', key: 'IDX', defaultVal: '-', description: 'รหัสชื่อพารามิเตอร์ (เช่น CMU_PCT, SERVICE_DEDUCT_1, RENT_DEDUCT)' },
      { name: 'value_numeric', type: 'NUMERIC(14,4)', nullable: 'NULL', key: '-', defaultVal: 'NULL', description: 'ค่าพารามิเตอร์ชนิดตัวเลขทศนิยม 4 ตำแหน่ง (เช่น 0.1000, 540.0000)' },
      { name: 'value_text', type: 'TEXT', nullable: 'NULL', key: '-', defaultVal: 'NULL', description: 'ค่าพารามิเตอร์ชนิดข้อความ (เช่น after_d1, ชื่อหน่วยงาน)' },
      { name: 'effective_be_year', type: 'INTEGER', nullable: 'NOT NULL', key: 'IDX', defaultVal: '-', description: 'ปีงบประมาณ พ.ศ. ที่บังคับใช้' },
      { name: 'note', type: 'TEXT', nullable: 'NULL', key: '-', defaultVal: 'NULL', description: 'คำอธิบายความหมายและแหล่งอ้างอิงของพารามิเตอร์' },
      { name: 'created_at', type: 'TIMESTAMPTZ', nullable: 'NOT NULL', key: '-', defaultVal: 'now()', description: 'วันเวลาที่สร้างรายการ' },
      { name: 'updated_at', type: 'TIMESTAMPTZ', nullable: 'NOT NULL', key: '-', defaultVal: 'now()', description: 'วันเวลาที่แก้ไขรายการล่าสุด' },
      { name: 'created_by', type: 'UUID', nullable: 'NULL', key: 'FK', defaultVal: 'NULL', description: 'รหัสผู้สร้างรายการ (อ้างอิง profiles.id)' },
      { name: 'deleted_at', type: 'TIMESTAMPTZ', nullable: 'NULL', key: '-', defaultVal: 'NULL', description: 'วันเวลาที่ลบข้อมูลแบบ Soft Delete' },
    ],
  },
  {
    no: 6,
    tableName: 'month_distribution',
    titleTh: 'ตารางสัดส่วนการกระจายรายรับรายเดือนตามภาคเรียน (Monthly Distribution)',
    description:
      'เก็บสัดส่วนร้อยละ (0–1) การรับเงินค่าธรรมเนียมการศึกษาในแต่ละเดือน (ลำดับเดือน 1=ต.ค. ถึง 12=ก.ย.) แยกตามภาคเรียนที่ 2 และภาคเรียนที่ 1 โดยผลรวมแต่ละภาคเรียนต้องเท่ากับ 1.0 (100%)',
    columns: [
      { name: 'id', type: 'UUID', nullable: 'NOT NULL', key: 'PK', defaultVal: 'gen_random_uuid()', description: 'รหัสอ้างอิงสัดส่วนรายเดือน' },
      { name: 'version_id', type: 'UUID', nullable: 'NOT NULL', key: 'FK, UQ', defaultVal: '-', description: 'รหัสเวอร์ชันประมาณการ (อ้างอิง estimate_versions.id)' },
      { name: 'month_seq', type: 'INTEGER', nullable: 'NOT NULL', key: 'UQ, CHECK', defaultVal: '-', description: 'ลำดับเดือนในปีงบประมาณ (1 = ต.ค. ถึง 12 = ก.ย.)' },
      { name: 'semester', type: 'INTEGER', nullable: 'NOT NULL', key: 'UQ, CHECK', defaultVal: '-', description: 'ภาคเรียน: 1 (ภาคเรียนที่ 1) หรือ 2 (ภาคเรียนที่ 2)' },
      { name: 'pct', type: 'NUMERIC(10,6)', nullable: 'NOT NULL', key: 'CHECK', defaultVal: '-', description: 'สัดส่วนการรับเงิน (0.000000 ถึง 1.000000 เช่น 0.70, 0.30)' },
      { name: 'created_at', type: 'TIMESTAMPTZ', nullable: 'NOT NULL', key: '-', defaultVal: 'now()', description: 'วันเวลาที่สร้างรายการ' },
      { name: 'updated_at', type: 'TIMESTAMPTZ', nullable: 'NOT NULL', key: '-', defaultVal: 'now()', description: 'วันเวลาที่แก้ไขรายการล่าสุด' },
      { name: 'created_by', type: 'UUID', nullable: 'NULL', key: 'FK', defaultVal: 'NULL', description: 'รหัสผู้สร้างรายการ (อ้างอิง profiles.id)' },
      { name: 'deleted_at', type: 'TIMESTAMPTZ', nullable: 'NULL', key: '-', defaultVal: 'NULL', description: 'วันเวลาที่ลบข้อมูลแบบ Soft Delete' },
    ],
  },
  {
    no: 7,
    tableName: 'rounding_rules',
    titleTh: 'ตารางนโยบายการปัดเศษ (Rounding Rules Policy)',
    description:
      'กำหนดวิธีปัดเศษที่ปลายทางการคำนวณตามสูตร Excel ต้นแบบ (เช่น ปัดลงหลักพัน TRUNC -3, ปัดทิ้งหลักพัน FLOOR -3, ปัดปกติหลักร้อย ROUND -2)',
    columns: [
      { name: 'id', type: 'UUID', nullable: 'NOT NULL', key: 'PK', defaultVal: 'gen_random_uuid()', description: 'รหัสอ้างอิงกฎการปัดเศษ' },
      { name: 'version_id', type: 'UUID', nullable: 'NULL', key: 'FK, UQ', defaultVal: 'NULL', description: 'รหัสเวอร์ชันประมาณการ (อ้างอิง estimate_versions.id)' },
      { name: 'scope', type: 'TEXT / VARCHAR(100)', nullable: 'NOT NULL', key: 'UQ', defaultVal: '-', description: 'ขอบเขตที่ใช้ปัดเศษ (เช่น TUITION_YEAR_TOTAL, ACAD_SERVICE_YEAR_TOTAL)' },
      { name: 'mode', type: 'TEXT / VARCHAR(20)', nullable: 'NOT NULL', key: 'CHECK', defaultVal: '-', description: 'โหมดการปัดเศษ: trunc (ตัดทศนิยม/หลัก), round (ปัดตามเกณฑ์), floor (ปัดลง), none (ไม่ปัด)' },
      { name: 'digits', type: 'INTEGER', nullable: 'NOT NULL', key: '-', defaultVal: '-3', description: 'หลักที่ปัดเศษ (-3 = หลักพัน, -2 = หลักร้อย, 0 = จำนวนเต็มบาท)' },
      { name: 'created_at', type: 'TIMESTAMPTZ', nullable: 'NOT NULL', key: '-', defaultVal: 'now()', description: 'วันเวลาที่สร้างรายการ' },
      { name: 'updated_at', type: 'TIMESTAMPTZ', nullable: 'NOT NULL', key: '-', defaultVal: 'now()', description: 'วันเวลาที่แก้ไขรายการล่าสุด' },
      { name: 'created_by', type: 'UUID', nullable: 'NULL', key: 'FK', defaultVal: 'NULL', description: 'รหัสผู้สร้างรายการ (อ้างอิง profiles.id)' },
      { name: 'deleted_at', type: 'TIMESTAMPTZ', nullable: 'NULL', key: '-', defaultVal: 'NULL', description: 'วันเวลาที่ลบข้อมูลแบบ Soft Delete' },
    ],
  },
  {
    no: 8,
    tableName: 'programs',
    titleTh: 'ตารางข้อมูลหลักสูตรและกระบวนวิชาศึกษาทั่วไป (Academic Programs Catalog)',
    description:
      'เก็บข้อมูลหลักสูตรระดับปริญญาตรี ปริญญาโท และรายการกระบวนวิชาศึกษาทั่วไป (Pay-in / Pay-out) พร้อมรหัสกลุ่มรายงาน 1.1.1 ถึง 1.1.7',
    columns: [
      { name: 'id', type: 'UUID', nullable: 'NOT NULL', key: 'PK', defaultVal: 'gen_random_uuid()', description: 'รหัสอ้างอิงหลักสูตร' },
      { name: 'code', type: 'TEXT / VARCHAR(50)', nullable: 'NOT NULL', key: 'UNIQUE', defaultVal: '-', description: 'รหัสย่อหลักสูตร (เช่น GOV, PA, IA, STB, MGOV_REG, MPA_SPEC)' },
      { name: 'name_th', type: 'TEXT / VARCHAR(255)', nullable: 'NOT NULL', key: '-', defaultVal: '-', description: 'ชื่อหลักสูตรหรือกระบวนวิชาภาษาไทย' },
      { name: 'level', type: 'TEXT / VARCHAR(30)', nullable: 'NOT NULL', key: 'CHECK', defaultVal: '-', description: 'ระดับการศึกษา: bachelor (ปริญญาตรี), master (ปริญญาโท), doctoral (ปริญญาเอก)' },
      { name: 'report_group', type: 'TEXT / VARCHAR(20)', nullable: 'NOT NULL', key: 'CHECK', defaultVal: '-', description: 'หมวดรายงานคำขอตั้งงบประมาณ: 1.1.1 ถึง 1.1.7' },
      { name: 'created_at', type: 'TIMESTAMPTZ', nullable: 'NOT NULL', key: '-', defaultVal: 'now()', description: 'วันเวลาที่สร้างรายการ' },
      { name: 'updated_at', type: 'TIMESTAMPTZ', nullable: 'NOT NULL', key: '-', defaultVal: 'now()', description: 'วันเวลาที่แก้ไขรายการล่าสุด' },
      { name: 'created_by', type: 'UUID', nullable: 'NULL', key: 'FK', defaultVal: 'NULL', description: 'รหัสผู้สร้างรายการ (อ้างอิง profiles.id)' },
      { name: 'deleted_at', type: 'TIMESTAMPTZ', nullable: 'NULL', key: '-', defaultVal: 'NULL', description: 'วันเวลาที่ลบข้อมูลแบบ Soft Delete' },
    ],
  },
  {
    no: 9,
    tableName: 'fee_schedules',
    titleTh: 'ตารางโครงสร้างค่าธรรมเนียมและรายการหักต่อหัว (Fee Schedules)',
    description:
      'เก็บอัตราค่าหักต่อหัวแยกตามระดับการศึกษาและปีงบประมาณ (เช่น ป.ตรี หักรวม 4,500 บาท/คน, ป.โท หักรวม 5,000 บาท/คน, อัตราคืนค่าห้องสมุด 60%)',
    columns: [
      { name: 'id', type: 'UUID', nullable: 'NOT NULL', key: 'PK', defaultVal: 'gen_random_uuid()', description: 'รหัสอ้างอิงตารางโครงสร้างค่าธรรมเนียม' },
      { name: 'level', type: 'TEXT / VARCHAR(30)', nullable: 'NOT NULL', key: 'UQ, CHECK', defaultVal: '-', description: 'ระดับการศึกษา: bachelor, master, doctoral' },
      { name: 'library_fee', type: 'NUMERIC(14,2)', nullable: 'NOT NULL', key: 'CHECK', defaultVal: '-', description: 'ค่าบำรุงห้องสมุดต่อหัว (บาท เช่น ตรี 700, โท 1,000)' },
      { name: 'it_fee', type: 'NUMERIC(14,2)', nullable: 'NOT NULL', key: 'CHECK', defaultVal: '-', description: 'ค่าบริการสารสนเทศ (IT) ต่อหัว (บาท เช่น ตรี 500, โท 1,000)' },
      { name: 'health_fee', type: 'NUMERIC(14,2)', nullable: 'NOT NULL', key: 'CHECK', defaultVal: '-', description: 'ค่าบริการสุขภาพต่อหัว (บาท เช่น 200)' },
      { name: 'registration_fee', type: 'NUMERIC(14,2)', nullable: 'NOT NULL', key: 'CHECK', defaultVal: '-', description: 'ค่าขึ้นทะเบียนนักศึกษาใหม่ต่อหัว (บาท เช่น 1,000 เฉพาะรุ่นรหัสปีงบใหม่)' },
      { name: 'total_deduction_per_head', type: 'NUMERIC(14,2)', nullable: 'NOT NULL', key: 'CHECK', defaultVal: '-', description: 'ยอดหักรวมต่อหัวทั้งหมด (บาท เช่น ตรี 4,500, โท 5,000)' },
      { name: 'library_refund_pct', type: 'NUMERIC(10,6)', nullable: 'NOT NULL', key: 'CHECK', defaultVal: '-', description: 'สัดส่วนเงินรับคืนจากค่าบำรุงห้องสมุด (เช่น 0.600000 = 60%)' },
      { name: 'effective_be_year', type: 'INTEGER', nullable: 'NOT NULL', key: 'UQ, CHECK', defaultVal: '-', description: 'ปีงบประมาณ พ.ศ. ที่บังคับใช้' },
      { name: 'created_at', type: 'TIMESTAMPTZ', nullable: 'NOT NULL', key: '-', defaultVal: 'now()', description: 'วันเวลาที่สร้างรายการ' },
      { name: 'updated_at', type: 'TIMESTAMPTZ', nullable: 'NOT NULL', key: '-', defaultVal: 'now()', description: 'วันเวลาที่แก้ไขรายการล่าสุด' },
      { name: 'created_by', type: 'UUID', nullable: 'NULL', key: 'FK', defaultVal: 'NULL', description: 'รหัสผู้สร้างรายการ (อ้างอิง profiles.id)' },
      { name: 'deleted_at', type: 'TIMESTAMPTZ', nullable: 'NULL', key: '-', defaultVal: 'NULL', description: 'วันเวลาที่ลบข้อมูลแบบ Soft Delete' },
    ],
  },
  {
    no: 10,
    tableName: 'tuition_lines',
    titleTh: 'ตารางรายการประมาณการค่าธรรมเนียมการศึกษา (Tuition Estimation Lines)',
    description:
      'เก็บข้อมูลนำเข้าจำนวนนักศึกษาภาคเรียนที่ 2 และภาคเรียนที่ 1 และอัตราค่าธรรมเนียมต่อคน แยกตามหลักสูตรและรหัสรุ่น (หมวดที่ 1)',
    columns: [
      { name: 'id', type: 'UUID', nullable: 'NOT NULL', key: 'PK', defaultVal: 'gen_random_uuid()', description: 'รหัสอ้างอิงแถวรายการค่าธรรมเนียมการศึกษา' },
      { name: 'version_id', type: 'UUID', nullable: 'NOT NULL', key: 'FK, IDX', defaultVal: '-', description: 'รหัสเวอร์ชันประมาณการ (อ้างอิง estimate_versions.id)' },
      { name: 'program_id', type: 'UUID', nullable: 'NOT NULL', key: 'FK, IDX', defaultVal: '-', description: 'รหัสหลักสูตร/กระบวนวิชา (อ้างอิง programs.id)' },
      { name: 'cohort_code', type: 'TEXT / VARCHAR(20)', nullable: 'NULL', key: '-', defaultVal: 'NULL', description: 'รหัสนักศึกษา/รหัสรุ่น (เช่น 68, 69, 70, 71 หรือ 1, 2 สำหรับ ป.โท)' },
      { name: 'line_type', type: 'TEXT / VARCHAR(30)', nullable: 'NOT NULL', key: 'CHECK', defaultVal: '-', description: 'ประเภทแถว: regular (หลักสูตรปกติ), gen_ed_in (ศึกษาทั่วไป Pay-in), gen_ed_out (ศึกษานอกคณะ Pay-out)' },
      { name: 'headcount_sem2', type: 'INTEGER', nullable: 'NOT NULL', key: 'CHECK', defaultVal: '0', description: 'จำนวนนักศึกษาภาคเรียนที่ 2 (คน, >= 0)' },
      { name: 'headcount_sem1', type: 'INTEGER', nullable: 'NOT NULL', key: 'CHECK', defaultVal: '0', description: 'จำนวนนักศึกษาภาคเรียนที่ 1 (คน, >= 0)' },
      { name: 'fee_per_head', type: 'NUMERIC(14,2)', nullable: 'NOT NULL', key: 'CHECK', defaultVal: '-', description: 'อัตราค่าธรรมเนียมการศึกษาต่อคนต่อภาคเรียน (บาท; กรณี gen_ed_out เป็นค่าติดลบ)' },
      { name: 'created_at', type: 'TIMESTAMPTZ', nullable: 'NOT NULL', key: '-', defaultVal: 'now()', description: 'วันเวลาที่สร้างรายการ' },
      { name: 'updated_at', type: 'TIMESTAMPTZ', nullable: 'NOT NULL', key: '-', defaultVal: 'now()', description: 'วันเวลาที่แก้ไขรายการล่าสุด' },
      { name: 'created_by', type: 'UUID', nullable: 'NULL', key: 'FK', defaultVal: 'NULL', description: 'รหัสผู้สร้างรายการ (อ้างอิง profiles.id)' },
      { name: 'deleted_at', type: 'TIMESTAMPTZ', nullable: 'NULL', key: '-', defaultVal: 'NULL', description: 'วันเวลาที่ลบข้อมูลแบบ Soft Delete' },
    ],
  },
  {
    no: 11,
    tableName: 'service_projects',
    titleTh: 'ตารางรายการประมาณการโครงการบริการวิชาการ (Academic Service Projects)',
    description:
      'เก็บข้อมูลโครงการบริการวิชาการแก่สังคม (หมวดที่ 2) คำนวณหักส่วนกลาง 10% และหักบริหารจัดการ 40% ตามพารามิเตอร์',
    columns: [
      { name: 'id', type: 'UUID', nullable: 'NOT NULL', key: 'PK', defaultVal: 'gen_random_uuid()', description: 'รหัสอ้างอิงโครงการบริการวิชาการ' },
      { name: 'version_id', type: 'UUID', nullable: 'NOT NULL', key: 'FK, IDX', defaultVal: '-', description: 'รหัสเวอร์ชันประมาณการ (อ้างอิง estimate_versions.id)' },
      { name: 'name', type: 'TEXT / VARCHAR(255)', nullable: 'NOT NULL', key: '-', defaultVal: '-', description: 'ชื่อโครงการบริการวิชาการ' },
      { name: 'partner', type: 'TEXT / VARCHAR(255)', nullable: 'NULL', key: '-', defaultVal: 'NULL', description: 'หน่วยงานร่วมจัด / ผู้รับบริการ' },
      { name: 'category', type: 'TEXT / VARCHAR(50)', nullable: 'NOT NULL', key: 'CHECK', defaultVal: '-', description: 'หมวดโครงการ: short_course (1.2.1 อบรมระยะสั้น), usac (1.2.2 USAC), le (1.2.3 LE), school_activity' },
      { name: 'batches', type: 'INTEGER', nullable: 'NOT NULL', key: 'CHECK', defaultVal: '1', description: 'จำนวนรุ่นที่จัดอบรม (รุ่น, >= 0)' },
      { name: 'attendees_per_batch', type: 'INTEGER', nullable: 'NOT NULL', key: 'CHECK', defaultVal: '0', description: 'จำนวนผู้เข้าร่วมต่อรุ่น (คน, >= 0)' },
      { name: 'fee_per_head', type: 'NUMERIC(14,2)', nullable: 'NOT NULL', key: 'CHECK', defaultVal: '0', description: 'อัตราค่าลงทะเบียนต่อคน (บาท, >= 0)' },
      { name: 'apply_mgmt_deduction', type: 'BOOLEAN', nullable: 'NOT NULL', key: '-', defaultVal: 'true', description: 'ตัวเลือกการหักค่าบริหารจัดการ 40% (true = หัก 40%, false = ไม่หัก)' },
      { name: 'month_seq', type: 'INTEGER', nullable: 'NOT NULL', key: 'CHECK', defaultVal: '-', description: 'เดือนที่คาดว่าจะได้รับเงิน (1 = ต.ค. ถึง 12 = ก.ย.)' },
      { name: 'note', type: 'TEXT', nullable: 'NULL', key: '-', defaultVal: 'NULL', description: 'หมายเหตุเพิ่มเติม' },
      { name: 'created_at', type: 'TIMESTAMPTZ', nullable: 'NOT NULL', key: '-', defaultVal: 'now()', description: 'วันเวลาที่สร้างรายการ' },
      { name: 'updated_at', type: 'TIMESTAMPTZ', nullable: 'NOT NULL', key: '-', defaultVal: 'now()', description: 'วันเวลาที่แก้ไขรายการล่าสุด' },
      { name: 'created_by', type: 'UUID', nullable: 'NULL', key: 'FK', defaultVal: 'NULL', description: 'รหัสผู้สร้างรายการ (อ้างอิง profiles.id)' },
      { name: 'deleted_at', type: 'TIMESTAMPTZ', nullable: 'NULL', key: '-', defaultVal: 'NULL', description: 'วันเวลาที่ลบข้อมูลแบบ Soft Delete' },
    ],
  },
  {
    no: 12,
    tableName: 'research_projects',
    titleTh: 'ตารางรายการประมาณการโครงการวิจัย (Research Overhead Projects)',
    description:
      'เก็บข้อมูลโครงการวิจัยเพื่อคำนวณรายรับค่าธรรมเนียมอุดหนุนสถาบัน (Overhead งานวิจัย - หมวดที่ 3)',
    columns: [
      { name: 'id', type: 'UUID', nullable: 'NOT NULL', key: 'PK', defaultVal: 'gen_random_uuid()', description: 'รหัสอ้างอิงโครงการวิจัย' },
      { name: 'version_id', type: 'UUID', nullable: 'NOT NULL', key: 'FK, IDX', defaultVal: '-', description: 'รหัสเวอร์ชันประมาณการ (อ้างอิง estimate_versions.id)' },
      { name: 'name', type: 'TEXT / VARCHAR(255)', nullable: 'NOT NULL', key: '-', defaultVal: '-', description: 'ชื่อโครงการวิจัย' },
      { name: 'funder', type: 'TEXT / VARCHAR(255)', nullable: 'NULL', key: '-', defaultVal: 'NULL', description: 'แหล่งทุนวิจัย / ผู้ให้ทุน' },
      { name: 'pi_name', type: 'TEXT / VARCHAR(255)', nullable: 'NULL', key: '-', defaultVal: 'NULL', description: 'ชื่อหัวหน้าโครงการวิจัย (Principal Investigator)' },
      { name: 'budget', type: 'NUMERIC(14,2)', nullable: 'NOT NULL', key: 'CHECK', defaultVal: '0', description: 'งบประมาณโครงการวิจัยรวม (บาท, >= 0)' },
      { name: 'overhead_rate_override', type: 'NUMERIC(10,6)', nullable: 'NULL', key: 'CHECK', defaultVal: 'NULL', description: 'อัตรา Overhead เฉพาะโครงการ (0–1 เช่น 0.10 = 10%; หากเป็น NULL จะใช้อัตราเริ่มต้นจากพารามิเตอร์)' },
      { name: 'month_seq', type: 'INTEGER', nullable: 'NOT NULL', key: 'CHECK', defaultVal: '-', description: 'เดือนที่คาดว่าจะได้รับเงิน (1 = ต.ค. ถึง 12 = ก.ย.)' },
      { name: 'note', type: 'TEXT', nullable: 'NULL', key: '-', defaultVal: 'NULL', description: 'หมายเหตุเพิ่มเติม' },
      { name: 'created_at', type: 'TIMESTAMPTZ', nullable: 'NOT NULL', key: '-', defaultVal: 'now()', description: 'วันเวลาที่สร้างรายการ' },
      { name: 'updated_at', type: 'TIMESTAMPTZ', nullable: 'NOT NULL', key: '-', defaultVal: 'now()', description: 'วันเวลาที่แก้ไขรายการล่าสุด' },
      { name: 'created_by', type: 'UUID', nullable: 'NULL', key: 'FK', defaultVal: 'NULL', description: 'รหัสผู้สร้างรายการ (อ้างอิง profiles.id)' },
      { name: 'deleted_at', type: 'TIMESTAMPTZ', nullable: 'NULL', key: '-', defaultVal: 'NULL', description: 'วันเวลาที่ลบข้อมูลแบบ Soft Delete' },
    ],
  },
  {
    no: 13,
    tableName: 'rental_items',
    titleTh: 'ตารางรายการประมาณการค่าเช่าราชพัสดุ (Property Rental Items)',
    description:
      'เก็บข้อมูลสัญญา/รายการเช่าพื้นที่ราชพัสดุและสถานที่ของคณะ (หมวดที่ 4) คำนวณรายเดือนตามช่วงเดือนที่เช่าและหักส่วนกลาง 10%',
    columns: [
      { name: 'id', type: 'UUID', nullable: 'NOT NULL', key: 'PK', defaultVal: 'gen_random_uuid()', description: 'รหัสอ้างอิงรายการค่าเช่าราชพัสดุ' },
      { name: 'version_id', type: 'UUID', nullable: 'NOT NULL', key: 'FK, IDX', defaultVal: '-', description: 'รหัสเวอร์ชันประมาณการ (อ้างอิง estimate_versions.id)' },
      { name: 'name', type: 'TEXT / VARCHAR(255)', nullable: 'NOT NULL', key: '-', defaultVal: '-', description: 'ชื่อรายการเช่า / พื้นที่ให้เช่า' },
      { name: 'tenant', type: 'TEXT / VARCHAR(255)', nullable: 'NULL', key: '-', defaultVal: 'NULL', description: 'ชื่อผู้เช่า / ร้านค้า / หน่วยงาน' },
      { name: 'area_sqm', type: 'NUMERIC(10,2)', nullable: 'NULL', key: 'CHECK', defaultVal: 'NULL', description: 'ขนาดพื้นที่เช่า (ตารางเมตร)' },
      { name: 'monthly_rent', type: 'NUMERIC(14,2)', nullable: 'NOT NULL', key: 'CHECK', defaultVal: '0', description: 'อัตราค่าเช่าต่อเดือน (บาท, >= 0)' },
      { name: 'start_month_seq', type: 'INTEGER', nullable: 'NOT NULL', key: 'CHECK', defaultVal: '-', description: 'ลำดับเดือนที่เริ่มสัญญาเช่าในปีงบประมาณ (1–12)' },
      { name: 'end_month_seq', type: 'INTEGER', nullable: 'NOT NULL', key: 'CHECK', defaultVal: '-', description: 'ลำดับเดือนที่สิ้นสุดสัญญาเช่าในปีงบประมาณ (1–12)' },
      { name: 'note', type: 'TEXT', nullable: 'NULL', key: '-', defaultVal: 'NULL', description: 'หมายเหตุเพิ่มเติม' },
      { name: 'created_at', type: 'TIMESTAMPTZ', nullable: 'NOT NULL', key: '-', defaultVal: 'now()', description: 'วันเวลาที่สร้างรายการ' },
      { name: 'updated_at', type: 'TIMESTAMPTZ', nullable: 'NOT NULL', key: '-', defaultVal: 'now()', description: 'วันเวลาที่แก้ไขรายการล่าสุด' },
      { name: 'created_by', type: 'UUID', nullable: 'NULL', key: 'FK', defaultVal: 'NULL', description: 'รหัสผู้สร้างรายการ (อ้างอิง profiles.id)' },
      { name: 'deleted_at', type: 'TIMESTAMPTZ', nullable: 'NULL', key: '-', defaultVal: 'NULL', description: 'วันเวลาที่ลบข้อมูลแบบ Soft Delete' },
    ],
  },
  {
    no: 14,
    tableName: 'carryover',
    titleTh: 'ตารางเงินเหลือจ่ายสะสมยกมา (Carryover Balance)',
    description:
      'เก็บยอดเงินเหลือจ่ายสะสมยกมา ณ ต้นปีงบประมาณ (1 ตุลาคม - หมวดที่ 5) โดยไม่มีรายการหัก',
    columns: [
      { name: 'id', type: 'UUID', nullable: 'NOT NULL', key: 'PK', defaultVal: 'gen_random_uuid()', description: 'รหัสอ้างอิงรายการเงินเหลือจ่ายสะสม' },
      { name: 'version_id', type: 'UUID', nullable: 'NOT NULL', key: 'FK, UQ', defaultVal: '-', description: 'รหัสเวอร์ชันประมาณการ (1 เวอร์ชันมี 1 ยอดยกมา)' },
      { name: 'amount', type: 'NUMERIC(14,2)', nullable: 'NOT NULL', key: 'CHECK', defaultVal: '0', description: 'จำนวนเงินเหลือจ่ายสะสมยกมา (บาท, >= 0)' },
      { name: 'source_note', type: 'TEXT', nullable: 'NULL', key: '-', defaultVal: 'NULL', description: 'แหล่งที่มาหรือหมายเหตุอ้างอิงของยอดเงินเหลือจ่ายสะสม' },
      { name: 'created_at', type: 'TIMESTAMPTZ', nullable: 'NOT NULL', key: '-', defaultVal: 'now()', description: 'วันเวลาที่สร้างรายการ' },
      { name: 'updated_at', type: 'TIMESTAMPTZ', nullable: 'NOT NULL', key: '-', defaultVal: 'now()', description: 'วันเวลาที่แก้ไขรายการล่าสุด' },
      { name: 'created_by', type: 'UUID', nullable: 'NULL', key: 'FK', defaultVal: 'NULL', description: 'รหัสผู้สร้างรายการ (อ้างอิง profiles.id)' },
      { name: 'deleted_at', type: 'TIMESTAMPTZ', nullable: 'NULL', key: '-', defaultVal: 'NULL', description: 'วันเวลาที่ลบข้อมูลแบบ Soft Delete' },
    ],
  },
  {
    no: 15,
    tableName: 'other_income_lines',
    titleTh: 'ตารางรายการประมาณการรายได้อื่นๆ (Other Income Lines)',
    description:
      'เก็บรายการประมาณการรายได้อื่นๆ นอกเหนือจาก 5 ประเภทหลัก (เช่น ดอกเบี้ยรับ ค่าปรับ หรือรายได้เบ็ดเตล็ด)',
    columns: [
      { name: 'id', type: 'UUID', nullable: 'NOT NULL', key: 'PK', defaultVal: 'gen_random_uuid()', description: 'รหัสอ้างอิงรายการรายได้อื่น' },
      { name: 'version_id', type: 'UUID', nullable: 'NOT NULL', key: 'FK, IDX', defaultVal: '-', description: 'รหัสเวอร์ชันประมาณการ (อ้างอิง estimate_versions.id)' },
      { name: 'name', type: 'TEXT / VARCHAR(255)', nullable: 'NOT NULL', key: '-', defaultVal: '-', description: 'ชื่อรายการรายได้อื่น' },
      { name: 'month_seq', type: 'INTEGER', nullable: 'NOT NULL', key: 'CHECK', defaultVal: '-', description: 'ลำดับเดือนที่คาดว่าจะได้รับ (1–12)' },
      { name: 'gross', type: 'NUMERIC(14,2)', nullable: 'NOT NULL', key: 'CHECK', defaultVal: '0', description: 'จำนวนเงินรายรับก่อนหัก (บาท, >= 0)' },
      { name: 'deduction', type: 'NUMERIC(14,2)', nullable: 'NOT NULL', key: 'CHECK', defaultVal: '0', description: 'จำนวนเงินค่าหัก (บาท, >= 0 และต้องไม่เกิน gross)' },
      { name: 'created_at', type: 'TIMESTAMPTZ', nullable: 'NOT NULL', key: '-', defaultVal: 'now()', description: 'วันเวลาที่สร้างรายการ' },
      { name: 'updated_at', type: 'TIMESTAMPTZ', nullable: 'NOT NULL', key: '-', defaultVal: 'now()', description: 'วันเวลาที่แก้ไขรายการล่าสุด' },
      { name: 'created_by', type: 'UUID', nullable: 'NULL', key: 'FK', defaultVal: 'NULL', description: 'รหัสผู้สร้างรายการ (อ้างอิง profiles.id)' },
      { name: 'deleted_at', type: 'TIMESTAMPTZ', nullable: 'NULL', key: '-', defaultVal: 'NULL', description: 'วันเวลาที่ลบข้อมูลแบบ Soft Delete' },
    ],
  },
  {
    no: 16,
    tableName: 'revenue_actuals',
    titleTh: 'ตารางบันทึกรายรับจริงรายเดือน (Monthly Revenue Actuals)',
    description:
      'เก็บข้อมูลรายรับจริงที่เกิดขึ้นในแต่ละเดือน แยกตามประเภทรายรับ เพื่อใช้ติดตามและเปรียบเทียบกับประมาณการ (Budget vs Actual)',
    columns: [
      { name: 'id', type: 'UUID', nullable: 'NOT NULL', key: 'PK', defaultVal: 'gen_random_uuid()', description: 'รหัสอ้างอิงรายการรายรับจริง' },
      { name: 'fiscal_year_id', type: 'UUID', nullable: 'NOT NULL', key: 'FK, IDX', defaultVal: '-', description: 'รหัสปีงบประมาณ (อ้างอิง fiscal_years.id)' },
      { name: 'received_date', type: 'DATE', nullable: 'NULL', key: '-', defaultVal: 'NULL', description: 'วันที่รับเงินจริงตามใบเสร็จ/เอกสารการเงิน' },
      { name: 'month_seq', type: 'INTEGER', nullable: 'NOT NULL', key: 'IDX, CHECK', defaultVal: '-', description: 'ลำดับเดือนในปีงบประมาณ (1 = ต.ค. ถึง 12 = ก.ย.)' },
      { name: 'revenue_type', type: 'TEXT / VARCHAR(30)', nullable: 'NOT NULL', key: 'IDX, CHECK', defaultVal: '-', description: 'ประเภทรายรับ: TUITION, ACAD_SERVICE, RESEARCH_OH, RENT, CARRYOVER, OTHER' },
      { name: 'source_name', type: 'TEXT / VARCHAR(255)', nullable: 'NOT NULL', key: '-', defaultVal: '-', description: 'ชื่อรายการ / แหล่งที่มาของรายรับจริง' },
      { name: 'ref_no', type: 'TEXT / VARCHAR(100)', nullable: 'NULL', key: '-', defaultVal: 'NULL', description: 'เลขที่เอกสารอ้างอิง / เลขที่ใบนำส่งเงิน' },
      { name: 'gross', type: 'NUMERIC(14,2)', nullable: 'NOT NULL', key: 'CHECK', defaultVal: '0', description: 'ยอดรายรับจริงก่อนหัก (บาท, >= 0)' },
      { name: 'deduction', type: 'NUMERIC(14,2)', nullable: 'NOT NULL', key: 'CHECK', defaultVal: '0', description: 'ยอดรายการหักจริง (บาท, >= 0)' },
      { name: 'net', type: 'NUMERIC(14,2)', nullable: 'GENERATED', key: '-', defaultVal: 'gross - deduction', description: 'ยอดรายรับสุทธิจริง (Generated Column คำนวณจาก gross - deduction อัตโนมัติ)' },
      { name: 'note', type: 'TEXT', nullable: 'NULL', key: '-', defaultVal: 'NULL', description: 'หมายเหตุเพิ่มเติม' },
      { name: 'created_at', type: 'TIMESTAMPTZ', nullable: 'NOT NULL', key: '-', defaultVal: 'now()', description: 'วันเวลาที่สร้างรายการ' },
      { name: 'updated_at', type: 'TIMESTAMPTZ', nullable: 'NOT NULL', key: '-', defaultVal: 'now()', description: 'วันเวลาที่แก้ไขรายการล่าสุด' },
      { name: 'created_by', type: 'UUID', nullable: 'NULL', key: 'FK', defaultVal: 'NULL', description: 'รหัสผู้บันทึกรายการ (อ้างอิง profiles.id)' },
      { name: 'deleted_at', type: 'TIMESTAMPTZ', nullable: 'NULL', key: '-', defaultVal: 'NULL', description: 'วันเวลาที่ลบข้อมูลแบบ Soft Delete' },
    ],
  },
  {
    no: 17,
    tableName: 'expenditure_actuals',
    titleTh: 'ตารางบันทึกรายจ่ายจริงรายเดือน (Monthly Expenditure Actuals)',
    description:
      'เก็บข้อมูลรายจ่ายจริงรายเดือนในแต่ละปีงบประมาณ เพื่อนำมาคำนวณยอดเงินเหลือจ่ายสะสมรายเดือน (Carryover Tracker)',
    columns: [
      { name: 'id', type: 'UUID', nullable: 'NOT NULL', key: 'PK', defaultVal: 'gen_random_uuid()', description: 'รหัสอ้างอิงรายการรายจ่ายจริง' },
      { name: 'fiscal_year_id', type: 'UUID', nullable: 'NOT NULL', key: 'FK, UQ', defaultVal: '-', description: 'รหัสปีงบประมาณ (อ้างอิง fiscal_years.id)' },
      { name: 'month_seq', type: 'INTEGER', nullable: 'NOT NULL', key: 'UQ, CHECK', defaultVal: '-', description: 'ลำดับเดือนในปีงบประมาณ (1 = ต.ค. ถึง 12 = ก.ย.)' },
      { name: 'amount', type: 'NUMERIC(14,2)', nullable: 'NOT NULL', key: 'CHECK', defaultVal: '0', description: 'จำนวนเงินรายจ่ายจริงในเดือนนั้น (บาท, >= 0)' },
      { name: 'note', type: 'TEXT', nullable: 'NULL', key: '-', defaultVal: 'NULL', description: 'หมายเหตุเพิ่มเติม' },
      { name: 'created_at', type: 'TIMESTAMPTZ', nullable: 'NOT NULL', key: '-', defaultVal: 'now()', description: 'วันเวลาที่สร้างรายการ' },
      { name: 'updated_at', type: 'TIMESTAMPTZ', nullable: 'NOT NULL', key: '-', defaultVal: 'now()', description: 'วันเวลาที่แก้ไขรายการล่าสุด' },
      { name: 'created_by', type: 'UUID', nullable: 'NULL', key: 'FK', defaultVal: 'NULL', description: 'รหัสผู้บันทึกรายการ (อ้างอิง profiles.id)' },
      { name: 'deleted_at', type: 'TIMESTAMPTZ', nullable: 'NULL', key: '-', defaultVal: 'NULL', description: 'วันเวลาที่ลบข้อมูลแบบ Soft Delete' },
    ],
  },
  {
    no: 18,
    tableName: 'allocation_dimensions',
    titleTh: 'ตารางมิติการจัดสรรกรอบงบประมาณ (Allocation Dimensions)',
    description:
      'เก็บข้อมูลมิติการจัดสรรรายรับสุทธิ 3 มุมมอง ได้แก่ มิติแผนงาน (plan), มิติหมวดรายจ่าย (expense_category) และมิติหมวดงบเชิงยุทธศาสตร์ (strategic)',
    columns: [
      { name: 'id', type: 'UUID', nullable: 'NOT NULL', key: 'PK', defaultVal: 'gen_random_uuid()', description: 'รหัสอ้างอิงมิติการจัดสรรงบ' },
      { name: 'code', type: 'TEXT / VARCHAR(50)', nullable: 'NOT NULL', key: 'UNIQUE, CHECK', defaultVal: '-', description: 'รหัสมิติการจัดสรร: plan, expense_category, strategic' },
      { name: 'name_th', type: 'TEXT / VARCHAR(255)', nullable: 'NOT NULL', key: '-', defaultVal: '-', description: 'ชื่อมิติการจัดสรรงบภาษาไทย' },
      { name: 'created_at', type: 'TIMESTAMPTZ', nullable: 'NOT NULL', key: '-', defaultVal: 'now()', description: 'วันเวลาที่สร้างรายการ' },
      { name: 'updated_at', type: 'TIMESTAMPTZ', nullable: 'NOT NULL', key: '-', defaultVal: 'now()', description: 'วันเวลาที่แก้ไขรายการล่าสุด' },
      { name: 'created_by', type: 'UUID', nullable: 'NULL', key: 'FK', defaultVal: 'NULL', description: 'รหัสผู้สร้างรายการ (อ้างอิง profiles.id)' },
      { name: 'deleted_at', type: 'TIMESTAMPTZ', nullable: 'NULL', key: '-', defaultVal: 'NULL', description: 'วันเวลาที่ลบข้อมูลแบบ Soft Delete' },
    ],
  },
  {
    no: 19,
    tableName: 'allocation_items',
    titleTh: 'ตารางรายการหมวดงบประมาณย่อยภายใต้แต่ละมิติ (Allocation Items)',
    description:
      'เก็บรายการหมวดงบประมาณย่อยในแต่ละมิติ (เช่น แผนงานการเรียนการสอน, งบบุคลากร, งบรายจ่ายประจำ (งบดำเนินงาน), งบพัฒนาและปรับปรุง, งบขับเคลื่อนยุทธศาสตร์คณะ ฯลฯ)',
    columns: [
      { name: 'id', type: 'UUID', nullable: 'NOT NULL', key: 'PK', defaultVal: 'gen_random_uuid()', description: 'รหัสอ้างอิงรายการหมวดงบประมาณย่อย' },
      { name: 'dimension_id', type: 'UUID', nullable: 'NOT NULL', key: 'FK, UQ, IDX', defaultVal: '-', description: 'รหัสมิติการจัดสรรงบ (อ้างอิง allocation_dimensions.id)' },
      { name: 'name', type: 'TEXT / VARCHAR(255)', nullable: 'NOT NULL', key: 'UQ', defaultVal: '-', description: 'ชื่อรายการหมวดงบประมาณย่อย' },
      { name: 'sort_order', type: 'INTEGER', nullable: 'NOT NULL', key: 'IDX', defaultVal: '1', description: 'ลำดับการแสดงผลในตารางและรายงาน' },
      { name: 'created_at', type: 'TIMESTAMPTZ', nullable: 'NOT NULL', key: '-', defaultVal: 'now()', description: 'วันเวลาที่สร้างรายการ' },
      { name: 'updated_at', type: 'TIMESTAMPTZ', nullable: 'NOT NULL', key: '-', defaultVal: 'now()', description: 'วันเวลาที่แก้ไขรายการล่าสุด' },
      { name: 'created_by', type: 'UUID', nullable: 'NULL', key: 'FK', defaultVal: 'NULL', description: 'รหัสผู้สร้างรายการ (อ้างอิง profiles.id)' },
      { name: 'deleted_at', type: 'TIMESTAMPTZ', nullable: 'NULL', key: '-', defaultVal: 'NULL', description: 'วันเวลาที่ลบข้อมูลแบบ Soft Delete' },
    ],
  },
  {
    no: 20,
    tableName: 'allocation_pcts',
    titleTh: 'ตารางสัดส่วนร้อยละการจัดสรรกรอบงบประมาณ (Allocation Percentages)',
    description:
      'เก็บสัดส่วนร้อยละ (0–1) การจัดสรรรายรับสุทธิของแต่ละประเภทรายรับไปยังหมวดงบประมาณย่อย โดยผลรวมต่อ (version_id, มิติ, revenue_type) ต้องเท่ากับ 1.0 (100%)',
    columns: [
      { name: 'id', type: 'UUID', nullable: 'NOT NULL', key: 'PK', defaultVal: 'gen_random_uuid()', description: 'รหัสอ้างอิงสัดส่วนการจัดสรร' },
      { name: 'version_id', type: 'UUID', nullable: 'NOT NULL', key: 'FK, UQ, IDX', defaultVal: '-', description: 'รหัสเวอร์ชันประมาณการ (อ้างอิง estimate_versions.id)' },
      { name: 'item_id', type: 'UUID', nullable: 'NOT NULL', key: 'FK, UQ', defaultVal: '-', description: 'รหัสรายการหมวดงบประมาณย่อย (อ้างอิง allocation_items.id)' },
      { name: 'revenue_type', type: 'TEXT / VARCHAR(30)', nullable: 'NOT NULL', key: 'UQ, CHECK', defaultVal: '-', description: 'ประเภทรายรับที่นำมาจัดสรร: TUITION, ACAD_SERVICE, RESEARCH_OH, RENT, CARRYOVER, OTHER' },
      { name: 'pct', type: 'NUMERIC(10,6)', nullable: 'NOT NULL', key: 'CHECK', defaultVal: '0', description: 'สัดส่วนการจัดสรร (0.000000 ถึง 1.000000)' },
      { name: 'created_at', type: 'TIMESTAMPTZ', nullable: 'NOT NULL', key: '-', defaultVal: 'now()', description: 'วันเวลาที่สร้างรายการ' },
      { name: 'updated_at', type: 'TIMESTAMPTZ', nullable: 'NOT NULL', key: '-', defaultVal: 'now()', description: 'วันเวลาที่แก้ไขรายการล่าสุด' },
      { name: 'created_by', type: 'UUID', nullable: 'NULL', key: 'FK', defaultVal: 'NULL', description: 'รหัสผู้สร้างรายการ (อ้างอิง profiles.id)' },
      { name: 'deleted_at', type: 'TIMESTAMPTZ', nullable: 'NULL', key: '-', defaultVal: 'NULL', description: 'วันเวลาที่ลบข้อมูลแบบ Soft Delete' },
    ],
  },
  {
    no: 21,
    tableName: 'historical_usage',
    titleTh: 'ตารางข้อมูลการใช้จ่ายงบประมาณย้อนหลัง (Historical Budget Usage)',
    description:
      'เก็บข้อมูลตัวเลขการใช้จ่ายจริงหรือการจัดสรรงบประมาณย้อนหลัง (เช่น ปี พ.ศ. 2565–2569) แยกตามรายการหมวดงบประมาณย่อย เพื่อใช้เปรียบเทียบแนวโน้ม',
    columns: [
      { name: 'id', type: 'UUID', nullable: 'NOT NULL', key: 'PK', defaultVal: 'gen_random_uuid()', description: 'รหัสอ้างอิงข้อมูลย้อนหลัง' },
      { name: 'item_id', type: 'UUID', nullable: 'NOT NULL', key: 'FK, UQ, IDX', defaultVal: '-', description: 'รหัสรายการหมวดงบประมาณย่อย (อ้างอิง allocation_items.id)' },
      { name: 'be_year', type: 'INTEGER', nullable: 'NOT NULL', key: 'UQ, IDX, CHECK', defaultVal: '-', description: 'ปีงบประมาณ พ.ศ. ย้อนหลัง (เช่น 2565–2569)' },
      { name: 'amount', type: 'NUMERIC(14,2)', nullable: 'NULL', key: 'CHECK', defaultVal: 'NULL', description: 'จำนวนเงินที่ใช้จ่าย/จัดสรรในปีนั้น (บาท; NULL กรณีไม่มีข้อมูล)' },
      { name: 'created_at', type: 'TIMESTAMPTZ', nullable: 'NOT NULL', key: '-', defaultVal: 'now()', description: 'วันเวลาที่สร้างรายการ' },
      { name: 'updated_at', type: 'TIMESTAMPTZ', nullable: 'NOT NULL', key: '-', defaultVal: 'now()', description: 'วันเวลาที่แก้ไขรายการล่าสุด' },
      { name: 'created_by', type: 'UUID', nullable: 'NULL', key: 'FK', defaultVal: 'NULL', description: 'รหัสผู้สร้างรายการ (อ้างอิง profiles.id)' },
      { name: 'deleted_at', type: 'TIMESTAMPTZ', nullable: 'NULL', key: '-', defaultVal: 'NULL', description: 'วันเวลาที่ลบข้อมูลแบบ Soft Delete' },
    ],
  },
  {
    no: 22,
    tableName: 'version_snapshots',
    titleTh: 'ตารางบันทึก Snapshot ผลการคำนวณเมื่ออนุมัติเวอร์ชัน (Approved Version Snapshots)',
    description:
      'เก็บผลลัพธ์การคำนวณทั้งหมดในรูปแบบ JSONB ณ เวลาที่อนุมัติเวอร์ชัน (Constitution ข้อ 10) เพื่อให้รายงานที่อนุมัติแล้วถูกตรึงค่าไว้ไม่เปลี่ยนแปลงตามพารามิเตอร์ภายหลัง',
    columns: [
      { name: 'id', type: 'UUID', nullable: 'NOT NULL', key: 'PK', defaultVal: 'gen_random_uuid()', description: 'รหัสอ้างอิง Snapshot' },
      { name: 'version_id', type: 'UUID', nullable: 'NOT NULL', key: 'FK, UNIQUE', defaultVal: '-', description: 'รหัสเวอร์ชันประมาณการที่ได้รับการอนุมัติ (อ้างอิง estimate_versions.id)' },
      { name: 'payload', type: 'JSONB / JSON', nullable: 'NOT NULL', key: '-', defaultVal: '-', description: 'ข้อมูลผลลัพธ์การคำนวณทั้งหมด ณ เวลาที่อนุมัติในรูปแบบ JSON' },
      { name: 'created_at', type: 'TIMESTAMPTZ', nullable: 'NOT NULL', key: '-', defaultVal: 'now()', description: 'วันเวลาที่สร้าง Snapshot' },
      { name: 'updated_at', type: 'TIMESTAMPTZ', nullable: 'NOT NULL', key: '-', defaultVal: 'now()', description: 'วันเวลาที่แก้ไขล่าสุด' },
      { name: 'created_by', type: 'UUID', nullable: 'NULL', key: 'FK', defaultVal: 'NULL', description: 'รหัสผู้อนุมัติที่สร้าง Snapshot (อ้างอิง profiles.id)' },
      { name: 'deleted_at', type: 'TIMESTAMPTZ', nullable: 'NULL', key: '-', defaultVal: 'NULL', description: 'วันเวลาที่ลบข้อมูลแบบ Soft Delete' },
    ],
  },
];

function escXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function makeParagraph(
  text: string,
  opts?: {
    bold?: boolean;
    sizeHalfPt?: number;
    color?: string;
    align?: 'left' | 'center' | 'right';
    spaceBefore?: number;
    spaceAfter?: number;
  }
): string {
  const size = opts?.sizeHalfPt ?? 22; // 11pt default
  const color = opts?.color ?? '1E293B';
  const align = opts?.align ?? 'left';
  const before = opts?.spaceBefore ?? 60;
  const after = opts?.spaceAfter ?? 60;
  const boldTag = opts?.bold ? '<w:b/><w:bCs/>' : '';

  return `
    <w:p>
      <w:pPr>
        <w:spacing w:before="${before}" w:after="${after}"/>
        <w:jc w:val="${align}"/>
      </w:pPr>
      <w:r>
        <w:rPr>
          <w:rFonts w:ascii="Leelawadee UI" w:hAnsi="Leelawadee UI" w:cs="Leelawadee UI" w:eastAsia="Leelawadee UI"/>
          ${boldTag}
          <w:color w:val="${color}"/>
          <w:sz w:val="${size}"/>
          <w:szCs w:val="${size}"/>
        </w:rPr>
        <w:t xml:space="preserve">${escXml(text)}</w:t>
      </w:r>
    </w:p>`;
}

function makeCell(
  text: string,
  widthDxa: number,
  opts?: {
    bold?: boolean;
    bgFill?: string;
    color?: string;
    align?: 'left' | 'center' | 'right';
    sizeHalfPt?: number;
  }
): string {
  const fill = opts?.bgFill ? `<w:shd w:val="clear" w:color="auto" w:fill="${opts.bgFill}"/>` : '';
  const size = opts?.sizeHalfPt ?? 19; // 9.5pt for table content
  const color = opts?.color ?? '0F172A';
  const align = opts?.align ?? 'left';
  const boldTag = opts?.bold ? '<w:b/><w:bCs/>' : '';

  return `
    <w:tc>
      <w:tcPr>
        <w:tcW w:w="${widthDxa}" w:type="dxa"/>
        ${fill}
        <w:tcMar>
          <w:top w:w="70" w:type="dxa"/>
          <w:bottom w:w="70" w:type="dxa"/>
          <w:left w:w="100" w:type="dxa"/>
          <w:right w:w="100" w:type="dxa"/>
        </w:tcMar>
        <w:vAlign w:val="center"/>
      </w:tcPr>
      <w:p>
        <w:pPr>
          <w:spacing w:before="20" w:after="20"/>
          <w:jc w:val="${align}"/>
        </w:pPr>
        <w:r>
          <w:rPr>
            <w:rFonts w:ascii="Leelawadee UI" w:hAnsi="Leelawadee UI" w:cs="Leelawadee UI" w:eastAsia="Leelawadee UI"/>
            ${boldTag}
            <w:color w:val="${color}"/>
            <w:sz w:val="${size}"/>
            <w:szCs w:val="${size}"/>
          </w:rPr>
          <w:t xml:space="preserve">${escXml(text)}</w:t>
        </w:r>
      </w:p>
    </w:tc>`;
}

function makeTableBorders(): string {
  return `
    <w:tblBorders>
      <w:top w:val="single" w:sz="6" w:space="0" w:color="CBD5E1"/>
      <w:left w:val="single" w:sz="6" w:space="0" w:color="CBD5E1"/>
      <w:bottom w:val="single" w:sz="6" w:space="0" w:color="CBD5E1"/>
      <w:right w:val="single" w:sz="6" w:space="0" w:color="CBD5E1"/>
      <w:insideH w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/>
      <w:insideV w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/>
    </w:tblBorders>`;
}

function buildSummaryTableXml(): string {
  const widths = [700, 2600, 3800, 2900]; // Total = 10,000 dxa
  let rowsXml = `
    <w:tr>
      <w:trPr><w:tblHeader/></w:trPr>
      ${makeCell('ลำดับ', widths[0], { bold: true, bgFill: '3B1C57', color: 'FFFFFF', align: 'center', sizeHalfPt: 20 })}
      ${makeCell('ชื่อตาราง (Table Name)', widths[1], { bold: true, bgFill: '3B1C57', color: 'FFFFFF', sizeHalfPt: 20 })}
      ${makeCell('ชื่อตารางภาษาไทย', widths[2], { bold: true, bgFill: '3B1C57', color: 'FFFFFF', sizeHalfPt: 20 })}
      ${makeCell('จำนวนคอลัมน์ / หมวดหมู่', widths[3], { bold: true, bgFill: '3B1C57', color: 'FFFFFF', align: 'center', sizeHalfPt: 20 })}
    </w:tr>`;

  for (const t of TABLES) {
    const bg = t.no % 2 === 0 ? 'F8FAFC' : 'FFFFFF';
    rowsXml += `
      <w:tr>
        ${makeCell(String(t.no), widths[0], { bgFill: bg, align: 'center' })}
        ${makeCell(t.tableName, widths[1], { bold: true, bgFill: bg, color: '3B1C57' })}
        ${makeCell(t.titleTh, widths[2], { bgFill: bg })}
        ${makeCell(`${t.columns.length} คอลัมน์`, widths[3], { bgFill: bg, align: 'center' })}
      </w:tr>`;
  }

  return `
    <w:tbl>
      <w:tblPr>
        <w:tblW w:w="10000" w:type="dxa"/>
        ${makeTableBorders()}
      </w:tblPr>
      ${rowsXml}
    </w:tbl>`;
}

function buildTableDefinitionXml(t: TableDef): string {
  // Column widths total = 10,000 dxa
  // #, Column Name, Data Type, Null/Not Null, Key/Constraint, Default, Description
  const widths = [550, 1750, 1450, 950, 950, 1200, 3150];

  let rowsXml = `
    <w:tr>
      <w:trPr><w:tblHeader/></w:trPr>
      ${makeCell('#', widths[0], { bold: true, bgFill: '5B2C83', color: 'FFFFFF', align: 'center' })}
      ${makeCell('ชื่อคอลัมน์ (Column)', widths[1], { bold: true, bgFill: '5B2C83', color: 'FFFFFF' })}
      ${makeCell('ชนิดข้อมูล (Data Type)', widths[2], { bold: true, bgFill: '5B2C83', color: 'FFFFFF' })}
      ${makeCell('Null', widths[3], { bold: true, bgFill: '5B2C83', color: 'FFFFFF', align: 'center' })}
      ${makeCell('Key', widths[4], { bold: true, bgFill: '5B2C83', color: 'FFFFFF', align: 'center' })}
      ${makeCell('ค่าเริ่มต้น (Default)', widths[5], { bold: true, bgFill: '5B2C83', color: 'FFFFFF' })}
      ${makeCell('คำอธิบาย (Description)', widths[6], { bold: true, bgFill: '5B2C83', color: 'FFFFFF' })}
    </w:tr>`;

  t.columns.forEach((c, idx) => {
    const bg = idx % 2 === 1 ? 'F8FAFC' : 'FFFFFF';
    rowsXml += `
      <w:tr>
        ${makeCell(String(idx + 1), widths[0], { bgFill: bg, align: 'center' })}
        ${makeCell(c.name, widths[1], { bold: true, bgFill: bg, color: '1E293B' })}
        ${makeCell(c.type, widths[2], { bgFill: bg, color: '334155' })}
        ${makeCell(c.nullable, widths[3], { bgFill: bg, align: 'center' })}
        ${makeCell(c.key, widths[4], { bold: c.key !== '-', bgFill: bg, align: 'center', color: c.key === 'PK' ? 'B45309' : '431D63' })}
        ${makeCell(c.defaultVal, widths[5], { bgFill: bg, color: '475569' })}
        ${makeCell(c.description, widths[6], { bgFill: bg })}
      </w:tr>`;
  });

  return `
    ${makeParagraph(`${t.no}. ตาราง ${t.tableName} — ${t.titleTh}`, {
      bold: true,
      sizeHalfPt: 26,
      color: '3B1C57',
      spaceBefore: 240,
      spaceAfter: 60,
    })}
    ${makeParagraph(`คำอธิบาย: ${t.description}`, {
      sizeHalfPt: 20,
      color: '475569',
      spaceBefore: 0,
      spaceAfter: 100,
    })}
    <w:tbl>
      <w:tblPr>
        <w:tblW w:w="10000" w:type="dxa"/>
        ${makeTableBorders()}
      </w:tblPr>
      ${rowsXml}
    </w:tbl>`;
}

function buildDocumentXml(): string {
  const sectionsXml = TABLES.map((t) => buildTableDefinitionXml(t)).join('\n');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${makeParagraph('พจนานุกรมข้อมูล (Data Dictionary)', {
      bold: true,
      sizeHalfPt: 36,
      color: '3B1C57',
      align: 'center',
      spaceBefore: 120,
      spaceAfter: 60,
    })}
    ${makeParagraph('ระบบประมาณการรายรับเงินรายได้ จัดสรรกรอบงบประมาณ และติดตามรายรับจริง', {
      bold: true,
      sizeHalfPt: 26,
      color: '1E293B',
      align: 'center',
      spaceBefore: 0,
      spaceAfter: 40,
    })}
    ${makeParagraph('คณะรัฐศาสตร์และรัฐประศาสนศาสตร์ มหาวิทยาลัยเชียงใหม่', {
      bold: true,
      sizeHalfPt: 24,
      color: '475569',
      align: 'center',
      spaceBefore: 0,
      spaceAfter: 180,
    })}
    ${makeParagraph('1. ภาพรวมสถาปัตยกรรมฐานข้อมูล (Database Overview)', {
      bold: true,
      sizeHalfPt: 28,
      color: '3B1C57',
      spaceBefore: 140,
      spaceAfter: 80,
    })}
    ${makeParagraph(
      'ฐานข้อมูลของระบบประมาณการรายรับเงินรายได้ ออกแบบตามมาตรฐาน Relational Database (รองรับทั้ง PostgreSQL / Supabase RLS และ MySQL 8.x UTF8MB4) ประกอบด้วยตารางทั้งหมด 22 ตาราง โดยบังคับใช้หลักการสำคัญ ได้แก่: (1) ตัวเลขทางการเงินทั้งหมดใช้ชนิดข้อมูล NUMERIC(14,2) เพื่อความแม่นยำระดับทศนิยม (2) ใช้การลบข้อมูลแบบ Soft Delete (deleted_at) ห้ามลบข้อมูลจริงด้วย Hard Delete (3) มีระบบบันทึกประวัติการแก้ไขข้อมูลการเงินอัตโนมัติ (Financial Audit Log) และ (4) ควบคุมสิทธิ์การเข้าถึงตามบทบาทผู้ใช้งาน 6 ระดับ (RBAC & Row-Level Security)',
      { sizeHalfPt: 21, color: '1E293B', spaceBefore: 0, spaceAfter: 160 }
    )}
    ${makeParagraph('2. สารบัญตารางฐานข้อมูลทั้งหมด (Table Summary - 22 ตาราง)', {
      bold: true,
      sizeHalfPt: 28,
      color: '3B1C57',
      spaceBefore: 140,
      spaceAfter: 100,
    })}
    ${buildSummaryTableXml()}
    ${makeParagraph('3. รายละเอียดโครงสร้างตารางและพจนานุกรมข้อมูล (Table Definitions)', {
      bold: true,
      sizeHalfPt: 28,
      color: '3B1C57',
      spaceBefore: 280,
      spaceAfter: 80,
    })}
    ${sectionsXml}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1000" w:right="950" w:bottom="1000" w:left="950" w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;
}

function main() {
  const buildDir = path.join(process.cwd(), '.docx_build_tmp');
  if (fs.existsSync(buildDir)) {
    fs.rmSync(buildDir, { recursive: true, force: true });
  }
  fs.mkdirSync(path.join(buildDir, '_rels'), { recursive: true });
  fs.mkdirSync(path.join(buildDir, 'word', '_rels'), { recursive: true });

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

  const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  const docRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`;

  fs.writeFileSync(path.join(buildDir, '[Content_Types].xml'), contentTypesXml, 'utf8');
  fs.writeFileSync(path.join(buildDir, '_rels', '.rels'), rootRelsXml, 'utf8');
  fs.writeFileSync(path.join(buildDir, 'word', '_rels', 'document.xml.rels'), docRelsXml, 'utf8');
  fs.writeFileSync(path.join(buildDir, 'word', 'document.xml'), buildDocumentXml(), 'utf8');

  const outPaths = [
    path.resolve(process.cwd(), '..', 'Data_Dictionary_Revenue_System.docx'),
    path.resolve(process.cwd(), 'docs', 'Data_Dictionary_Revenue_System.docx'),
  ];

  for (const outPath of outPaths) {
    const dir = path.dirname(outPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (fs.existsSync(outPath)) {
      fs.unlinkSync(outPath);
    }
    const psScript = `
      Add-Type -AssemblyName System.IO.Compression
      Add-Type -AssemblyName System.IO.Compression.FileSystem
      $fs = New-Object System.IO.FileStream('${outPath.replace(/'/g, "''")}', [System.IO.FileMode]::Create)
      $zip = New-Object System.IO.Compression.ZipArchive($fs, [System.IO.Compression.ZipArchiveMode]::Create)
      $files = @(
        @{ src = '[Content_Types].xml'; entry = '[Content_Types].xml' },
        @{ src = '_rels\\.rels'; entry = '_rels/.rels' },
        @{ src = 'word\\document.xml'; entry = 'word/document.xml' },
        @{ src = 'word\\_rels\\document.xml.rels'; entry = 'word/_rels/document.xml.rels' }
      )
      foreach ($f in $files) {
        $srcPath = Join-Path '${buildDir.replace(/'/g, "''")}' $f.src
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $srcPath, $f.entry) | Out-Null
      }
      $zip.Dispose()
      $fs.Dispose()
    `;
    const psFile = path.join(buildDir, 'pack.ps1');
    fs.writeFileSync(psFile, psScript, 'utf8');
    execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${psFile}"`);
    console.log('Generated Word (.docx):', outPath);
  }

  fs.rmSync(buildDir, { recursive: true, force: true });
}

main();
