<?php

return [
    /*
    |--------------------------------------------------------------------------
    | Default Filesystem Disk (Strictly Private Disk per Security Constraint)
    |--------------------------------------------------------------------------
    | All uploaded/imported Excel files, snapshots, and generated reports are
    | stored on the private disk and served ONLY via authenticated streaming
    | routes (/revenue/files/{id}/stream). Never exposed in public/.
    */
    'default' => env('FILESYSTEM_DISK', 'private'),

    'disks' => [
        'private' => [
            'driver' => 'local',
            'root' => storage_path('app/private'),
            'visibility' => 'private',
            'throw' => true,
        ],
    ],
];
