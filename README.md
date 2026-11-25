# ระบบประมาณการรายรับเงินรายได้ (Laravel 13 + MySQL 8.x + Docker + Blade + Vue.js Non-SFC)
**คณะรัฐศาสตร์และรัฐประศาสนศาสตร์ มหาวิทยาลัยเชียงใหม่**

---

## 1. สถาปัตยกรรมและเทคโนโลยี (Constraints & Tech Stack)

| ส่วนประกอบ | เทคโนโลยีที่ใช้ | รายละเอียด / ข้อกำหนดที่รองรับ |
| --- | --- | --- |
| **Backend Framework** | **Laravel 13 (PHP 8.3-FPM)** | Eloquent ORM, RBAC Middleware (6 บทบาท), Private File Storage, BCMath Pure Calculation Engine |
| **Database** | **MySQL 8.x (`utf8mb4_unicode_ci`)** | รองรับภาษาไทยเต็มรูปแบบ, Multi-cycle / Multi-year (หลายปีงบประมาณและหลายครั้งต่อปี), Many-to-Many Allocation Matrix, Generated Stored Column |
| **Container & Runtime** | **Docker & Docker Compose (Ubuntu)** | ประกอบด้วย 3 เซอร์วิส: `app` (PHP 8.3-FPM), `webserver` (Nginx 1.27), `db` (MySQL 8.0 พร้อม Auto-seed SQL) |
| **Frontend Architecture** | **Laravel Blade + Vue.js 3 (Global/CDN, Non-SFC)** | **ไม่ใช้ Single File Component (`.vue`) และไม่ต้องรัน Build Step** เขียน `<script>` ในไฟล์ Blade (`resources/views/revenue/index.blade.php`) ได้โดยตรง แก้ไขแล้วกด Refresh หน้าเว็บได้ทันที |
| **CSS Framework** | **Tailwind CSS (CDN)** | จัดหน้าตา UI สวยงาม สะอาด รองรับช่องกรอกสีเหลืองตามแบบฟอร์ม Excel เดิม และ Responsive |
| **File Storage** | **Private Disk + Authenticated Streaming Route** | ไฟล์ทั้งหมดเก็บบน `Storage::disk('private')` (`storage/app/private/revenue/`) และเสิร์ฟผ่าน Route `/revenue/files/{id}/stream` ที่ตรวจสอบสิทธิ์ผู้ใช้เท่านั้น (ห้ามเข้าถึงผ่าน `public/`) |

---

## 2. โครงสร้างไฟล์สำคัญ

```text
revenue-laravel/
├── app/
│   ├── Http/
│   │   ├── Controllers/Revenue/
│   │   │   ├── RevenueController.php             # ควบคุม 15 หน้าจอ Blade, API ข้อมูล และการส่งออกไฟล์
│   │   │   └── PrivateFileStreamController.php   # อัปโหลดและสตรีมไฟล์จาก Private Disk เท่านั้น
│   │   └── Middleware/
│   │       └── RolePermissionMiddleware.php      # ตรวจสอบสิทธิ์ 6 บทบาท (SUPER_ADMIN..EVALUATOR)
│   ├── Models/
│   │   ├── Concerns/
│   │   │   └── AuditableAndVersionLocked.php     # Trait บันทึก audit_logs อัตโนมัติ, SoftDeletes และล็อกเวอร์ชัน Approved
│   │   └── RevenueModels.php                     # Eloquent Models ครบทั้ง 23 ตาราง
│   └── Services/Revenue/
│       └── RevenueCalculationService.php         # Pure PHP BCMath Calculation Engine (ตรงตาม Golden Values 100%)
├── config/
│   └── filesystems.php                           # กำหนด Default Disk เป็น 'private' (storage/app/private)
├── database/
│   ├── migrations/
│   │   └── 2026_11_25_000001_create_revenue_estimation_tables.php
│   └── seeders/
│       ├── DatabaseSeeder.php
│       └── Revenue2571Seeder.php
├── docker/
│   ├── mysql/init/
│   │   └── 01_schema_and_seed_2571.sql           # ไฟล์ SQL สร้างตาราง MySQL 8.x + Seed ข้อมูลปี 2571 อัตโนมัติเมื่อเปิด Container
│   ├── nginx/default.conf                        # Nginx config บล็อกการเข้าถึง private storage และส่งต่อ PHP-FPM
│   └── php/local.ini
├── resources/views/
│   ├── layouts/app.blade.php                     # โหลด Tailwind CSS CDN & Vue 3 Global Build (Non-SFC)
│   └── revenue/index.blade.php                   # หน้าจอและสคริปต์ Vue 3 ครบทั้ง 15 Routes (แก้แล้ว Refresh ได้ทันที)
├── routes/
│   └── web.php                                   # กำหนด Routes ทั้ง 15 หน้าจอ, API และ Private File Stream
├── Dockerfile
├── docker-compose.yml
└── composer.json
```

---

## 3. วิธีรันระบบด้วย Docker Compose บน Ubuntu / Linux / Windows

1. โคลนโปรเจกต์จาก GitHub:
   ```bash
   git clone https://github.com/veeraphathan3995/Revenue.git
   cd Revenue
   cp .env.example .env
   ```
2. สั่งรัน Docker Compose (จะสร้าง Container `app`, `webserver`, `db` และนำเข้าฐานข้อมูล MySQL 8.x ปีงบ 2571 จาก `docker/mysql/init/01_schema_and_seed_2571.sql` อัตโนมัติ):
   ```bash
   docker compose up -d --build
   ```
3. ติดตั้ง Composer dependencies ภายใน Container `app` (ครั้งแรกครั้งเดียว):
   ```bash
   docker exec -it cmu_revenue_app composer install
   ```
4. เปิดเบราว์เซอร์เข้าใช้งานระบบได้ที่:
   - **URL:** `http://localhost:8080/revenue`
   - **MySQL 8.0 Port:** `33060` (Database: `revenue_estimate_db`, User: `revenue_user`, Password: `revenue_secret_2571`)
