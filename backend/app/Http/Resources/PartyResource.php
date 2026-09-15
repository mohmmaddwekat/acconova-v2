<?php

namespace App\Http\Resources;

use App\Models\PartyRole;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class PartyResource extends JsonResource
{
    /**
     * Transform a Party into its stable public API representation while
     * intentionally hiding organization_id from the browser payload.
     *
     * @return array<string, mixed>
     */
    public function toArray(
        Request $request,
    ): array {
        return [
            'id' => $this->id,

            'type' => $this->type->value,

            'name' => $this->name,

            'company_name' => $this->company_name,

            'email' => $this->email,

            'phone' => $this->phone,

            'tax_number' => $this->tax_number,

            'address_line_1' => $this->address_line_1,

            'address_line_2' => $this->address_line_2,

            'city' => $this->city,

            'state' => $this->state,

            'postal_code' => $this->postal_code,

            'country_code' => $this->country_code,

            'notes' => $this->notes,

            'roles' => $this->when(
                $this->relationLoaded(
                    'roles',
                ),
                $this->relationLoaded(
                    'roles',
                )
                    ? $this->roleValues()
                    : null,
            ),

            'deleted_at' => $this->deleted_at,

            'created_at' => $this->created_at,

            'updated_at' => $this->updated_at,
        ];
    }

    /**
     * Return Party role enums as stable public string values.
     *
     * @return list<string>
     */
    private function roleValues(): array
    {
        return $this->roles
            ->map(
                /**
                 * Convert one PartyRole model into its enum string value.
                 */
                fn (
                    PartyRole $role,
                ): string => $role->role->value,
            )
            ->sort()
            ->values()
            ->all();
    }
}
