<?php

namespace App\Http\Requests\Teams;

use App\Rules\TeamName;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class SaveTeamRequest extends FormRequest
{
    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255', new TeamName],
            'data_source' => ['nullable', 'string', 'in:analytics_db,xlsx'],
            'external_company_id' => [
                'nullable',
                'integer',
                'min:1',
                'required_if:data_source,analytics_db',
            ],
        ];
    }

    public function messages(): array
    {
        return [
            'external_company_id.required_if' => 'External company ID is required when reading from the analytics database.',
        ];
    }
}
