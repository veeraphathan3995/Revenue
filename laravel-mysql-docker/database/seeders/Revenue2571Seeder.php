<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class Revenue2571Seeder extends Seeder
{
    public function run(): void
    {
        $sqlPath = base_path('docker/mysql/init/01_schema_and_seed_2571.sql');
        if (file_exists($sqlPath)) {
            $sql = file_get_contents($sqlPath);
            DB::unprepared($sql);
        }
    }
}
