<?php

namespace App\Services\Mcp;

use App\Models\FinancialDocument;
use App\Models\Party;
use App\Models\Product;
use App\Models\StaffMember;
use App\Models\Task;
use App\Models\User;
use App\Services\FinanceAuthorization;
use App\Services\FinanceDocumentService;
use App\Services\WorkspaceFeaturePermissions;
use App\Tenancy\TenantContext;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpException;

final class McpExecutor
{
    public function __construct(
        private readonly McpTokenService $tokens,
        private readonly FinanceDocumentService $financeDocuments,
        private readonly TenantContext $context,
    ) {}

    /** @return array<string, mixed> */
    public function execute(
        string $toolName,
        array $arguments,
        User $user,
        ?object $token = null,
        bool $sandbox = false,
        bool $bypassApproval = false,
    ): array {
        $started = hrtime(true);
        $tool = McpCapabilityCatalog::findTool($toolName);

        if (! $tool) {
            return $this->executeCustom($toolName, $arguments, $user, $token, $sandbox, $bypassApproval, $started);
        }

        $this->authorize($tool, $user, $token);
        $this->assertWorkspaceCapabilityEnabled($tool['tool']);
        $this->assertExecutionMode($tool, $token, $sandbox);

        if ($this->needsApproval($tool, $token) && ! $sandbox && ! $bypassApproval) {
            $approval = $this->queueApproval($tool['tool'], $arguments, $user, $token);
            $this->audit($tool['tool'], 'approval_required', $arguments, ['approval_id' => $approval], $user, $token, $started);

            return [
                'ok' => true,
                'status' => 'approval_required',
                'approval_id' => $approval,
                'message' => 'This MCP action is waiting for human approval.',
            ];
        }

        if ($sandbox && $tool['mode'] === 'write') {
            $result = [
                'ok' => true,
                'status' => 'sandbox',
                'would_execute' => $tool['tool'],
                'arguments' => $this->safeInput($arguments),
            ];
            $this->audit($tool['tool'], 'sandbox', $arguments, $result, $user, $token, $started);
            return $result;
        }

        try {
            $result = match ($tool['tool']) {
                'acconova.ask' => $this->askAccoNova($arguments),
                'invoices.create_draft' => $this->createInvoiceDraft($arguments, $user),
                'customers.get_360' => $this->party360($arguments, 'customer'),
                'suppliers.get_360' => $this->party360($arguments, 'supplier'),
                'collections.queue' => $this->collectionsQueue($arguments),
                'business.morning_brief' => $this->morningBrief(),
                'inventory.analysis' => $this->inventoryAnalysis($arguments),
                'inventory.reorder_suggestions' => $this->reorderSuggestions(),
                'quotes.build' => $this->quoteBuilder($arguments),
                'customers.profitability' => $this->profitability($arguments),
                'cashflow.forecast' => $this->cashflow($arguments),
                'expenses.intelligence' => $this->expenseIntelligence($arguments),
                'business.anomalies' => $this->anomalies(),
                'reports.query' => $this->reportQuery($arguments),
                'tasks.create' => $this->createTask($arguments, $user),
                'crm.meeting_note' => $this->meetingNote($arguments, $user),
                'erp.email_intake' => $this->emailIntake($arguments, $user),
                'documents.link' => $this->linkDocument($arguments, $user),
                'approvals.list' => $this->pendingApprovals(),
                'business.ceo_snapshot' => $this->ceoSnapshot(),
                'sales.opportunities' => $this->salesOpportunities($arguments),
                'customers.churn_risk' => $this->churnRisk(),
                'sales.cross_sell' => $this->crossSell($arguments),
                'sales.pricing_assistant' => $this->pricingAssistant($arguments),
                'accounting.copilot' => $this->accountingCopilot(),
                'employees.overview' => $this->employeeOverview(),
                default => throw new HttpException(404, 'Unknown MCP tool.'),
            };

            $this->audit($tool['tool'], 'success', $arguments, $result, $user, $token, $started);
            return ['ok' => true, 'status' => 'success', 'data' => $result];
        } catch (\Throwable $exception) {
            $this->audit($tool['tool'], 'error', $arguments, ['error' => $exception->getMessage()], $user, $token, $started);
            throw $exception;
        }
    }

    private function authorize(array $tool, User $user, ?object $token): void
    {
        WorkspaceFeaturePermissions::authorize($user, 'ai.business_data.use');

        $permission = $tool['permission'] ?? null;
        if ($permission && in_array($permission, WorkspaceFeaturePermissions::keys(), true)) {
            WorkspaceFeaturePermissions::authorize($user, $permission);
        }

        if ($token && ! $this->tokens->canUse($token, (string) $tool['tool']) && ! $this->tokens->canUse($token, (string) $tool['id'])) {
            throw new HttpException(403, 'This MCP token does not include the required scope.');
        }

        if ($tool['tool'] === 'invoices.create_draft') {
            $kind = request()->input('params.arguments.kind', request()->input('kind', 'sale_invoice'));
            FinanceAuthorization::authorize($user, $kind === 'purchase_invoice' ? 'finance.purchases.manage' : 'finance.sales.manage');
        }
    }

    private function assertWorkspaceCapabilityEnabled(string $capability): void
    {
        $settings = DB::table('mcp_workspace_settings')->where('organization_id', $this->context->id())->first();
        if (! $settings || ! $settings->enabled_capabilities) {
            return;
        }

        $enabled = json_decode((string) $settings->enabled_capabilities, true) ?: [];
        if (! in_array('*', $enabled, true) && ! in_array($capability, $enabled, true)) {
            throw new HttpException(403, 'This MCP capability is disabled for the workspace.');
        }
    }

    private function assertExecutionMode(array $tool, ?object $token, bool $sandbox): void
    {
        if (! $token || $sandbox || $tool['mode'] !== 'write') {
            return;
        }

        if (($token->mode ?? 'read') === 'read') {
            throw new HttpException(403, 'This MCP token is read-only.');
        }
    }

    private function needsApproval(array $tool, ?object $token): bool
    {
        if (($token->mode ?? null) === 'approve') {
            return $tool['mode'] === 'write';
        }

        if (! ($tool['approval_required'] ?? false)) {
            return false;
        }

        $settings = DB::table('mcp_workspace_settings')->where('organization_id', $this->context->id())->first();
        return ! $settings || (bool) $settings->require_approval_for_financial_writes;
    }

    private function queueApproval(string $capability, array $input, User $user, ?object $token): int
    {
        return DB::table('mcp_approvals')->insertGetId([
            'organization_id' => $this->context->id(),
            'requested_by' => $user->id,
            'mcp_access_token_id' => $token->id ?? null,
            'capability' => $capability,
            'input' => json_encode($this->safeInput($input)),
            'status' => 'pending',
            'expires_at' => now()->addDays(7),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    private function askAccoNova(array $arguments): array
    {
        return [
            'question' => trim((string) ($arguments['question'] ?? '')),
            'workspace' => $this->ceoSnapshot(),
            'note' => 'Structured AccoNova business context. The connected AI client can formulate the natural-language answer.',
        ];
    }

    private function createInvoiceDraft(array $arguments, User $user): array
    {
        $kind = in_array(($arguments['kind'] ?? 'sale_invoice'), ['sale_invoice', 'purchase_invoice'], true)
            ? $arguments['kind']
            : 'sale_invoice';
        FinanceAuthorization::authorize($user, $kind === 'sale_invoice' ? 'finance.sales.manage' : 'finance.purchases.manage');

        $organization = $this->context->organization();
        $currency = strtoupper((string) ($organization->preferences['currency'] ?? 'ILS'));
        $lines = array_map(static function (array $line): array {
            return [
                'product_id' => isset($line['product_id']) ? (int) $line['product_id'] : null,
                'warehouse_id' => isset($line['warehouse_id']) ? (int) $line['warehouse_id'] : null,
                'description' => trim((string) ($line['description'] ?? '')) ?: null,
                'unit' => trim((string) ($line['unit'] ?? '')) ?: null,
                'quantity' => (string) ($line['quantity'] ?? 1),
                'unit_price' => (string) ($line['unit_price'] ?? 0),
                'discount_type' => in_array(($line['discount_type'] ?? null), ['percent', 'fixed'], true) ? $line['discount_type'] : null,
                'discount_value' => (string) ($line['discount_value'] ?? 0),
                'tax_rate' => (string) ($line['tax_rate'] ?? 0),
                'affects_inventory' => (bool) ($line['affects_inventory'] ?? true),
            ];
        }, array_values(array_filter($arguments['lines'] ?? [], 'is_array')));

        if ($lines === []) {
            throw ValidationException::withMessages(['lines' => ['At least one invoice line is required.']]);
        }

        $data = [
            'kind' => $kind,
            'party_id' => (int) ($arguments['party_id'] ?? 0),
            'issue_date' => (string) ($arguments['issue_date'] ?? now()->toDateString()),
            'due_date' => $arguments['due_date'] ?? null,
            'currency' => $currency,
            'exchange_rate' => '1',
            'shipping_total' => (string) ($arguments['shipping_total'] ?? 0),
            'notes' => $arguments['notes'] ?? null,
            'internal_notes' => $arguments['internal_notes'] ?? 'Created through AccoNova MCP',
            'lines' => $lines,
        ];

        $document = $this->financeDocuments->createDraft($data, $user->id);
        return [
            'id' => $document->id,
            'number' => $document->number,
            'kind' => $document->kind,
            'status' => $document->status,
            'currency' => $document->currency,
            'total' => $document->total,
            'url' => $document->isSale() ? '/app/invoices/sales/'.$document->id : '/app/invoices/purchases/'.$document->id,
        ];
    }

    private function party360(array $arguments, string $role): array
    {
        $party = Party::query()->with('roles')->findOrFail((int) ($arguments['party_id'] ?? 0));
        $roleNames = $party->roles->pluck('role')->map(fn ($value) => is_object($value) && property_exists($value, 'value') ? $value->value : (string) $value)->all();
        if ($roleNames !== [] && ! in_array($role, $roleNames, true)) {
            throw new HttpException(422, "The selected party is not a {$role}.");
        }

        $documents = FinancialDocument::query()->where('party_id', $party->id)->latest('issue_date')->limit(25)->get();
        return [
            'party' => $party->only(['id', 'name', 'company_name', 'email', 'phone', 'credit_limit', 'city', 'country_code', 'notes']),
            'roles' => $roleNames,
            'financials' => [
                'documents' => $documents->count(),
                'sales_total' => (float) $documents->where('kind', 'sale_invoice')->sum('total'),
                'purchases_total' => (float) $documents->where('kind', 'purchase_invoice')->sum('total'),
                'open_balance' => (float) $documents->sum('balance_due'),
            ],
            'recent_documents' => $documents->map(fn (FinancialDocument $doc) => [
                'id' => $doc->id, 'number' => $doc->number, 'kind' => $doc->kind, 'status' => $doc->status,
                'issue_date' => $doc->issue_date?->toDateString(), 'total' => $doc->total, 'balance_due' => $doc->balance_due,
            ])->values(),
            'mcp_context' => DB::table('mcp_context_records')->where('organization_id', $this->context->id())->where('entity_type', 'party')->where('entity_id', $party->id)->latest()->limit(20)->get(),
        ];
    }

    private function collectionsQueue(array $arguments): array
    {
        $limit = min(max((int) ($arguments['limit'] ?? 30), 1), 100);
        return FinancialDocument::query()->with('party:id,name,company_name,email,phone')
            ->where('kind', 'sale_invoice')->whereIn('status', ['issued', 'partially_paid'])
            ->where('balance_due', '>', 0)->whereDate('due_date', '<', today())
            ->orderBy('due_date')->limit($limit)->get()->map(fn (FinancialDocument $doc) => [
                'id' => $doc->id, 'number' => $doc->number, 'party' => $doc->party?->company_name ?: $doc->party?->name,
                'email' => $doc->party?->email, 'phone' => $doc->party?->phone, 'due_date' => $doc->due_date?->toDateString(),
                'days_overdue' => $doc->due_date ? $doc->due_date->diffInDays(today()) : 0, 'balance_due' => $doc->balance_due, 'currency' => $doc->currency,
            ])->all();
    }

    private function morningBrief(): array
    {
        return [
            'date' => today()->toDateString(),
            'overdue_receivables' => $this->receivableSummary(),
            'inventory_alerts' => array_slice($this->reorderSuggestions(), 0, 10),
            'tasks_due' => Task::query()->operational()->whereNotNull('due_on')->whereDate('due_on', '<=', today()->addDay())->orderBy('due_on')->limit(10)->get(['id', 'title', 'status', 'priority', 'due_on'])->toArray(),
            'pending_mcp_approvals' => DB::table('mcp_approvals')->where('organization_id', $this->context->id())->where('status', 'pending')->count(),
        ];
    }

    private function inventoryAnalysis(array $arguments): array
    {
        $limit = min(max((int) ($arguments['limit'] ?? 50), 1), 100);
        return Product::query()->withSum('inventoryBalances as available_stock', 'available')->where('active', true)->orderBy('name')->limit($limit)->get()->map(fn (Product $p) => [
            'id' => $p->id, 'sku' => $p->sku, 'name' => $p->name, 'available' => (float) ($p->available_stock ?? 0),
            'low_stock_threshold' => (float) ($p->low_stock_threshold ?? 0), 'reorder_level' => (float) ($p->reorder_level ?? 0), 'reorder_qty' => (float) ($p->reorder_qty ?? 0),
        ])->all();
    }

    private function reorderSuggestions(): array
    {
        return collect($this->inventoryAnalysis(['limit' => 100]))->filter(function (array $row): bool {
            $threshold = max($row['low_stock_threshold'], $row['reorder_level']);
            return $threshold > 0 && $row['available'] <= $threshold;
        })->map(function (array $row): array {
            $target = max($row['reorder_qty'], $row['reorder_level'] * 2, $row['low_stock_threshold'] * 2);
            $row['suggested_order_qty'] = max($target - $row['available'], 0);
            return $row;
        })->values()->all();
    }

    private function quoteBuilder(array $arguments): array
    {
        $party = Party::query()->findOrFail((int) ($arguments['party_id'] ?? 0));
        $ids = array_values(array_unique(array_map('intval', $arguments['product_ids'] ?? [])));
        $products = Product::query()->whereIn('id', $ids)->where('active', true)->get();
        $lines = $products->map(fn (Product $p) => [
            'product_id' => $p->id, 'sku' => $p->sku, 'name' => $p->name, 'quantity' => 1,
            'unit_price' => (float) ($p->sale_price ?? $p->price ?? 0), 'tax_rate' => (float) ($p->tax_rate ?? 0),
        ]);
        return ['draft_only' => true, 'party' => ['id' => $party->id, 'name' => $party->company_name ?: $party->name], 'lines' => $lines, 'subtotal' => $lines->sum('unit_price')];
    }

    private function profitability(array $arguments): array
    {
        $limit = min(max((int) ($arguments['limit'] ?? 20), 1), 100);
        return DB::table('financial_documents as d')->join('financial_document_lines as l', 'l.financial_document_id', '=', 'd.id')
            ->leftJoin('parties as p', 'p.id', '=', 'd.party_id')
            ->where('d.organization_id', $this->context->id())->where('d.kind', 'sale_invoice')->whereIn('d.status', ['issued', 'partially_paid', 'paid'])
            ->selectRaw('d.party_id, COALESCE(p.company_name, p.name) as party_name, SUM(l.line_total) as revenue, SUM(COALESCE(l.cost_total,0)) as cost, SUM(l.line_total-COALESCE(l.cost_total,0)) as profit')
            ->groupBy('d.party_id', 'p.company_name', 'p.name')->orderByDesc('profit')->limit($limit)->get()->map(fn ($row) => (array) $row)->all();
    }

    private function cashflow(array $arguments): array
    {
        $days = min(max((int) ($arguments['days'] ?? 30), 7), 365);
        $to = today()->addDays($days);
        $base = FinancialDocument::query()->whereIn('status', ['issued', 'partially_paid'])->where('balance_due', '>', 0)->whereDate('due_date', '<=', $to);
        $inflow = (clone $base)->where('kind', 'sale_invoice')->sum('balance_due');
        $outflow = (clone $base)->where('kind', 'purchase_invoice')->sum('balance_due');
        return ['days' => $days, 'expected_inflow' => (float) $inflow, 'expected_outflow' => (float) $outflow, 'net_expected' => (float) $inflow - (float) $outflow];
    }

    private function expenseIntelligence(array $arguments): array
    {
        $days = min(max((int) ($arguments['days'] ?? 30), 7), 365);
        $from = today()->subDays($days - 1);
        $previousFrom = (clone $from)->subDays($days);
        $current = (float) FinancialDocument::query()->where('kind', 'purchase_invoice')->whereIn('status', ['issued', 'partially_paid', 'paid'])->whereBetween('issue_date', [$from, today()])->sum('total');
        $previous = (float) FinancialDocument::query()->where('kind', 'purchase_invoice')->whereIn('status', ['issued', 'partially_paid', 'paid'])->whereBetween('issue_date', [$previousFrom, $from->copy()->subDay()])->sum('total');
        return ['days' => $days, 'current' => $current, 'previous' => $previous, 'change_percent' => $previous > 0 ? round((($current - $previous) / $previous) * 100, 2) : null];
    }

    private function anomalies(): array
    {
        $average = (float) FinancialDocument::query()->whereIn('status', ['issued', 'partially_paid', 'paid'])->where('issue_date', '>=', today()->subDays(90))->avg('total');
        $large = FinancialDocument::query()->with('party:id,name,company_name')->where('total', '>', max($average * 3, 0))->where('issue_date', '>=', today()->subDays(90))->latest('issue_date')->limit(20)->get(['id', 'number', 'party_id', 'kind', 'total', 'issue_date']);
        return ['average_document_total_90d' => $average, 'unusually_large_documents' => $large, 'overdue_receivables' => $this->receivableSummary(), 'low_stock_count' => count($this->reorderSuggestions())];
    }

    private function reportQuery(array $arguments): array
    {
        $report = (string) ($arguments['report'] ?? 'sales');
        $from = Carbon::parse($arguments['from'] ?? today()->startOfMonth())->startOfDay();
        $to = Carbon::parse($arguments['to'] ?? today())->endOfDay();
        if ($from->gt($to) || $from->diffInDays($to) > 732) {
            throw ValidationException::withMessages(['date' => ['Invalid report date range.']]);
        }

        return match ($report) {
            'sales', 'purchases' => FinancialDocument::query()->where('kind', $report === 'sales' ? 'sale_invoice' : 'purchase_invoice')->whereBetween('issue_date', [$from, $to])->selectRaw('COUNT(*) as document_count, COALESCE(SUM(total),0) as total, COALESCE(SUM(balance_due),0) as balance_due')->first()?->toArray() ?? [],
            'receivables' => $this->receivableSummary(),
            'payables' => $this->payableSummary(),
            'inventory' => ['items' => $this->inventoryAnalysis(['limit' => 100]), 'reorder' => $this->reorderSuggestions()],
            'customers' => ['count' => Party::query()->count(), 'opportunities' => $this->salesOpportunities(['limit' => 20])],
            default => throw ValidationException::withMessages(['report' => ['Unsupported report type.']]),
        };
    }

    private function createTask(array $arguments, User $user): array
    {
        WorkspaceFeaturePermissions::authorize($user, 'tasks.create');
        $task = Task::query()->create([
            'title' => trim((string) ($arguments['title'] ?? '')),
            'description' => trim((string) ($arguments['description'] ?? '')) ?: null,
            'status' => 'todo',
            'priority' => in_array(($arguments['priority'] ?? 'normal'), ['low', 'normal', 'high', 'urgent'], true) ? $arguments['priority'] : 'normal',
            'due_on' => $arguments['due_on'] ?? null,
            'created_by' => $user->id,
        ]);
        return ['id' => $task->id, 'title' => $task->title, 'status' => $task->status, 'due_on' => $task->due_on?->toDateString(), 'url' => '/app/task-management'];
    }

    private function meetingNote(array $arguments, User $user): array
    {
        $party = Party::query()->findOrFail((int) ($arguments['party_id'] ?? 0));
        $id = $this->contextRecord('meeting', 'party', $party->id, 'Meeting note', (string) ($arguments['summary'] ?? ''), null, ['next_action' => $arguments['next_action'] ?? null], $user);
        return ['id' => $id, 'party_id' => $party->id];
    }

    private function emailIntake(array $arguments, User $user): array
    {
        $from = strtolower(trim((string) ($arguments['from'] ?? '')));
        $party = $from !== '' ? Party::query()->whereRaw('LOWER(email) = ?', [$from])->first() : null;
        $id = $this->contextRecord('email', $party ? 'party' : null, $party?->id, (string) ($arguments['subject'] ?? 'Email intake'), (string) ($arguments['body'] ?? ''), null, ['from' => $from], $user);
        return ['id' => $id, 'matched_party' => $party ? ['id' => $party->id, 'name' => $party->company_name ?: $party->name] : null, 'suggested_action' => $party ? 'Review customer 360 and create a follow-up task or draft quote.' : 'Create or match a party before starting a commercial workflow.'];
    }

    private function linkDocument(array $arguments, User $user): array
    {
        $url = trim((string) ($arguments['url'] ?? ''));
        if ($url !== '' && ! filter_var($url, FILTER_VALIDATE_URL)) {
            throw ValidationException::withMessages(['url' => ['A valid document URL is required.']]);
        }
        $id = $this->contextRecord('document', (string) ($arguments['entity_type'] ?? ''), isset($arguments['entity_id']) ? (int) $arguments['entity_id'] : null, (string) ($arguments['title'] ?? 'Document'), null, $url ?: null, [], $user);
        return ['id' => $id, 'url' => $url ?: null];
    }

    private function pendingApprovals(): array
    {
        return DB::table('mcp_approvals')->where('organization_id', $this->context->id())->where('status', 'pending')->orderByDesc('created_at')->limit(100)->get()->map(fn ($row) => $this->rowWithJson($row, ['input']))->all();
    }

    private function ceoSnapshot(): array
    {
        $sales30 = (float) FinancialDocument::query()->where('kind', 'sale_invoice')->whereIn('status', ['issued', 'partially_paid', 'paid'])->whereDate('issue_date', '>=', today()->subDays(29))->sum('total');
        $purchases30 = (float) FinancialDocument::query()->where('kind', 'purchase_invoice')->whereIn('status', ['issued', 'partially_paid', 'paid'])->whereDate('issue_date', '>=', today()->subDays(29))->sum('total');
        return [
            'sales_30d' => $sales30,
            'purchases_30d' => $purchases30,
            'gross_operating_delta_30d' => $sales30 - $purchases30,
            'receivables' => $this->receivableSummary(),
            'payables' => $this->payableSummary(),
            'active_customers' => Party::query()->count(),
            'low_stock_items' => count($this->reorderSuggestions()),
            'open_tasks' => Task::query()->operational()->whereNotIn('status', ['done', 'completed'])->count(),
            'pending_mcp_approvals' => DB::table('mcp_approvals')->where('organization_id', $this->context->id())->where('status', 'pending')->count(),
        ];
    }

    private function salesOpportunities(array $arguments): array
    {
        $limit = min(max((int) ($arguments['limit'] ?? 20), 1), 100);
        return DB::table('parties as p')->leftJoin('financial_documents as d', function ($join): void {
            $join->on('d.party_id', '=', 'p.id')->where('d.kind', '=', 'sale_invoice');
        })->where('p.organization_id', $this->context->id())->whereNull('p.deleted_at')
            ->selectRaw('p.id, COALESCE(p.company_name,p.name) as name, p.email, MAX(d.issue_date) as last_sale_on, COUNT(d.id) as order_count, COALESCE(SUM(d.total),0) as lifetime_sales')
            ->groupBy('p.id', 'p.company_name', 'p.name', 'p.email')->orderByDesc('lifetime_sales')->limit($limit)->get()->map(fn ($row) => (array) $row)->all();
    }

    private function churnRisk(): array
    {
        $rows = $this->salesOpportunities(['limit' => 100]);
        return collect($rows)->map(function (array $row): array {
            $days = $row['last_sale_on'] ? Carbon::parse($row['last_sale_on'])->diffInDays(today()) : null;
            $row['days_since_last_sale'] = $days;
            $row['risk'] = $days === null ? 'new_or_no_history' : ($days >= 90 ? 'high' : ($days >= 45 ? 'medium' : 'low'));
            return $row;
        })->sortByDesc(fn (array $row) => $row['days_since_last_sale'] ?? 9999)->values()->all();
    }

    private function crossSell(array $arguments): array
    {
        $partyId = (int) ($arguments['party_id'] ?? 0);
        Party::query()->findOrFail($partyId);
        $limit = min(max((int) ($arguments['limit'] ?? 10), 1), 30);
        $bought = DB::table('financial_document_lines as l')->join('financial_documents as d', 'd.id', '=', 'l.financial_document_id')->where('d.organization_id', $this->context->id())->where('d.party_id', $partyId)->where('d.kind', 'sale_invoice')->whereNotNull('l.product_id')->pluck('l.product_id');
        return Product::query()->where('active', true)->whereNotIn('id', $bought)->orderByDesc('sale_price')->limit($limit)->get(['id', 'sku', 'name', 'sale_price', 'price'])->toArray();
    }

    private function pricingAssistant(array $arguments): array
    {
        $partyId = (int) ($arguments['party_id'] ?? 0);
        $product = Product::query()->findOrFail((int) ($arguments['product_id'] ?? 0));
        Party::query()->findOrFail($partyId);
        $recent = DB::table('financial_document_lines as l')->join('financial_documents as d', 'd.id', '=', 'l.financial_document_id')->where('d.organization_id', $this->context->id())->where('d.kind', 'sale_invoice')->where('d.party_id', $partyId)->where('l.product_id', $product->id)->orderByDesc('d.issue_date')->value('l.unit_price');
        $price = (float) ($product->sale_price ?? $product->price ?? 0);
        $cost = (float) ($product->cost ?? $product->purchase_price ?? 0);
        return ['product_id' => $product->id, 'quantity' => (float) ($arguments['quantity'] ?? 1), 'list_price' => $price, 'cost' => $cost, 'recent_customer_price' => $recent !== null ? (float) $recent : null, 'list_margin_percent' => $price > 0 ? round((($price - $cost) / $price) * 100, 2) : null];
    }

    private function accountingCopilot(): array
    {
        return ['receivables' => $this->receivableSummary(), 'payables' => $this->payableSummary(), 'cashflow_30d' => $this->cashflow(['days' => 30]), 'draft_sales_invoices' => FinancialDocument::query()->where('kind', 'sale_invoice')->where('status', 'draft')->count(), 'draft_purchase_invoices' => FinancialDocument::query()->where('kind', 'purchase_invoice')->where('status', 'draft')->count()];
    }

    private function employeeOverview(): array
    {
        $staff = StaffMember::query()->limit(100)->get();
        $openByAssignee = Task::query()->operational()->whereNotIn('status', ['done', 'completed'])->whereNotNull('primary_assignee_id')->selectRaw('primary_assignee_id, COUNT(*) as open_tasks')->groupBy('primary_assignee_id')->pluck('open_tasks', 'primary_assignee_id');
        return $staff->map(fn (StaffMember $member) => ['id' => $member->id, 'name' => $member->name ?? $member->full_name ?? null, 'email' => $member->email ?? null, 'job_title' => $member->job_title ?? null, 'open_tasks' => (int) ($openByAssignee[$member->id] ?? 0)])->all();
    }

    private function receivableSummary(): array
    {
        $query = FinancialDocument::query()->where('kind', 'sale_invoice')->whereIn('status', ['issued', 'partially_paid'])->where('balance_due', '>', 0);
        return ['total' => (float) (clone $query)->sum('balance_due'), 'overdue' => (float) (clone $query)->whereDate('due_date', '<', today())->sum('balance_due'), 'documents' => (clone $query)->count()];
    }

    private function payableSummary(): array
    {
        $query = FinancialDocument::query()->where('kind', 'purchase_invoice')->whereIn('status', ['issued', 'partially_paid'])->where('balance_due', '>', 0);
        return ['total' => (float) (clone $query)->sum('balance_due'), 'overdue' => (float) (clone $query)->whereDate('due_date', '<', today())->sum('balance_due'), 'documents' => (clone $query)->count()];
    }

    private function contextRecord(string $kind, ?string $entityType, ?int $entityId, ?string $title, ?string $content, ?string $url, array $metadata, User $user): int
    {
        return DB::table('mcp_context_records')->insertGetId([
            'organization_id' => $this->context->id(), 'created_by' => $user->id, 'kind' => $kind,
            'entity_type' => $entityType ?: null, 'entity_id' => $entityId, 'title' => $title, 'content' => $content,
            'external_url' => $url, 'metadata' => json_encode($metadata), 'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    private function executeCustom(string $name, array $arguments, User $user, ?object $token, bool $sandbox, bool $bypassApproval, int $started): array
    {
        WorkspaceFeaturePermissions::authorize($user, 'ai.business_data.use');
        $slug = Str::after($name, 'custom.');
        $tool = DB::table('mcp_custom_tools')->where('organization_id', $this->context->id())->where('slug', $slug)->where('enabled', true)->first();
        if (! $tool) {
            throw new HttpException(404, 'MCP tool not found.');
        }
        $scope = 'custom.'.$tool->slug;
        if ($token && ! $this->tokens->canUse($token, $scope)) {
            throw new HttpException(403, 'This MCP token does not include the custom tool scope.');
        }
        if (($token->mode ?? 'read') === 'read' && strtoupper($tool->http_method) !== 'GET') {
            throw new HttpException(403, 'This MCP token is read-only.');
        }
        if ($sandbox) {
            $result = ['ok' => true, 'status' => 'sandbox', 'would_execute' => $scope, 'endpoint_host' => parse_url($tool->endpoint_url, PHP_URL_HOST)];
            $this->audit($scope, 'sandbox', $arguments, $result, $user, $token, $started);
            return $result;
        }
        if ((bool) $tool->approval_required && ! $bypassApproval) {
            $approval = $this->queueApproval($scope, $arguments, $user, $token);
            $this->audit($scope, 'approval_required', $arguments, ['approval_id' => $approval], $user, $token, $started);
            return ['ok' => true, 'status' => 'approval_required', 'approval_id' => $approval];
        }

        $this->assertSafeOutboundUrl($tool->endpoint_url);
        $headers = $tool->headers_encrypted ? (json_decode(Crypt::decryptString($tool->headers_encrypted), true) ?: []) : [];
        $request = Http::timeout(15)->connectTimeout(5)->acceptJson()->withHeaders($headers);
        $method = strtolower((string) $tool->http_method);
        $response = $method === 'get' ? $request->get($tool->endpoint_url, $arguments) : $request->send(strtoupper($method), $tool->endpoint_url, ['json' => $arguments]);
        $response->throw();
        $result = ['http_status' => $response->status(), 'data' => $response->json() ?? Str::limit($response->body(), 8000)];
        $this->audit($scope, 'success', $arguments, $result, $user, $token, $started);
        return ['ok' => true, 'status' => 'success', 'data' => $result];
    }

    private function assertSafeOutboundUrl(string $url): void
    {
        if (! filter_var($url, FILTER_VALIDATE_URL) || strtolower((string) parse_url($url, PHP_URL_SCHEME)) !== 'https') {
            throw ValidationException::withMessages(['endpoint_url' => ['Custom MCP tools require an HTTPS endpoint.']]);
        }
        $host = strtolower((string) parse_url($url, PHP_URL_HOST));
        if ($host === '' || $host === 'localhost' || str_ends_with($host, '.local')) {
            throw ValidationException::withMessages(['endpoint_url' => ['Local/private endpoints are not allowed.']]);
        }
        $ips = filter_var($host, FILTER_VALIDATE_IP) ? [$host] : (gethostbynamel($host) ?: []);
        if ($ips === []) {
            throw ValidationException::withMessages(['endpoint_url' => ['The endpoint hostname could not be resolved.']]);
        }
        foreach ($ips as $ip) {
            if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) === false) {
                throw ValidationException::withMessages(['endpoint_url' => ['Private or reserved network endpoints are not allowed.']]);
            }
        }
    }

    private function audit(string $capability, string $status, array $input, array $output, User $user, ?object $token, int $started): void
    {
        DB::table('mcp_audit_logs')->insert([
            'organization_id' => $this->context->id(), 'user_id' => $user->id, 'mcp_access_token_id' => $token->id ?? null,
            'capability' => $capability, 'action' => 'tools/call', 'status' => $status,
            'input' => json_encode($this->safeInput($input)), 'output_summary' => json_encode($this->safeOutput($output)),
            'duration_ms' => (int) round((hrtime(true) - $started) / 1_000_000), 'cost_units' => 1, 'created_at' => now(),
        ]);
    }

    private function safeInput(array $input): array
    {
        foreach (['token', 'secret', 'password', 'authorization', 'headers'] as $key) {
            if (array_key_exists($key, $input)) {
                $input[$key] = '[redacted]';
            }
        }
        return $input;
    }

    private function safeOutput(array $output): array
    {
        $json = json_encode($output);
        if ($json === false || strlen($json) <= 12000) {
            return $output;
        }
        return ['summary' => Str::limit($json, 12000), 'truncated' => true];
    }

    private function rowWithJson(object $row, array $jsonFields): array
    {
        $data = (array) $row;
        foreach ($jsonFields as $field) {
            $data[$field] = isset($data[$field]) ? (json_decode((string) $data[$field], true) ?: []) : null;
        }
        return $data;
    }
}
