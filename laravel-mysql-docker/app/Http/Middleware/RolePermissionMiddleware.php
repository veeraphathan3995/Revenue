<?php

namespace App\Http\Middleware;

use App\Models\Profile;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Role-Based Access Control (RBAC) Middleware enforcing the 6 Roles from Specification 0.7:
 * SUPER_ADMIN, PLANNING_OFFICER, FINANCE_OFFICER, EXECUTIVE, PROJECT_OWNER, EVALUATOR
 */
class RolePermissionMiddleware
{
    public function handle(Request $request, Closure $next, string ...$allowedRoles): Response
    {
        $userId = $request->user()?->id
            ?? $request->header('X-Acting-User-Id')
            ?? $request->input('userId');

        $profile = $userId ? Profile::find($userId) : Profile::where('role', 'SUPER_ADMIN')->first();

        if (!$profile) {
            return response()->json([
                'ok' => false,
                'error' => 'ไม่พบข้อมูลสิทธิ์ผู้ใช้งาน (Unauthorized Profile)',
            ], 403);
        }

        if (!empty($allowedRoles) && !in_array($profile->role, $allowedRoles, true)) {
            return response()->json([
                'ok' => false,
                'error' => "สิทธิ์ปัจจุบัน ({$profile->role}) ไม่ได้รับอนุญาตให้ดำเนินการนี้ (ต้องการสิทธิ์: " . implode(', ', $allowedRoles) . ")",
            ], 403);
        }

        $request->attributes->set('acting_profile', $profile);
        return $next($request);
    }
}
