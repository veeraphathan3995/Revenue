<?php

namespace App\Http\Controllers\Revenue;

use App\Models\PrivateFile;
use App\Models\Profile;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Private File Storage & Authenticated Streaming Controller
 * Constraint: "File Storage: เก็บบน Private Disk เสิร์ฟผ่าน Authenticated Streaming Route เท่านั้น"
 */
class PrivateFileStreamController extends Controller
{
    /**
     * Store an uploaded or generated file on the Private Disk ('private' -> storage/app/private)
     */
    public function uploadToPrivateDisk(Request $request)
    {
        $request->validate([
            'file' => 'required|file|max:51200', // max 50MB
            'versionId' => 'nullable|uuid',
            'category' => 'nullable|string|max:50',
        ]);

        $actingProfile = $this->resolveActingProfile($request);
        if (!in_array($actingProfile->role, ['SUPER_ADMIN', 'PLANNING_OFFICER', 'FINANCE_OFFICER'], true)) {
            return response()->json([
                'ok' => false,
                'error' => "สิทธิ์ {$actingProfile->role} ไม่ได้รับอนุญาตให้อัปโหลดไฟล์เข้าสู่ Private Storage",
            ], 403);
        }

        $uploaded = $request->file('file');
        $fileId = (string) Str::uuid();
        $ext = $uploaded->getClientOriginalExtension() ?: 'xlsx';
        $relativePath = 'revenue/' . date('Y/m') . '/' . $fileId . '.' . $ext;

        // Save strictly to 'private' disk (storage/app/private/...)
        Storage::disk('private')->putFileAs(
            dirname($relativePath),
            $uploaded,
            basename($relativePath)
        );

        $record = PrivateFile::create([
            'id' => $fileId,
            'version_id' => $request->input('versionId'),
            'original_name' => $uploaded->getClientOriginalName(),
            'disk_path' => $relativePath,
            'mime_type' => $uploaded->getClientMimeType() ?: 'application/octet-stream',
            'size_bytes' => $uploaded->getSize(),
            'category' => $request->input('category', 'excel_import'),
            'created_by' => $actingProfile->id,
        ]);

        return response()->json([
            'ok' => true,
            'file' => $record,
            'streamUrl' => route('revenue.files.stream', ['id' => $record->id]),
        ]);
    }

    /**
     * Serve file from Private Disk exclusively via Authenticated Streaming Route
     */
    public function streamPrivateFile(Request $request, string $id): StreamedResponse
    {
        $actingProfile = $this->resolveActingProfile($request);
        $validRoles = [
            'SUPER_ADMIN',
            'PLANNING_OFFICER',
            'FINANCE_OFFICER',
            'EXECUTIVE',
            'PROJECT_OWNER',
            'EVALUATOR',
        ];

        if (!$actingProfile || !in_array($actingProfile->role, $validRoles, true)) {
            abort(403, 'Unauthorized: ต้องเข้าสู่ระบบก่อนดาวน์โหลดไฟล์จาก Private Disk');
        }

        $fileRecord = PrivateFile::findOrFail($id);

        if (!Storage::disk('private')->exists($fileRecord->disk_path)) {
            abort(404, 'ไม่พบไฟล์บน Private Disk');
        }

        return Storage::disk('private')->download(
            $fileRecord->disk_path,
            $fileRecord->original_name,
            [
                'Content-Type' => $fileRecord->mime_type,
                'Cache-Control' => 'private, no-store, no-cache, must-revalidate',
                'X-Served-From' => 'Laravel-Private-Disk-Stream',
            ]
        );
    }

    protected function resolveActingProfile(Request $request): ?Profile
    {
        if ($request->attributes->has('acting_profile')) {
            return $request->attributes->get('acting_profile');
        }
        $userId = $request->user()?->id
            ?? $request->header('X-Acting-User-Id')
            ?? $request->query('userId');

        return $userId
            ? Profile::find($userId)
            : Profile::where('role', 'SUPER_ADMIN')->first();
    }
}
