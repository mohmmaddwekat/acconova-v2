<?php

namespace App\Services;

use App\Models\User;
use App\Tenancy\TenantContext;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

final class WorkspaceFeaturePermissions
{
    /**
     * Central permission catalog for assignable workspace capabilities.
     *
     * Each permission may declare:
     * - legacy: broad permissions that represented the capability before the
     *   granular permission catalog existed.
     * - depends: permissions that are automatically added when this permission
     *   is selected.
     * - builtin: built-in membership roles that receive the capability without
     *   a custom role.
     *
     * @return array<string, array<string, mixed>>
     */
    public static function groups(): array
    {
        return [
            'tasks' => [
                'key' => 'tasks',
                'title_ar' => 'إدارة المهام والمشاريع',
                'title_en' => 'Tasks & Projects',
                'description_ar' => 'إنشاء المهام ونطاق عرضها وإسنادها وتعديلها والمشاريع والتقارير.',
                'description_en' => 'Task creation, visibility, assignment, editing, projects and reports.',
                'icon' => 'tasks',
                'permissions' => [
                    [
                        'key' => 'tasks.create',
                        'label_ar' => 'إنشاء مهام',
                        'label_en' => 'Create tasks',
                    ],
                    [
                        'key' => 'tasks.view_team',
                        'label_ar' => 'عرض مهام القسم',
                        'label_en' => 'View department tasks',
                    ],
                    [
                        'key' => 'tasks.view_all',
                        'label_ar' => 'عرض جميع مهام الشركة',
                        'label_en' => 'View all company tasks',
                    ],
                    [
                        'key' => 'tasks.assign_team',
                        'label_ar' => 'إسناد المهام داخل القسم',
                        'label_en' => 'Assign tasks within department',
                    ],
                    [
                        'key' => 'tasks.assign_all',
                        'label_ar' => 'إسناد المهام لأي موظف',
                        'label_en' => 'Assign tasks to any employee',
                    ],
                    [
                        'key' => 'tasks.update_team',
                        'label_ar' => 'تعديل مهام القسم',
                        'label_en' => 'Edit department tasks',
                    ],
                    [
                        'key' => 'tasks.update_all',
                        'label_ar' => 'تعديل جميع المهام',
                        'label_en' => 'Edit all tasks',
                    ],
                    [
                        'key' => 'tasks.archive',
                        'label_ar' => 'أرشفة المهام',
                        'label_en' => 'Archive tasks',
                    ],
                    [
                        'key' => 'tasks.reports',
                        'label_ar' => 'عرض تقارير المهام',
                        'label_en' => 'View task reports',
                    ],
                    [
                        'key' => 'tasks.projects_manage',
                        'label_ar' => 'إنشاء وإدارة المشاريع',
                        'label_en' => 'Create and manage projects',
                    ],
                ],
            ],
            'teams' => [
                'key' => 'teams',
                'title_ar' => 'الفرق والهيكل التنظيمي',
                'title_en' => 'Teams & Hierarchy',
                'description_ar' => 'الفرق والفرق الفرعية والأعضاء والقادة والمشاريع وعبء العمل.',
                'description_en' => 'Teams, sub-teams, members, leaders, projects and workload.',
                'icon' => 'teams',
                'permissions' => [
                    [
                        'key' => 'teams.view',
                        'label_ar' => 'عرض الفرق والهيكل',
                        'label_en' => 'View teams and hierarchy',
                    ],
                    [
                        'key' => 'teams.create',
                        'label_ar' => 'إنشاء فريق رئيسي',
                        'label_en' => 'Create top-level teams',
                    ],
                    [
                        'key' => 'teams.update',
                        'label_ar' => 'تعديل بيانات الفريق',
                        'label_en' => 'Edit team details',
                    ],
                    [
                        'key' => 'teams.archive',
                        'label_ar' => 'أرشفة الفرق',
                        'label_en' => 'Archive teams',
                    ],
                    [
                        'key' => 'teams.members.manage',
                        'label_ar' => 'إدارة أعضاء الفرق',
                        'label_en' => 'Manage team members',
                    ],
                    [
                        'key' => 'teams.lead.manage',
                        'label_ar' => 'إدارة قائد الفريق',
                        'label_en' => 'Manage team lead',
                    ],
                    [
                        'key' => 'teams.projects.manage',
                        'label_ar' => 'ربط المشاريع بالفرق',
                        'label_en' => 'Link projects to teams',
                    ],
                    [
                        'key' => 'teams.subteams.create',
                        'label_ar' => 'إنشاء فرق فرعية',
                        'label_en' => 'Create sub-teams',
                    ],
                    [
                        'key' => 'teams.subteams.manage',
                        'label_ar' => 'إدارة الفرق الفرعية',
                        'label_en' => 'Manage sub-teams',
                    ],
                    [
                        'key' => 'teams.move',
                        'label_ar' => 'نقل فريق داخل الشجرة',
                        'label_en' => 'Move teams in hierarchy',
                    ],
                    [
                        'key' => 'teams.view_workload',
                        'label_ar' => 'عرض عبء العمل',
                        'label_en' => 'View team workload',
                    ],
                ],
            ],
            'products' => [
                'key' => 'products',
                'title_ar' => 'المنتجات والخدمات',
                'title_en' => 'Products & Services',
                'description_ar' => 'الكتالوج والخدمات والاستيراد والتصدير والتحليلات والوصفات.',
                'description_en' => 'Catalog, services, import/export, insights and recipes.',
                'icon' => 'products',
                'permissions' => [
                    [
                        'key' => 'products.view',
                        'label_ar' => 'عرض المنتجات',
                        'label_en' => 'View products',
                    ],
                    [
                        'key' => 'products.create',
                        'label_ar' => 'إضافة منتج',
                        'label_en' => 'Create products',
                    ],
                    [
                        'key' => 'products.update',
                        'label_ar' => 'تعديل المنتجات',
                        'label_en' => 'Edit products',
                    ],
                    [
                        'key' => 'products.service',
                        'label_ar' => 'تسجيل عمليات الخدمة',
                        'label_en' => 'Record service operations',
                    ],
                    [
                        'key' => 'products.manage',
                        'label_ar' => 'إدارة كاملة للمنتجات',
                        'label_en' => 'Full product management',
                    ],
                    [
                        'key' => 'products.archive',
                        'label_ar' => 'أرشفة واستعادة المنتجات',
                        'label_en' => 'Archive & restore products',
                    ],
                    [
                        'key' => 'products.insights.view',
                        'label_ar' => 'عرض Product 360 والتحليلات',
                        'label_en' => 'View Product 360 & insights',
                        'legacy' => ['products.view'],
                        'depends' => ['products.view'],
                    ],
                    [
                        'key' => 'products.import.preview',
                        'label_ar' => 'معاينة استيراد المنتجات',
                        'label_en' => 'Preview product import',
                        'legacy' => ['products.create'],
                        'depends' => ['products.view'],
                    ],
                    [
                        'key' => 'products.import.commit',
                        'label_ar' => 'تنفيذ استيراد المنتجات',
                        'label_en' => 'Commit product import',
                        'legacy' => ['products.create'],
                        'depends' => ['products.create'],
                    ],
                    [
                        'key' => 'products.export',
                        'label_ar' => 'تصدير المنتجات',
                        'label_en' => 'Export products',
                        'legacy' => ['products.view'],
                        'depends' => ['products.view'],
                    ],
                    [
                        'key' => 'products.bulk.edit',
                        'label_ar' => 'تعديل المنتجات بالجملة',
                        'label_en' => 'Bulk edit products',
                        'legacy' => ['products.update'],
                        'depends' => ['products.update'],
                    ],
                    [
                        'key' => 'products.bulk.actions',
                        'label_ar' => 'عمليات المنتجات الجماعية',
                        'label_en' => 'Bulk product actions',
                        'legacy' => ['products.manage'],
                        'depends' => ['products.view'],
                    ],
                    [
                        'key' => 'products.delete_permanent',
                        'label_ar' => 'حذف منتج نهائيًا',
                        'label_en' => 'Permanently delete products',
                        'legacy' => ['products.archive'],
                        'depends' => ['products.archive'],
                        'builtin' => ['owner', 'admin'],
                    ],
                    [
                        'key' => 'products.production_recipe.view',
                        'label_ar' => 'عرض وصفة الإنتاج',
                        'label_en' => 'View production recipe',
                        'legacy' => ['products.view'],
                        'depends' => ['products.view'],
                    ],
                    [
                        'key' => 'products.production_recipe.manage',
                        'label_ar' => 'إدارة وصفة الإنتاج',
                        'label_en' => 'Manage production recipe',
                        'legacy' => ['products.update'],
                        'depends' => ['products.update'],
                    ],
                    [
                        'key' => 'products.production_history.view',
                        'label_ar' => 'عرض تاريخ الإنتاج للمنتج',
                        'label_en' => 'View product production history',
                        'legacy' => ['products.view'],
                        'depends' => ['products.view'],
                    ],
                    [
                        'key' => 'products.service_operations.view',
                        'label_ar' => 'عرض عمليات الخدمة',
                        'label_en' => 'View service operations',
                        'legacy' => ['products.view'],
                        'depends' => ['products.view'],
                    ],
                ],
            ],
            'parties' => [
                'key' => 'parties',
                'title_ar' => 'العملاء والموردون',
                'title_en' => 'Customers & Suppliers',
                'description_ar' => 'العلاقات والحسابات والأرصدة والاستيراد والتصدير والتسعير والتحليلات.',
                'description_en' => 'Relationships, accounts, balances, import/export, pricing and insights.',
                'icon' => 'parties',
                'permissions' => [
                    [
                        'key' => 'parties.view',
                        'label_ar' => 'عرض العملاء والموردين',
                        'label_en' => 'View customers & suppliers',
                    ],
                    [
                        'key' => 'parties.create',
                        'label_ar' => 'إضافة عميل أو مورد',
                        'label_en' => 'Create customer or supplier',
                    ],
                    [
                        'key' => 'parties.update',
                        'label_ar' => 'تعديل العملاء والموردين',
                        'label_en' => 'Edit customers & suppliers',
                    ],
                    [
                        'key' => 'parties.manage',
                        'label_ar' => 'إدارة كاملة للعملاء والموردين',
                        'label_en' => 'Full party management',
                    ],
                    [
                        'key' => 'parties.archive',
                        'label_ar' => 'أرشفة واستعادة الجهات',
                        'label_en' => 'Archive & restore parties',
                    ],
                    [
                        'key' => 'parties.account.view',
                        'label_ar' => 'عرض حساب وكشف الجهة',
                        'label_en' => 'View party account & statement',
                        'legacy' => ['parties.view'],
                        'depends' => ['parties.view'],
                    ],
                    [
                        'key' => 'parties.account.opening_balance.manage',
                        'label_ar' => 'إدارة الرصيد المدور',
                        'label_en' => 'Manage carried/opening balance',
                        'legacy' => ['parties.manage'],
                        'depends' => ['parties.view'],
                    ],
                    [
                        'key' => 'parties.insights.view',
                        'label_ar' => 'عرض Customer/Party 360',
                        'label_en' => 'View Party 360',
                        'legacy' => ['parties.view'],
                        'depends' => ['parties.view'],
                    ],
                    [
                        'key' => 'parties.notes.update',
                        'label_ar' => 'تعديل ملاحظات الجهة',
                        'label_en' => 'Edit party notes',
                        'legacy' => ['parties.update'],
                        'depends' => ['parties.view'],
                    ],
                    [
                        'key' => 'parties.import.preview',
                        'label_ar' => 'معاينة استيراد الجهات',
                        'label_en' => 'Preview party import',
                        'legacy' => ['parties.create'],
                        'depends' => ['parties.view'],
                    ],
                    [
                        'key' => 'parties.import.commit',
                        'label_ar' => 'تنفيذ استيراد الجهات',
                        'label_en' => 'Commit party import',
                        'legacy' => ['parties.create'],
                        'depends' => ['parties.create'],
                    ],
                    [
                        'key' => 'parties.export',
                        'label_ar' => 'تصدير العملاء والموردين',
                        'label_en' => 'Export parties',
                        'legacy' => ['parties.view'],
                        'depends' => ['parties.view'],
                    ],
                    [
                        'key' => 'parties.bulk.edit',
                        'label_ar' => 'تعديل الجهات بالجملة',
                        'label_en' => 'Bulk edit parties',
                        'legacy' => ['parties.update'],
                        'depends' => ['parties.update'],
                    ],
                    [
                        'key' => 'parties.bulk.actions',
                        'label_ar' => 'عمليات الجهات الجماعية',
                        'label_en' => 'Bulk party actions',
                        'legacy' => ['parties.manage'],
                        'depends' => ['parties.view'],
                    ],
                    [
                        'key' => 'parties.delete_permanent',
                        'label_ar' => 'حذف جهة نهائيًا',
                        'label_en' => 'Permanently delete parties',
                        'legacy' => ['parties.archive'],
                        'depends' => ['parties.archive'],
                        'builtin' => ['owner', 'admin'],
                    ],
                    [
                        'key' => 'parties.pricing.view',
                        'label_ar' => 'عرض أسعار العميل الخاصة',
                        'label_en' => 'View party-specific prices',
                        'legacy' => ['parties.view'],
                        'depends' => ['parties.view'],
                    ],
                    [
                        'key' => 'parties.pricing.manage',
                        'label_ar' => 'إدارة أسعار العميل الخاصة',
                        'label_en' => 'Manage party-specific prices',
                        'legacy' => ['parties.manage'],
                        'depends' => ['parties.view'],
                    ],
                ],
            ],
            'inventory' => [
                'key' => 'inventory',
                'title_ar' => 'المخزون والمستودعات',
                'title_en' => 'Inventory & Warehouses',
                'description_ar' => 'الأرصدة والذكاء والتحويلات والتسويات والمستودعات.',
                'description_en' => 'Stock, intelligence, transfers, adjustments and warehouses.',
                'icon' => 'inventory',
                'permissions' => [
                    [
                        'key' => 'inventory.view',
                        'label_ar' => 'عرض المخزون',
                        'label_en' => 'View inventory',
                    ],
                    [
                        'key' => 'inventory.manage',
                        'label_ar' => 'إدارة المخزون',
                        'label_en' => 'Manage inventory',
                    ],
                    [
                        'key' => 'inventory.overview.view',
                        'label_ar' => 'عرض لوحة المخزون',
                        'label_en' => 'View inventory overview',
                        'legacy' => ['inventory.view'],
                        'depends' => ['inventory.view'],
                    ],
                    [
                        'key' => 'inventory.intelligence.view',
                        'label_ar' => 'عرض ذكاء المخزون',
                        'label_en' => 'View inventory intelligence',
                        'legacy' => ['inventory.view'],
                        'depends' => ['inventory.view'],
                    ],
                    [
                        'key' => 'inventory.product.view',
                        'label_ar' => 'عرض مخزون المنتج',
                        'label_en' => 'View product stock details',
                        'legacy' => ['inventory.view'],
                        'depends' => ['inventory.view'],
                    ],
                    [
                        'key' => 'inventory.product_settings.manage',
                        'label_ar' => 'إدارة إعدادات مخزون المنتج',
                        'label_en' => 'Manage product inventory settings',
                        'legacy' => ['inventory.manage'],
                        'depends' => ['inventory.view'],
                    ],
                    [
                        'key' => 'inventory.opening_stock.manage',
                        'label_ar' => 'تسجيل المخزون الافتتاحي',
                        'label_en' => 'Manage opening stock',
                        'legacy' => ['inventory.manage'],
                        'depends' => ['inventory.view'],
                    ],
                    [
                        'key' => 'inventory.adjustments.manage',
                        'label_ar' => 'تنفيذ تسويات المخزون',
                        'label_en' => 'Manage stock adjustments',
                        'legacy' => ['inventory.manage'],
                        'depends' => ['inventory.view'],
                    ],
                    [
                        'key' => 'inventory.stock_transfer.manage',
                        'label_ar' => 'تحويل المخزون مباشرة',
                        'label_en' => 'Manage direct stock transfers',
                        'legacy' => ['inventory.manage'],
                        'depends' => ['inventory.view'],
                    ],
                    [
                        'key' => 'inventory.transfer_requests.view',
                        'label_ar' => 'عرض طلبات التحويل',
                        'label_en' => 'View transfer requests',
                        'legacy' => ['inventory.view'],
                        'depends' => ['inventory.view'],
                    ],
                    [
                        'key' => 'inventory.transfer_requests.create',
                        'label_ar' => 'إنشاء طلب تحويل',
                        'label_en' => 'Create transfer requests',
                        'legacy' => ['inventory.manage'],
                        'depends' => ['inventory.view'],
                    ],
                    [
                        'key' => 'inventory.transfer_requests.review',
                        'label_ar' => 'اعتماد أو رفض التحويل',
                        'label_en' => 'Review transfer requests',
                        'legacy' => ['inventory.manage'],
                        'depends' => ['inventory.view'],
                    ],
                    [
                        'key' => 'inventory.warehouses.view',
                        'label_ar' => 'عرض المستودعات',
                        'label_en' => 'View warehouses',
                        'legacy' => ['inventory.view'],
                        'depends' => ['inventory.view'],
                    ],
                    [
                        'key' => 'inventory.warehouses.manage',
                        'label_ar' => 'إضافة وتعديل المستودعات',
                        'label_en' => 'Manage warehouses',
                        'legacy' => ['inventory.manage'],
                        'depends' => ['inventory.view'],
                    ],
                    [
                        'key' => 'inventory.warehouses.default.manage',
                        'label_ar' => 'تعيين المستودع الافتراضي',
                        'label_en' => 'Set default warehouse',
                        'legacy' => ['inventory.manage'],
                        'depends' => ['inventory.view'],
                    ],
                    [
                        'key' => 'inventory.warehouses.archive',
                        'label_ar' => 'أرشفة واستعادة المستودعات',
                        'label_en' => 'Archive & restore warehouses',
                        'legacy' => ['inventory.manage'],
                        'depends' => ['inventory.view'],
                    ],
                    [
                        'key' => 'inventory.warehouses.delete_permanent',
                        'label_ar' => 'حذف مستودع نهائيًا',
                        'label_en' => 'Permanently delete warehouses',
                        'legacy' => ['inventory.manage'],
                        'depends' => ['inventory.view'],
                        'builtin' => ['owner', 'admin'],
                    ],
                ],
            ],
            'production' => [
                'key' => 'production',
                'title_ar' => 'الإنتاج',
                'title_en' => 'Production',
                'description_ar' => 'الوصفات وتشغيل أو تعديل أو ترحيل أو عكس أو حذف الإنتاج.',
                'description_en' => 'Recipes and production run lifecycle controls.',
                'icon' => 'production',
                'permissions' => [
                    [
                        'key' => 'production.view',
                        'label_ar' => 'عرض الإنتاج',
                        'label_en' => 'View production',
                    ],
                    [
                        'key' => 'production.manage',
                        'label_ar' => 'إدارة الإنتاج',
                        'label_en' => 'Manage production',
                    ],
                    [
                        'key' => 'production.recipes.view',
                        'label_ar' => 'عرض وصفات الإنتاج',
                        'label_en' => 'View production recipes',
                        'legacy' => ['production.view'],
                        'depends' => ['production.view'],
                    ],
                    [
                        'key' => 'production.recipes.manage',
                        'label_ar' => 'إدارة وصفات الإنتاج',
                        'label_en' => 'Manage production recipes',
                        'legacy' => ['production.manage'],
                        'depends' => ['production.view'],
                    ],
                    [
                        'key' => 'production.runs.view',
                        'label_ar' => 'عرض تشغيلات الإنتاج',
                        'label_en' => 'View production runs',
                        'legacy' => ['production.view'],
                        'depends' => ['production.view'],
                    ],
                    [
                        'key' => 'production.runs.create',
                        'label_ar' => 'إنشاء تشغيل إنتاج',
                        'label_en' => 'Create production runs',
                        'legacy' => ['production.manage'],
                        'depends' => ['production.view'],
                    ],
                    [
                        'key' => 'production.runs.update',
                        'label_ar' => 'تعديل تشغيل إنتاج',
                        'label_en' => 'Edit production runs',
                        'legacy' => ['production.manage'],
                        'depends' => ['production.view'],
                    ],
                    [
                        'key' => 'production.runs.delete',
                        'label_ar' => 'حذف مسودة تشغيل إنتاج',
                        'label_en' => 'Delete production drafts',
                        'legacy' => ['production.manage'],
                        'depends' => ['production.view'],
                    ],
                    [
                        'key' => 'production.runs.post',
                        'label_ar' => 'ترحيل تشغيل الإنتاج',
                        'label_en' => 'Post production runs',
                        'legacy' => ['production.manage'],
                        'depends' => ['production.view'],
                    ],
                    [
                        'key' => 'production.runs.reverse',
                        'label_ar' => 'عكس تشغيل أو مخرج إنتاج',
                        'label_en' => 'Reverse production runs/outputs',
                        'legacy' => ['production.manage'],
                        'depends' => ['production.view'],
                    ],
                ],
            ],
            'finance_documents' => [
                'key' => 'finance_documents',
                'title_ar' => 'الفواتير والأتمتة',
                'title_en' => 'Invoices & Automation',
                'description_ar' => 'دورة حياة الفواتير والتخصيصات والقوالب والتكرار والاستيراد.',
                'description_en' => 'Invoice lifecycle, allocations, templates, recurring profiles and import.',
                'icon' => 'finance',
                'permissions' => [
                    [
                        'key' => 'finance.sales.view',
                        'label_ar' => 'عرض فواتير البيع',
                        'label_en' => 'View sales invoices',
                    ],
                    [
                        'key' => 'finance.sales.manage',
                        'label_ar' => 'إنشاء وإدارة فواتير البيع',
                        'label_en' => 'Create & manage sales invoices',
                    ],
                    [
                        'key' => 'finance.purchases.view',
                        'label_ar' => 'عرض فواتير الشراء',
                        'label_en' => 'View purchase invoices',
                    ],
                    [
                        'key' => 'finance.purchases.manage',
                        'label_ar' => 'إنشاء وإدارة فواتير الشراء',
                        'label_en' => 'Create & manage purchase invoices',
                    ],
                    [
                        'key' => 'finance.documents.create',
                        'label_ar' => 'إنشاء فاتورة',
                        'label_en' => 'Create invoices',
                        'legacy' => ['finance.sales.manage', 'finance.purchases.manage'],
                    ],
                    [
                        'key' => 'finance.documents.update',
                        'label_ar' => 'تعديل مسودة فاتورة',
                        'label_en' => 'Edit invoice drafts',
                        'legacy' => ['finance.sales.manage', 'finance.purchases.manage'],
                    ],
                    [
                        'key' => 'finance.documents.delete',
                        'label_ar' => 'حذف مسودة فاتورة',
                        'label_en' => 'Delete invoice drafts',
                        'legacy' => ['finance.sales.manage', 'finance.purchases.manage'],
                    ],
                    [
                        'key' => 'finance.documents.issue',
                        'label_ar' => 'إصدار واعتماد الفاتورة',
                        'label_en' => 'Issue invoices',
                        'legacy' => ['finance.sales.manage', 'finance.purchases.manage'],
                    ],
                    [
                        'key' => 'finance.documents.void',
                        'label_ar' => 'إلغاء فاتورة مصدرة',
                        'label_en' => 'Void issued invoices',
                        'legacy' => ['finance.documents.correct'],
                    ],
                    [
                        'key' => 'finance.documents.correct',
                        'label_ar' => 'تصحيح الفواتير بعد الإصدار',
                        'label_en' => 'Correct issued invoices',
                    ],
                    [
                        'key' => 'finance.documents.apply_credit',
                        'label_ar' => 'تطبيق رصيد دائن على فاتورة',
                        'label_en' => 'Apply credit to invoices',
                        'legacy' => ['finance.sales.manage', 'finance.purchases.manage'],
                    ],
                    [
                        'key' => 'finance.fulfillments.view',
                        'label_ar' => 'عرض تنفيذ/تسليم الفاتورة',
                        'label_en' => 'View invoice fulfillments',
                        'legacy' => ['finance.sales.view', 'finance.purchases.view'],
                    ],
                    [
                        'key' => 'finance.fulfillments.manage',
                        'label_ar' => 'إدارة تنفيذ/تسليم الفاتورة',
                        'label_en' => 'Manage invoice fulfillments',
                        'legacy' => ['finance.sales.manage', 'finance.purchases.manage'],
                    ],
                    [
                        'key' => 'finance.automation.view',
                        'label_ar' => 'عرض قوالب وتكرار الفواتير',
                        'label_en' => 'View invoice automation',
                        'legacy' => ['finance.sales.view', 'finance.purchases.view'],
                    ],
                    [
                        'key' => 'finance.automation.templates.manage',
                        'label_ar' => 'إدارة قوالب الفواتير',
                        'label_en' => 'Manage invoice templates',
                        'legacy' => ['finance.sales.manage', 'finance.purchases.manage'],
                    ],
                    [
                        'key' => 'finance.automation.recurring.manage',
                        'label_ar' => 'إدارة الفواتير المتكررة',
                        'label_en' => 'Manage recurring invoices',
                        'legacy' => ['finance.sales.manage', 'finance.purchases.manage'],
                    ],
                    [
                        'key' => 'finance.import.template',
                        'label_ar' => 'تنزيل قالب الاستيراد',
                        'label_en' => 'Download finance import templates',
                        'legacy' => ['finance.sales.view', 'finance.purchases.view'],
                    ],
                    [
                        'key' => 'finance.import.preview',
                        'label_ar' => 'معاينة استيراد الفواتير',
                        'label_en' => 'Preview finance imports',
                        'legacy' => ['finance.sales.manage', 'finance.purchases.manage'],
                    ],
                    [
                        'key' => 'finance.import.commit',
                        'label_ar' => 'تنفيذ استيراد الفواتير',
                        'label_en' => 'Commit finance imports',
                        'legacy' => ['finance.sales.manage', 'finance.purchases.manage'],
                    ],
                    [
                        'key' => 'finance.lookups.view',
                        'label_ar' => 'استخدام بيانات البحث المالية',
                        'label_en' => 'Use finance lookups',
                        'legacy' => ['finance.sales.view', 'finance.purchases.view', 'finance.cash.view'],
                    ],
                    [
                        'key' => 'finance.reference_price.view',
                        'label_ar' => 'عرض السعر المرجعي',
                        'label_en' => 'View reference pricing',
                        'legacy' => ['finance.sales.view', 'finance.purchases.view'],
                    ],
                ],
            ],
            'cash_payments' => [
                'key' => 'cash_payments',
                'title_ar' => 'القبض والدفع وخطط السداد',
                'title_en' => 'Cash, Receipts & Payment Plans',
                'description_ar' => 'المقبوضات والمدفوعات والتصحيح والشيكات وخطط السداد.',
                'description_en' => 'Receipts, payments, corrections, cheque state and payment plans.',
                'icon' => 'cash',
                'permissions' => [
                    [
                        'key' => 'finance.cash.view',
                        'label_ar' => 'عرض المدفوعات والمقبوضات',
                        'label_en' => 'View payments & receipts',
                    ],
                    [
                        'key' => 'finance.cash.receive',
                        'label_ar' => 'تسجيل واعتماد المقبوضات',
                        'label_en' => 'Record & post receipts',
                    ],
                    [
                        'key' => 'finance.cash.pay',
                        'label_ar' => 'تسجيل واعتماد المدفوعات',
                        'label_en' => 'Record & post payments',
                    ],
                    [
                        'key' => 'finance.cash.correct',
                        'label_ar' => 'عكس وتصحيح الحركات النقدية',
                        'label_en' => 'Reverse & correct cash movements',
                    ],
                    [
                        'key' => 'finance.cash.create',
                        'label_ar' => 'إنشاء حركة قبض/دفع',
                        'label_en' => 'Create cash movements',
                        'legacy' => ['finance.cash.receive', 'finance.cash.pay'],
                        'depends' => ['finance.cash.view'],
                    ],
                    [
                        'key' => 'finance.cash.update',
                        'label_ar' => 'تعديل مسودة قبض/دفع',
                        'label_en' => 'Edit cash movement drafts',
                        'legacy' => ['finance.cash.receive', 'finance.cash.pay'],
                        'depends' => ['finance.cash.view'],
                    ],
                    [
                        'key' => 'finance.cash.post',
                        'label_ar' => 'ترحيل حركة قبض/دفع',
                        'label_en' => 'Post cash movements',
                        'legacy' => ['finance.cash.receive', 'finance.cash.pay'],
                        'depends' => ['finance.cash.view'],
                    ],
                    [
                        'key' => 'finance.cash.reverse',
                        'label_ar' => 'عكس حركة قبض/دفع',
                        'label_en' => 'Reverse cash movements',
                        'legacy' => ['finance.cash.correct'],
                        'depends' => ['finance.cash.view'],
                    ],
                    [
                        'key' => 'finance.cash.check_status',
                        'label_ar' => 'تحديث حالة الشيك',
                        'label_en' => 'Update cheque status',
                        'legacy' => ['finance.cash.receive', 'finance.cash.pay'],
                        'depends' => ['finance.cash.view'],
                    ],
                    [
                        'key' => 'finance.cash.duplicate_check',
                        'label_ar' => 'فحص الحركات المكررة',
                        'label_en' => 'Check duplicate cash movements',
                        'legacy' => ['finance.cash.view'],
                        'depends' => ['finance.cash.view'],
                    ],
                    [
                        'key' => 'payments.view',
                        'label_ar' => 'عرض خطط وعمليات السداد',
                        'label_en' => 'View payment plans',
                    ],
                    [
                        'key' => 'payments.create',
                        'label_ar' => 'إنشاء خطة سداد',
                        'label_en' => 'Create payment plans',
                    ],
                    [
                        'key' => 'payments.update',
                        'label_ar' => 'تعديل خطة سداد',
                        'label_en' => 'Edit payment plans',
                    ],
                    [
                        'key' => 'payments.record',
                        'label_ar' => 'تسجيل دفعة على خطة',
                        'label_en' => 'Record payment plan installments',
                    ],
                    [
                        'key' => 'payments.manage',
                        'label_ar' => 'إدارة كاملة لخطط السداد',
                        'label_en' => 'Full payment plan management',
                    ],
                    [
                        'key' => 'payments.reminders.view',
                        'label_ar' => 'عرض تذكيرات الاستحقاق',
                        'label_en' => 'View payment reminders',
                        'legacy' => ['payments.view'],
                        'depends' => ['payments.view'],
                    ],
                    [
                        'key' => 'payments.history.view',
                        'label_ar' => 'عرض سجل الدفعات',
                        'label_en' => 'View payment history',
                        'legacy' => ['payments.view'],
                        'depends' => ['payments.view'],
                    ],
                    [
                        'key' => 'payments.plans.toggle',
                        'label_ar' => 'تفعيل/إيقاف خطة سداد',
                        'label_en' => 'Enable/disable payment plans',
                        'legacy' => ['payments.update'],
                        'depends' => ['payments.view'],
                    ],
                ],
            ],
            'finance_governance' => [
                'key' => 'finance_governance',
                'title_ar' => 'الضرائب والموافقات والتسويات',
                'title_en' => 'Tax, Approvals & Reconciliation',
                'description_ar' => 'الضرائب وطلبات الشراء والموافقات والتسوية البنكية.',
                'description_en' => 'Tax, purchase requisitions, approvals and bank reconciliation.',
                'icon' => 'governance',
                'permissions' => [
                    [
                        'key' => 'finance.approvals.view',
                        'label_ar' => 'عرض طلبات الموافقة',
                        'label_en' => 'View approval requests',
                        'legacy' => ['finance.approvals.review'],
                    ],
                    [
                        'key' => 'finance.approvals.review',
                        'label_ar' => 'مراجعة واعتماد الطلبات',
                        'label_en' => 'Review finance approvals',
                    ],
                    [
                        'key' => 'finance.taxes.view',
                        'label_ar' => 'عرض الضرائب والمستحقات الحكومية',
                        'label_en' => 'View taxes & obligations',
                    ],
                    [
                        'key' => 'finance.taxes.manage',
                        'label_ar' => 'إدارة الضرائب والمستحقات',
                        'label_en' => 'Manage taxes & obligations',
                    ],
                    [
                        'key' => 'finance.taxes.rules.manage',
                        'label_ar' => 'إدارة قواعد الضرائب',
                        'label_en' => 'Manage tax rules',
                        'legacy' => ['finance.taxes.manage'],
                        'depends' => ['finance.taxes.view'],
                    ],
                    [
                        'key' => 'finance.taxes.obligations.manage',
                        'label_ar' => 'إدارة المستحقات الحكومية',
                        'label_en' => 'Manage government obligations',
                        'legacy' => ['finance.taxes.manage'],
                        'depends' => ['finance.taxes.view'],
                    ],
                    [
                        'key' => 'finance.requisitions.view',
                        'label_ar' => 'عرض طلبات الشراء',
                        'label_en' => 'View purchase requisitions',
                        'legacy' => ['finance.purchases.view'],
                        'depends' => ['finance.purchases.view'],
                    ],
                    [
                        'key' => 'finance.requisitions.create',
                        'label_ar' => 'إنشاء طلب شراء',
                        'label_en' => 'Create purchase requisitions',
                        'legacy' => ['finance.purchases.manage'],
                        'depends' => ['finance.purchases.view'],
                    ],
                    [
                        'key' => 'finance.requisitions.review',
                        'label_ar' => 'مراجعة طلبات الشراء',
                        'label_en' => 'Review purchase requisitions',
                        'legacy' => ['finance.approvals.review'],
                        'depends' => ['finance.purchases.view'],
                    ],
                    [
                        'key' => 'finance.requisitions.convert',
                        'label_ar' => 'تحويل طلب الشراء إلى فاتورة',
                        'label_en' => 'Convert requisitions to purchase invoices',
                        'legacy' => ['finance.purchases.manage'],
                        'depends' => ['finance.purchases.view'],
                    ],
                    [
                        'key' => 'finance.reconciliation.view',
                        'label_ar' => 'عرض التسوية البنكية',
                        'label_en' => 'View bank reconciliation',
                        'legacy' => ['finance.cash.view'],
                        'depends' => ['finance.cash.view'],
                    ],
                    [
                        'key' => 'finance.reconciliation.import',
                        'label_ar' => 'استيراد كشف البنك',
                        'label_en' => 'Import bank statements',
                        'legacy' => ['finance.cash.correct'],
                        'depends' => ['finance.cash.view'],
                    ],
                    [
                        'key' => 'finance.reconciliation.match',
                        'label_ar' => 'مطابقة الحركات البنكية',
                        'label_en' => 'Match bank lines',
                        'legacy' => ['finance.cash.correct'],
                        'depends' => ['finance.cash.view'],
                    ],
                    [
                        'key' => 'finance.reconciliation.ignore',
                        'label_ar' => 'تجاهل سطر بنكي',
                        'label_en' => 'Ignore bank lines',
                        'legacy' => ['finance.cash.correct'],
                        'depends' => ['finance.cash.view'],
                    ],
                ],
            ],
            'reports' => [
                'key' => 'reports',
                'title_ar' => 'التقارير والتحليلات',
                'title_en' => 'Reports & Analytics',
                'description_ar' => 'بناء وتشغيل التقارير، Drill-down، الرسوم، التعليقات، الـSnapshots واللوحات.',
                'description_en' => 'Report builder/studio, drill-down, charts, comments, snapshots and boards.',
                'icon' => 'reports',
                'permissions' => [
                    [
                        'key' => 'reports.view',
                        'label_ar' => 'فتح مركز التقارير',
                        'label_en' => 'Open reports center',
                        'legacy' => ['finance.sales.view', 'finance.purchases.view', 'finance.cash.view'],
                    ],
                    [
                        'key' => 'reports.builder.view',
                        'label_ar' => 'عرض التقارير المخصصة',
                        'label_en' => 'View custom reports',
                        'legacy' => ['finance.sales.view', 'finance.purchases.view', 'finance.cash.view'],
                        'depends' => ['reports.view'],
                    ],
                    [
                        'key' => 'reports.builder.create',
                        'label_ar' => 'إنشاء تقرير مخصص',
                        'label_en' => 'Create custom reports',
                        'legacy' => ['finance.sales.view', 'finance.purchases.view', 'finance.cash.view'],
                        'depends' => ['reports.view'],
                    ],
                    [
                        'key' => 'reports.builder.update',
                        'label_ar' => 'تعديل تقرير مخصص',
                        'label_en' => 'Edit custom reports',
                        'legacy' => ['finance.sales.view', 'finance.purchases.view', 'finance.cash.view'],
                        'depends' => ['reports.view'],
                    ],
                    [
                        'key' => 'reports.builder.delete',
                        'label_ar' => 'حذف تقرير مخصص',
                        'label_en' => 'Delete custom reports',
                        'legacy' => ['finance.sales.view', 'finance.purchases.view', 'finance.cash.view'],
                        'depends' => ['reports.view'],
                    ],
                    [
                        'key' => 'reports.builder.run',
                        'label_ar' => 'تشغيل Report Builder',
                        'label_en' => 'Run custom reports',
                        'legacy' => ['finance.sales.view', 'finance.purchases.view', 'finance.cash.view'],
                        'depends' => ['reports.view'],
                    ],
                    [
                        'key' => 'reports.builder.versions.view',
                        'label_ar' => 'عرض تاريخ نسخ التقرير',
                        'label_en' => 'View report versions',
                        'legacy' => ['finance.sales.view', 'finance.purchases.view', 'finance.cash.view'],
                        'depends' => ['reports.view'],
                    ],
                    [
                        'key' => 'reports.builder.versions.restore',
                        'label_ar' => 'استعادة نسخة تقرير',
                        'label_en' => 'Restore report versions',
                        'legacy' => ['finance.sales.view', 'finance.purchases.view', 'finance.cash.view'],
                        'depends' => ['reports.view'],
                    ],
                    [
                        'key' => 'reports.studio.view',
                        'label_ar' => 'فتح Report Studio',
                        'label_en' => 'Open Report Studio',
                        'legacy' => ['finance.sales.view', 'finance.purchases.view', 'finance.cash.view'],
                        'depends' => ['reports.view'],
                    ],
                    [
                        'key' => 'reports.studio.run',
                        'label_ar' => 'تشغيل تقارير Studio',
                        'label_en' => 'Run Studio reports',
                        'legacy' => ['finance.sales.view', 'finance.purchases.view', 'finance.cash.view'],
                        'depends' => ['reports.view'],
                    ],
                    [
                        'key' => 'reports.studio.drill_down',
                        'label_ar' => 'استخدام Drill-Down',
                        'label_en' => 'Use report drill-down',
                        'legacy' => ['finance.sales.view', 'finance.purchases.view', 'finance.cash.view'],
                        'depends' => ['reports.view'],
                    ],
                    [
                        'key' => 'reports.studio.visualizations.manage',
                        'label_ar' => 'حفظ الرسوم والتصورات',
                        'label_en' => 'Manage report visualizations',
                        'legacy' => ['finance.sales.view', 'finance.purchases.view', 'finance.cash.view'],
                        'depends' => ['reports.view'],
                    ],
                    [
                        'key' => 'reports.studio.configuration.manage',
                        'label_ar' => 'حفظ إعدادات التقرير',
                        'label_en' => 'Manage report configurations',
                        'legacy' => ['finance.sales.view', 'finance.purchases.view', 'finance.cash.view'],
                        'depends' => ['reports.view'],
                    ],
                    [
                        'key' => 'reports.studio.natural_language',
                        'label_ar' => 'استخدام البحث باللغة الطبيعية',
                        'label_en' => 'Use natural-language reports',
                        'legacy' => ['finance.sales.view', 'finance.purchases.view', 'finance.cash.view'],
                        'depends' => ['reports.view'],
                    ],
                    [
                        'key' => 'reports.studio.snapshots.create',
                        'label_ar' => 'حفظ Report Snapshot',
                        'label_en' => 'Create report snapshots',
                        'legacy' => ['finance.sales.view', 'finance.purchases.view', 'finance.cash.view'],
                        'depends' => ['reports.view'],
                    ],
                    [
                        'key' => 'reports.studio.annotations.manage',
                        'label_ar' => 'إدارة ملاحظات التقارير',
                        'label_en' => 'Manage report annotations',
                        'legacy' => ['finance.sales.view', 'finance.purchases.view', 'finance.cash.view'],
                        'depends' => ['reports.view'],
                    ],
                    [
                        'key' => 'reports.studio.comments.manage',
                        'label_ar' => 'التعليق والتعاون على التقارير',
                        'label_en' => 'Comment & collaborate on reports',
                        'legacy' => ['finance.sales.view', 'finance.purchases.view', 'finance.cash.view'],
                        'depends' => ['reports.view'],
                    ],
                    [
                        'key' => 'reports.studio.approvals.review',
                        'label_ar' => 'اعتماد التقارير',
                        'label_en' => 'Approve/sign-off reports',
                        'legacy' => ['finance.approvals.review'],
                        'depends' => ['reports.view'],
                    ],
                    [
                        'key' => 'reports.studio.targets.manage',
                        'label_ar' => 'إدارة Targets داخل التقارير',
                        'label_en' => 'Manage report targets',
                        'legacy' => ['finance.sales.view', 'finance.purchases.view', 'finance.cash.view'],
                        'depends' => ['reports.view'],
                    ],
                    [
                        'key' => 'reports.studio.presets.manage',
                        'label_ar' => 'إدارة فلاتر Presets',
                        'label_en' => 'Manage report presets',
                        'legacy' => ['finance.sales.view', 'finance.purchases.view', 'finance.cash.view'],
                        'depends' => ['reports.view'],
                    ],
                    [
                        'key' => 'reports.studio.boards.manage',
                        'label_ar' => 'إدارة Report Boards',
                        'label_en' => 'Manage report boards',
                        'legacy' => ['finance.sales.view', 'finance.purchases.view', 'finance.cash.view'],
                        'depends' => ['reports.view'],
                    ],
                    [
                        'key' => 'reports.scheduled.view',
                        'label_ar' => 'عرض التقارير المجدولة',
                        'label_en' => 'View scheduled reports',
                        'legacy' => ['finance.sales.view', 'finance.purchases.view', 'finance.cash.view'],
                        'depends' => ['reports.view'],
                    ],
                    [
                        'key' => 'reports.scheduled.create',
                        'label_ar' => 'إنشاء تقرير مجدول',
                        'label_en' => 'Create scheduled reports',
                        'depends' => ['reports.scheduled.view'],
                        'builtin' => ['owner', 'admin', 'manager'],
                    ],
                    [
                        'key' => 'reports.scheduled.update',
                        'label_ar' => 'تعديل تقرير مجدول',
                        'label_en' => 'Edit scheduled reports',
                        'depends' => ['reports.scheduled.view'],
                        'builtin' => ['owner', 'admin', 'manager'],
                    ],
                    [
                        'key' => 'reports.scheduled.run',
                        'label_ar' => 'تشغيل تقرير مجدول يدويًا',
                        'label_en' => 'Run scheduled reports',
                        'depends' => ['reports.scheduled.view'],
                        'builtin' => ['owner', 'admin', 'manager'],
                    ],
                ],
            ],
            'dashboard' => [
                'key' => 'dashboard',
                'title_ar' => 'لوحة التحكم والذكاء',
                'title_en' => 'Dashboard & Intelligence',
                'description_ar' => 'التخصيص والأهداف والنبض التجاري والمتابعات والتحليلات.',
                'description_en' => 'Dashboard customization, targets, business pulse and intelligence.',
                'icon' => 'dashboard',
                'permissions' => [
                    [
                        'key' => 'dashboard.view',
                        'label_ar' => 'عرض لوحة التحكم',
                        'label_en' => 'View dashboard',
                        'builtin' => ['owner', 'admin', 'manager', 'accountant', 'employee'],
                    ],
                    [
                        'key' => 'dashboard.customize',
                        'label_ar' => 'تخصيص Widgets لوحة التحكم',
                        'label_en' => 'Customize dashboard widgets',
                        'depends' => ['dashboard.view'],
                        'builtin' => ['owner', 'admin', 'manager'],
                    ],
                    [
                        'key' => 'dashboard.targets.manage',
                        'label_ar' => 'إدارة أهداف KPI',
                        'label_en' => 'Manage KPI targets',
                        'depends' => ['dashboard.view'],
                        'builtin' => ['owner', 'admin', 'manager'],
                    ],
                    [
                        'key' => 'intelligence.business_pulse.view',
                        'label_ar' => 'عرض Business Pulse',
                        'label_en' => 'View Business Pulse',
                        'legacy' => ['finance.sales.view', 'finance.purchases.view', 'finance.cash.view'],
                        'depends' => ['dashboard.view'],
                    ],
                    [
                        'key' => 'intelligence.followups.view',
                        'label_ar' => 'عرض قائمة المتابعات',
                        'label_en' => 'View follow-up queue',
                        'legacy' => ['finance.sales.view', 'finance.purchases.view', 'finance.cash.view'],
                        'depends' => ['dashboard.view'],
                    ],
                    [
                        'key' => 'intelligence.cashflow.view',
                        'label_ar' => 'عرض ذكاء التدفق النقدي',
                        'label_en' => 'View cashflow intelligence',
                        'legacy' => ['finance.cash.view'],
                        'depends' => ['dashboard.view'],
                    ],
                    [
                        'key' => 'intelligence.anomalies.view',
                        'label_ar' => 'عرض مركز الشذوذ والتنبيهات',
                        'label_en' => 'View anomaly center',
                        'legacy' => ['finance.sales.view', 'finance.purchases.view', 'finance.cash.view'],
                        'depends' => ['dashboard.view'],
                    ],
                    [
                        'key' => 'intelligence.customers.view',
                        'label_ar' => 'عرض ذكاء العملاء',
                        'label_en' => 'View customer intelligence',
                        'legacy' => ['parties.view'],
                        'depends' => ['dashboard.view'],
                    ],
                ],
            ],
            'commercial_operations' => [
                'key' => 'commercial_operations',
                'title_ar' => 'المبيعات والمشتريات التشغيلية',
                'title_en' => 'Commercial Operations',
                'description_ar' => 'العروض والأوامر والمرتجعات والضمانات والدفعات غير المخصصة وAging.',
                'description_en' => 'Quotes, orders, returns, warranties, unallocated cash and aging.',
                'icon' => 'operations',
                'permissions' => [
                    [
                        'key' => 'operations.unallocated.view',
                        'label_ar' => 'عرض الدفعات غير المخصصة',
                        'label_en' => 'View unallocated cash',
                        'legacy' => ['finance.cash.view'],
                    ],
                    [
                        'key' => 'operations.unallocated.allocate',
                        'label_ar' => 'تخصيص دفعة غير مخصصة',
                        'label_en' => 'Allocate unallocated cash',
                        'legacy' => ['finance.cash.receive', 'finance.cash.pay'],
                        'depends' => ['finance.cash.view'],
                    ],
                    [
                        'key' => 'operations.collections.view',
                        'label_ar' => 'عرض متابعة التحصيل',
                        'label_en' => 'View collections',
                        'legacy' => ['finance.sales.view', 'finance.cash.view'],
                    ],
                    [
                        'key' => 'operations.ar_aging.view',
                        'label_ar' => 'عرض أعمار ذمم العملاء',
                        'label_en' => 'View A/R aging',
                        'legacy' => ['finance.sales.view'],
                    ],
                    [
                        'key' => 'operations.ap_aging.view',
                        'label_ar' => 'عرض أعمار ذمم الموردين',
                        'label_en' => 'View A/P aging',
                        'legacy' => ['finance.purchases.view'],
                    ],
                    [
                        'key' => 'operations.promises.view',
                        'label_ar' => 'عرض وعود الدفع',
                        'label_en' => 'View payment promises',
                        'legacy' => ['parties.view'],
                    ],
                    [
                        'key' => 'operations.promises.manage',
                        'label_ar' => 'إدارة وعود الدفع',
                        'label_en' => 'Manage payment promises',
                        'legacy' => ['parties.manage'],
                        'depends' => ['parties.view'],
                    ],
                    [
                        'key' => 'operations.pipeline.view',
                        'label_ar' => 'عرض CRM Pipeline',
                        'label_en' => 'View CRM pipeline',
                        'legacy' => ['parties.view'],
                    ],
                    [
                        'key' => 'operations.pipeline.manage',
                        'label_ar' => 'إدارة CRM Pipeline',
                        'label_en' => 'Manage CRM pipeline',
                        'legacy' => ['parties.manage'],
                        'depends' => ['parties.view'],
                    ],
                    [
                        'key' => 'operations.backorders.view',
                        'label_ar' => 'عرض Backorders',
                        'label_en' => 'View backorders',
                        'legacy' => ['finance.sales.view', 'inventory.view'],
                    ],
                    [
                        'key' => 'operations.returns.view',
                        'label_ar' => 'عرض المرتجعات',
                        'label_en' => 'View returns',
                        'legacy' => ['finance.sales.view', 'finance.purchases.view'],
                    ],
                    [
                        'key' => 'operations.returns.manage',
                        'label_ar' => 'إدارة المرتجعات',
                        'label_en' => 'Manage returns',
                        'legacy' => ['finance.sales.manage', 'finance.purchases.manage'],
                    ],
                    [
                        'key' => 'operations.warranties.view',
                        'label_ar' => 'عرض الضمانات',
                        'label_en' => 'View warranties',
                        'legacy' => ['products.view'],
                    ],
                    [
                        'key' => 'operations.warranties.manage',
                        'label_ar' => 'إدارة الضمانات والمطالبات',
                        'label_en' => 'Manage warranties & claims',
                        'legacy' => ['products.manage'],
                        'depends' => ['products.view'],
                    ],
                    [
                        'key' => 'operations.serials.view',
                        'label_ar' => 'عرض الأرقام التسلسلية',
                        'label_en' => 'View serial numbers',
                        'legacy' => ['inventory.view'],
                    ],
                    [
                        'key' => 'operations.serials.manage',
                        'label_ar' => 'إدارة الأرقام التسلسلية',
                        'label_en' => 'Manage serial numbers',
                        'legacy' => ['inventory.manage'],
                        'depends' => ['inventory.view'],
                    ],
                    [
                        'key' => 'operations.batches.view',
                        'label_ar' => 'عرض الدفعات/التشغيلات',
                        'label_en' => 'View batches/lots',
                        'legacy' => ['inventory.view'],
                    ],
                    [
                        'key' => 'operations.batches.manage',
                        'label_ar' => 'إدارة الدفعات/التشغيلات',
                        'label_en' => 'Manage batches/lots',
                        'legacy' => ['inventory.manage'],
                        'depends' => ['inventory.view'],
                    ],
                    [
                        'key' => 'operations.quotations.view',
                        'label_ar' => 'عرض عروض الأسعار',
                        'label_en' => 'View quotations',
                        'legacy' => ['finance.sales.view'],
                    ],
                    [
                        'key' => 'operations.quotations.manage',
                        'label_ar' => 'إدارة عروض الأسعار',
                        'label_en' => 'Manage quotations',
                        'legacy' => ['finance.sales.manage'],
                        'depends' => ['finance.sales.view'],
                    ],
                    [
                        'key' => 'operations.quotations.convert',
                        'label_ar' => 'تحويل عرض السعر إلى فاتورة',
                        'label_en' => 'Convert quotations',
                        'legacy' => ['finance.sales.manage'],
                        'depends' => ['finance.sales.view'],
                    ],
                    [
                        'key' => 'operations.proformas.view',
                        'label_ar' => 'عرض Proforma',
                        'label_en' => 'View proformas',
                        'legacy' => ['finance.sales.view'],
                    ],
                    [
                        'key' => 'operations.proformas.manage',
                        'label_ar' => 'إدارة Proforma',
                        'label_en' => 'Manage proformas',
                        'legacy' => ['finance.sales.manage'],
                        'depends' => ['finance.sales.view'],
                    ],
                    [
                        'key' => 'operations.proformas.convert',
                        'label_ar' => 'تحويل Proforma',
                        'label_en' => 'Convert proformas',
                        'legacy' => ['finance.sales.manage'],
                        'depends' => ['finance.sales.view'],
                    ],
                    [
                        'key' => 'operations.sales_orders.view',
                        'label_ar' => 'عرض أوامر البيع',
                        'label_en' => 'View sales orders',
                        'legacy' => ['finance.sales.view'],
                    ],
                    [
                        'key' => 'operations.sales_orders.manage',
                        'label_ar' => 'إدارة أوامر البيع',
                        'label_en' => 'Manage sales orders',
                        'legacy' => ['finance.sales.manage'],
                        'depends' => ['finance.sales.view'],
                    ],
                    [
                        'key' => 'operations.sales_orders.convert',
                        'label_ar' => 'تحويل أمر بيع إلى فاتورة',
                        'label_en' => 'Convert sales orders',
                        'legacy' => ['finance.sales.manage'],
                        'depends' => ['finance.sales.view'],
                    ],
                    [
                        'key' => 'operations.purchase_orders.view',
                        'label_ar' => 'عرض أوامر الشراء',
                        'label_en' => 'View purchase orders',
                        'legacy' => ['finance.purchases.view'],
                    ],
                    [
                        'key' => 'operations.purchase_orders.manage',
                        'label_ar' => 'إدارة أوامر الشراء',
                        'label_en' => 'Manage purchase orders',
                        'legacy' => ['finance.purchases.manage'],
                        'depends' => ['finance.purchases.view'],
                    ],
                    [
                        'key' => 'operations.purchase_orders.convert',
                        'label_ar' => 'تحويل أمر شراء إلى فاتورة',
                        'label_en' => 'Convert purchase orders',
                        'legacy' => ['finance.purchases.manage'],
                        'depends' => ['finance.purchases.view'],
                    ],
                ],
            ],
            'business_controls' => [
                'key' => 'business_controls',
                'title_ar' => 'الضوابط والتكاليف والمصاريف',
                'title_en' => 'Business Controls & Costs',
                'description_ar' => 'الميزانيات والحدود والمصاريف والعهد والتكاليف والعقود وجودة البيانات.',
                'description_en' => 'Budgets, limits, expenses, petty cash, landed costs, contracts and data quality.',
                'icon' => 'controls',
                'permissions' => [
                    [
                        'key' => 'controls.lookups.view',
                        'label_ar' => 'عرض بيانات مساعدة للضوابط',
                        'label_en' => 'View control lookups',
                    ],
                    [
                        'key' => 'controls.expiry_alerts.view',
                        'label_ar' => 'عرض تنبيهات الانتهاء',
                        'label_en' => 'View expiry alerts',
                        'legacy' => ['parties.view', 'products.view'],
                    ],
                    [
                        'key' => 'controls.landed_costs.view',
                        'label_ar' => 'عرض التكاليف المحملة',
                        'label_en' => 'View landed costs',
                        'legacy' => ['finance.purchases.view'],
                    ],
                    [
                        'key' => 'controls.landed_costs.manage',
                        'label_ar' => 'إدارة التكاليف المحملة',
                        'label_en' => 'Manage landed costs',
                        'legacy' => ['finance.purchases.manage'],
                        'depends' => ['finance.purchases.view'],
                    ],
                    [
                        'key' => 'controls.exchange_rates.view',
                        'label_ar' => 'عرض أسعار الصرف',
                        'label_en' => 'View exchange rates',
                        'legacy' => ['finance.cash.view'],
                    ],
                    [
                        'key' => 'controls.budgets.view',
                        'label_ar' => 'عرض الميزانيات',
                        'label_en' => 'View budgets',
                        'legacy' => ['finance.cash.view'],
                    ],
                    [
                        'key' => 'controls.budgets.manage',
                        'label_ar' => 'إدارة الميزانيات',
                        'label_en' => 'Manage budgets',
                        'legacy' => ['finance.cash.correct'],
                        'depends' => ['finance.cash.view'],
                    ],
                    [
                        'key' => 'controls.spending_limits.view',
                        'label_ar' => 'عرض حدود الإنفاق',
                        'label_en' => 'View spending limits',
                    ],
                    [
                        'key' => 'controls.spending_limits.manage',
                        'label_ar' => 'إدارة حدود الإنفاق',
                        'label_en' => 'Manage spending limits',
                        'builtin' => ['owner', 'admin', 'manager'],
                    ],
                    [
                        'key' => 'controls.expense_claims.view',
                        'label_ar' => 'عرض مطالبات المصاريف',
                        'label_en' => 'View expense claims',
                    ],
                    [
                        'key' => 'controls.expense_claims.create',
                        'label_ar' => 'إنشاء مطالبة مصروف',
                        'label_en' => 'Create expense claims',
                    ],
                    [
                        'key' => 'controls.expense_claims.manage',
                        'label_ar' => 'تعديل وإدارة مطالبات المصاريف',
                        'label_en' => 'Edit & manage expense claims',
                        'depends' => ['controls.expense_claims.view'],
                    ],
                    [
                        'key' => 'controls.expense_claims.review',
                        'label_ar' => 'مراجعة مطالبات المصاريف',
                        'label_en' => 'Review expense claims',
                        'legacy' => ['finance.approvals.review'],
                    ],
                    [
                        'key' => 'controls.expense_claims.receipts.manage',
                        'label_ar' => 'إدارة إيصالات المطالبات',
                        'label_en' => 'Manage expense claim receipts',
                        'depends' => ['controls.expense_claims.view'],
                    ],
                    [
                        'key' => 'controls.petty_cash.view',
                        'label_ar' => 'عرض العهدة النقدية',
                        'label_en' => 'View petty cash',
                        'legacy' => ['finance.cash.view'],
                    ],
                    [
                        'key' => 'controls.petty_cash.manage',
                        'label_ar' => 'إدارة صناديق العهدة',
                        'label_en' => 'Manage petty cash funds',
                        'legacy' => ['finance.cash.pay'],
                        'depends' => ['finance.cash.view'],
                    ],
                    [
                        'key' => 'controls.petty_cash.transactions.manage',
                        'label_ar' => 'تسجيل حركات العهدة',
                        'label_en' => 'Record petty cash transactions',
                        'legacy' => ['finance.cash.pay'],
                        'depends' => ['controls.petty_cash.view'],
                    ],
                    [
                        'key' => 'controls.recurring_expenses.view',
                        'label_ar' => 'عرض المصاريف المتكررة',
                        'label_en' => 'View recurring expenses',
                        'legacy' => ['finance.cash.view'],
                    ],
                    [
                        'key' => 'controls.recurring_expenses.manage',
                        'label_ar' => 'إدارة المصاريف المتكررة',
                        'label_en' => 'Manage recurring expenses',
                        'legacy' => ['finance.cash.pay'],
                        'depends' => ['finance.cash.view'],
                    ],
                    [
                        'key' => 'controls.contracts.view',
                        'label_ar' => 'عرض العقود',
                        'label_en' => 'View contracts',
                        'legacy' => ['parties.view'],
                    ],
                    [
                        'key' => 'controls.contracts.manage',
                        'label_ar' => 'إدارة العقود',
                        'label_en' => 'Manage contracts',
                        'legacy' => ['parties.manage'],
                        'depends' => ['parties.view'],
                    ],
                    [
                        'key' => 'controls.document_expiry.view',
                        'label_ar' => 'عرض انتهاء الوثائق',
                        'label_en' => 'View document expiry',
                    ],
                    [
                        'key' => 'controls.document_expiry.manage',
                        'label_ar' => 'إدارة وثائق الانتهاء',
                        'label_en' => 'Manage expiring documents',
                    ],
                    [
                        'key' => 'controls.data_quality.view',
                        'label_ar' => 'عرض مركز جودة البيانات',
                        'label_en' => 'View data quality center',
                    ],
                ],
            ],
            'audit_admin' => [
                'key' => 'audit_admin',
                'title_ar' => 'التدقيق والاستعادة',
                'title_en' => 'Audit & Recovery',
                'description_ar' => 'مركز التدقيق وسجل العمليات الجماعية والاستعادة وفحوصات النظام.',
                'description_en' => 'Audit center, bulk history, restore center and system checks.',
                'icon' => 'audit',
                'permissions' => [
                    [
                        'key' => 'audit.center.view',
                        'label_ar' => 'عرض مركز التدقيق',
                        'label_en' => 'View audit center',
                        'legacy' => ['finance.sales.view', 'finance.purchases.view', 'finance.cash.view'],
                    ],
                    [
                        'key' => 'audit.bulk_actions.view',
                        'label_ar' => 'عرض سجل العمليات الجماعية',
                        'label_en' => 'View bulk action history',
                        'builtin' => ['owner', 'admin', 'manager'],
                    ],
                    [
                        'key' => 'audit.restore.view',
                        'label_ar' => 'عرض مركز الاستعادة',
                        'label_en' => 'View restore center',
                        'builtin' => ['owner', 'admin'],
                    ],
                    [
                        'key' => 'audit.restore.execute',
                        'label_ar' => 'تنفيذ الاستعادة',
                        'label_en' => 'Restore archived records',
                        'depends' => ['audit.restore.view'],
                        'builtin' => ['owner', 'admin'],
                    ],
                    [
                        'key' => 'audit.system_checks.view',
                        'label_ar' => 'عرض فحوصات النظام',
                        'label_en' => 'View system checks',
                        'builtin' => ['owner', 'admin'],
                    ],
                ],
            ],
            'staff' => [
                'key' => 'staff',
                'title_ar' => 'الموظفون والموارد البشرية',
                'title_en' => 'Employees & HR',
                'description_ar' => 'الدليل والحضور والمستحقات والاستيراد والدعوات والتصحيحات.',
                'description_en' => 'Directory, attendance, payroll, import, invitations and corrections.',
                'icon' => 'staff',
                'permissions' => [
                    [
                        'key' => 'staff.team_view',
                        'label_ar' => 'عرض موظفي القسم',
                        'label_en' => 'View department staff',
                    ],
                    [
                        'key' => 'staff.team_manage',
                        'label_ar' => 'إدارة موظفي القسم',
                        'label_en' => 'Manage department staff',
                    ],
                    [
                        'key' => 'staff.team_attendance',
                        'label_ar' => 'إدارة حضور القسم',
                        'label_en' => 'Manage department attendance',
                    ],
                    [
                        'key' => 'staff.team_pay',
                        'label_ar' => 'عرض/إدارة مستحقات القسم',
                        'label_en' => 'Department payroll',
                    ],
                    [
                        'key' => 'staff.view',
                        'label_ar' => 'عرض جميع الموظفين',
                        'label_en' => 'View all employees',
                    ],
                    [
                        'key' => 'staff.manage',
                        'label_ar' => 'إدارة جميع الموظفين',
                        'label_en' => 'Manage all employees',
                    ],
                    [
                        'key' => 'staff.attendance',
                        'label_ar' => 'إدارة حضور الشركة',
                        'label_en' => 'Company attendance',
                    ],
                    [
                        'key' => 'staff.pay',
                        'label_ar' => 'إدارة مستحقات الشركة',
                        'label_en' => 'Company payroll',
                    ],
                    [
                        'key' => 'staff.import',
                        'label_ar' => 'استيراد الموظفين',
                        'label_en' => 'Import employees',
                    ],
                    [
                        'key' => 'staff.insights.view',
                        'label_ar' => 'عرض تحليلات الموظفين',
                        'label_en' => 'View staff insights',
                        'legacy' => ['staff.view', 'staff.team_view'],
                    ],
                    [
                        'key' => 'staff.invitations.manage',
                        'label_ar' => 'إرسال وإدارة دعوات الموظفين',
                        'label_en' => 'Manage staff invitations',
                        'legacy' => ['staff.manage', 'staff.team_manage'],
                    ],
                    [
                        'key' => 'staff.corrections.manage',
                        'label_ar' => 'تصحيح سجلات الموظفين',
                        'label_en' => 'Correct staff records',
                        'legacy' => ['staff.manage', 'staff.team_manage'],
                    ],
                    [
                        'key' => 'staff.delete',
                        'label_ar' => 'حذف سجل موظف',
                        'label_en' => 'Delete staff records',
                        'legacy' => ['staff.manage'],
                    ],
                    [
                        'key' => 'staff.workforce.view',
                        'label_ar' => 'عرض تفاصيل Workforce',
                        'label_en' => 'View workforce details',
                        'legacy' => ['staff.view', 'staff.team_view'],
                    ],
                    [
                        'key' => 'staff.workforce.adjustments.manage',
                        'label_ar' => 'إدارة تعديلات واستحقاقات الموظف',
                        'label_en' => 'Manage workforce adjustments',
                        'legacy' => ['staff.pay', 'staff.team_pay'],
                    ],
                ],
            ],
            'collaboration' => [
                'key' => 'collaboration',
                'title_ar' => 'التعاون داخل السجلات',
                'title_en' => 'Record Collaboration',
                'description_ar' => 'التعليقات والوسوم والمرفقات والتذكيرات والعلاقات داخل السجلات.',
                'description_en' => 'Comments, tags, attachments, reminders and record relationships.',
                'icon' => 'collaboration',
                'permissions' => [
                    [
                        'key' => 'collaboration.view',
                        'label_ar' => 'عرض التعاون داخل السجلات',
                        'label_en' => 'View record collaboration',
                    ],
                    [
                        'key' => 'collaboration.tags.manage',
                        'label_ar' => 'إدارة الوسوم',
                        'label_en' => 'Manage record tags',
                        'depends' => ['collaboration.view'],
                    ],
                    [
                        'key' => 'collaboration.comments.manage',
                        'label_ar' => 'إضافة التعليقات والمنشن',
                        'label_en' => 'Add comments & mentions',
                        'depends' => ['collaboration.view'],
                    ],
                    [
                        'key' => 'collaboration.attachments.manage',
                        'label_ar' => 'إدارة المرفقات',
                        'label_en' => 'Manage attachments',
                        'depends' => ['collaboration.view'],
                    ],
                    [
                        'key' => 'collaboration.reminders.manage',
                        'label_ar' => 'إدارة التذكيرات',
                        'label_en' => 'Manage reminders',
                        'depends' => ['collaboration.view'],
                    ],
                    [
                        'key' => 'collaboration.relationships.manage',
                        'label_ar' => 'إدارة علاقات العملاء/الموردين',
                        'label_en' => 'Manage party relationships',
                        'legacy' => ['parties.manage'],
                        'depends' => ['collaboration.view'],
                    ],
                ],
            ],
            'teamspace' => [
                'key' => 'teamspace',
                'title_ar' => 'مساحة الفريق والمراسلة',
                'title_en' => 'Team Space & Messaging',
                'description_ar' => 'المحادثات والرسائل والأعضاء والإعدادات والمكتبة والإشراف.',
                'description_en' => 'Conversations, messages, members, settings, library and moderation.',
                'icon' => 'teamspace',
                'permissions' => [
                    [
                        'key' => 'teamspace.view',
                        'label_ar' => 'فتح مساحة الفريق',
                        'label_en' => 'View Team Space',
                        'builtin' => ['owner', 'admin', 'manager', 'accountant', 'employee'],
                    ],
                    [
                        'key' => 'teamspace.people.view',
                        'label_ar' => 'عرض دليل الأشخاص',
                        'label_en' => 'View people directory',
                        'depends' => ['teamspace.view'],
                    ],
                    [
                        'key' => 'teamspace.groups.create',
                        'label_ar' => 'إنشاء محادثة جماعية',
                        'label_en' => 'Create group conversations',
                        'depends' => ['teamspace.view'],
                        'builtin' => ['owner', 'admin', 'manager'],
                    ],
                    [
                        'key' => 'teamspace.messages.view',
                        'label_ar' => 'عرض الرسائل',
                        'label_en' => 'View messages',
                        'depends' => ['teamspace.view'],
                    ],
                    [
                        'key' => 'teamspace.messages.send',
                        'label_ar' => 'إرسال وتعديل الرسائل',
                        'label_en' => 'Send/edit messages',
                        'depends' => ['teamspace.view'],
                    ],
                    [
                        'key' => 'teamspace.members.manage',
                        'label_ar' => 'إدارة أعضاء المحادثة',
                        'label_en' => 'Manage conversation members',
                        'depends' => ['teamspace.view'],
                    ],
                    [
                        'key' => 'teamspace.settings.view',
                        'label_ar' => 'عرض إعدادات المحادثة',
                        'label_en' => 'View conversation settings',
                        'depends' => ['teamspace.view'],
                    ],
                    [
                        'key' => 'teamspace.settings.manage',
                        'label_ar' => 'إدارة إعدادات المحادثة',
                        'label_en' => 'Manage conversation settings',
                        'depends' => ['teamspace.view'],
                    ],
                    [
                        'key' => 'teamspace.admins.manage',
                        'label_ar' => 'إدارة مشرفي المحادثة',
                        'label_en' => 'Manage conversation admins',
                        'depends' => ['teamspace.view'],
                    ],
                    [
                        'key' => 'teamspace.restrictions.manage',
                        'label_ar' => 'إدارة قيود الأعضاء',
                        'label_en' => 'Manage member restrictions',
                        'depends' => ['teamspace.view'],
                    ],
                    [
                        'key' => 'teamspace.library.view',
                        'label_ar' => 'عرض مكتبة المحادثة',
                        'label_en' => 'View conversation library',
                        'depends' => ['teamspace.view'],
                    ],
                ],
            ],
            'workspace' => [
                'key' => 'workspace',
                'title_ar' => 'إعدادات مساحة العمل',
                'title_en' => 'Workspace Administration',
                'description_ar' => 'الأقسام والإعدادات والتخصيص والإشعارات. إدارة الأدوار تبقى للمالك فقط.',
                'description_en' => 'Departments, settings, customization and notifications. Role administration remains Owner-only.',
                'icon' => 'workspace',
                'permissions' => [
                    [
                        'key' => 'departments.view',
                        'label_ar' => 'عرض الأقسام',
                        'label_en' => 'View departments',
                        'builtin' => ['owner', 'admin', 'manager'],
                    ],
                    [
                        'key' => 'departments.manage',
                        'label_ar' => 'إدارة الأقسام',
                        'label_en' => 'Manage departments',
                        'depends' => ['departments.view'],
                        'builtin' => ['owner', 'admin', 'manager'],
                    ],
                    [
                        'key' => 'workspace.settings.view',
                        'label_ar' => 'عرض إعدادات الشركة',
                        'label_en' => 'View workspace settings',
                        'builtin' => ['owner', 'admin'],
                    ],
                    [
                        'key' => 'workspace.settings.manage',
                        'label_ar' => 'تعديل إعدادات الشركة',
                        'label_en' => 'Manage workspace settings',
                        'depends' => ['workspace.settings.view'],
                        'builtin' => ['owner', 'admin'],
                    ],
                    [
                        'key' => 'workspace.logo.manage',
                        'label_ar' => 'تغيير شعار الشركة',
                        'label_en' => 'Manage workspace logo',
                        'depends' => ['workspace.settings.view'],
                        'builtin' => ['owner', 'admin'],
                    ],
                    [
                        'key' => 'workspace.customization.view',
                        'label_ar' => 'عرض التخصيصات',
                        'label_en' => 'View workspace customization',
                        'builtin' => ['owner', 'admin'],
                    ],
                    [
                        'key' => 'workspace.custom_fields.manage',
                        'label_ar' => 'إدارة الحقول المخصصة',
                        'label_en' => 'Manage custom fields',
                        'depends' => ['workspace.customization.view'],
                        'builtin' => ['owner', 'admin'],
                    ],
                    [
                        'key' => 'workspace.custom_statuses.manage',
                        'label_ar' => 'إدارة الحالات المخصصة',
                        'label_en' => 'Manage custom statuses',
                        'depends' => ['workspace.customization.view'],
                        'builtin' => ['owner', 'admin'],
                    ],
                    [
                        'key' => 'workspace.approval_rules.manage',
                        'label_ar' => 'إدارة قواعد الموافقة',
                        'label_en' => 'Manage approval rules',
                        'depends' => ['workspace.customization.view'],
                        'builtin' => ['owner', 'admin'],
                    ],
                    [
                        'key' => 'workspace.record_customization.manage',
                        'label_ar' => 'تعديل تخصيصات السجلات',
                        'label_en' => 'Manage record customization',
                        'depends' => ['workspace.customization.view'],
                    ],
                    [
                        'key' => 'notifications.view',
                        'label_ar' => 'عرض الإشعارات',
                        'label_en' => 'View notifications',
                        'builtin' => ['owner', 'admin', 'manager', 'accountant', 'employee'],
                    ],
                    [
                        'key' => 'notifications.rules.manage',
                        'label_ar' => 'إدارة قواعد الإشعارات',
                        'label_en' => 'Manage notification rules',
                        'depends' => ['notifications.view'],
                        'builtin' => ['owner', 'admin', 'manager'],
                    ],
                    [
                        'key' => 'notifications.read.manage',
                        'label_ar' => 'تحديث حالة قراءة الإشعارات',
                        'label_en' => 'Manage notification read state',
                        'depends' => ['notifications.view'],
                    ],
                ],
            ],
        ];
    }

    /** @return list<string> */
    public static function keys(): array
    {
        $keys = [];

        foreach (self::groups() as $group) {
            foreach ($group['permissions'] as $permission) {
                $keys[] = $permission['key'];
            }
        }

        return array_values(array_unique($keys));
    }

    /** @return array<string, array<string, mixed>> */
    public static function permissions(): array
    {
        $permissions = [];

        foreach (self::groups() as $group) {
            foreach ($group['permissions'] as $permission) {
                $permission['group'] = $group['key'];
                $permissions[$permission['key']] = $permission;
            }
        }

        return $permissions;
    }

    /** @return array<string, list<string>> */
    public static function dependencies(): array
    {
        $dependencies = [];

        foreach (self::permissions() as $key => $permission) {
            $dependencies[$key] = array_values(array_unique($permission['depends'] ?? []));
        }

        return $dependencies;
    }

    /**
     * Add catalog dependencies recursively while discarding unknown keys.
     *
     * @param  list<string>  $permissions
     * @return list<string>
     */
    public static function normalize(array $permissions): array
    {
        $known = array_flip(self::keys());
        $dependencies = self::dependencies();
        $normalized = array_values(array_unique(array_filter(
            $permissions,
            fn ($permission): bool => is_string($permission) && isset($known[$permission]),
        )));

        $queue = $normalized;

        while ($queue !== []) {
            $permission = array_shift($queue);

            foreach ($dependencies[$permission] ?? [] as $dependency) {
                if (! in_array($dependency, $normalized, true)) {
                    $normalized[] = $dependency;
                    $queue[] = $dependency;
                }
            }
        }

        return array_values(array_unique($normalized));
    }

    /**
     * Resolve the effective feature permissions represented by one built-in or
     * custom workspace role without relying on the currently authenticated
     * user's role.
     *
     * @param  list<string>|null  $customPermissions
     * @return list<string>
     */
    public static function effectiveForRole(
        string $baseRole,
        ?array $customPermissions = null,
    ): array {
        return array_values(array_filter(
            self::keys(),
            fn (string $permission): bool =>
                self::allowsForRole(
                    $baseRole,
                    $customPermissions,
                    $permission,
                ),
        ));
    }

    /**
     * Evaluate one permission for an arbitrary membership role.
     *
     * @param  list<string>|null  $customPermissions
     */
    public static function allowsForRole(
        string $baseRole,
        ?array $customPermissions,
        string $permission,
    ): bool {
        $meta = self::permissions()[$permission] ?? null;

        if (! $meta) {
            return false;
        }

        if (
            in_array(
                $baseRole,
                [
                    'owner',
                    'admin',
                ],
                true,
            )
        ) {
            return true;
        }

        if ($customPermissions === null) {
            $basePermissions =
                WorkspaceRoleCatalog::builtInPermissions(
                    $baseRole,
                );

            if (
                in_array(
                    $permission,
                    $basePermissions,
                    true,
                )
            ) {
                return true;
            }
        }

        if ($customPermissions !== null) {
            $granted = array_values(array_unique($customPermissions));

            if (in_array($permission, $granted, true)) {
                return true;
            }

            $group =
                $meta['group']
                ?? null;

            $hasGroupSelection = false;

            if ($group) {
                foreach (self::permissions() as $candidateKey => $candidate) {
                    if (
                        ($candidate['group'] ?? null) === $group
                        && in_array(
                            $candidateKey,
                            $granted,
                            true,
                        )
                    ) {
                        $hasGroupSelection = true;
                        break;
                    }
                }
            }

            $builtin = $meta['builtin'] ?? [];

            if (
                ! $hasGroupSelection
                && in_array(
                    $baseRole,
                    $builtin,
                    true,
                )
            ) {
                return true;
            }

            $legacy = $meta['legacy'] ?? [];

            if ($legacy === []) {
                return false;
            }

            $hasGranularSibling = false;

            foreach (self::permissions() as $candidateKey => $candidate) {
                if ($candidateKey === $permission) {
                    continue;
                }

                if (
                    array_intersect(
                        $legacy,
                        $candidate['legacy'] ?? [],
                    ) !== []
                    && in_array($candidateKey, $granted, true)
                ) {
                    $hasGranularSibling = true;
                    break;
                }
            }

            if ($hasGranularSibling) {
                return false;
            }

            return array_intersect($legacy, $granted) !== [];
        }

        $builtin = $meta['builtin'] ?? [];

        if ($builtin !== []) {
            return in_array($baseRole, $builtin, true);
        }

        $legacy = $meta['legacy'] ?? [];

        if ($legacy === []) {
            return false;
        }

        return array_intersect(
            $legacy,
            WorkspaceRoleCatalog::builtInPermissions($baseRole),
        ) !== [];
    }

    /**
     * Determine whether the current user has one granular feature permission.
     *
     * Existing custom roles keep their previous broad access until the role is
     * edited with granular permissions. Once any granular sibling exists for a
     * legacy umbrella, exact feature permissions become authoritative.
     */
    public static function allows(User $user, string $permission): bool
    {
        $meta = self::permissions()[$permission] ?? null;

        if (! $meta) {
            return false;
        }

        $context = app(TenantContext::class);
        $role = $context->role()->value;

        $custom = WorkspacePermissions::custom(
            $user->id,
            $context->id(),
        );

        return self::allowsForRole(
            $role,
            $custom
                ? ($custom->permissions ?? [])
                : null,
            $permission,
        );
    }

    public static function authorize(User $user, string $permission): void
    {
        abort_unless(self::allows($user, $permission), 403);
    }

    /**
     * Enforce a mapped feature permission for requests that run inside a
     * resolved workspace. Unmapped routes continue using their existing
     * policy/authorization checks.
     */
    public static function authorizeRequest(Request $request): void
    {
        $permission = self::resolveRequestPermission($request);

        if (! $permission || ! $request->user()) {
            return;
        }

        self::authorize($request->user(), $permission);
    }

    public static function resolveRequestPermission(Request $request): ?string
    {
        $method = strtoupper($request->method());
        $path = trim($request->path(), '/');

        if (
            $path === 'api/team-space'
            && $method === 'POST'
        ) {
            return $request->input('kind') === 'group'
                ? 'teamspace.groups.create'
                : 'teamspace.view';
        }

        // Dynamic business-control features.
        if (Str::is('api/control/*', $path)) {
            if (Str::is('api/control/expense-claims/*/receipt', $path)) {
                return $method === 'GET'
                    ? 'controls.expense_claims.view'
                    : 'controls.expense_claims.receipts.manage';
            }

            if (Str::is('api/control/petty-cash/*/transactions', $path)) {
                return 'controls.petty_cash.transactions.manage';
            }

            $feature = (string) $request->route('feature');
            $map = [
                'expiry-alerts' => 'controls.expiry_alerts',
                'landed-costs' => 'controls.landed_costs',
                'exchange-rates' => 'controls.exchange_rates',
                'budgets' => 'controls.budgets',
                'spending-limits' => 'controls.spending_limits',
                'expense-claims' => 'controls.expense_claims',
                'petty-cash' => 'controls.petty_cash',
                'recurring-expenses' => 'controls.recurring_expenses',
                'contracts' => 'controls.contracts',
                'document-expiry' => 'controls.document_expiry',
                'data-quality' => 'controls.data_quality',
            ];

            if (isset($map[$feature])) {
                if ($feature === 'expense-claims' && $method === 'POST') {
                    return 'controls.expense_claims.create';
                }

                return $map[$feature].($method === 'GET' ? '.view' : '.manage');
            }

            if (Str::is('api/control-lookups', $path)) {
                return 'controls.lookups.view';
            }
        }

        if ($path === 'api/control-lookups') {
            return 'controls.lookups.view';
        }

        // Dynamic commercial-operation features.
        if (Str::is('api/operations/*', $path)) {
            if (Str::is('api/operations/unallocated/*/prepare-allocation', $path)) {
                return 'operations.unallocated.allocate';
            }

            if (Str::is('api/operations/warranties/*/claims*', $path)) {
                return 'operations.warranties.manage';
            }

            $feature = (string) $request->route('feature');
            $slug = [
                'ar-aging' => 'ar_aging',
                'ap-aging' => 'ap_aging',
                'sales-orders' => 'sales_orders',
                'purchase-orders' => 'purchase_orders',
            ][$feature] ?? $feature;

            $viewOnly = [
                'unallocated',
                'collections',
                'ar_aging',
                'ap_aging',
                'backorders',
            ];

            $convertible = [
                'quotations',
                'proformas',
                'sales_orders',
                'purchase_orders',
            ];

            if (in_array($slug, $convertible, true) && Str::is('api/operations/*/*/convert', $path)) {
                return 'operations.'.$slug.'.convert';
            }

            if (in_array($slug, $viewOnly, true)) {
                return 'operations.'.$slug.'.view';
            }

            if (in_array($slug, [
                'promises',
                'pipeline',
                'returns',
                'warranties',
                'serials',
                'batches',
                ...$convertible,
            ], true)) {
                return 'operations.'.$slug.($method === 'GET' ? '.view' : '.manage');
            }
        }

        $rules = [
            // Products.
            ['GET', 'api/products/*/360', 'products.insights.view'],
            ['GET', 'api/products/import-template', 'products.import.preview'],
            ['POST', 'api/products/import/preview', 'products.import.preview'],
            ['POST', 'api/products/import', 'products.import.commit'],
            ['GET', 'api/products/export/*', 'products.export'],
            ['POST', 'api/products/bulk-action', 'products.bulk.actions'],
            ['POST', 'api/products/bulk-edit', 'products.bulk.edit'],
            ['DELETE', 'api/products/*/permanent', 'products.delete_permanent'],
            ['GET', 'api/products/*/production-recipe', 'products.production_recipe.view'],
            ['POST', 'api/products/*/production-recipe', 'products.production_recipe.manage'],
            ['GET', 'api/products/*/production', 'products.production_history.view'],
            ['GET', 'api/products/*/service-operations', 'products.service_operations.view'],

            // Parties.
            ['GET', 'api/parties/*/account', 'parties.account.view'],
            ['PATCH', 'api/parties/*/opening-balances', 'parties.account.opening_balance.manage'],
            ['DELETE', 'api/parties/*/opening-balances/*', 'parties.account.opening_balance.manage'],
            ['GET', 'api/parties/*/360', 'parties.insights.view'],
            ['PATCH', 'api/parties/*/notes', 'parties.notes.update'],
            ['GET', 'api/parties/import-template', 'parties.import.preview'],
            ['POST', 'api/parties/import/preview', 'parties.import.preview'],
            ['POST', 'api/parties/import', 'parties.import.commit'],
            ['GET', 'api/parties/export/*', 'parties.export'],
            ['POST', 'api/parties/bulk', 'parties.bulk.actions'],
            ['POST', 'api/parties/bulk-edit', 'parties.bulk.edit'],
            ['DELETE', 'api/parties/*/permanent', 'parties.delete_permanent'],
            ['GET', 'api/parties/*/prices', 'parties.pricing.view'],
            ['POST', 'api/parties/*/prices', 'parties.pricing.manage'],
            ['DELETE', 'api/parties/*/prices/*', 'parties.pricing.manage'],

            // Inventory and production.
            ['GET', 'api/inventory/overview', 'inventory.overview.view'],
            ['GET', 'api/inventory/intelligence', 'inventory.intelligence.view'],
            ['GET', 'api/inventory/products/*', 'inventory.product.view'],
            ['PATCH', 'api/inventory/products/*/settings', 'inventory.product_settings.manage'],
            ['POST', 'api/inventory/products/*/opening-stock', 'inventory.opening_stock.manage'],
            ['POST', 'api/inventory/products/*/adjust', 'inventory.adjustments.manage'],
            ['POST', 'api/inventory/products/*/transfer', 'inventory.stock_transfer.manage'],
            ['GET', 'api/inventory/transfer-requests', 'inventory.transfer_requests.view'],
            ['POST', 'api/inventory/transfer-requests', 'inventory.transfer_requests.create'],
            ['PATCH', 'api/inventory/transfer-requests/*', 'inventory.transfer_requests.review'],
            ['GET', 'api/warehouses', 'inventory.warehouses.view'],
            ['GET', 'api/warehouses/*/inventory-products', 'inventory.warehouses.view'],
            ['POST', 'api/warehouses', 'inventory.warehouses.manage'],
            ['PATCH', 'api/warehouses/*', 'inventory.warehouses.manage'],
            ['POST', 'api/warehouses/*/default', 'inventory.warehouses.default.manage'],
            ['DELETE', 'api/warehouses/*/permanent', 'inventory.warehouses.delete_permanent'],
            ['DELETE', 'api/warehouses/*', 'inventory.warehouses.archive'],
            ['POST', 'api/warehouses/*/restore', 'inventory.warehouses.archive'],
            ['GET', 'api/production-runs', 'production.runs.view'],
            ['GET', 'api/production-runs/*', 'production.runs.view'],
            ['POST', 'api/production-runs', 'production.runs.create'],
            ['PATCH', 'api/production-runs/*', 'production.runs.update'],
            ['DELETE', 'api/production-runs/*', 'production.runs.delete'],
            ['POST', 'api/production-runs/*/post', 'production.runs.post'],
            ['POST', 'api/production-runs/*/reverse', 'production.runs.reverse'],
            ['POST', 'api/production-runs/*/outputs/*/reverse', 'production.runs.reverse'],

            // Invoice automation and document lifecycle.
            ['GET', 'api/finance/invoice-automation', 'finance.automation.view'],
            ['POST', 'api/finance/documents/*/templates', 'finance.automation.templates.manage'],
            ['POST', 'api/finance/invoice-templates/*/create-draft', 'finance.automation.templates.manage'],
            ['DELETE', 'api/finance/invoice-templates/*', 'finance.automation.templates.manage'],
            ['POST', 'api/finance/documents/*/recurring', 'finance.automation.recurring.manage'],
            ['PATCH', 'api/finance/recurring-invoices/*', 'finance.automation.recurring.manage'],
            ['DELETE', 'api/finance/recurring-invoices/*', 'finance.automation.recurring.manage'],
            ['GET', 'api/finance-import/template/*', 'finance.import.template'],
            ['POST', 'api/finance-import/preview', 'finance.import.preview'],
            ['POST', 'api/finance-import/commit', 'finance.import.commit'],
            ['GET', 'api/finance/lookups', 'finance.lookups.view'],
            ['GET', 'api/finance/reference-price', 'finance.reference_price.view'],
            ['POST', 'api/finance/documents', 'finance.documents.create'],
            ['PATCH', 'api/finance/documents/*', 'finance.documents.update'],
            ['DELETE', 'api/finance/documents/*', 'finance.documents.delete'],
            ['POST', 'api/finance/documents/*/issue', 'finance.documents.issue'],
            ['POST', 'api/finance/documents/*/correct', 'finance.documents.correct'],
            ['POST', 'api/finance/documents/*/void', 'finance.documents.void'],
            ['POST', 'api/finance/documents/*/apply-credit', 'finance.documents.apply_credit'],
            ['GET', 'api/finance/documents/*/fulfillments', 'finance.fulfillments.view'],
            ['POST', 'api/finance/documents/*/fulfillments', 'finance.fulfillments.manage'],
            ['DELETE', 'api/finance/documents/*/fulfillments/*', 'finance.fulfillments.manage'],

            // Cash.
            ['POST', 'api/finance/cash-movements/duplicate-check', 'finance.cash.duplicate_check'],
            ['POST', 'api/finance/cash-movements', 'finance.cash.create'],
            ['PATCH', 'api/finance/cash-movements/*', 'finance.cash.update'],
            ['POST', 'api/finance/cash-movements/*/post', 'finance.cash.post'],
            ['POST', 'api/finance/cash-movements/*/reverse', 'finance.cash.reverse'],
            ['POST', 'api/finance/cash-movements/*/correct', 'finance.cash.correct'],
            ['PATCH', 'api/finance/cash-movements/*/check-status', 'finance.cash.check_status'],

            // Tax / approvals / requisitions / reconciliation.
            ['GET', 'api/approval-requests', 'finance.approvals.view'],
            ['PATCH', 'api/approval-requests/*', 'finance.approvals.review'],
            ['POST', 'api/finance/tax-rules', 'finance.taxes.rules.manage'],
            ['PATCH', 'api/finance/tax-rules/*', 'finance.taxes.rules.manage'],
            ['POST', 'api/finance/government-obligations', 'finance.taxes.obligations.manage'],
            ['GET', 'api/purchase-requisitions', 'finance.requisitions.view'],
            ['POST', 'api/purchase-requisitions', 'finance.requisitions.create'],
            ['PATCH', 'api/purchase-requisitions/*/review', 'finance.requisitions.review'],
            ['POST', 'api/purchase-requisitions/*/convert', 'finance.requisitions.convert'],
            ['GET', 'api/bank-reconciliation', 'finance.reconciliation.view'],
            ['POST', 'api/bank-reconciliation/import', 'finance.reconciliation.import'],
            ['GET', 'api/bank-reconciliation/*/candidates', 'finance.reconciliation.view'],
            ['POST', 'api/bank-reconciliation/*/match', 'finance.reconciliation.match'],
            ['POST', 'api/bank-reconciliation/*/ignore', 'finance.reconciliation.ignore'],

            // Payment plans.
            ['GET', 'api/payment-plans/reminders', 'payments.reminders.view'],
            ['GET', 'api/payment-records', 'payments.history.view'],
            ['PATCH', 'api/payment-plans/*', 'payments.plans.toggle'],

            // Reports.
            ['GET', 'api/report-builder', 'reports.builder.view'],
            ['POST', 'api/report-builder', 'reports.builder.create'],
            ['PATCH', 'api/report-builder/*', 'reports.builder.update'],
            ['DELETE', 'api/report-builder/*', 'reports.builder.delete'],
            ['POST', 'api/report-builder/run', 'reports.builder.run'],
            ['GET', 'api/report-builder/*/versions', 'reports.builder.versions.view'],
            ['POST', 'api/report-builder/*/versions/*/restore', 'reports.builder.versions.restore'],
            ['GET', 'api/report-studio', 'reports.studio.view'],
            ['POST', 'api/report-studio/run', 'reports.studio.run'],
            ['POST', 'api/report-studio/drill-down', 'reports.studio.drill_down'],
            ['POST', 'api/report-studio/visualizations', 'reports.studio.visualizations.manage'],
            ['POST', 'api/report-studio/configuration', 'reports.studio.configuration.manage'],
            ['POST', 'api/report-studio/natural-language', 'reports.studio.natural_language'],
            ['POST', 'api/report-studio/snapshots', 'reports.studio.snapshots.create'],
            ['POST', 'api/report-studio/annotations', 'reports.studio.annotations.manage'],
            ['POST', 'api/report-studio/comments', 'reports.studio.comments.manage'],
            ['POST', 'api/report-studio/approvals', 'reports.studio.approvals.review'],
            ['POST', 'api/report-studio/targets', 'reports.studio.targets.manage'],
            ['POST', 'api/report-studio/presets', 'reports.studio.presets.manage'],
            ['POST', 'api/report-studio/boards', 'reports.studio.boards.manage'],
            ['GET', 'api/scheduled-reports', 'reports.scheduled.view'],
            ['POST', 'api/scheduled-reports', 'reports.scheduled.create'],
            ['PATCH', 'api/scheduled-reports/*', 'reports.scheduled.update'],
            ['POST', 'api/scheduled-reports/*/run', 'reports.scheduled.run'],

            // Dashboard intelligence.
            ['GET', 'api/dashboard-intelligence', 'dashboard.view'],
            ['PATCH', 'api/dashboard-intelligence/preferences', 'dashboard.customize'],
            ['POST', 'api/dashboard-intelligence/kpi-targets', 'dashboard.targets.manage'],
            ['PATCH', 'api/dashboard-intelligence/kpi-targets/*', 'dashboard.targets.manage'],
            ['DELETE', 'api/dashboard-intelligence/kpi-targets/*', 'dashboard.targets.manage'],
            ['GET', 'api/business-pulse/brief', 'intelligence.business_pulse.view'],
            ['GET', 'api/business-pulse/follow-ups', 'intelligence.followups.view'],
            ['GET', 'api/business-pulse/cashflow', 'intelligence.cashflow.view'],
            ['GET', 'api/business-pulse/anomalies', 'intelligence.anomalies.view'],
            ['GET', 'api/customer-intelligence', 'intelligence.customers.view'],

            // Audit / restore.
            ['GET', 'api/audit-center', 'audit.center.view'],
            ['GET', 'api/bulk-action-history', 'audit.bulk_actions.view'],
            ['GET', 'api/restore-center', 'audit.restore.view'],
            ['POST', 'api/restore-center/*/*', 'audit.restore.execute'],
            ['GET', 'api/system-checks', 'audit.system_checks.view'],

            // Staff.
            ['POST', 'api/staff/*/invitation', 'staff.invitations.manage'],
            ['DELETE', 'api/staff/*', 'staff.delete'],
            ['GET', 'api/staff/*/workforce', 'staff.workforce.view'],
            ['POST', 'api/staff/*/adjustments', 'staff.workforce.adjustments.manage'],
            ['PATCH', 'api/staff/*/adjustments/*', 'staff.workforce.adjustments.manage'],
            ['POST', 'api/staff/*/adjustments/accrue', 'staff.workforce.adjustments.manage'],

            // Record collaboration.
            ['GET', 'api/records/*/*/collaboration', 'collaboration.view'],
            ['POST', 'api/records/*/*/tags', 'collaboration.tags.manage'],
            ['DELETE', 'api/records/*/*/tags/*', 'collaboration.tags.manage'],
            ['POST', 'api/records/*/*/comments', 'collaboration.comments.manage'],
            ['POST', 'api/records/*/*/attachments', 'collaboration.attachments.manage'],
            ['DELETE', 'api/records/*/*/attachments/*', 'collaboration.attachments.manage'],
            ['POST', 'api/records/*/*/reminders', 'collaboration.reminders.manage'],
            ['PATCH', 'api/records/*/*/reminders/*/complete', 'collaboration.reminders.manage'],
            ['POST', 'api/records/party/*/relationships', 'collaboration.relationships.manage'],
            ['DELETE', 'api/records/party/*/relationships/*', 'collaboration.relationships.manage'],

            // Team Space.
            ['GET', 'api/team-space', 'teamspace.view'],
            ['GET', 'api/team-space/people', 'teamspace.people.view'],
            ['POST', 'api/team-space', 'teamspace.groups.create'],
            ['GET', 'api/team-space/*/messages', 'teamspace.messages.view'],
            ['POST', 'api/team-space/*/messages', 'teamspace.messages.send'],
            ['PATCH', 'api/team-space/*/members', 'teamspace.members.manage'],
            ['GET', 'api/team-space/*/settings', 'teamspace.settings.view'],
            ['POST', 'api/team-space/*/settings', 'teamspace.settings.manage'],
            ['PUT', 'api/team-space/*/people/*/admin', 'teamspace.admins.manage'],
            ['PUT', 'api/team-space/*/people/*/restriction', 'teamspace.restrictions.manage'],
            ['GET', 'api/team-space/*/library', 'teamspace.library.view'],

            // Workspace settings and notifications.
            ['GET', 'api/departments', 'departments.view'],
            ['POST', 'api/departments', 'departments.manage'],
            ['PATCH', 'api/departments/*', 'departments.manage'],
            ['GET', 'api/workspace-settings', 'workspace.settings.view'],
            ['PATCH', 'api/workspace-settings', 'workspace.settings.manage'],
            ['POST', 'api/workspace-settings/logo', 'workspace.logo.manage'],
            ['GET', 'api/workspace-customization', 'workspace.customization.view'],
            ['POST', 'api/workspace-customization/fields', 'workspace.custom_fields.manage'],
            ['PATCH', 'api/workspace-customization/fields/*', 'workspace.custom_fields.manage'],
            ['DELETE', 'api/workspace-customization/fields/*', 'workspace.custom_fields.manage'],
            ['POST', 'api/workspace-customization/statuses', 'workspace.custom_statuses.manage'],
            ['PATCH', 'api/workspace-customization/statuses/*', 'workspace.custom_statuses.manage'],
            ['DELETE', 'api/workspace-customization/statuses/*', 'workspace.custom_statuses.manage'],
            ['POST', 'api/workspace-customization/approval-rules', 'workspace.approval_rules.manage'],
            ['PATCH', 'api/workspace-customization/approval-rules/*', 'workspace.approval_rules.manage'],
            ['DELETE', 'api/workspace-customization/approval-rules/*', 'workspace.approval_rules.manage'],
            ['PATCH', 'api/records/*/*/customization', 'workspace.record_customization.manage'],
            ['GET', 'api/notifications', 'notifications.view'],
            ['GET', 'api/notifications/digest', 'notifications.view'],
            ['GET', 'api/notification-rules', 'notifications.view'],
            ['POST', 'api/notification-rules', 'notifications.rules.manage'],
            ['PATCH', 'api/notification-rules/*', 'notifications.rules.manage'],
            ['DELETE', 'api/notification-rules/*', 'notifications.rules.manage'],
            ['POST', 'api/notifications/read-all', 'notifications.read.manage'],
            ['PATCH', 'api/notifications/*/read', 'notifications.read.manage'],
        ];

        foreach ($rules as [$ruleMethod, $pattern, $permission]) {
            if ($method === $ruleMethod && Str::is($pattern, $path)) {
                return $permission;
            }
        }

        return null;
    }
}
