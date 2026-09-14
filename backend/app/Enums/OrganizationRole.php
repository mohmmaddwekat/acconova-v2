<?php

namespace App\Enums;

enum OrganizationRole: string
{
    case Owner = 'owner';
    case Admin = 'admin';
    case Manager = 'manager';
    case Accountant = 'accountant';
    case Employee = 'employee';

    /** @return list<string> */
    public static function assignableBy(self $role): array
    {
        return match ($role) {
            self::Owner => [self::Admin->value, self::Manager->value, self::Accountant->value, self::Employee->value],
            self::Admin => [self::Manager->value, self::Accountant->value, self::Employee->value],
            default => [],
        };
    }
}
