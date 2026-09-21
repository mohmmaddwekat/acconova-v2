<?php

namespace App\Services;

final class WorkspaceRoleCatalog
{
    /**
     * Return practical role templates for common business structures.
     *
     * These are starting points. The owner remains free to customize every
     * resulting custom role before or after assigning it.
     *
     * @return array<string, array{
     *     name_ar: string,
     *     name_en: string,
     *     description_ar: string,
     *     description_en: string,
     *     category: string,
     *     permissions: list<string>
     * }>
     */
    public static function presets(): array
    {
        return [
            'employee' => [
                'name_ar' => 'موظف عادي',
                'name_en' => 'Employee',
                'description_ar' => 'حساب موظف بدون صلاحيات إدارية إضافية.',
                'description_en' => 'Standard employee without extra administrative authority.',
                'category' => 'staff',
                'permissions' => [],
            ],

            'department_head' => [
                'name_ar' => 'رئيس قسم',
                'name_en' => 'Department Head',
                'description_ar' => 'يرى أعضاء قسمه ويسجل حضورهم دون الوصول لبقية الشركة.',
                'description_en' => 'Can view department members and manage their attendance.',
                'category' => 'staff',
                'permissions' => [
                    'staff.team_view',
                    'staff.team_attendance',

                    'teams.view',
                    'teams.view_workload',
                ],
            ],

            'department_manager' => [
                'name_ar' => 'مدير قسم',
                'name_en' => 'Department Manager',
                'description_ar' => 'إدارة أعضاء القسم والحضور والمستحقات الخاصة بفريقه.',
                'description_en' => 'Can manage department employees, attendance, and team payroll.',
                'category' => 'staff',
                'permissions' => [
                    'staff.team_view',
                    'staff.team_manage',
                    'staff.team_attendance',
                    'staff.team_pay',

                    'teams.view',
                    'teams.create',
                    'teams.update',
                    'teams.archive',
                    'teams.members.manage',
                    'teams.lead.manage',
                    'teams.projects.manage',
                    'teams.subteams.create',
                    'teams.subteams.manage',
                    'teams.move',
                    'teams.view_workload',
                ],
            ],

            'general_manager' => [
                'name_ar' => 'مدير عام',
                'name_en' => 'General Manager',
                'description_ar' => 'صلاحيات تشغيلية واسعة للشركة بدون امتلاك صلاحيات المالك.',
                'description_en' => 'Broad operational authority without workspace ownership.',
                'category' => 'management',
                'permissions' => [
                    'products.view',
                    'products.create',
                    'products.update',
                    'products.service',
                    'products.archive',

                    'parties.view',
                    'parties.create',
                    'parties.update',
                    'parties.archive',

                    'inventory.view',
                    'inventory.manage',

                    'production.view',
                    'production.manage',

                    'payments.view',
                    'payments.create',
                    'payments.update',
                    'payments.record',

                    'finance.sales.view',
                    'finance.sales.manage',
                    'finance.purchases.view',
                    'finance.purchases.manage',
                    'finance.cash.view',
                    'finance.cash.receive',
                    'finance.cash.pay',
                    'finance.cash.correct',
                    'finance.documents.correct',
                    'finance.approvals.review',
                    'finance.taxes.view',
                    'finance.taxes.manage',

                    'staff.view',
                    'staff.manage',
                    'staff.attendance',
                    'staff.import',

                    'teams.view',
                    'teams.create',
                    'teams.update',
                    'teams.archive',
                    'teams.members.manage',
                    'teams.lead.manage',
                    'teams.projects.manage',
                    'teams.subteams.create',
                    'teams.subteams.manage',
                    'teams.move',
                    'teams.view_workload',
                ],
            ],

            'accountant' => [
                'name_ar' => 'محاسب',
                'name_en' => 'Accountant',
                'description_ar' => 'عمليات المصاريف والمدفوعات اليومية مع عرض بيانات التشغيل.',
                'description_en' => 'Daily financial operations with operational read access.',
                'category' => 'finance',
                'permissions' => [
                    'products.view',
                    'parties.view',
                    'inventory.view',

                    'payments.view',
                    'payments.create',
                    'payments.update',
                    'payments.record',

                    'finance.sales.view',
                    'finance.sales.manage',
                    'finance.purchases.view',
                    'finance.purchases.manage',
                    'finance.cash.view',
                    'finance.cash.receive',
                    'finance.cash.pay',
                    'finance.taxes.view',
                ],
            ],

            'finance_manager' => [
                'name_ar' => 'مدير مالي',
                'name_en' => 'Finance Manager',
                'description_ar' => 'صلاحيات مالية كاملة مع الوصول لمستحقات الموظفين.',
                'description_en' => 'Full financial operations including employee payroll.',
                'category' => 'finance',
                'permissions' => [
                    'products.view',
                    'parties.view',
                    'inventory.view',

                    'payments.view',
                    'payments.create',
                    'payments.update',
                    'payments.record',

                    'finance.sales.view',
                    'finance.sales.manage',
                    'finance.purchases.view',
                    'finance.purchases.manage',
                    'finance.cash.view',
                    'finance.cash.receive',
                    'finance.cash.pay',
                    'finance.cash.correct',
                    'finance.documents.correct',
                    'finance.approvals.review',
                    'finance.taxes.view',
                    'finance.taxes.manage',

                    'staff.view',
                    'staff.pay',
                ],
            ],

            'sales_rep' => [
                'name_ar' => 'مندوب مبيعات',
                'name_en' => 'Sales Representative',
                'description_ar' => 'إدارة العملاء وتنفيذ خدمات البيع مع عرض المنتجات.',
                'description_en' => 'Customer operations and service execution with product visibility.',
                'category' => 'sales',
                'permissions' => [
                    'products.view',
                    'products.service',

                    'parties.view',
                    'parties.create',
                    'parties.update',

                    'finance.sales.view',
                    'finance.sales.manage',
                    'finance.cash.view',
                    'finance.cash.receive',
                ],
            ],

            'sales_manager' => [
                'name_ar' => 'مدير مبيعات',
                'name_en' => 'Sales Manager',
                'description_ar' => 'إدارة العملاء والخدمات ومتابعة فريق المبيعات.',
                'description_en' => 'Manages parties, services, and the sales department.',
                'category' => 'sales',
                'permissions' => [
                    'products.view',
                    'products.create',
                    'products.update',
                    'products.service',

                    'parties.view',
                    'parties.create',
                    'parties.update',

                    'finance.sales.view',
                    'finance.sales.manage',
                    'finance.cash.view',
                    'finance.cash.receive',
                    'finance.documents.correct',

                    'staff.team_view',
                    'staff.team_manage',
                    'staff.team_attendance',

                    'teams.view',
                    'teams.create',
                    'teams.update',
                    'teams.members.manage',
                    'teams.lead.manage',
                    'teams.projects.manage',
                    'teams.subteams.create',
                    'teams.subteams.manage',
                    'teams.move',
                    'teams.view_workload',
                ],
            ],

            'inventory_clerk' => [
                'name_ar' => 'مسؤول مخزون',
                'name_en' => 'Inventory Clerk',
                'description_ar' => 'عرض المنتجات والمخزون دون صلاحية تغيير الأرصدة.',
                'description_en' => 'Read-only product and inventory access.',
                'category' => 'inventory',
                'permissions' => [
                    'products.view',
                    'inventory.view',
                ],
            ],

            'inventory_manager' => [
                'name_ar' => 'مدير مخزون',
                'name_en' => 'Inventory Manager',
                'description_ar' => 'إدارة المخزون والمستودعات وحركات المخزون.',
                'description_en' => 'Manages stock, warehouses, and inventory operations.',
                'category' => 'inventory',
                'permissions' => [
                    'products.view',
                    'inventory.view',
                    'inventory.manage',
                ],
            ],

            'production_supervisor' => [
                'name_ar' => 'مشرف إنتاج',
                'name_en' => 'Production Supervisor',
                'description_ar' => 'تشغيل الإنتاج مع عرض المخزون والمواد الخام.',
                'description_en' => 'Runs production with inventory visibility.',
                'category' => 'production',
                'permissions' => [
                    'products.view',
                    'inventory.view',
                    'production.view',
                    'production.manage',
                ],
            ],

            'production_manager' => [
                'name_ar' => 'مدير إنتاج',
                'name_en' => 'Production Manager',
                'description_ar' => 'إدارة الإنتاج والمخزون ومتابعة فريق قسم الإنتاج.',
                'description_en' => 'Manages production, inventory, and the production team.',
                'category' => 'production',
                'permissions' => [
                    'products.view',
                    'products.update',

                    'inventory.view',
                    'inventory.manage',

                    'production.view',
                    'production.manage',

                    'staff.team_view',
                    'staff.team_manage',
                    'staff.team_attendance',

                    'teams.view',
                    'teams.create',
                    'teams.update',
                    'teams.members.manage',
                    'teams.lead.manage',
                    'teams.projects.manage',
                    'teams.subteams.create',
                    'teams.subteams.manage',
                    'teams.move',
                    'teams.view_workload',
                ],
            ],

            'hr_officer' => [
                'name_ar' => 'مسؤول موارد بشرية',
                'name_en' => 'HR Officer',
                'description_ar' => 'إدارة ملفات الموظفين والحضور دون المستحقات المالية.',
                'description_en' => 'Employee and attendance management without payroll.',
                'category' => 'staff',
                'permissions' => [
                    'staff.view',
                    'staff.manage',
                    'staff.attendance',
                    'staff.import',
                ],
            ],

            'hr_manager' => [
                'name_ar' => 'مدير موارد بشرية',
                'name_en' => 'HR Manager',
                'description_ar' => 'إدارة كاملة للموظفين والحضور والمستحقات.',
                'description_en' => 'Full employee, attendance, and payroll administration.',
                'category' => 'staff',
                'permissions' => [
                    'staff.view',
                    'staff.manage',
                    'staff.attendance',
                    'staff.pay',
                    'staff.import',
                ],
            ],

            'operations_manager' => [
                'name_ar' => 'مدير عمليات',
                'name_en' => 'Operations Manager',
                'description_ar' => 'يشرف على التشغيل اليومي والمخزون والإنتاج والفرق دون صلاحيات المالك.',
                'description_en' => 'Runs day-to-day operations across inventory, production, teams, and workflows.',
                'category' => 'management',
                'permissions' => [
                    'products.view',
                    'parties.view',
                    'inventory.view',
                    'inventory.manage',
                    'production.view',
                    'production.manage',
                    'tasks.create',
                    'tasks.view_all',
                    'tasks.assign_all',
                    'tasks.update_all',
                    'tasks.reports',
                    'tasks.projects_manage',
                    'teams.view',
                    'teams.members.manage',
                    'teams.view_workload',
                    'dashboard.view',
                    'intelligence.business_pulse.view',
                    'audit.bulk_actions.view',
                ],
            ],

            'executive_viewer' => [
                'name_ar' => 'إدارة تنفيذية - عرض فقط',
                'name_en' => 'Executive Viewer',
                'description_ar' => 'لوحات وتقارير ومؤشرات الشركة للمتابعة الإدارية دون تعديل العمليات.',
                'description_en' => 'Executive dashboards, reports, and company KPIs without operational editing.',
                'category' => 'management',
                'permissions' => [
                    'dashboard.view',
                    'reports.view',
                    'reports.studio.view',
                    'reports.studio.run',
                    'reports.studio.drill_down',
                    'intelligence.business_pulse.view',
                    'intelligence.cashflow.view',
                    'intelligence.anomalies.view',
                    'intelligence.customers.view',
                    'finance.sales.view',
                    'finance.purchases.view',
                    'finance.cash.view',
                    'finance.taxes.view',
                    'inventory.view',
                    'staff.view',
                    'tasks.reports',
                ],
            ],

            'branch_manager' => [
                'name_ar' => 'مدير فرع',
                'name_en' => 'Branch Manager',
                'description_ar' => 'دور تشغيلي واسع مناسب لمدير فرع أو وحدة أعمال.',
                'description_en' => 'Broad operational access suitable for a branch or business-unit manager.',
                'category' => 'management',
                'permissions' => [
                    'products.view',
                    'products.create',
                    'products.update',
                    'parties.view',
                    'parties.create',
                    'parties.update',
                    'inventory.view',
                    'inventory.manage',
                    'finance.sales.view',
                    'finance.sales.manage',
                    'finance.cash.view',
                    'finance.cash.receive',
                    'finance.cash.pay',
                    'staff.team_view',
                    'staff.team_manage',
                    'staff.team_attendance',
                    'tasks.create',
                    'tasks.view_team',
                    'tasks.assign_team',
                    'tasks.update_team',
                    'tasks.reports',
                    'teams.view',
                    'teams.view_workload',
                    'dashboard.view',
                ],
            ],

            'financial_controller' => [
                'name_ar' => 'مراقب مالي',
                'name_en' => 'Financial Controller',
                'description_ar' => 'رقابة مالية، مراجعات، تقارير، ضرائب، موافقات وتسويات.',
                'description_en' => 'Financial control, reporting, approvals, tax, audit, and reconciliation.',
                'category' => 'finance',
                'permissions' => [
                    'finance.sales.view',
                    'finance.purchases.view',
                    'finance.cash.view',
                    'finance.cash.correct',
                    'finance.documents.correct',
                    'finance.approvals.view',
                    'finance.approvals.review',
                    'finance.taxes.view',
                    'finance.taxes.manage',
                    'finance.reconciliation.view',
                    'finance.reconciliation.import',
                    'finance.reconciliation.match',
                    'finance.reconciliation.ignore',
                    'reports.view',
                    'reports.builder.view',
                    'reports.builder.run',
                    'reports.studio.view',
                    'reports.studio.run',
                    'reports.studio.drill_down',
                    'reports.scheduled.view',
                    'audit.center.view',
                    'dashboard.view',
                ],
            ],

            'senior_accountant' => [
                'name_ar' => 'محاسب أول',
                'name_en' => 'Senior Accountant',
                'description_ar' => 'محاسب بصلاحيات أوسع للتصحيح والتقارير والتسويات.',
                'description_en' => 'Senior accounting access including corrections, reports, and reconciliation.',
                'category' => 'finance',
                'permissions' => [
                    'parties.view',
                    'products.view',
                    'finance.sales.view',
                    'finance.sales.manage',
                    'finance.purchases.view',
                    'finance.purchases.manage',
                    'finance.cash.view',
                    'finance.cash.receive',
                    'finance.cash.pay',
                    'finance.cash.correct',
                    'finance.documents.correct',
                    'finance.taxes.view',
                    'finance.reconciliation.view',
                    'finance.reconciliation.match',
                    'payments.view',
                    'payments.create',
                    'payments.update',
                    'payments.record',
                    'reports.view',
                    'reports.builder.view',
                    'reports.builder.run',
                ],
            ],

            'junior_accountant' => [
                'name_ar' => 'محاسب مساعد',
                'name_en' => 'Junior Accountant',
                'description_ar' => 'إدخال ومتابعة الفواتير والدفعات اليومية دون صلاحيات تصحيح حساسة.',
                'description_en' => 'Daily invoice and payment entry without sensitive correction authority.',
                'category' => 'finance',
                'permissions' => [
                    'parties.view',
                    'products.view',
                    'finance.sales.view',
                    'finance.sales.manage',
                    'finance.purchases.view',
                    'finance.purchases.manage',
                    'finance.cash.view',
                    'finance.cash.receive',
                    'finance.cash.pay',
                    'payments.view',
                    'payments.record',
                ],
            ],

            'accounts_receivable' => [
                'name_ar' => 'محاسب ذمم مدينة',
                'name_en' => 'Accounts Receivable',
                'description_ar' => 'فواتير العملاء والتحصيل ووعود الدفع وأعمار الذمم.',
                'description_en' => 'Customer invoicing, collections, payment promises, and receivables aging.',
                'category' => 'finance',
                'permissions' => [
                    'parties.view',
                    'finance.sales.view',
                    'finance.sales.manage',
                    'finance.cash.view',
                    'finance.cash.receive',
                    'operations.collections.view',
                    'operations.ar_aging.view',
                    'operations.promises.view',
                    'operations.promises.manage',
                    'payments.view',
                    'payments.record',
                    'reports.view',
                ],
            ],

            'accounts_payable' => [
                'name_ar' => 'محاسب ذمم دائنة',
                'name_en' => 'Accounts Payable',
                'description_ar' => 'فواتير الموردين والمدفوعات وأعمار الذمم وطلبات الشراء.',
                'description_en' => 'Supplier invoices, payments, payables aging, and purchase requests.',
                'category' => 'finance',
                'permissions' => [
                    'parties.view',
                    'finance.purchases.view',
                    'finance.purchases.manage',
                    'finance.cash.view',
                    'finance.cash.pay',
                    'operations.ap_aging.view',
                    'finance.requisitions.view',
                    'finance.requisitions.create',
                    'payments.view',
                    'payments.record',
                    'reports.view',
                ],
            ],

            'cashier' => [
                'name_ar' => 'أمين صندوق',
                'name_en' => 'Cashier',
                'description_ar' => 'تسجيل المقبوضات والمدفوعات اليومية ومتابعة الشيكات.',
                'description_en' => 'Records daily receipts, payments, and cheque status.',
                'category' => 'finance',
                'permissions' => [
                    'parties.view',
                    'finance.cash.view',
                    'finance.cash.receive',
                    'finance.cash.pay',
                    'finance.cash.create',
                    'finance.cash.update',
                    'finance.cash.post',
                    'finance.cash.check_status',
                    'finance.cash.duplicate_check',
                ],
            ],

            'treasurer' => [
                'name_ar' => 'أمين خزينة',
                'name_en' => 'Treasurer',
                'description_ar' => 'إدارة النقد والبنوك والتسويات والتدفق النقدي.',
                'description_en' => 'Cash, treasury, bank reconciliation, and cash-flow oversight.',
                'category' => 'finance',
                'permissions' => [
                    'finance.cash.view',
                    'finance.cash.receive',
                    'finance.cash.pay',
                    'finance.cash.correct',
                    'finance.cash.create',
                    'finance.cash.update',
                    'finance.cash.post',
                    'finance.cash.reverse',
                    'finance.cash.check_status',
                    'finance.reconciliation.view',
                    'finance.reconciliation.import',
                    'finance.reconciliation.match',
                    'finance.reconciliation.ignore',
                    'intelligence.cashflow.view',
                    'reports.view',
                ],
            ],

            'tax_accountant' => [
                'name_ar' => 'محاسب ضرائب',
                'name_en' => 'Tax Accountant',
                'description_ar' => 'متخصص في الضرائب والالتزامات الحكومية والتقارير المرتبطة بها.',
                'description_en' => 'Tax rules, government obligations, and tax reporting.',
                'category' => 'finance',
                'permissions' => [
                    'finance.sales.view',
                    'finance.purchases.view',
                    'finance.taxes.view',
                    'finance.taxes.manage',
                    'finance.taxes.rules.manage',
                    'finance.taxes.obligations.manage',
                    'reports.view',
                    'reports.studio.view',
                    'reports.studio.run',
                    'audit.center.view',
                ],
            ],

            'internal_auditor' => [
                'name_ar' => 'مدقق داخلي',
                'name_en' => 'Internal Auditor',
                'description_ar' => 'عرض السجلات المالية والتدقيق والتقارير دون تعديل البيانات التشغيلية.',
                'description_en' => 'Read-oriented access to finance, audit trails, controls, and reports.',
                'category' => 'finance',
                'permissions' => [
                    'finance.sales.view',
                    'finance.purchases.view',
                    'finance.cash.view',
                    'finance.taxes.view',
                    'inventory.view',
                    'parties.view',
                    'products.view',
                    'audit.center.view',
                    'audit.bulk_actions.view',
                    'reports.view',
                    'reports.builder.view',
                    'reports.builder.run',
                    'reports.studio.view',
                    'reports.studio.run',
                    'controls.data_quality.view',
                ],
            ],

            'finance_approver' => [
                'name_ar' => 'معتمد مالي',
                'name_en' => 'Finance Approver',
                'description_ar' => 'مراجعة واعتماد الطلبات المالية وطلبات الشراء والمصاريف.',
                'description_en' => 'Reviews finance approvals, purchase requests, and expense claims.',
                'category' => 'finance',
                'permissions' => [
                    'finance.sales.view',
                    'finance.purchases.view',
                    'finance.cash.view',
                    'finance.approvals.view',
                    'finance.approvals.review',
                    'finance.requisitions.view',
                    'finance.requisitions.review',
                    'controls.expense_claims.view',
                    'controls.expense_claims.review',
                ],
            ],

            'procurement_manager' => [
                'name_ar' => 'مدير مشتريات',
                'name_en' => 'Procurement Manager',
                'description_ar' => 'إدارة الموردين والطلبات وأوامر الشراء والتكاليف المحملة.',
                'description_en' => 'Supplier, requisition, purchase-order, and landed-cost management.',
                'category' => 'inventory',
                'permissions' => [
                    'parties.view',
                    'parties.create',
                    'parties.update',
                    'products.view',
                    'finance.purchases.view',
                    'finance.purchases.manage',
                    'finance.requisitions.view',
                    'finance.requisitions.create',
                    'finance.requisitions.review',
                    'finance.requisitions.convert',
                    'operations.purchase_orders.view',
                    'operations.purchase_orders.manage',
                    'operations.purchase_orders.convert',
                    'controls.landed_costs.view',
                    'controls.landed_costs.manage',
                    'staff.team_view',
                    'teams.view',
                    'tasks.create',
                    'tasks.view_team',
                    'tasks.assign_team',
                ],
            ],

            'buyer' => [
                'name_ar' => 'موظف مشتريات',
                'name_en' => 'Buyer / Procurement Officer',
                'description_ar' => 'إدخال طلبات وأوامر الشراء ومتابعة الموردين.',
                'description_en' => 'Creates purchase requests/orders and follows supplier activity.',
                'category' => 'inventory',
                'permissions' => [
                    'parties.view',
                    'parties.create',
                    'products.view',
                    'finance.purchases.view',
                    'finance.requisitions.view',
                    'finance.requisitions.create',
                    'operations.purchase_orders.view',
                    'operations.purchase_orders.manage',
                    'controls.landed_costs.view',
                ],
            ],

            'sales_supervisor' => [
                'name_ar' => 'مشرف مبيعات',
                'name_en' => 'Sales Supervisor',
                'description_ar' => 'متابعة فريق المبيعات والعملاء والعروض والتحصيل.',
                'description_en' => 'Supervises sales staff, customers, quotations, pipeline, and collections.',
                'category' => 'sales',
                'permissions' => [
                    'products.view',
                    'parties.view',
                    'parties.create',
                    'parties.update',
                    'finance.sales.view',
                    'finance.sales.manage',
                    'finance.cash.view',
                    'operations.quotations.view',
                    'operations.quotations.manage',
                    'operations.pipeline.view',
                    'operations.pipeline.manage',
                    'operations.collections.view',
                    'operations.ar_aging.view',
                    'staff.team_view',
                    'teams.view',
                    'teams.view_workload',
                    'tasks.create',
                    'tasks.view_team',
                    'tasks.assign_team',
                    'tasks.update_team',
                ],
            ],

            'collections_officer' => [
                'name_ar' => 'موظف تحصيل',
                'name_en' => 'Collections Officer',
                'description_ar' => 'متابعة الذمم ووعود الدفع والتحصيل وتسجيل المقبوضات.',
                'description_en' => 'Tracks receivables, payment promises, collections, and receipts.',
                'category' => 'sales',
                'permissions' => [
                    'parties.view',
                    'parties.update',
                    'finance.sales.view',
                    'finance.cash.view',
                    'finance.cash.receive',
                    'operations.collections.view',
                    'operations.ar_aging.view',
                    'operations.promises.view',
                    'operations.promises.manage',
                    'collaboration.comments.manage',
                    'collaboration.reminders.manage',
                ],
            ],

            'customer_service' => [
                'name_ar' => 'خدمة عملاء',
                'name_en' => 'Customer Service',
                'description_ar' => 'عرض وتحديث بيانات العملاء والتعليقات والتذكيرات والضمانات.',
                'description_en' => 'Customer records, comments, reminders, warranties, and service follow-up.',
                'category' => 'sales',
                'permissions' => [
                    'parties.view',
                    'parties.update',
                    'parties.insights.view',
                    'products.view',
                    'products.service_operations.view',
                    'operations.warranties.view',
                    'operations.promises.view',
                    'collaboration.view',
                    'collaboration.comments.manage',
                    'collaboration.reminders.manage',
                    'collaboration.attachments.manage',
                ],
            ],

            'crm_specialist' => [
                'name_ar' => 'مسؤول CRM',
                'name_en' => 'CRM Specialist',
                'description_ar' => 'إدارة قاعدة العملاء والفرص والمتابعات والعلاقات.',
                'description_en' => 'Manages customer records, opportunities, follow-ups, and relationships.',
                'category' => 'sales',
                'permissions' => [
                    'parties.view',
                    'parties.create',
                    'parties.update',
                    'parties.insights.view',
                    'operations.pipeline.view',
                    'operations.pipeline.manage',
                    'operations.promises.view',
                    'collaboration.view',
                    'collaboration.comments.manage',
                    'collaboration.reminders.manage',
                    'collaboration.relationships.manage',
                    'intelligence.customers.view',
                ],
            ],

            'storekeeper' => [
                'name_ar' => 'أمين مستودع',
                'name_en' => 'Storekeeper',
                'description_ar' => 'حركات المخزون اليومية والاستلام والتحويل والتسوية.',
                'description_en' => 'Daily warehouse stock, transfers, opening stock, and adjustments.',
                'category' => 'inventory',
                'permissions' => [
                    'products.view',
                    'inventory.view',
                    'inventory.product.view',
                    'inventory.opening_stock.manage',
                    'inventory.adjustments.manage',
                    'inventory.stock_transfer.manage',
                    'inventory.transfer_requests.view',
                    'inventory.transfer_requests.create',
                    'inventory.warehouses.view',
                ],
            ],

            'warehouse_supervisor' => [
                'name_ar' => 'مشرف مستودع',
                'name_en' => 'Warehouse Supervisor',
                'description_ar' => 'إشراف على المستودعات والتحويلات والتسويات والأرصدة.',
                'description_en' => 'Supervises warehouses, stock transfers, adjustments, and balances.',
                'category' => 'inventory',
                'permissions' => [
                    'products.view',
                    'inventory.view',
                    'inventory.overview.view',
                    'inventory.product.view',
                    'inventory.adjustments.manage',
                    'inventory.stock_transfer.manage',
                    'inventory.transfer_requests.view',
                    'inventory.transfer_requests.create',
                    'inventory.transfer_requests.review',
                    'inventory.warehouses.view',
                    'inventory.warehouses.manage',
                    'staff.team_view',
                    'teams.view',
                    'teams.view_workload',
                ],
            ],

            'stock_controller' => [
                'name_ar' => 'مراقب مخزون',
                'name_en' => 'Stock Controller',
                'description_ar' => 'متابعة الأرصدة والذكاء والتنبيهات وجودة بيانات المخزون.',
                'description_en' => 'Monitors stock balances, intelligence, alerts, and inventory data quality.',
                'category' => 'inventory',
                'permissions' => [
                    'products.view',
                    'products.insights.view',
                    'inventory.view',
                    'inventory.overview.view',
                    'inventory.intelligence.view',
                    'inventory.product.view',
                    'operations.serials.view',
                    'operations.batches.view',
                    'controls.expiry_alerts.view',
                    'controls.data_quality.view',
                    'reports.view',
                ],
            ],

            'logistics_coordinator' => [
                'name_ar' => 'منسق لوجستي',
                'name_en' => 'Logistics Coordinator',
                'description_ar' => 'تنسيق التحويلات والمخزون والأوامر المتأخرة والتنفيذ.',
                'description_en' => 'Coordinates transfers, inventory, backorders, and fulfillment.',
                'category' => 'inventory',
                'permissions' => [
                    'products.view',
                    'inventory.view',
                    'inventory.transfer_requests.view',
                    'inventory.transfer_requests.create',
                    'operations.backorders.view',
                    'finance.fulfillments.view',
                    'finance.fulfillments.manage',
                    'operations.sales_orders.view',
                    'operations.purchase_orders.view',
                    'collaboration.comments.manage',
                    'collaboration.reminders.manage',
                ],
            ],

            'production_operator' => [
                'name_ar' => 'مشغل إنتاج',
                'name_en' => 'Production Operator',
                'description_ar' => 'تنفيذ تشغيلات الإنتاج اليومية دون إدارة واسعة للمخزون.',
                'description_en' => 'Executes day-to-day production runs without broad inventory administration.',
                'category' => 'production',
                'permissions' => [
                    'products.view',
                    'inventory.view',
                    'production.view',
                    'production.runs.view',
                    'production.runs.create',
                    'production.runs.update',
                    'production.runs.post',
                ],
            ],

            'production_planner' => [
                'name_ar' => 'مخطط إنتاج',
                'name_en' => 'Production Planner',
                'description_ar' => 'تخطيط الإنتاج والوصفات ومتابعة المخزون والتشغيلات.',
                'description_en' => 'Plans production, recipes, stock requirements, and production runs.',
                'category' => 'production',
                'permissions' => [
                    'products.view',
                    'inventory.view',
                    'inventory.intelligence.view',
                    'production.view',
                    'production.recipes.view',
                    'production.recipes.manage',
                    'production.runs.view',
                    'production.runs.create',
                    'tasks.create',
                    'tasks.view_team',
                    'tasks.assign_team',
                ],
            ],

            'quality_controller' => [
                'name_ar' => 'مراقب جودة',
                'name_en' => 'Quality Controller',
                'description_ar' => 'عرض الإنتاج والدفعات والبيانات والمرفقات لمتابعة الجودة.',
                'description_en' => 'Reviews production, batches, data quality, attachments, and audit information.',
                'category' => 'production',
                'permissions' => [
                    'products.view',
                    'inventory.view',
                    'production.view',
                    'production.runs.view',
                    'operations.batches.view',
                    'operations.serials.view',
                    'controls.data_quality.view',
                    'collaboration.view',
                    'collaboration.comments.manage',
                    'collaboration.attachments.manage',
                    'audit.center.view',
                ],
            ],

            'payroll_officer' => [
                'name_ar' => 'مسؤول رواتب',
                'name_en' => 'Payroll Officer',
                'description_ar' => 'متابعة مستحقات ورواتب الموظفين والتعديلات المتعلقة بها.',
                'description_en' => 'Manages employee payroll, entitlements, and payroll adjustments.',
                'category' => 'staff',
                'permissions' => [
                    'staff.view',
                    'staff.pay',
                    'staff.workforce.view',
                    'staff.workforce.adjustments.manage',
                ],
            ],

            'attendance_officer' => [
                'name_ar' => 'مسؤول دوام',
                'name_en' => 'Attendance Officer',
                'description_ar' => 'متابعة وإدارة حضور ودوام الموظفين دون الوصول للرواتب.',
                'description_en' => 'Manages employee attendance without payroll authority.',
                'category' => 'staff',
                'permissions' => [
                    'staff.view',
                    'staff.attendance',
                    'staff.workforce.view',
                ],
            ],

            'hr_assistant' => [
                'name_ar' => 'مساعد موارد بشرية',
                'name_en' => 'HR Assistant',
                'description_ar' => 'ملفات الموظفين والدعوات والاستيراد والمتابعة الأساسية.',
                'description_en' => 'Supports employee records, invitations, imports, and routine HR work.',
                'category' => 'staff',
                'permissions' => [
                    'staff.view',
                    'staff.manage',
                    'staff.import',
                    'staff.invitations.manage',
                    'staff.workforce.view',
                ],
            ],

            'team_leader' => [
                'name_ar' => 'قائد فريق',
                'name_en' => 'Team Leader',
                'description_ar' => 'إدارة مهام وأعضاء فريقه ومتابعة عبء العمل.',
                'description_en' => 'Manages team tasks, members, assignment, and workload.',
                'category' => 'staff',
                'permissions' => [
                    'staff.team_view',
                    'tasks.create',
                    'tasks.view_team',
                    'tasks.assign_team',
                    'tasks.update_team',
                    'tasks.reports',
                    'teams.view',
                    'teams.members.manage',
                    'teams.view_workload',
                ],
            ],

            'project_manager' => [
                'name_ar' => 'مدير مشاريع',
                'name_en' => 'Project Manager',
                'description_ar' => 'إدارة المشاريع والمهام والفرق والتقارير المرتبطة بها.',
                'description_en' => 'Manages projects, tasks, assignments, teams, and project reporting.',
                'category' => 'management',
                'permissions' => [
                    'tasks.create',
                    'tasks.view_all',
                    'tasks.assign_all',
                    'tasks.update_all',
                    'tasks.archive',
                    'tasks.reports',
                    'tasks.projects_manage',
                    'teams.view',
                    'teams.projects.manage',
                    'teams.view_workload',
                    'staff.view',
                ],
            ],

            'project_coordinator' => [
                'name_ar' => 'منسق مشاريع',
                'name_en' => 'Project Coordinator',
                'description_ar' => 'إنشاء ومتابعة المهام والمشاريع داخل الفريق.',
                'description_en' => 'Coordinates project tasks, assignments, and team progress.',
                'category' => 'management',
                'permissions' => [
                    'tasks.create',
                    'tasks.view_team',
                    'tasks.assign_team',
                    'tasks.update_team',
                    'tasks.reports',
                    'teams.view',
                    'teams.view_workload',
                ],
            ],

            'task_contributor' => [
                'name_ar' => 'عضو فريق مهام',
                'name_en' => 'Task Contributor',
                'description_ar' => 'موظف يعمل على المهام المسندة إليه ويشارك في مساحة الفريق.',
                'description_en' => 'Works on assigned tasks and collaborates with the team.',
                'category' => 'staff',
                'permissions' => [
                    'tasks.create',
                    'teamspace.view',
                    'teamspace.people.view',
                    'teamspace.messages.view',
                    'teamspace.messages.send',
                    'collaboration.view',
                    'collaboration.comments.manage',
                    'collaboration.attachments.manage',
                ],
            ],

            'business_analyst' => [
                'name_ar' => 'محلل أعمال',
                'name_en' => 'Business Analyst',
                'description_ar' => 'تقارير وتحليلات وذكاء أعمال مع وصول قراءة للبيانات التشغيلية.',
                'description_en' => 'Business intelligence and reporting with read access to operational data.',
                'category' => 'management',
                'permissions' => [
                    'products.view',
                    'parties.view',
                    'inventory.view',
                    'finance.sales.view',
                    'finance.purchases.view',
                    'finance.cash.view',
                    'reports.view',
                    'reports.builder.view',
                    'reports.builder.create',
                    'reports.builder.update',
                    'reports.builder.run',
                    'reports.studio.view',
                    'reports.studio.run',
                    'reports.studio.drill_down',
                    'reports.studio.visualizations.manage',
                    'reports.studio.configuration.manage',
                    'intelligence.business_pulse.view',
                    'intelligence.customers.view',
                    'inventory.intelligence.view',
                    'dashboard.view',
                ],
            ],

            'report_analyst' => [
                'name_ar' => 'محلل تقارير',
                'name_en' => 'Reporting Analyst',
                'description_ar' => 'بناء وتشغيل وحفظ تقارير ولوحات وتقارير مجدولة.',
                'description_en' => 'Builds, runs, visualizes, and schedules business reports.',
                'category' => 'management',
                'permissions' => [
                    'finance.sales.view',
                    'finance.purchases.view',
                    'finance.cash.view',
                    'reports.view',
                    'reports.builder.view',
                    'reports.builder.create',
                    'reports.builder.update',
                    'reports.builder.run',
                    'reports.builder.versions.view',
                    'reports.studio.view',
                    'reports.studio.run',
                    'reports.studio.drill_down',
                    'reports.studio.visualizations.manage',
                    'reports.studio.configuration.manage',
                    'reports.studio.snapshots.create',
                    'reports.studio.annotations.manage',
                    'reports.studio.comments.manage',
                    'reports.studio.presets.manage',
                    'reports.studio.boards.manage',
                    'reports.scheduled.view',
                ],
            ],

            'compliance_officer' => [
                'name_ar' => 'مسؤول امتثال',
                'name_en' => 'Compliance Officer',
                'description_ar' => 'الضرائب والموافقات والتدقيق والعقود وانتهاء الوثائق.',
                'description_en' => 'Tax, approvals, audit, contracts, and document-expiry compliance.',
                'category' => 'management',
                'permissions' => [
                    'finance.taxes.view',
                    'finance.approvals.view',
                    'audit.center.view',
                    'controls.contracts.view',
                    'controls.document_expiry.view',
                    'controls.expiry_alerts.view',
                    'controls.data_quality.view',
                    'reports.view',
                    'reports.studio.view',
                    'reports.studio.run',
                ],
            ],

            'expense_reviewer' => [
                'name_ar' => 'مراجع مصاريف',
                'name_en' => 'Expense Reviewer',
                'description_ar' => 'مراجعة مطالبات المصاريف والإيصالات وحدود الإنفاق.',
                'description_en' => 'Reviews expense claims, receipts, and spending controls.',
                'category' => 'finance',
                'permissions' => [
                    'controls.expense_claims.view',
                    'controls.expense_claims.review',
                    'controls.expense_claims.receipts.manage',
                    'controls.spending_limits.view',
                    'finance.approvals.view',
                ],
            ],

            'document_controller' => [
                'name_ar' => 'مسؤول وثائق',
                'name_en' => 'Document Controller',
                'description_ar' => 'متابعة المرفقات والعقود والوثائق المنتهية والتذكيرات.',
                'description_en' => 'Controls attachments, contracts, expiring documents, and reminders.',
                'category' => 'staff',
                'permissions' => [
                    'parties.view',
                    'controls.contracts.view',
                    'controls.document_expiry.view',
                    'controls.document_expiry.manage',
                    'collaboration.view',
                    'collaboration.attachments.manage',
                    'collaboration.reminders.manage',
                    'notifications.view',
                ],
            ],

            'data_entry' => [
                'name_ar' => 'مدخل بيانات',
                'name_en' => 'Data Entry Clerk',
                'description_ar' => 'إضافة وتحديث البيانات الأساسية دون صلاحيات حذف أو اعتماد حساسة.',
                'description_en' => 'Creates and updates routine master data without sensitive delete or approval authority.',
                'category' => 'staff',
                'permissions' => [
                    'products.view',
                    'products.create',
                    'products.update',
                    'parties.view',
                    'parties.create',
                    'parties.update',
                    'collaboration.view',
                    'collaboration.comments.manage',
                    'workspace.record_customization.manage',
                ],
            ],

            'workspace_admin' => [
                'name_ar' => 'مسؤول إعدادات النظام',
                'name_en' => 'Workspace Administrator',
                'description_ar' => 'إدارة إعدادات الشركة والتخصيصات والإشعارات دون امتلاك صلاحية المالك.',
                'description_en' => 'Manages workspace settings, customization, and notification rules without ownership.',
                'category' => 'management',
                'permissions' => [
                    'workspace.settings.view',
                    'workspace.settings.manage',
                    'workspace.logo.manage',
                    'workspace.customization.view',
                    'workspace.custom_fields.manage',
                    'workspace.custom_statuses.manage',
                    'workspace.approval_rules.manage',
                    'workspace.record_customization.manage',
                    'notifications.view',
                    'notifications.rules.manage',
                    'audit.system_checks.view',
                ],
            ],

            'communications_admin' => [
                'name_ar' => 'مسؤول تواصل داخلي',
                'name_en' => 'Internal Communications Admin',
                'description_ar' => 'إدارة مساحة الفريق والمجموعات والمحادثات والإشعارات.',
                'description_en' => 'Administers Team Space groups, members, settings, and notifications.',
                'category' => 'staff',
                'permissions' => [
                    'teamspace.view',
                    'teamspace.people.view',
                    'teamspace.groups.create',
                    'teamspace.messages.view',
                    'teamspace.messages.send',
                    'teamspace.members.manage',
                    'teamspace.settings.view',
                    'teamspace.settings.manage',
                    'teamspace.admins.manage',
                    'teamspace.restrictions.manage',
                    'teamspace.library.view',
                    'notifications.view',
                    'notifications.rules.manage',
                ],
            ],

            'readonly_employee' => [
                'name_ar' => 'موظف عرض فقط',
                'name_en' => 'Read-only Employee',
                'description_ar' => 'عرض البيانات الأساسية بدون إنشاء أو تعديل.',
                'description_en' => 'Read-only access to common workspace data.',
                'category' => 'staff',
                'permissions' => [
                    'products.view',
                    'parties.view',
                    'inventory.view',
                    'production.view',
                    'teamspace.view',
                    'teamspace.people.view',
                    'teamspace.messages.view',
                    'notifications.view',
                    'dashboard.view',
                ],
            ],
        ];
    }

    /**
     * Return the permission matrix represented by one built-in membership role.
     *
     * Custom roles remain the source of truth whenever a membership has a
     * workspace_role_id. These values describe the legacy/system roles still
     * supported by policies and authorization services.
     *
     * @return list<string>
     */
    public static function builtInPermissions(
        string $role,
    ): array {
        if (
            in_array(
                $role,
                [
                    'owner',
                    'admin',
                ],
                true,
            )
        ) {
            return WorkspacePermissions::keys();
        }

        if ($role === 'manager') {
            return self::normalizePermissions([
                'products.view',
                'products.create',
                'products.update',
                'products.service',
                'products.archive',

                'parties.view',
                'parties.create',
                'parties.update',
                'parties.archive',

                'inventory.view',
                'inventory.manage',

                'production.view',
                'production.manage',

                'payments.view',
                'payments.create',
                'payments.update',
                'payments.record',

                'finance.sales.view',
                'finance.sales.manage',
                'finance.purchases.view',
                'finance.purchases.manage',
                'finance.cash.view',
                'finance.cash.receive',
                'finance.cash.pay',
                'finance.cash.correct',
                'finance.documents.correct',
                'finance.approvals.review',
                'finance.taxes.view',
                'finance.taxes.manage',

                'tasks.create',
                'tasks.view_team',
                'tasks.view_all',
                'tasks.assign_team',
                'tasks.assign_all',
                'tasks.update_team',
                'tasks.update_all',
                'tasks.archive',
                'tasks.reports',
                'tasks.projects_manage',

                'teams.view',
                'teams.create',
                'teams.update',
                'teams.archive',
                'teams.members.manage',
                'teams.lead.manage',
                'teams.projects.manage',
                'teams.subteams.create',
                'teams.subteams.manage',
                'teams.move',
                'teams.view_workload',
            ]);
        }

        if ($role === 'accountant') {
            return self::normalizePermissions([
                'products.view',
                'products.create',
                'products.update',

                'parties.view',
                'parties.create',
                'parties.update',

                'production.view',

                'payments.view',
                'payments.create',
                'payments.update',
                'payments.record',

                'finance.sales.view',
                'finance.sales.manage',
                'finance.purchases.view',
                'finance.purchases.manage',
                'finance.cash.view',
                'finance.cash.receive',
                'finance.cash.pay',
                'finance.taxes.view',
            ]);
        }

        return [
            'products.view',
            'parties.view',
            'production.view',
        ];
    }

    /**
     * Resolve one role preset.
     *
     * @return array<string, mixed>|null
     */
    public static function preset(
        string $key,
    ): ?array {
        return self::presets()[$key]
            ?? null;
    }

    /**
     * Add required read/scope dependencies to a permission selection.
     *
     * @param  list<string>  $permissions
     * @return list<string>
     */
    public static function normalizePermissions(
        array $permissions,
    ): array {
        $normalized =
            array_values(
                array_unique(
                    $permissions,
                ),
            );

        foreach (
            $normalized as $permission
        ) {
            if (
                str_starts_with(
                    $permission,
                    'teams.',
                )
                && $permission !==
                'teams.view'
            ) {
                $normalized[] = 'teams.view';
            }

            if (
                $permission ===
                'teams.subteams.create'
            ) {
                $normalized[] = 'teams.create';
            }
            if (
                str_starts_with(
                    $permission,
                    'products.',
                )
                && $permission !==
                'products.view'
            ) {
                $normalized[] =
                    'products.view';
            }

            if (
                str_starts_with(
                    $permission,
                    'parties.',
                )
                && $permission !==
                'parties.view'
            ) {
                $normalized[] =
                    'parties.view';
            }

            if (
                $permission ===
                'products.service'
            ) {
                $normalized[] =
                    'parties.view';
            }

            if (
                $permission ===
                'inventory.manage'
            ) {
                $normalized[] =
                    'inventory.view';

                $normalized[] =
                    'products.view';
            }

            if (
                $permission ===
                'production.view'
            ) {
                $normalized[] =
                    'inventory.view';

                $normalized[] =
                    'products.view';
            }

            if (
                $permission ===
                'production.manage'
            ) {
                $normalized[] =
                    'production.view';

                $normalized[] =
                    'inventory.view';

                $normalized[] =
                    'products.view';
            }

            if (
                str_starts_with(
                    $permission,
                    'payments.',
                )
                && $permission !==
                'payments.view'
            ) {
                $normalized[] =
                    'payments.view';
            }

            if ($permission === 'finance.sales.manage') {
                $normalized[] = 'finance.sales.view';
                $normalized[] = 'parties.view';
                $normalized[] = 'products.view';
            }

            if ($permission === 'finance.purchases.manage') {
                $normalized[] = 'finance.purchases.view';
                $normalized[] = 'parties.view';
                $normalized[] = 'products.view';
            }

            if (
                in_array(
                    $permission,
                    [
                        'finance.cash.receive',
                        'finance.cash.pay',
                        'finance.cash.correct',
                    ],
                    true,
                )
            ) {
                $normalized[] = 'finance.cash.view';
                $normalized[] = 'parties.view';

                if ($permission === 'finance.cash.receive') {
                    $normalized[] = 'finance.sales.view';
                }

                if ($permission === 'finance.cash.pay') {
                    $normalized[] = 'finance.purchases.view';
                }
            }

            if ($permission === 'finance.documents.correct') {
                $normalized[] = 'finance.sales.view';
                $normalized[] = 'finance.purchases.view';
            }

            if ($permission === 'finance.taxes.manage') {
                $normalized[] = 'finance.taxes.view';
            }

            if (
                in_array(
                    $permission,
                    [
                        'staff.manage',
                        'staff.attendance',
                        'staff.pay',
                    ],
                    true,
                )
            ) {
                $normalized[] =
                    'staff.view';
            }

            if (
                $permission ===
                'staff.import'
            ) {
                $normalized[] =
                    'staff.view';

                $normalized[] =
                    'staff.manage';
            }

            if (
                in_array(
                    $permission,
                    [
                        'staff.team_manage',
                        'staff.team_attendance',
                        'staff.team_pay',
                    ],
                    true,
                )
            ) {
                $normalized[] =
                    'staff.team_view';
            }
        }

        return WorkspaceFeaturePermissions::normalize(
            array_values(
                array_unique(
                    $normalized,
                ),
            ),
        );
    }
}
