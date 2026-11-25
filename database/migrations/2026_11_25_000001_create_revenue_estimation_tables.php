<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // 1. Shared profiles table (6 roles from specification 0.7)
        if (!Schema::hasTable('profiles')) {
            Schema::create('profiles', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->string('email', 191)->unique();
                $table->string('full_name', 255);
                $table->enum('role', [
                    'SUPER_ADMIN',
                    'PLANNING_OFFICER',
                    'FINANCE_OFFICER',
                    'EXECUTIVE',
                    'PROJECT_OWNER',
                    'EVALUATOR',
                ]);
                $table->uuid('created_by')->nullable();
                $table->timestamps();
                $table->softDeletes();
                $table->charset = 'utf8mb4';
                $table->collation = 'utf8mb4_unicode_ci';
            });
        }

        // 2. Shared audit_logs table (Constitution Rule 5)
        if (!Schema::hasTable('audit_logs')) {
            Schema::create('audit_logs', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->string('table_name', 100);
                $table->uuid('record_id');
                $table->enum('action', ['INSERT', 'UPDATE', 'SOFT_DELETE', 'DELETE', 'APPROVE', 'UNLOCK']);
                $table->json('old_data')->nullable();
                $table->json('new_data')->nullable();
                $table->uuid('performed_by')->nullable();
                $table->timestamp('performed_at')->useCurrent();
                $table->index(['table_name', 'record_id'], 'idx_audit_table_record');
                $table->index('performed_by', 'idx_audit_performed_by');
                $table->index('performed_at', 'idx_audit_performed_at');
                $table->charset = 'utf8mb4';
                $table->collation = 'utf8mb4_unicode_ci';
            });
        }

        // 3. fiscal_years (Multi-cycle / Multi-year support)
        Schema::create('fiscal_years', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->unsignedSmallInteger('be_year')->unique();
            $table->date('start_date');
            $table->date('end_date');
            $table->uuid('created_by')->nullable();
            $table->timestamps();
            $table->softDeletes();
            $table->charset = 'utf8mb4';
            $table->collation = 'utf8mb4_unicode_ci';
        });

        // 4. estimate_versions
        Schema::create('estimate_versions', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('fiscal_year_id');
            $table->unsignedSmallInteger('version_no');
            $table->string('label', 255);
            $table->enum('status', ['draft', 'submitted', 'approved', 'locked'])->default('draft');
            $table->uuid('parent_version_id')->nullable();
            $table->uuid('approved_by')->nullable();
            $table->timestamp('approved_at')->nullable();
            $table->uuid('created_by')->nullable();
            $table->timestamps();
            $table->softDeletes();
            $table->unique(['fiscal_year_id', 'version_no'], 'uq_fy_version_no');
            $table->foreign('fiscal_year_id')->references('id')->on('fiscal_years');
            $table->charset = 'utf8mb4';
            $table->collation = 'utf8mb4_unicode_ci';
        });

        // 5. parameters
        Schema::create('parameters', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('version_id')->nullable();
            $table->string('key', 100);
            $table->decimal('value_numeric', 14, 4)->nullable();
            $table->string('value_text', 500)->nullable();
            $table->unsignedSmallInteger('effective_be_year');
            $table->text('note')->nullable();
            $table->uuid('created_by')->nullable();
            $table->timestamps();
            $table->softDeletes();
            $table->index(['version_id', 'key']);
            $table->index(['effective_be_year', 'key']);
            $table->foreign('version_id')->references('id')->on('estimate_versions');
            $table->charset = 'utf8mb4';
            $table->collation = 'utf8mb4_unicode_ci';
        });

        // 6. month_distribution
        Schema::create('month_distribution', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('version_id');
            $table->unsignedTinyInteger('month_seq');
            $table->unsignedTinyInteger('semester');
            $table->decimal('pct', 10, 6);
            $table->uuid('created_by')->nullable();
            $table->timestamps();
            $table->softDeletes();
            $table->unique(['version_id', 'semester', 'month_seq'], 'uq_ver_sem_month');
            $table->foreign('version_id')->references('id')->on('estimate_versions');
            $table->charset = 'utf8mb4';
            $table->collation = 'utf8mb4_unicode_ci';
        });

        // 7. rounding_rules
        Schema::create('rounding_rules', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('version_id')->nullable();
            $table->string('scope', 100);
            $table->enum('mode', ['trunc', 'round', 'floor', 'none']);
            $table->smallInteger('digits')->default(-3);
            $table->uuid('created_by')->nullable();
            $table->timestamps();
            $table->softDeletes();
            $table->unique(['version_id', 'scope'], 'uq_ver_rounding_scope');
            $table->foreign('version_id')->references('id')->on('estimate_versions');
            $table->charset = 'utf8mb4';
            $table->collation = 'utf8mb4_unicode_ci';
        });

        // 8. programs
        Schema::create('programs', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('code', 50)->unique();
            $table->string('name_th', 255);
            $table->enum('level', ['bachelor', 'master', 'doctoral']);
            $table->enum('report_group', ['1.1.1', '1.1.2', '1.1.3', '1.1.4', '1.1.5', '1.1.6', '1.1.7']);
            $table->uuid('created_by')->nullable();
            $table->timestamps();
            $table->softDeletes();
            $table->charset = 'utf8mb4';
            $table->collation = 'utf8mb4_unicode_ci';
        });

        // 9. fee_schedules
        Schema::create('fee_schedules', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->enum('level', ['bachelor', 'master', 'doctoral']);
            $table->decimal('library_fee', 14, 2);
            $table->decimal('it_fee', 14, 2);
            $table->decimal('health_fee', 14, 2);
            $table->decimal('registration_fee', 14, 2);
            $table->decimal('total_deduction_per_head', 14, 2);
            $table->decimal('library_refund_pct', 10, 6);
            $table->unsignedSmallInteger('effective_be_year');
            $table->uuid('created_by')->nullable();
            $table->timestamps();
            $table->softDeletes();
            $table->unique(['level', 'effective_be_year'], 'uq_level_year');
            $table->charset = 'utf8mb4';
            $table->collation = 'utf8mb4_unicode_ci';
        });

        // 10. tuition_lines
        Schema::create('tuition_lines', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('version_id');
            $table->uuid('program_id');
            $table->string('cohort_code', 20)->nullable();
            $table->enum('line_type', ['regular', 'gen_ed_in', 'gen_ed_out']);
            $table->unsignedInteger('headcount_sem2')->default(0);
            $table->unsignedInteger('headcount_sem1')->default(0);
            $table->decimal('fee_per_head', 14, 2);
            $table->uuid('created_by')->nullable();
            $table->timestamps();
            $table->softDeletes();
            $table->foreign('version_id')->references('id')->on('estimate_versions');
            $table->foreign('program_id')->references('id')->on('programs');
            $table->charset = 'utf8mb4';
            $table->collation = 'utf8mb4_unicode_ci';
        });

        // 11. service_projects
        Schema::create('service_projects', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('version_id');
            $table->string('name', 500);
            $table->string('partner', 255)->nullable();
            $table->enum('category', ['short_course', 'usac', 'le', 'school_activity']);
            $table->unsignedInteger('batches')->default(1);
            $table->unsignedInteger('attendees_per_batch')->default(0);
            $table->decimal('fee_per_head', 14, 2)->default(0);
            $table->boolean('apply_mgmt_deduction')->default(true);
            $table->unsignedTinyInteger('month_seq');
            $table->text('note')->nullable();
            $table->uuid('created_by')->nullable();
            $table->timestamps();
            $table->softDeletes();
            $table->foreign('version_id')->references('id')->on('estimate_versions');
            $table->charset = 'utf8mb4';
            $table->collation = 'utf8mb4_unicode_ci';
        });

        // 12. research_projects
        Schema::create('research_projects', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('version_id');
            $table->text('name');
            $table->string('funder', 255)->nullable();
            $table->string('pi_name', 255)->nullable();
            $table->decimal('budget', 14, 2)->default(0);
            $table->decimal('overhead_rate_override', 10, 6)->nullable();
            $table->unsignedTinyInteger('month_seq');
            $table->text('note')->nullable();
            $table->uuid('created_by')->nullable();
            $table->timestamps();
            $table->softDeletes();
            $table->foreign('version_id')->references('id')->on('estimate_versions');
            $table->charset = 'utf8mb4';
            $table->collation = 'utf8mb4_unicode_ci';
        });

        // 13. rental_items
        Schema::create('rental_items', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('version_id');
            $table->string('name', 255);
            $table->string('tenant', 255)->nullable();
            $table->decimal('area_sqm', 10, 2)->nullable();
            $table->decimal('monthly_rent', 14, 2)->default(0);
            $table->unsignedTinyInteger('start_month_seq');
            $table->unsignedTinyInteger('end_month_seq');
            $table->text('note')->nullable();
            $table->uuid('created_by')->nullable();
            $table->timestamps();
            $table->softDeletes();
            $table->foreign('version_id')->references('id')->on('estimate_versions');
            $table->charset = 'utf8mb4';
            $table->collation = 'utf8mb4_unicode_ci';
        });

        // 14. carryover
        Schema::create('carryover', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('version_id')->unique();
            $table->decimal('amount', 14, 2)->default(0);
            $table->text('source_note')->nullable();
            $table->uuid('created_by')->nullable();
            $table->timestamps();
            $table->softDeletes();
            $table->foreign('version_id')->references('id')->on('estimate_versions');
            $table->charset = 'utf8mb4';
            $table->collation = 'utf8mb4_unicode_ci';
        });

        // 15. other_income_lines
        Schema::create('other_income_lines', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('version_id');
            $table->string('name', 255);
            $table->unsignedTinyInteger('month_seq');
            $table->decimal('gross', 14, 2)->default(0);
            $table->decimal('deduction', 14, 2)->default(0);
            $table->uuid('created_by')->nullable();
            $table->timestamps();
            $table->softDeletes();
            $table->foreign('version_id')->references('id')->on('estimate_versions');
            $table->charset = 'utf8mb4';
            $table->collation = 'utf8mb4_unicode_ci';
        });

        // 16. revenue_actuals (with MySQL 8.x Generated Stored Column net = gross - deduction)
        Schema::create('revenue_actuals', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('fiscal_year_id');
            $table->date('received_date')->nullable();
            $table->unsignedTinyInteger('month_seq');
            $table->enum('revenue_type', ['TUITION', 'ACAD_SERVICE', 'RESEARCH_OH', 'RENT', 'CARRYOVER', 'OTHER']);
            $table->string('source_name', 255);
            $table->string('ref_no', 100)->nullable();
            $table->decimal('gross', 14, 2)->default(0);
            $table->decimal('deduction', 14, 2)->default(0);
            $table->decimal('net', 14, 2)->storedAs('gross - deduction');
            $table->text('note')->nullable();
            $table->uuid('created_by')->nullable();
            $table->timestamps();
            $table->softDeletes();
            $table->foreign('fiscal_year_id')->references('id')->on('fiscal_years');
            $table->charset = 'utf8mb4';
            $table->collation = 'utf8mb4_unicode_ci';
        });

        // 17. expenditure_actuals
        Schema::create('expenditure_actuals', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('fiscal_year_id');
            $table->unsignedTinyInteger('month_seq');
            $table->decimal('amount', 14, 2)->default(0);
            $table->text('note')->nullable();
            $table->uuid('created_by')->nullable();
            $table->timestamps();
            $table->softDeletes();
            $table->unique(['fiscal_year_id', 'month_seq'], 'uq_fy_exp_month');
            $table->foreign('fiscal_year_id')->references('id')->on('fiscal_years');
            $table->charset = 'utf8mb4';
            $table->collation = 'utf8mb4_unicode_ci';
        });

        // 18. allocation_dimensions
        Schema::create('allocation_dimensions', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->enum('code', ['plan', 'expense_category', 'strategic'])->unique();
            $table->string('name_th', 255);
            $table->uuid('created_by')->nullable();
            $table->timestamps();
            $table->softDeletes();
            $table->charset = 'utf8mb4';
            $table->collation = 'utf8mb4_unicode_ci';
        });

        // 19. allocation_items
        Schema::create('allocation_items', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('dimension_id');
            $table->string('name', 255);
            $table->unsignedSmallInteger('sort_order')->default(1);
            $table->uuid('created_by')->nullable();
            $table->timestamps();
            $table->softDeletes();
            $table->unique(['dimension_id', 'name'], 'uq_dim_item_name');
            $table->foreign('dimension_id')->references('id')->on('allocation_dimensions');
            $table->charset = 'utf8mb4';
            $table->collation = 'utf8mb4_unicode_ci';
        });

        // 20. allocation_pcts (Many-to-Many bridge between version, allocation_item, and revenue_type)
        Schema::create('allocation_pcts', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('version_id');
            $table->uuid('item_id');
            $table->enum('revenue_type', ['TUITION', 'ACAD_SERVICE', 'RESEARCH_OH', 'RENT', 'CARRYOVER', 'OTHER']);
            $table->decimal('pct', 10, 6)->default(0);
            $table->uuid('created_by')->nullable();
            $table->timestamps();
            $table->softDeletes();
            $table->unique(['version_id', 'item_id', 'revenue_type'], 'uq_ver_item_revtype');
            $table->foreign('version_id')->references('id')->on('estimate_versions');
            $table->foreign('item_id')->references('id')->on('allocation_items');
            $table->charset = 'utf8mb4';
            $table->collation = 'utf8mb4_unicode_ci';
        });

        // 21. historical_usage
        Schema::create('historical_usage', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('item_id');
            $table->unsignedSmallInteger('be_year');
            $table->decimal('amount', 14, 2)->nullable();
            $table->uuid('created_by')->nullable();
            $table->timestamps();
            $table->softDeletes();
            $table->unique(['item_id', 'be_year'], 'uq_item_hist_year');
            $table->foreign('item_id')->references('id')->on('allocation_items');
            $table->charset = 'utf8mb4';
            $table->collation = 'utf8mb4_unicode_ci';
        });

        // 22. version_snapshots
        Schema::create('version_snapshots', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('version_id')->unique();
            $table->json('payload');
            $table->uuid('created_by')->nullable();
            $table->timestamps();
            $table->softDeletes();
            $table->foreign('version_id')->references('id')->on('estimate_versions');
            $table->charset = 'utf8mb4';
            $table->collation = 'utf8mb4_unicode_ci';
        });

        // 23. private_files (Metadata for files stored on Private Disk and served via Authenticated Streaming Route)
        Schema::create('private_files', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('version_id')->nullable();
            $table->string('original_name', 255);
            $table->string('disk_path', 500);
            $table->string('mime_type', 150);
            $table->unsignedBigInteger('size_bytes')->default(0);
            $table->string('category', 50)->default('excel_export'); // excel_import | excel_export | pdf_report
            $table->uuid('created_by')->nullable();
            $table->timestamps();
            $table->softDeletes();
            $table->charset = 'utf8mb4';
            $table->collation = 'utf8mb4_unicode_ci';
        });
    }

    public function down(): void
    {
        $tables = [
            'private_files',
            'version_snapshots',
            'historical_usage',
            'allocation_pcts',
            'allocation_items',
            'allocation_dimensions',
            'expenditure_actuals',
            'revenue_actuals',
            'other_income_lines',
            'carryover',
            'rental_items',
            'research_projects',
            'service_projects',
            'tuition_lines',
            'fee_schedules',
            'programs',
            'rounding_rules',
            'month_distribution',
            'parameters',
            'estimate_versions',
            'fiscal_years',
        ];
        foreach ($tables as $t) {
            Schema::dropIfExists($t);
        }
    }
};
