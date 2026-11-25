<?php

namespace App\Models\Concerns;

use App\Models\AuditLog;
use App\Models\EstimateVersion;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Str;
use RuntimeException;

trait AuditableAndVersionLocked
{
    use HasUuids, SoftDeletes;

    public static function bootAuditableAndVersionLocked(): void
    {
        // 1. Before saving (creating or updating): enforce version lock & populate created_by
        static::saving(function ($model) {
            $userId = Auth::id() ?? request()->header('X-Acting-User-Id') ?? request()->input('userId');

            if (!$model->exists && empty($model->created_by) && $userId) {
                $model->created_by = $userId;
            }

            // Constitution Rule 10: Approved or locked versions are immutable
            if (!empty($model->version_id) && $model->getTable() !== 'version_snapshots') {
                $version = EstimateVersion::withTrashed()->find($model->version_id);
                if ($version && in_array($version->status, ['approved', 'locked'], true)) {
                    throw new RuntimeException(
                        "เวอร์ชัน {$version->label} อยู่ในสถานะ {$version->status} ไม่สามารถแก้ไขได้ (Constitution Rule 10) กรุณาสร้างเวอร์ชันใหม่ (ครั้งที่ 2)"
                    );
                }
            }
        });

        // 2. After created: record INSERT in audit_logs
        static::created(function ($model) {
            self::writeAuditLog($model, 'INSERT', null, $model->getAttributes());
        });

        // 3. After updated: record UPDATE, SOFT_DELETE, APPROVE, or UNLOCK in audit_logs
        static::updated(function ($model) {
            $old = $model->getOriginal();
            $new = $model->getAttributes();

            $action = 'UPDATE';
            if (empty($old['deleted_at']) && !empty($new['deleted_at'])) {
                $action = 'SOFT_DELETE';
            } elseif ($model->getTable() === 'estimate_versions') {
                if (($old['status'] ?? '') !== 'approved' && ($new['status'] ?? '') === 'approved') {
                    $action = 'APPROVE';
                } elseif (
                    in_array($old['status'] ?? '', ['approved', 'locked'], true) &&
                    in_array($new['status'] ?? '', ['draft', 'submitted'], true)
                ) {
                    $action = 'UNLOCK';
                }
            }

            self::writeAuditLog($model, $action, $old, $new);
        });

        // 4. Constitution Rule 3: Block hard forceDelete
        static::forceDeleting(function ($model) {
            throw new RuntimeException(
                "ไม่อนุญาตให้ลบข้อมูลถาวร (Hard Delete) จากตาราง {$model->getTable()} ตาม Constitution ข้อ 3 กรุณาใช้ Soft Delete (deleted_at)"
            );
        });
    }

    protected static function writeAuditLog($model, string $action, ?array $oldData, ?array $newData): void
    {
        if ($model->getTable() === 'audit_logs') {
            return;
        }

        $userId = Auth::id() ?? request()->header('X-Acting-User-Id') ?? request()->input('userId');

        AuditLog::create([
            'id' => (string) Str::uuid(),
            'table_name' => $model->getTable(),
            'record_id' => (string) $model->getKey(),
            'action' => $action,
            'old_data' => $oldData,
            'new_data' => $newData,
            'performed_by' => $userId ?: null,
            'performed_at' => now(),
        ]);
    }
}
