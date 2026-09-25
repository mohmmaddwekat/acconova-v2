@extends('marketing.layout')

@section('content')
<section class="page-hero">
    <div class="shell">
        <div class="breadcrumbs"><a href="{{ route('marketing.home') }}">Home</a><span>/</span><span>Features</span></div>
        <div class="section-header">
            <div class="kicker">Platform capabilities</div>
            <h1>ERP, CRM, finance, inventory and intelligence in one system.</h1>
            <p>AccoNova brings the workflows a growing company uses every day into one connected business platform, with shared data, permissions, reporting and AI-assisted operations.</p>
        </div>
    </div>
</section>

<section class="section">
    <div class="shell">
        <div class="feature-grid">
            <article class="feature-card"><div class="icon-box">CRM</div><h3>Customers, suppliers & contacts</h3><p>Manage parties once and use the same record across sales, purchasing, finance, notes and operational history.</p><ul><li>Customer and supplier 360</li><li>Relationship links</li><li>Statements and activity history</li><li>Tags, notes and collaboration</li></ul></article>
            <article class="feature-card"><div class="icon-box">INV</div><h3>Sales & purchase invoicing</h3><p>Create and manage commercial and financial documents with clear status, pricing and fulfillment workflows.</p><ul><li>Sales and purchase invoices</li><li>Quotes and proformas</li><li>Sales and purchase orders</li><li>Recurring invoice workflows</li></ul></article>
            <article class="feature-card"><div class="icon-box">PAY</div><h3>Payments, receipts & collections</h3><p>Track money moving in and out, allocations, advances, collections and outstanding balances.</p><ul><li>Receipts and payments</li><li>Partial allocations</li><li>Customer advances</li><li>Collections and payment promises</li></ul></article>
            <article class="feature-card"><div class="icon-box">STK</div><h3>Inventory & warehouses</h3><p>Keep stock, movements and warehouse activity connected to products and operational decisions.</p><ul><li>Multi-warehouse stock</li><li>Transfers and adjustments</li><li>Stock aging and expiry signals</li><li>Reorder and stockout intelligence</li></ul></article>
            <article class="feature-card"><div class="icon-box">PRD</div><h3>Products, services & production</h3><p>Maintain a central catalog, service pricing and production workflows with actual consumption history.</p><ul><li>Products and services</li><li>Customer pricing</li><li>Production recipes</li><li>Actual material consumption</li></ul></article>
            <article class="feature-card"><div class="icon-box">TSK</div><h3>Tasks, projects & teams</h3><p>Turn operational work into accountable tasks and projects connected to teams and workloads.</p><ul><li>Projects and tasks</li><li>Nested teams</li><li>Workload visibility</li><li>Attachments and collaboration</li></ul></article>
            <article class="feature-card"><div class="icon-box">HR</div><h3>Staff operations</h3><p>Manage employees, departments and selected workforce workflows alongside the rest of the business.</p><ul><li>Employee directory</li><li>Attendance and adjustments</li><li>Advances and payroll-ledger workflows</li><li>Department management</li></ul></article>
            <article class="feature-card"><div class="icon-box">RPT</div><h3>Reports, dashboards & KPIs</h3><p>Move from static reports to configurable business intelligence and management views.</p><ul><li>Report builder</li><li>Dashboard builder</li><li>KPI targets and trends</li><li>A/R and A/P aging</li></ul></article>
            <article class="feature-card"><div class="icon-box">CTL</div><h3>Permissions, approvals & controls</h3><p>Shape access around responsibilities and require approvals for sensitive workflows.</p><ul><li>Granular roles and permissions</li><li>Multi-reviewer approvals</li><li>Budget and spending controls</li><li>Audit-oriented record history</li></ul></article>
            <article class="feature-card"><div class="icon-box">AI</div><h3>AccoNova AI</h3><p>Use an assistant designed to work through permission-checked business tools instead of unrestricted raw data access.</p><ul><li>Business questions in context</li><li>Permission-aware tools</li><li>Operational summaries</li><li>Action-oriented assistance</li></ul></article>
            <article class="feature-card"><div class="icon-box">AUT</div><h3>Automation & recurring work</h3><p>Reduce repetitive work with scheduled reports, recurring records, notification rules and workflow automation.</p><ul><li>Recurring profiles</li><li>Scheduled reports</li><li>Notification rules</li><li>Operational follow-up queues</li></ul></article>
            <article class="feature-card"><div class="icon-box">IMP</div><h3>Import, export & migration</h3><p>Move structured business data into AccoNova and keep useful export paths available.</p><ul><li>Party and product imports</li><li>Finance import workflows</li><li>Employee import tools</li><li>PDF and data exports</li></ul></article>
        </div>
    </div>
</section>

<section class="section section-soft">
    <div class="shell split">
        <div class="copy-block">
            <div class="kicker">Connected workflows</div>
            <h2>The value is in the connections.</h2>
            <p>A customer record is not just a CRM contact. It connects to invoices, receipts, payment promises, profitability and activity. A product connects to pricing, stock, warehouses, purchasing and production. A team connects to permissions, tasks and approvals.</p>
            <p>Those connections are what allow AccoNova to surface better reports, cleaner follow-up queues and more useful AI context.</p>
        </div>
        <div class="contact-card">
            <h3>Example management questions</h3>
            <div class="check-list">
                <div class="check-row"><b>?</b><span>Which customers are overdue and need follow-up today?</span></div>
                <div class="check-row"><b>?</b><span>Which products are likely to stock out soon?</span></div>
                <div class="check-row"><b>?</b><span>Where is cash tied up across receivables and inventory?</span></div>
                <div class="check-row"><b>?</b><span>What changed since my last login that needs action?</span></div>
            </div>
        </div>
    </div>
</section>

<section class="section">
    <div class="shell cta-panel">
        <div><h2>Choose the level of capacity your team needs.</h2><p>Compare AccoNova plans and see how seats, storage, reporting and AI capacity scale with your company.</p></div>
        <div class="cta-actions"><a class="button button-primary" href="{{ route('marketing.pricing') }}">View pricing</a><a class="button button-secondary" href="/register">Create an account</a></div>
    </div>
</section>
@endsection
