export default {
    en: {
        'production.rawMaterial': 'Raw material',
        'production.rawMaterialHelp': 'Material consumed to manufacture products',
        'production.title': 'Production',
        'production.help': 'Record a finished-product batch and the actual total quantities of raw materials consumed. Materials are deducted and finished goods are added in the selected warehouse together.',
        'production.setup': 'First enable inventory tracking for the finished product and raw materials, and record the raw-material stock in Inventory.',
        'production.record': 'Record production',
        'production.warehouse': 'Production warehouse',
        'production.chooseWarehouse': 'Choose a warehouse',
        'production.output': 'Finished quantity',
        'production.search': 'Search and add raw materials',
        'production.consumed': 'Total consumed for this batch',
        'production.remove': 'Remove',
        'production.untracked': 'Enable inventory tracking first',
        'production.noMaterials': 'No matching raw materials. Create a raw-material item or change the search.',
        'production.saved': 'Production recorded. Raw materials were deducted and finished stock was added.',
        'production.history': 'Production history',
        'production.empty': 'No production recorded yet.',
        'inventory.movement.production_in': 'Production receipt',
        'inventory.movement.production_out': 'Production consumption',
        'catalog.operations.title': 'Service operations',
        'catalog.operations.help': 'Record service operations for customers, suppliers, or general contacts. Each operation has its own quantity and price, with no warehouse balance.',
        'catalog.operations.new': 'Record a service operation',
        'catalog.operations.customer': 'Party',
        'catalog.operations.customerRole': 'Customer',
        'catalog.operations.supplierRole': 'Supplier',
        'catalog.operations.searchCustomer': 'Search customers, suppliers, or general contacts',
        'catalog.operations.selected': 'Selected party',
        'catalog.operations.noCustomers': 'No matching parties. Add a party or try another search.',
        'catalog.operations.date': 'Service date',
        'catalog.operations.quantity': 'Quantity',
        'catalog.operations.price': 'Price per unit for this operation',
        'catalog.operations.priceHelp': 'The catalog price is a starting value. Change it for this party without changing the service’s default price.',
        'catalog.operations.subtotal': 'Amount before tax',
        'catalog.operations.notes': 'Operation details (optional)',
        'catalog.operations.save': 'Save service operation',
        'catalog.operations.saving': 'Saving…',
        'catalog.operations.saved': 'Service operation saved. Stock was not changed.',
        'catalog.operations.history': 'Recorded operations',
        'catalog.operations.empty': 'No service operations recorded yet.',
        'catalog.operations.loading': 'Loading…',
        'catalog.operations.failed': 'Unable to complete the request. Please try again.',
        'catalog.operations.retry': 'Retry',
        'catalog.operations.previous': 'Previous',
        'catalog.operations.next': 'Next',
        'catalog.productRuleTitle':
            'Physical Product',

        'catalog.productRuleHelp':
            'Products can optionally track physical quantities across warehouses. Stock quantities change only through Inventory movements.',

        'catalog.serviceRuleTitle':
            'Service billing',

        'catalog.serviceRuleHelp':
            'Services never have warehouse stock. Their quantity is commercial: hours, visits, trips, kilometres, people, days, projects, or another billing unit.',

        'catalog.serviceNoWarehouse':
            'No opening stock, stock adjustment, transfer, reservation, or warehouse balance is created for a Service.',

        'catalog.productToServiceWarning':
            'Changing an existing Product to a Service is allowed only before it has warehouse stock or stock-movement history.',

        'catalog.stockSalesUnit':
            'Sales / stock unit',

        'catalog.billingUnit':
            'Billing unit',

        'catalog.unitSuggestions':
            'Quick units',

        'catalog.productPrice':
            'Selling price',

        'catalog.servicePrice':
            'Default price per billing unit',

        'catalog.quantityExampleProduct':
            'Example: 3 pieces × price. When inventory tracking is enabled, physical stock is reduced by the business document later.',

        'catalog.quantityExampleService':
            'After saving, open the service details to record a customer operation: 4 hours × hourly price or 3 trips × trip price. Set the quantity and price for each operation without affecting stock.',

        'catalog.unit.unit':
            'Unit',

        'catalog.unit.piece':
            'Piece',

        'catalog.unit.box':
            'Box',

        'catalog.unit.kg':
            'kg',

        'catalog.unit.liter':
            'Liter',

        'catalog.unit.meter':
            'Meter',

        'catalog.unit.hour':
            'Hour',

        'catalog.unit.visit':
            'Visit',

        'catalog.unit.trip':
            'Trip',

        'catalog.unit.km':
            'km',

        'catalog.unit.person':
            'Person',

        'catalog.unit.day':
            'Day',

        'catalog.unit.project':
            'Project',

        'catalog.unit.job':
            'Job',
    },

    ar: {
        'production.rawMaterial': 'مادة خام',
        'production.rawMaterialHelp': 'مادة تُستهلك في تصنيع المنتجات',
        'production.title': 'الإنتاج',
        'production.help': 'سجّل دفعة إنتاج وحدّد إجمالي الكميات الفعلية المستهلكة من المواد الخام. تُخصم المواد وتُضاف المنتجات الناتجة معًا في المستودع المحدد.',
        'production.setup': 'فعّل تتبع المخزون للمنتج النهائي والمواد الخام أولًا، وسجّل رصيد المواد الخام من شاشة المخزون.',
        'production.record': 'تسجيل إنتاج',
        'production.warehouse': 'مستودع الإنتاج',
        'production.chooseWarehouse': 'اختر المستودع',
        'production.output': 'الكمية المنتجة',
        'production.search': 'ابحث وأضف المواد الخام',
        'production.consumed': 'إجمالي الاستهلاك لهذه الدفعة',
        'production.remove': 'إزالة',
        'production.untracked': 'فعّل تتبع المخزون أولًا',
        'production.noMaterials': 'لا توجد مواد خام مطابقة. أضف صنفًا من نوع مادة خام أو غيّر البحث.',
        'production.saved': 'تم تسجيل الإنتاج وخصم المواد الخام وإضافة كمية المنتج الناتج.',
        'production.history': 'سجل الإنتاج',
        'production.empty': 'لا توجد عمليات إنتاج بعد.',
        'inventory.movement.production_in': 'إضافة إنتاج',
        'inventory.movement.production_out': 'استهلاك إنتاج',
        'catalog.operations.title': 'عمليات الخدمة',
        'catalog.operations.help': 'سجّل عمليات الخدمة للعملاء والموردين وجهات التعامل الأخرى. لكل عملية كميتها وسعرها، بدون رصيد مستودع.',
        'catalog.operations.new': 'تسجيل عملية خدمة',
        'catalog.operations.customer': 'جهة التعامل',
        'catalog.operations.customerRole': 'عميل',
        'catalog.operations.supplierRole': 'مورد',
        'catalog.operations.searchCustomer': 'ابحث عن عميل أو مورد أو جهة تعامل',
        'catalog.operations.selected': 'الطرف المحدد',
        'catalog.operations.noCustomers': 'لا توجد جهة مطابقة. أضف جهة من صفحة العلاقات أو جرّب بحثًا آخر.',
        'catalog.operations.date': 'تاريخ الخدمة',
        'catalog.operations.quantity': 'الكمية',
        'catalog.operations.price': 'سعر الوحدة لهذه العملية',
        'catalog.operations.priceHelp': 'السعر مأخوذ مبدئيًا من تعريف الخدمة. يمكنك تغييره لهذا الطرف دون تغيير السعر الافتراضي للخدمة.',
        'catalog.operations.subtotal': 'المبلغ قبل الضريبة',
        'catalog.operations.notes': 'تفاصيل العملية (اختياري)',
        'catalog.operations.save': 'حفظ عملية الخدمة',
        'catalog.operations.saving': 'جارٍ الحفظ…',
        'catalog.operations.saved': 'تم حفظ عملية الخدمة دون تغيير المخزون.',
        'catalog.operations.history': 'العمليات المسجلة',
        'catalog.operations.empty': 'لم تُسجّل عمليات لهذه الخدمة بعد.',
        'catalog.operations.loading': 'جارٍ التحميل…',
        'catalog.operations.failed': 'تعذّر إكمال الطلب. حاول مرة أخرى.',
        'catalog.operations.retry': 'إعادة المحاولة',
        'catalog.operations.previous': 'السابق',
        'catalog.operations.next': 'التالي',
        'catalog.productRuleTitle':
            'منتج مادي',

        'catalog.productRuleHelp':
            'المنتجات يمكن أن تتتبع كميات فعلية موزعة بين المستودعات. كمية المخزون لا تتغير إلا من خلال حركات المخزون.',

        'catalog.serviceRuleTitle':
            'احتساب كمية الخدمة',

        'catalog.serviceRuleHelp':
            'الخدمة لا تملك مخزونًا داخل المستودعات. كميتها كمية تجارية مثل الساعات أو الزيارات أو الرحلات أو الكيلومترات أو الأشخاص أو الأيام أو المشاريع.',

        'catalog.serviceNoWarehouse':
            'الخدمة لا ينشأ لها مخزون افتتاحي أو تعديل مخزون أو تحويل أو حجز أو رصيد مستودع.',

        'catalog.productToServiceWarning':
            'تحويل منتج موجود إلى خدمة مسموح فقط قبل وجود مخزون أو أي سجل سابق لحركات المخزون.',

        'catalog.stockSalesUnit':
            'وحدة البيع والمخزون',

        'catalog.billingUnit':
            'وحدة احتساب الخدمة',

        'catalog.unitSuggestions':
            'وحدات سريعة',

        'catalog.productPrice':
            'سعر البيع',

        'catalog.servicePrice':
            'السعر الافتراضي لكل وحدة خدمة',

        'catalog.quantityExampleProduct':
            'مثال: 3 قطع × السعر. وعند تفعيل تتبع المخزون ستؤثر الكمية لاحقًا على المخزون عند اعتماد مستند البيع.',

        'catalog.quantityExampleService':
            'بعد الحفظ، افتح تفاصيل الخدمة وسجّل عملية للعميل: 4 ساعات × سعر الساعة أو 3 نقلات × سعر النقلة. تحدد الكمية والسعر لكل عملية دون التأثير على المخزون.',

        'catalog.unit.unit':
            'وحدة',

        'catalog.unit.piece':
            'قطعة',

        'catalog.unit.box':
            'صندوق',

        'catalog.unit.kg':
            'كغم',

        'catalog.unit.liter':
            'لتر',

        'catalog.unit.meter':
            'متر',

        'catalog.unit.hour':
            'ساعة',

        'catalog.unit.visit':
            'زيارة',

        'catalog.unit.trip':
            'رحلة',

        'catalog.unit.km':
            'كم',

        'catalog.unit.person':
            'شخص',

        'catalog.unit.day':
            'يوم',

        'catalog.unit.project':
            'مشروع',

        'catalog.unit.job':
            'مهمة',
    },
} as const;
