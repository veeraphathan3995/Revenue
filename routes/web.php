<?php

use App\Http\Controllers\Revenue\PrivateFileStreamController;
use App\Http\Controllers\Revenue\RevenueController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Web & API Routes — Revenue Estimation System (Laravel 13)
|--------------------------------------------------------------------------
| Frontend: Laravel Blade + Vue.js 3 (Global/CDN, Non-SFC, No Build Step)
| File Storage: Private Disk served exclusively via Authenticated Stream Route
*/

Route::redirect('/', '/revenue');

Route::prefix('revenue')->group(function () {
    // 15 UI Routes rendered via Blade + Vue 3 Global (Non-SFC)
    Route::get('/', [RevenueController::class, 'showPage'])->defaults('tab', 'dashboard')->name('revenue.dashboard');
    Route::get('/settings', [RevenueController::class, 'showPage'])->defaults('tab', 'settings')->name('revenue.settings');
    Route::get('/tuition', [RevenueController::class, 'showPage'])->defaults('tab', 'tuition')->name('revenue.tuition');
    Route::get('/service', [RevenueController::class, 'showPage'])->defaults('tab', 'service')->name('revenue.service');
    Route::get('/research', [RevenueController::class, 'showPage'])->defaults('tab', 'research')->name('revenue.research');
    Route::get('/rent', [RevenueController::class, 'showPage'])->defaults('tab', 'rent')->name('revenue.rent');
    Route::get('/carryover', [RevenueController::class, 'showPage'])->defaults('tab', 'carryover')->name('revenue.carryover');
    Route::get('/summary', [RevenueController::class, 'showPage'])->defaults('tab', 'summary')->name('revenue.summary');
    Route::get('/allocation', [RevenueController::class, 'showPage'])->defaults('tab', 'allocation')->name('revenue.allocation');
    Route::get('/actuals', [RevenueController::class, 'showPage'])->defaults('tab', 'actuals')->name('revenue.actuals');
    Route::get('/compare', [RevenueController::class, 'showPage'])->defaults('tab', 'compare')->name('revenue.compare');
    Route::get('/reports/budget-request', [RevenueController::class, 'showPage'])->defaults('tab', 'budget-request')->name('revenue.budget_request');
    Route::get('/import', [RevenueController::class, 'showPage'])->defaults('tab', 'import')->name('revenue.import');
    Route::get('/versions', [RevenueController::class, 'showPage'])->defaults('tab', 'versions')->name('revenue.versions');
    Route::get('/audit', [RevenueController::class, 'showPage'])->defaults('tab', 'audit')->name('revenue.audit');

    // Authenticated Private Disk File Upload & Streaming Routes (Strictly Private Disk)
    Route::post('/files/upload', [PrivateFileStreamController::class, 'uploadToPrivateDisk'])
        ->name('revenue.files.upload');
    Route::get('/files/{id}/stream', [PrivateFileStreamController::class, 'streamPrivateFile'])
        ->name('revenue.files.stream');
});

// REST API Endpoints for Vue 3 (Global CDN) Client
Route::prefix('api/revenue')->group(function () {
    Route::get('/', [RevenueController::class, 'getWorkspace'])->name('api.revenue.workspace');
    Route::get('/export', [RevenueController::class, 'exportAndStreamPrivateExcel'])->name('api.revenue.export');
});
