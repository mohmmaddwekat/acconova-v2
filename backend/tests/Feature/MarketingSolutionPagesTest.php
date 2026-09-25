<?php

namespace Tests\Feature;

use Tests\TestCase;

class MarketingSolutionPagesTest extends TestCase
{
    public function test_solution_pages_are_indexable_and_linked_to_product_context(): void
    {
        foreach ([
            '/small-business-erp' => 'small business ERP',
            '/crm-for-small-business' => 'CRM that stays connected',
            '/inventory-management-software' => 'Inventory management',
            '/invoicing-and-payments' => 'Invoicing',
            '/business-reporting-software' => 'Reporting',
        ] as $path => $copy) {
            $this->get($path)
                ->assertOk()
                ->assertSee($copy, false)
                ->assertSee('rel="canonical"', false)
                ->assertSee('application/ld+json', false);
        }

        $this->get('/sitemap.xml')
            ->assertOk()
            ->assertSee('/small-business-erp')
            ->assertSee('/inventory-management-software');

        $this->get('/llms.txt')
            ->assertOk()
            ->assertSee('## Topic pages')
            ->assertSee('/crm-for-small-business');
    }
}
