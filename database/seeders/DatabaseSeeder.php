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
        $user = User::create([
            'name' => 'Jacob',
            'email' => 'jacob@zeegotlogistics.com',
            'email_verified_at' => now(),
            'password' => Hash::make('9£j1mWR[;J94'),
        ]);

        $team = Team::create([
            'name' => 'Zeegot Logistics Street',
            'external_company_id' => 1,
            'is_personal' => false,
        ]);

        $team->members()->attach($user, [
            'role' => TeamRole::Owner->value,
        ]);

        $user->switchTeam($team);

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

            DriverConfig::create([
                'team_id' => $team->id,
                'external_driver_id' => $driverId,
                'contract_type' => $contractType,
                'tariff_rate' => $tariffRate,
            ]);
        }

        fclose($handle);
    }
}
