<?php

namespace Tests\Feature;

use App\Models\Organization;
use App\Models\User;
use App\Tenancy\OrganizationAccess;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class WorkspaceSelectionTest extends TestCase
{
    use RefreshDatabase;

    /**
     * A user with exactly one authorized organization should never become
     * trapped in a meaningless "No workspace selected" UI state.
     */
    public function test_single_workspace_is_automatically_selected_when_session_is_missing(): void
    {
        $user =
            User::factory()
                ->create();

        $organization =
            Organization::create([
                'name' => 'Only Workspace',
            ]);

        $organization
            ->users()
            ->attach(
                $user->id,
                [
                    'role' => 'owner',
                ],
            );

        $this
            ->actingAs(
                $user,
            )
            ->get(
                '/app',
            )
            ->assertOk()
            ->assertSessionHas(
                OrganizationAccess::SESSION_KEY,
                $organization->id,
            )
            ->assertInertia(
                fn (
                    Assert $page,
                ) => $page
                    ->where(
                        'workspace.activeOrganization.id',
                        $organization->id,
                    )
                    ->where(
                        'workspace.activeOrganization.name',
                        'Only Workspace',
                    )
                    ->where(
                        'workspace.activeOrganization.role',
                        'owner',
                    ),
            );
    }

    /**
     * Multiple workspaces are intentionally not auto-selected because the user
     * must decide which business context they want to operate in.
     */
    public function test_multiple_workspaces_require_explicit_user_selection(): void
    {
        $user =
            User::factory()
                ->create();

        foreach (
            [
                'Alpha Workspace',
                'Beta Workspace',
            ] as $name
        ) {
            $organization =
                Organization::create([
                    'name' => $name,
                ]);

            $organization
                ->users()
                ->attach(
                    $user->id,
                    [
                        'role' => 'owner',
                    ],
                );
        }

        $this
            ->actingAs(
                $user,
            )
            ->get(
                '/app',
            )
            ->assertOk()
            ->assertSessionMissing(
                OrganizationAccess::SESSION_KEY,
            )
            ->assertInertia(
                fn (
                    Assert $page,
                ) => $page
                    ->where(
                        'workspace.activeOrganization',
                        null,
                    )
                    ->has(
                        'workspace.organizations',
                        2,
                    ),
            );
    }

    /**
     * A stale or unauthorized session tenant must be replaced only when there
     * is exactly one valid organization available to the current user.
     */
    public function test_stale_workspace_session_recovers_to_only_authorized_workspace(): void
    {
        $user =
            User::factory()
                ->create();

        $organization =
            Organization::create([
                'name' => 'Authorized Workspace',
            ]);

        $organization
            ->users()
            ->attach(
                $user->id,
                [
                    'role' => 'owner',
                ],
            );

        $foreignOrganization =
            Organization::create([
                'name' => 'Foreign Workspace',
            ]);

        $foreignOrganization
            ->users()
            ->attach(
                User::factory()
                    ->create()
                    ->id,
                [
                    'role' => 'owner',
                ],
            );

        $this
            ->actingAs(
                $user,
            )
            ->withSession([
                OrganizationAccess::SESSION_KEY => $foreignOrganization->id,
            ])
            ->get(
                '/app',
            )
            ->assertOk()
            ->assertSessionHas(
                OrganizationAccess::SESSION_KEY,
                $organization->id,
            )
            ->assertInertia(
                fn (
                    Assert $page,
                ) => $page->where(
                    'workspace.activeOrganization.id',
                    $organization->id,
                ),
            );
    }
}
