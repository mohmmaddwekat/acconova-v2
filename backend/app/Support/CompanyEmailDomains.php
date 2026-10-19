<?php

namespace App\Support;

use App\Models\Organization;
use App\Tenancy\TenantContext;
use Illuminate\Support\Facades\DB;

/**
 * Decides whether an email address belongs to the active company, so staff
 * invitations are never sent to outside addresses.
 */
class CompanyEmailDomains
{
    /**
     * Free mailbox providers say nothing about which company owns the address.
     *
     * @var list<string>
     */
    private const PUBLIC_PROVIDERS = [
        'gmail.com',
        'googlemail.com',
        'yahoo.com',
        'hotmail.com',
        'outlook.com',
        'live.com',
        'msn.com',
        'icloud.com',
        'me.com',
        'aol.com',
        'proton.me',
        'protonmail.com',
        'mail.com',
        'gmx.com',
        'yandex.com',
    ];

    /**
     * Return the company domains inferred from the accounts that already belong
     * to the active organization.
     *
     * @return list<string>
     */
    public function domains(?Organization $organization = null): array
    {
        $organizationId = $organization?->id ?? app(TenantContext::class)->id();

        return DB::table('memberships')
            ->join('users', 'users.id', '=', 'memberships.user_id')
            ->where('memberships.organization_id', $organizationId)
            ->pluck('users.email')
            ->map(fn (string $email): string => $this->domainOf($email))
            ->filter(fn (string $domain): bool => $domain !== '' && ! in_array($domain, self::PUBLIC_PROVIDERS, true))
            ->unique()
            ->values()
            ->all();
    }

    /**
     * Whether the address may receive company invitations. A company that has
     * no domain yet (only free-mailbox accounts) is not restricted.
     */
    public function allows(string $email, ?Organization $organization = null): bool
    {
        $domains = $this->domains($organization);

        return $domains === [] || in_array($this->domainOf($email), $domains, true);
    }

    /**
     * Return the lower-cased domain part of an email address.
     */
    private function domainOf(string $email): string
    {
        return strtolower(trim(substr(strrchr($email, '@') ?: '', 1)));
    }
}
