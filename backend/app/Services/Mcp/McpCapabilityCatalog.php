<?php

namespace App\Services\Mcp;

final class McpCapabilityCatalog
{
    /** @return array<int, array<string, mixed>> */
    public static function all(): array
    {
        return [
            self::tool('ask_acconova', 'acconova.ask', 'اسأل AccoNova', 'Ask AccoNova Anything', 'اسأل عن أي بيانات تشغيلية داخل الشركة.', 'insights', 'read', 'ai.business_data.use', false, self::schema(['question' => ['type' => 'string']], ['question'])),
            self::tool('create_invoice_by_ai', 'invoices.create_draft', 'إنشاء فاتورة بالذكاء الاصطناعي', 'Create Invoice by AI', 'ينشئ مسودة فاتورة بيع أو شراء من مدخلات منظمة.', 'finance', 'write', 'finance.documents.manage', true, self::schema(['kind' => ['type' => 'string', 'enum' => ['sale_invoice', 'purchase_invoice']], 'party_id' => ['type' => 'integer'], 'currency' => ['type' => 'string'], 'lines' => ['type' => 'array', 'items' => ['type' => 'object']]], ['kind', 'party_id', 'lines'])),
            self::tool('customer_360', 'customers.get_360', 'Customer 360', 'Customer 360 MCP', 'ملف العميل الكامل مع الفواتير والنشاط والرصيد.', 'crm', 'read', 'parties.view', false, self::idSchema('party_id')),
            self::tool('supplier_360', 'suppliers.get_360', 'Supplier 360', 'Supplier 360 MCP', 'ملف المورد الكامل مع المشتريات والمستحقات.', 'crm', 'read', 'parties.view', false, self::idSchema('party_id')),
            self::tool('collections_agent', 'collections.queue', 'وكيل التحصيل', 'Collections Agent', 'يرتب الذمم المتأخرة حسب الأولوية والمخاطر.', 'finance', 'read', 'finance.documents.view', false, self::schema(['limit' => ['type' => 'integer', 'minimum' => 1, 'maximum' => 100]])),
            self::tool('morning_brief', 'business.morning_brief', 'ملخص الصباح', 'Morning Brief', 'يعطي أهم ما يحتاج انتباه الإدارة اليوم.', 'insights', 'read', 'ai.business_data.use', false),
            self::tool('inventory_agent', 'inventory.analysis', 'وكيل المخزون', 'Inventory Agent', 'يحلل المخزون والنواقص وحركة المنتجات.', 'inventory', 'read', 'inventory.view', false, self::schema(['limit' => ['type' => 'integer', 'minimum' => 1, 'maximum' => 100]])),
            self::tool('reorder_assistant', 'inventory.reorder_suggestions', 'اقتراح إعادة الطلب', 'Reorder Assistant', 'يقترح الكميات التي تحتاج إعادة طلب.', 'inventory', 'read', 'inventory.view', false),
            self::tool('quote_builder', 'quotes.build', 'منشئ عروض الأسعار', 'Quote Builder', 'يبني عرض سعر مقترح من العميل والمنتجات.', 'sales', 'read', 'finance.documents.view', false, self::schema(['party_id' => ['type' => 'integer'], 'product_ids' => ['type' => 'array', 'items' => ['type' => 'integer']]], ['party_id', 'product_ids'])),
            self::tool('profitability_query', 'customers.profitability', 'ربحية العملاء', 'Profitability Query', 'يحلل أعلى العملاء ربحية.', 'insights', 'read', 'reports.view', false, self::schema(['limit' => ['type' => 'integer', 'minimum' => 1, 'maximum' => 100]])),
            self::tool('cashflow_mcp', 'cashflow.forecast', 'توقع التدفق النقدي', 'Cashflow MCP', 'يعرض الالتزامات والمقبوضات المتوقعة وصافي التدفق.', 'finance', 'read', 'reports.view', false, self::schema(['days' => ['type' => 'integer', 'minimum' => 7, 'maximum' => 365]])),
            self::tool('expense_intelligence', 'expenses.intelligence', 'ذكاء المصروفات', 'Expense Intelligence', 'يكشف تغيرات واتجاهات المصروفات.', 'finance', 'read', 'reports.view', false, self::schema(['days' => ['type' => 'integer', 'minimum' => 7, 'maximum' => 365]])),
            self::tool('anomaly_detector', 'business.anomalies', 'كاشف الحالات الشاذة', 'Anomaly Detector', 'يرصد أرقامًا أو عمليات غير اعتيادية تحتاج مراجعة.', 'insights', 'read', 'ai.business_data.use', false),
            self::tool('natural_language_reports', 'reports.query', 'تقارير باللغة الطبيعية', 'Natural Language Reports', 'يجهز بيانات تقارير مرنة بناء على نوع التقرير والفترة.', 'reports', 'read', 'reports.view', false, self::schema(['report' => ['type' => 'string'], 'from' => ['type' => 'string'], 'to' => ['type' => 'string']], ['report'])),
            self::tool('task_agent', 'tasks.create', 'وكيل المهام', 'Task Agent', 'ينشئ مهمة داخل AccoNova ضمن صلاحيات المستخدم.', 'operations', 'write', 'tasks.manage', false, self::schema(['title' => ['type' => 'string'], 'description' => ['type' => 'string'], 'due_on' => ['type' => 'string'], 'priority' => ['type' => 'string']], ['title'])),
            self::tool('meeting_to_crm', 'crm.meeting_note', 'Meeting-to-CRM', 'Meeting-to-CRM', 'يحفظ ملخص اجتماع ومتابعاته على سجل العميل/المورد.', 'crm', 'write', 'parties.manage', false, self::schema(['party_id' => ['type' => 'integer'], 'summary' => ['type' => 'string'], 'next_action' => ['type' => 'string']], ['party_id', 'summary'])),
            self::tool('email_to_erp', 'erp.email_intake', 'Email-to-ERP', 'Email-to-ERP', 'يربط بيانات رسالة واردة بطرف ويقترح الإجراء التالي.', 'automation', 'read', 'ai.business_data.use', false, self::schema(['from' => ['type' => 'string'], 'subject' => ['type' => 'string'], 'body' => ['type' => 'string']], ['body'])),
            self::tool('document_mcp', 'documents.link', 'Document MCP', 'Document MCP', 'يسجل مرجع مستند خارجي ويربطه بالسجل المناسب.', 'documents', 'write', 'documents.manage', true, self::schema(['entity_type' => ['type' => 'string'], 'entity_id' => ['type' => 'integer'], 'title' => ['type' => 'string'], 'url' => ['type' => 'string']], ['entity_type', 'entity_id', 'title'])),
            self::tool('approval_agent', 'approvals.list', 'وكيل الموافقات', 'Approval Agent', 'يعرض طلبات MCP المعلقة للمراجعة.', 'control', 'read', 'ai.business_data.use', false),
            self::tool('ceo_mode', 'business.ceo_snapshot', 'CEO Mode', 'CEO Mode', 'ملخص تنفيذي شامل للوضع المالي والتشغيلي.', 'insights', 'read', 'ai.business_data.use', false),
            self::tool('sales_agent', 'sales.opportunities', 'وكيل المبيعات', 'Sales Agent', 'يرتب العملاء حسب فرصة الشراء والمتابعة.', 'sales', 'read', 'parties.view', false, self::schema(['limit' => ['type' => 'integer', 'minimum' => 1, 'maximum' => 100]])),
            self::tool('churn_risk', 'customers.churn_risk', 'خطر فقد العملاء', 'Churn Risk', 'يكشف العملاء الذين انخفض نشاطهم أو توقف.', 'sales', 'read', 'parties.view', false),
            self::tool('cross_sell_agent', 'sales.cross_sell', 'Cross-sell Agent', 'Cross-sell Agent', 'يقترح منتجات مناسبة إضافية لكل عميل.', 'sales', 'read', 'products.view', false, self::schema(['party_id' => ['type' => 'integer'], 'limit' => ['type' => 'integer', 'minimum' => 1, 'maximum' => 30]], ['party_id'])),
            self::tool('pricing_assistant', 'sales.pricing_assistant', 'مساعد التسعير', 'Pricing Assistant', 'يعرض التكلفة والسعر وتاريخ العميل لتحديد سعر مقترح.', 'sales', 'read', 'products.view', false, self::schema(['party_id' => ['type' => 'integer'], 'product_id' => ['type' => 'integer'], 'quantity' => ['type' => 'number']], ['party_id', 'product_id'])),
            self::tool('accounting_copilot', 'accounting.copilot', 'Accounting Copilot', 'Accounting Copilot', 'يعرض إشارات المحاسبة والذمم والسيولة التي تحتاج متابعة.', 'finance', 'read', 'reports.view', false),
            self::tool('employee_mcp', 'employees.overview', 'Employee MCP', 'Employee MCP', 'ملخص الموظفين والمهام وعبء العمل.', 'hr', 'read', 'staff.view', false),

            self::platform('permission_aware_mcp', 'MCP حسب الصلاحيات', 'Permission-aware MCP', 'كل استدعاء يمر بصلاحيات المستخدم ومساحة العمل.', 'security'),
            self::platform('audit_everything', 'تدقيق كامل', 'Audit Everything', 'تسجيل الأداة والمدخلات والحالة والزمن والتكلفة لكل استدعاء.', 'security'),
            self::platform('external_mcp_marketplace', 'MCP Marketplace', 'External MCP Marketplace', 'إدارة اتصالات MCP خارجية ومزودي الأدوات.', 'integrations'),
            self::platform('custom_mcp_builder', 'منشئ MCP مخصص', 'Custom MCP Builder', 'تحويل Endpoint خارجي إلى Tool مضبوط الصلاحيات.', 'integrations'),
            self::platform('webhook_to_mcp', 'Webhook → MCP Tool', 'Webhook → MCP Tool', 'تحويل Webhook آمن إلى أداة قابلة للاستخدام من الوكيل.', 'integrations'),
            self::platform('mcp_workflows', 'MCP Workflows', 'MCP Workflows', 'تجميع أدوات متعددة في Workflow منظم.', 'automation'),
            self::platform('mcp_sandbox', 'MCP Sandbox', 'MCP Sandbox', 'تجربة الأدوات وDry-run قبل منحها للوكيل.', 'developer'),
            self::platform('execution_modes', 'Read / Write / Approve', 'Read / Write / Approve Modes', 'مستويات تنفيذ واضحة لكل مفتاح MCP.', 'security'),
            self::platform('ai_spend_control', 'التحكم بالاستهلاك', 'AI Spend Control', 'حدود يومية وشهرية للاستدعاءات والتكلفة.', 'billing'),
            self::platform('mcp_usage_dashboard', 'لوحة استخدام MCP', 'MCP Usage Dashboard', 'إحصائيات الاستدعاءات والنجاح والأخطاء والأدوات الأعلى استخدامًا.', 'analytics'),
            self::platform('mcp_key_management', 'إدارة مفاتيح MCP', 'MCP Key Management', 'إنشاء وإلغاء مفاتيح مخزنة كـhash مع scopes.', 'security'),
            self::platform('temporary_access', 'وصول مؤقت', 'Temporary Access', 'مفاتيح بتاريخ انتهاء تلقائي.', 'security'),
            self::platform('per_workspace_mcp', 'MCP لكل Workspace', 'Per-Workspace MCP', 'كل مفتاح مقيد بمؤسسة واحدة ولا يقبل تبديل المستأجر من المدخلات.', 'security'),
            self::platform('public_mcp_partners', 'MCP للشركاء', 'Public MCP for Partners', 'مفاتيح Partner محدودة النطاق مع إمكانية تعطيلها على مستوى المؤسسة.', 'integrations'),
        ];
    }

    /** @return array<int, array<string, mixed>> */
    public static function tools(): array
    {
        return array_values(array_filter(self::all(), fn (array $item): bool => $item['kind'] === 'tool'));
    }

    public static function findTool(string $name): ?array
    {
        foreach (self::tools() as $tool) {
            if ($tool['tool'] === $name || $tool['id'] === $name) {
                return $tool;
            }
        }

        return null;
    }

    private static function tool(string $id, string $tool, string $titleAr, string $titleEn, string $description, string $category, string $mode, ?string $permission, bool $approvalRequired, ?array $schema = null): array
    {
        return [
            'id' => $id,
            'tool' => $tool,
            'kind' => 'tool',
            'title_ar' => $titleAr,
            'title_en' => $titleEn,
            'description' => $description,
            'category' => $category,
            'mode' => $mode,
            'permission' => $permission,
            'approval_required' => $approvalRequired,
            'inputSchema' => $schema ?? self::schema(),
        ];
    }

    private static function platform(string $id, string $titleAr, string $titleEn, string $description, string $category): array
    {
        return [
            'id' => $id,
            'tool' => null,
            'kind' => 'platform',
            'title_ar' => $titleAr,
            'title_en' => $titleEn,
            'description' => $description,
            'category' => $category,
            'mode' => 'control',
            'permission' => null,
            'approval_required' => false,
        ];
    }

    private static function idSchema(string $name): array
    {
        return self::schema([$name => ['type' => 'integer']], [$name]);
    }

    private static function schema(array $properties = [], array $required = []): array
    {
        $schema = ['type' => 'object', 'properties' => (object) $properties, 'additionalProperties' => true];

        if ($required !== []) {
            $schema['required'] = $required;
        }

        return $schema;
    }
}
