<?php

namespace App\Models;

use App\Models\Concerns\AuditableAndVersionLocked;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class AuditLog extends Model
{
    use HasUuids;

    protected $table = 'audit_logs';
    public $timestamps = false;
    protected $guarded = [];
    protected $casts = [
        'old_data' => 'array',
        'new_data' => 'array',
        'performed_at' => 'datetime',
    ];

    public function performer(): BelongsTo
    {
        return $this->belongsTo(Profile::class, 'performed_by');
    }
}

class Profile extends Model
{
    use AuditableAndVersionLocked;

    protected $table = 'profiles';
    protected $guarded = [];
}

class FiscalYear extends Model
{
    use AuditableAndVersionLocked;

    protected $table = 'fiscal_years';
    protected $guarded = [];
    protected $casts = [
        'be_year' => 'integer',
        'start_date' => 'date:Y-m-d',
        'end_date' => 'date:Y-m-d',
    ];

    public function versions(): HasMany
    {
        return $this->hasMany(EstimateVersion::class, 'fiscal_year_id');
    }

    public function revenueActuals(): HasMany
    {
        return $this->hasMany(RevenueActual::class, 'fiscal_year_id');
    }

    public function expenditureActuals(): HasMany
    {
        return $this->hasMany(ExpenditureActual::class, 'fiscal_year_id');
    }
}

class EstimateVersion extends Model
{
    use AuditableAndVersionLocked;

    protected $table = 'estimate_versions';
    protected $guarded = [];
    protected $casts = [
        'version_no' => 'integer',
        'approved_at' => 'datetime',
    ];

    public function fiscalYear(): BelongsTo
    {
        return $this->belongsTo(FiscalYear::class, 'fiscal_year_id');
    }

    public function tuitionLines(): HasMany
    {
        return $this->hasMany(TuitionLine::class, 'version_id');
    }

    public function serviceProjects(): HasMany
    {
        return $this->hasMany(ServiceProject::class, 'version_id');
    }

    public function researchProjects(): HasMany
    {
        return $this->hasMany(ResearchProject::class, 'version_id');
    }

    public function rentalItems(): HasMany
    {
        return $this->hasMany(RentalItem::class, 'version_id');
    }

    public function carryover(): HasOne
    {
        return $this->hasOne(Carryover::class, 'version_id');
    }

    public function otherIncomeLines(): HasMany
    {
        return $this->hasMany(OtherIncomeLine::class, 'version_id');
    }

    public function allocationPcts(): HasMany
    {
        return $this->hasMany(AllocationPct::class, 'version_id');
    }

    public function snapshot(): HasOne
    {
        return $this->hasOne(VersionSnapshot::class, 'version_id');
    }
}

class Parameter extends Model
{
    use AuditableAndVersionLocked;

    protected $table = 'parameters';
    protected $guarded = [];
}

class MonthDistribution extends Model
{
    use AuditableAndVersionLocked;

    protected $table = 'month_distribution';
    protected $guarded = [];
}

class RoundingRule extends Model
{
    use AuditableAndVersionLocked;

    protected $table = 'rounding_rules';
    protected $guarded = [];
}

class Program extends Model
{
    use AuditableAndVersionLocked;

    protected $table = 'programs';
    protected $guarded = [];
}

class FeeSchedule extends Model
{
    use AuditableAndVersionLocked;

    protected $table = 'fee_schedules';
    protected $guarded = [];
}

class TuitionLine extends Model
{
    use AuditableAndVersionLocked;

    protected $table = 'tuition_lines';
    protected $guarded = [];

    public function program(): BelongsTo
    {
        return $this->belongsTo(Program::class, 'program_id');
    }
}

class ServiceProject extends Model
{
    use AuditableAndVersionLocked;

    protected $table = 'service_projects';
    protected $guarded = [];
    protected $casts = [
        'apply_mgmt_deduction' => 'boolean',
    ];
}

class ResearchProject extends Model
{
    use AuditableAndVersionLocked;

    protected $table = 'research_projects';
    protected $guarded = [];
}

class RentalItem extends Model
{
    use AuditableAndVersionLocked;

    protected $table = 'rental_items';
    protected $guarded = [];
}

class Carryover extends Model
{
    use AuditableAndVersionLocked;

    protected $table = 'carryover';
    protected $guarded = [];
}

class OtherIncomeLine extends Model
{
    use AuditableAndVersionLocked;

    protected $table = 'other_income_lines';
    protected $guarded = [];
}

class RevenueActual extends Model
{
    use AuditableAndVersionLocked;

    protected $table = 'revenue_actuals';
    protected $guarded = ['net']; // net is a MySQL 8.x STORED GENERATED column
}

class ExpenditureActual extends Model
{
    use AuditableAndVersionLocked;

    protected $table = 'expenditure_actuals';
    protected $guarded = [];
}

class AllocationDimension extends Model
{
    use AuditableAndVersionLocked;

    protected $table = 'allocation_dimensions';
    protected $guarded = [];

    public function items(): HasMany
    {
        return $this->hasMany(AllocationItem::class, 'dimension_id')->orderBy('sort_order');
    }
}

class AllocationItem extends Model
{
    use AuditableAndVersionLocked;

    protected $table = 'allocation_items';
    protected $guarded = [];

    public function dimension(): BelongsTo
    {
        return $this->belongsTo(AllocationDimension::class, 'dimension_id');
    }

    public function historicalUsages(): HasMany
    {
        return $this->hasMany(HistoricalUsage::class, 'item_id');
    }
}

class AllocationPct extends Model
{
    use AuditableAndVersionLocked;

    protected $table = 'allocation_pcts';
    protected $guarded = [];
}

class HistoricalUsage extends Model
{
    use AuditableAndVersionLocked;

    protected $table = 'historical_usage';
    protected $guarded = [];
}

class VersionSnapshot extends Model
{
    use AuditableAndVersionLocked;

    protected $table = 'version_snapshots';
    protected $guarded = [];
    protected $casts = [
        'payload' => 'array',
    ];
}

class PrivateFile extends Model
{
    use AuditableAndVersionLocked;

    protected $table = 'private_files';
    protected $guarded = [];
}
