<?php

namespace Database\Seeders;

use App\Enums\DriverContractType;
use App\Enums\TeamRole;
use App\Models\DriverConfig;
use App\Models\Team;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

// use Illuminate\Database\Console\Seeds\WithoutModelEvents;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        $password = Hash::make('?*FtIG3F38@8');

        $jacob = User::firstOrCreate(
            ['email' => 'jacob@zeegotlogistics.com'],
            [
                'name' => 'Jacob',
                'email_verified_at' => now(),
                'password' => $password,
            ],
        );

        $sage = User::firstOrCreate(
            ['email' => 'sage@zeegotlogistics.com'],
            [
                'name' => 'Sage',
                'email_verified_at' => now(),
                'password' => $password,
            ],
        );

        $team = Team::firstOrCreate(
            ['external_company_id' => 1],
            [
                'name' => 'Zeegot Logistics Street',
                'is_personal' => false,
            ],
        );

        if (! $team->members()->where('user_id', $jacob->id)->exists()) {
            $team->members()->attach($jacob, ['role' => TeamRole::Owner->value]);
        }

        if (! $team->members()->where('user_id', $sage->id)->exists()) {
            $team->members()->attach($sage, ['role' => TeamRole::Admin->value]);
        }

        $jacob->switchTeam($team);
        $sage->switchTeam($team);

        $this->seedDriverConfigs($team);
    }

    private function seedDriverConfigs(Team $team): void
    {
        $csvPath = base_path('data/driver_contracts.csv');
        $handle = fopen($csvPath, 'r');

        // Skip header row
        fgetcsv($handle);

        $contractTypeMap = [
            'C' => DriverContractType::CompanyCpm,
            'C%' => DriverContractType::CompanyPercentage,
            'L' => DriverContractType::LeaseOperator,
            'L/O' => DriverContractType::LeaseOwner,
            'O' => DriverContractType::OwnerOperator,
        ];

        while (($row = fgetcsv($handle)) !== false) {
            $driverId = (int) $row[0];
            $correctType = trim($row[6]);
            $tariffRaw = trim($row[8]);

            $contractType = $contractTypeMap[$correctType] ?? null;
            if ($contractType === null) {
                continue;
            }

            // Percentages are stored as "30%" — convert to decimal
            $tariffRate = str_contains($tariffRaw, '%')
                ? (float) rtrim($tariffRaw, '%') / 100
                : (float) $tariffRaw;

            DriverConfig::updateOrCreate(
                ['team_id' => $team->id, 'external_driver_id' => $driverId],
                ['contract_type' => $contractType, 'tariff_rate' => $tariffRate],
            );
        }

        fclose($handle);
    }
}
