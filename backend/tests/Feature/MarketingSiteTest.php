<?php

namespace Tests\Feature;

use App\Models\User;
use Tests\TestCase;

class MarketingSiteTest extends TestCase
{
    public function test_public_marketing_pages_are_server_rendered_and_indexable(): void
    {
        $this->get('/')
            ->assertOk()
            ->assertSee('<title>AccoNova | ERP, CRM, Invoicing, Inventory &amp; AI for Growing Businesses</title>', false)
            ->assertSee('Run your business from one intelligent workspace.')
            ->assertSee('application/ld+json', false)
            ->assertSee('rel="canonical"', false);

        foreach ([
            '/about',
            '/features',
            '/pricing',
            '/security',
            '/faq',
            '/contact',
            '/privacy',
            '/terms',
        ] as $path) {
            $this->get($path)
                ->assertOk()
                ->assertSee('AccoNova');
        }
    }

    public function test_pricing_uses_the_server_owned_billing_catalog(): void
    {
        $this->get('/pricing')
            ->assertOk()
            ->assertSee('$19')
            ->assertSee('$49')
            ->assertSee('$99')
            ->assertSee('Additional seats')
            ->assertSee('AI wallet');
    }

    public function test_search_and_ai_discovery_endpoints_are_available(): void
    {
        $this->get('/sitemap.xml')
            ->assertOk()
            ->assertHeader('Content-Type', 'application/xml; charset=UTF-8')
            ->assertSee('/features')
            ->assertSee('/pricing');

        $this->get('/robots.txt')
            ->assertOk()
            ->assertSee('Sitemap:')
            ->assertSee('Disallow: /app/');

        $this->get('/llms.txt')
            ->assertOk()
            ->assertSee('# AccoNova')
            ->assertSee('ERP and CRM business management software');
    }

    public function test_authenticated_user_still_enters_the_application_from_root(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)
            ->get('/')
            ->assertRedirect('/app');
    }

    public function test_contact_form_validates_required_fields(): void
    {
        $this->from('/contact')
            ->post('/contact', [])
            ->assertRedirect('/contact')
            ->assertSessionHasErrors([
                'name',
                'email',
                'subject',
                'message',
            ]);
    }
}
