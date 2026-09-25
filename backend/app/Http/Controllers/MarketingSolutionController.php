<?php

namespace App\Http\Controllers;

use Illuminate\View\View;

class MarketingSolutionController extends Controller
{
    public function smallBusinessErp(): View
    {
        return $this->page('small-business-erp', [
            'label' => 'Small business ERP',
            'title' => 'Small Business ERP Software | AccoNova',
            'description' => 'AccoNova small business ERP software connects customers, invoicing, payments, inventory, purchasing, teams, reporting and AI in one workspace.',
            'headline' => 'A small business ERP that grows with operational complexity.',
            'intro' => 'Move beyond disconnected spreadsheets and point solutions without jumping into an ERP that feels built only for large enterprises. AccoNova combines practical day-to-day workflows with room for stronger controls as your company grows.',
            'problems' => [
                'Customer, finance and inventory information lives in different tools.',
                'Managers spend time rebuilding the same numbers in spreadsheets.',
                'Approvals and responsibilities become unclear as the team grows.',
                'Important follow-ups depend on memory instead of system signals.',
            ],
            'capabilities' => [
                ['Customers and suppliers', 'Keep relationship, transaction and statement context connected.'],
                ['Finance workflows', 'Manage invoices, receipts, payments, collections and outstanding balances.'],
                ['Inventory operations', 'Track products, warehouses, stock movement, purchasing and production.'],
                ['Management visibility', 'Use dashboards, KPIs, aging, reports and exception-oriented signals.'],
                ['Teams and controls', 'Add roles, permissions, departments, tasks and approvals as complexity increases.'],
                ['AI-assisted operations', 'Ask business questions through permission-checked tools and context.'],
            ],
            'faq' => [
                ['Is AccoNova suitable for a small company?', 'Yes. The Starter plan is designed for small teams, while Business and Scale add more capacity, reporting and controls as needs grow.'],
                ['Do I need to use every module?', 'No. A company can begin with the workflows it needs most and expand usage over time.'],
                ['Can I migrate data from spreadsheets?', 'AccoNova includes structured import workflows for multiple business areas so existing data can be brought into the system.'],
            ],
        ]);
    }

    public function crm(): View
    {
        return $this->page('crm-for-small-business', [
            'label' => 'CRM for small business',
            'title' => 'CRM for Small Business with Invoicing & Operations | AccoNova',
            'description' => 'Manage customers, suppliers, invoices, payments, notes, statements and profitability in one small business CRM connected to ERP workflows.',
            'headline' => 'A CRM that stays connected after the sale.',
            'intro' => 'Traditional CRM stops at leads and customer activity. AccoNova keeps the relationship connected to quotes, invoices, receipts, balances, profitability, follow-ups and the operational work that happens after a customer buys.',
            'problems' => [
                'Sales teams can see conversations but not the customer’s financial context.',
                'Invoices and payments are disconnected from relationship history.',
                'Customer risk and profitability require manual spreadsheet work.',
                'Supplier and customer records are duplicated when one company plays both roles.',
            ],
            'capabilities' => [
                ['Customer 360', 'See identity, activity, invoices, payments, balances and related operations together.'],
                ['Supplier 360', 'Connect purchasing history and supplier performance to the same relationship model.'],
                ['Dual-role parties', 'Represent a business as both customer and supplier without duplicating core identity data.'],
                ['Collections', 'Track overdue balances, payment promises and follow-up priorities.'],
                ['Segmentation', 'Use business signals to identify valuable, inactive, risky or overdue customers.'],
                ['Profitability context', 'Look beyond revenue to understand contribution and transaction history.'],
            ],
            'faq' => [
                ['Is AccoNova only a CRM?', 'No. CRM is connected to invoicing, payments, inventory, reporting, staff and wider ERP workflows.'],
                ['Can customers and suppliers share one record?', 'Yes. The platform supports multiple business roles on one party record where appropriate.'],
                ['Can I view a customer statement?', 'Yes. Account and transaction views are designed to bring customer financial history into the relationship context.'],
            ],
        ]);
    }

    public function inventory(): View
    {
        return $this->page('inventory-management-software', [
            'label' => 'Inventory management',
            'title' => 'Inventory Management Software for Growing Businesses | AccoNova',
            'description' => 'Track products, warehouses, transfers, purchasing, production, stock aging, reorder needs and stockout risk with AccoNova inventory management software.',
            'headline' => 'Inventory management that connects stock to business decisions.',
            'intro' => 'Know what you have, where it is, how it moved and what may need attention next. AccoNova connects stock records to purchasing, sales, warehouses, production and management reporting.',
            'problems' => [
                'Stock quantities are spread across spreadsheets or locations.',
                'Transfers and adjustments lack a clear workflow history.',
                'Reorder decisions happen too late or rely on one person’s memory.',
                'Slow-moving and aging inventory is difficult to identify early.',
            ],
            'capabilities' => [
                ['Multi-warehouse stock', 'Track inventory across multiple storage locations.'],
                ['Warehouse transfers', 'Use transfer workflows instead of invisible quantity edits.'],
                ['Production', 'Record outputs and actual material consumption with traceable history.'],
                ['Reorder signals', 'Identify stock levels that may require replenishment.'],
                ['Stockout forecasting', 'Surface items that may run short based on current operational signals.'],
                ['Inventory aging', 'Identify slow-moving and aging stock that ties up working capital.'],
            ],
            'faq' => [
                ['Does AccoNova support multiple warehouses?', 'Yes. Inventory can be organized across warehouses with transfer workflows between locations.'],
                ['Can AccoNova track production consumption?', 'Yes. Production workflows can record actual material consumption rather than relying only on a recipe suggestion.'],
                ['Can services be kept separate from physical inventory?', 'Yes. Service items are treated separately from warehouse-tracked physical products.'],
            ],
        ]);
    }

    public function invoicing(): View
    {
        return $this->page('invoicing-and-payments', [
            'label' => 'Invoicing and payments',
            'title' => 'Invoicing, Payments & Receivables Software | AccoNova',
            'description' => 'Create invoices, record receipts and payments, allocate transactions, track customer advances, receivables, payables and collections in AccoNova.',
            'headline' => 'Invoicing is more useful when it stays connected to cash and customer context.',
            'intro' => 'AccoNova links commercial documents, receipts, payments, balances and follow-up workflows so finance activity does not end at creating a PDF invoice.',
            'problems' => [
                'Invoices are created in one place while payment tracking happens somewhere else.',
                'Partial payments and advances are hard to reconcile manually.',
                'Overdue customers are noticed late because collection work is not prioritized.',
                'Corrections risk damaging historical records when the system lacks controlled workflows.',
            ],
            'capabilities' => [
                ['Sales and purchase invoices', 'Keep outgoing and incoming document workflows in one finance context.'],
                ['Receipts and payments', 'Record money in and out with allocation and payment method context.'],
                ['Partial allocation', 'Apply transactions gradually instead of forcing all-or-nothing settlement.'],
                ['Customer advances', 'Preserve overpayments as usable customer credit where appropriate.'],
                ['Collections', 'Use aging and payment-promise workflows to prioritize follow-up.'],
                ['Correction history', 'Use correction, void and protected-history patterns instead of silent destructive edits.'],
            ],
            'faq' => [
                ['Can AccoNova track partial payments?', 'Yes. Payment and receipt workflows support allocation patterns for partially settled balances.'],
                ['What happens to a customer overpayment?', 'Customer overpayments can remain available as advance credit for later use rather than disappearing from the account context.'],
                ['Does AccoNova include receivables aging?', 'Yes. A/R and A/P aging workflows are part of the reporting and collections capabilities.'],
            ],
        ]);
    }

    public function reporting(): View
    {
        return $this->page('business-reporting-software', [
            'label' => 'Business reporting',
            'title' => 'Business Reporting, Dashboards & KPI Software | AccoNova',
            'description' => 'Build reports, dashboards, KPI targets, aging views, trend comparisons and operational action lists from connected AccoNova business data.',
            'headline' => 'Reporting that helps managers decide what to do next.',
            'intro' => 'AccoNova reporting is designed to move beyond static tables. Connected business data can feed dashboards, KPI targets, trends, aging, profitability views and exception-first management signals.',
            'problems' => [
                'Monthly reporting requires repeated spreadsheet exports and manual cleanup.',
                'Teams look at totals without seeing the operational reasons underneath.',
                'Important exceptions are buried inside large reports.',
                'Management cannot easily compare current performance with previous periods or targets.',
            ],
            'capabilities' => [
                ['Report builder', 'Choose fields, filters and grouping to create reusable business views.'],
                ['Dashboard builder', 'Organize relevant widgets and management indicators around different roles.'],
                ['KPI targets', 'Compare current results against explicit goals and progress.'],
                ['Trend comparison', 'Compare performance across prior periods and changing business conditions.'],
                ['Aging and profitability', 'Track receivables, payables and profitability-oriented views.'],
                ['Exception-first workflows', 'Surface what changed and what needs attention instead of showing only passive totals.'],
            ],
            'faq' => [
                ['Can users build their own reports?', 'AccoNova includes report-building capabilities for configurable fields, filters and grouping.'],
                ['Can dashboards show KPIs?', 'Yes. KPI targets and dashboard workflows are designed to show progress and trends in context.'],
                ['Can reports lead to action?', 'That is a core product direction: reporting should connect to follow-up, approvals, collections and other operational workflows where possible.'],
            ],
        ]);
    }

    /**
     * @param array<string, mixed> $content
     */
    private function page(string $slug, array $content): View
    {
        $canonical = rtrim((string) config('app.url'), '/').'/'.$slug;
        $home = rtrim((string) config('app.url'), '/').'/';

        $schema = [
            [
                '@context' => 'https://schema.org',
                '@type' => 'SoftwareApplication',
                'name' => 'AccoNova',
                'applicationCategory' => 'BusinessApplication',
                'operatingSystem' => 'Web',
                'url' => $canonical,
                'description' => $content['description'],
            ],
            [
                '@context' => 'https://schema.org',
                '@type' => 'BreadcrumbList',
                'itemListElement' => [
                    ['@type' => 'ListItem', 'position' => 1, 'name' => 'Home', 'item' => $home],
                    ['@type' => 'ListItem', 'position' => 2, 'name' => $content['label'], 'item' => $canonical],
                ],
            ],
            [
                '@context' => 'https://schema.org',
                '@type' => 'FAQPage',
                'mainEntity' => collect($content['faq'])->map(fn (array $item): array => [
                    '@type' => 'Question',
                    'name' => $item[0],
                    'acceptedAnswer' => ['@type' => 'Answer', 'text' => $item[1]],
                ])->all(),
            ],
        ];

        return view('marketing.pages.solution', [
            'seo' => [
                'title' => $content['title'],
                'description' => $content['description'],
                'canonical' => $canonical,
                'path' => '/'.$slug,
            ],
            'schema' => $schema,
            'content' => $content,
        ]);
    }
}
