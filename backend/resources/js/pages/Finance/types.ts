export type FinanceView =
    | 'hub'
    | 'sales-list'
    | 'sales-create'
    | 'sales-detail'
    | 'purchase-list'
    | 'purchase-create'
    | 'purchase-detail'
    | 'payment-list'
    | 'payment-create'
    | 'payment-detail'
    | 'receipt-list'
    | 'receipt-create'
    | 'receipt-detail'
    | 'taxes';

export type LookupParty = {
    id: number;
    name: string;
    email: string | null;
    phone: string | null;
    tax_number: string | null;
    country_code: string | null;
    region_code: string | null;
    roles: string[];
};

export type LookupProduct = {
    id: number;
    name: string;
    sku: string | null;
    type: string;
    unit: string | null;
    unit_price: string;
    cost_price: string;
    tax_rate: string;
    track_inventory: boolean;
};

export type LookupWarehouse = {
    id: number;
    code: string;
    name: string;
    is_default: boolean;
};

export type TaxRule = {
    id: number;
    name: string;
    code: string;
    tax_type: string;
    country_code: string;
    region_code: string | null;
    applies_to: 'sales' | 'purchases' | 'both';
    rate: string;
    inclusive: boolean;
    recoverable: boolean;
    effective_from: string | null;
    effective_to: string | null;
    active?: boolean;
    notes?: string | null;
};

export type GovernmentObligation = {
    id: number;
    tax_rule_id: number | null;
    authority_name: string;
    title: string;
    obligation_type?: string;
    country_code: string;
    region_code: string | null;
    period_start?: string | null;
    period_end?: string | null;
    due_date: string;
    amount: string;
    paid_total: string;
    balance_due: string;
    currency: string;
    status: string;
    notes?: string | null;
};

export type FinancePermissions = {
    sales_view: boolean;
    sales_manage: boolean;
    purchases_view: boolean;
    purchases_manage: boolean;
    cash_view: boolean;
    cash_pay: boolean;
    cash_receive: boolean;
    cash_correct: boolean;
    documents_correct: boolean;
    taxes_view: boolean;
    taxes_manage: boolean;
    recurring_payments_view: boolean;
};

export type FinanceLookups = {
    currency: string;
    parties: LookupParty[];
    products: LookupProduct[];
    warehouses: LookupWarehouse[];
    departments: { id: number; name: string }[];
    tax_rules: TaxRule[];
    government_obligations: GovernmentObligation[];
    permissions: FinancePermissions;
};

export type DocumentRow = {
    id: number;
    number: string;
    external_number: string | null;
    kind: 'sale_invoice' | 'purchase_invoice';
    status: string;
    revision: number;
    party: { id: number; name: string } | null;
    issue_date: string;
    due_date: string | null;
    activity_type: string | null;
    market_type: string | null;
    currency: string;
    total: string;
    paid_total: string;
    balance_due: string;
    credit_total: string;
};

export type DocumentLine = {
    id?: number;
    product_id: number | null;
    warehouse_id: number | null;
    tax_rule_id: number | null;
    description: string;
    sku?: string | null;
    unit: string;
    quantity: string;
    unit_price: string;
    price_status: 'estimated' | 'final';
    discount_percent: string;
    tax_name?: string | null;
    tax_rate: string;
    line_subtotal?: string;
    line_discount?: string;
    line_tax?: string;
    line_total?: string;
    affects_inventory: boolean;
};

export type DocumentDetail = DocumentRow & {
    root_document_id: number | null;
    corrected_from_id: number | null;
    warehouse_id: number | null;
    department_id: number | null;
    branch_label: string | null;
    exchange_rate: string;
    subtotal: string;
    discount_total: string;
    tax_total: string;
    shipping_total: string;
    payment_terms: string | null;
    notes: string | null;
    internal_notes: string | null;
    correction_reason: string | null;
    issued_at: string | null;
    warnings: string[];
    party_detail: LookupParty | null;
    lines: DocumentLine[];
    allocations: {
        id: number;
        cash_movement_id: number;
        cash_number: string | null;
        amount: string;
        movement_date: string | null;
        method: string | null;
        status: string | null;
    }[];
};

export type CashRow = {
    id: number;
    number: string;
    direction: 'incoming' | 'outgoing';
    status: string;
    category: string;
    party: { id: number; name: string } | null;
    amount: string;
    currency: string;
    movement_date: string;
    method: string;
    reference: string | null;
    check_number: string | null;
    check_due_date: string | null;
    check_status: string | null;
};

export type CashDetail = CashRow & {
    party_id: number | null;
    government_obligation_id: number | null;
    department_id: number | null;
    corrected_from_id: number | null;
    reversal_of_id: number | null;
    account_label: string | null;
    branch_label: string | null;
    cost_center: string | null;
    check_bank: string | null;
    method_details: Record<string, unknown> | null;
    notes: string | null;
    correction_reason: string | null;
    posted_at: string | null;
    allocations: {
        id: number;
        financial_document_id: number;
        document_number: string | null;
        document_total: string | null;
        document_balance_due: string | null;
        amount: string;
    }[];
    government_obligation: {
        id: number;
        title: string;
        authority_name: string;
        balance_due: string;
    } | null;
};

export type AuditEvent = {
    id: number;
    action: string;
    reason: string | null;
    created_at: string | null;
};
