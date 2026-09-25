@extends('marketing.layout')

@section('content')
<section class="hero">
    <div class="shell hero-grid">
        <div class="hero-copy">
            <span class="eyebrow">Business operating system</span>
            <h1>Run your business from one intelligent workspace.</h1>
            <p>AccoNova connects CRM, invoicing, payments, inventory, purchasing, teams, reporting and AI-assisted workflows so growing companies can operate with less friction and better visibility.</p>
            <div class="hero-actions">
                <a class="button button-primary" href="/register">Start with AccoNova</a>
                <a class="button button-secondary" href="{{ route('marketing.features') }}">Explore the platform</a>
            </div>
            <div class="hero-note">Built for small and growing companies that are ready to move beyond disconnected spreadsheets and point solutions.</div>
        </div>

        <div class="product-frame" aria-label="AccoNova dashboard preview">
            <div class="product-window">
                <div class="window-top">
                    <div class="window-dots"><i></i><i></i><i></i></div>
                    <div class="window-title">AccoNova / Business overview</div>
                </div>
                <div class="dashboard-body">
                    <aside class="mock-sidebar" aria-hidden="true">
                        <span></span><span></span><span></span><span></span><span></span><span></span><span></span>
                    </aside>
                    <div class="mock-main">
                        <div class="mock-heading"></div>
                        <div class="mock-cards">
                            <div class="mock-card"><small>Revenue</small><b>$48.2k</b></div>
                            <div class="mock-card"><small>Receivables</small><b>$12.8k</b></div>
                            <div class="mock-card"><small>Orders</small><b>184</b></div>
                        </div>
                        <div class="mock-chart"></div>
                        <div class="mock-list">
                            <div><i></i><span></span><em></em></div>
                            <div><i></i><span></span><em></em></div>
                            <div><i></i><span></span><em></em></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</section>

<section class="trust-strip" aria-label="Platform highlights">
    <div class="shell trust-items">
        <div class="trust-item"><span class="trust-icon">1</span><span>One connected source of truth</span></div>
        <div class="trust-item"><span class="trust-icon">↗</span><span>Designed to scale with your team</span></div>
        <div class="trust-item"><span class="trust-icon">✓</span><span>Role-based access and approvals</span></div>
        <div class="trust-item"><span class="trust-icon">AI</span><span>AI inside real business workflows</span></div>
    </div>
</section>

<section class="section">
    <div class="shell">
        <div class="section-header center">
            <div class="kicker">Connected by design</div>
            <h2>Replace tool sprawl with one business platform.</h2>
            <p>Every core workflow shares the same customers, products, transactions, teams and reporting context. That means less duplicate data, fewer blind spots and faster decisions.</p>
        </div>
        <div class="feature-grid">
            <article class="feature-card">
                <div class="icon-box">C</div>
                <h3>CRM & relationships</h3>
                <p>Keep customers, suppliers, contacts, notes and financial activity connected in a complete business view.</p>
                <ul><li>Customer and supplier 360</li><li>Contact history and notes</li><li>Statements and account activity</li></ul>
            </article>
            <article class="feature-card">
                <div class="icon-box">$</div>
                <h3>Finance & invoicing</h3>
                <p>Manage sales and purchase documents, receipts, payments, allocations, collections and finance workflows.</p>
                <ul><li>Invoices and payments</li><li>Receivables and payables</li><li>Cash and bank workflows</li></ul>
            </article>
            <article class="feature-card">
                <div class="icon-box">I</div>
                <h3>Inventory & operations</h3>
                <p>Track products, warehouses, stock movement, transfers, production and operational inventory signals.</p>
                <ul><li>Multi-warehouse workflows</li><li>Stock intelligence</li><li>Production and consumption</li></ul>
            </article>
            <article class="feature-card">
                <div class="icon-box">T</div>
                <h3>Teams & execution</h3>
                <p>Coordinate tasks, projects, teams, departments and operational responsibilities without leaving the system.</p>
                <ul><li>Tasks and projects</li><li>Nested teams</li><li>Workload visibility</li></ul>
            </article>
            <article class="feature-card">
                <div class="icon-box">R</div>
                <h3>Reports & intelligence</h3>
                <p>Turn operational data into dashboards, KPI tracking, aging analysis, trends and custom reports.</p>
                <ul><li>Report builder</li><li>Dashboards and KPIs</li><li>Trend and exception analysis</li></ul>
            </article>
            <article class="feature-card">
                <div class="icon-box">A</div>
                <h3>Approvals & controls</h3>
                <p>Give each person the right level of access and introduce approval steps where your business needs control.</p>
                <ul><li>Granular permissions</li><li>Approval workflows</li><li>Audit-oriented history</li></ul>
            </article>
        </div>
    </div>
</section>

<section class="section section-dark">
    <div class="shell split">
        <div class="copy-block">
            <div class="kicker">AccoNova AI</div>
            <h2>AI that works with your business, not beside it.</h2>
            <p>Ask operational questions, surface important changes and work through permission-checked business tools. AccoNova AI is designed to stay inside the same access rules as your workspace.</p>
            <div class="check-list">
                <div class="check-row"><b>✓</b><span>Use live business context instead of copy-pasting data into a separate tool.</span></div>
                <div class="check-row"><b>✓</b><span>Respect role permissions when offering finance or operational tools.</span></div>
                <div class="check-row"><b>✓</b><span>Turn reports and workflow signals into clearer next actions.</span></div>
            </div>
        </div>
        <div class="ai-panel" aria-label="AI assistant example">
            <span class="eyebrow">Permission-aware assistant</span>
            <div class="ai-message">“Which customers need attention this week and why?”</div>
            <div class="ai-result">
                <strong>Priority follow-up</strong>
                <p>3 overdue accounts, 2 payment promises due soon and 1 high-value customer with declining order activity.</p>
            </div>
            <div class="ai-message">“Show the biggest inventory risks before next month.”</div>
            <div class="ai-result">
                <strong>Inventory signals</strong>
                <p>Potential stockout exposure, slow-moving inventory and warehouse imbalances are grouped into one action list.</p>
            </div>
        </div>
    </div>
</section>

<section class="section section-soft">
    <div class="shell">
        <div class="section-header center">
            <div class="kicker">Built for real operations</div>
            <h2>From daily transactions to management decisions.</h2>
            <p>AccoNova is designed to keep operational work and decision-making in the same system.</p>
        </div>
        <div class="metrics-grid">
            <div class="metric"><strong>CRM</strong><span>Customers, suppliers, contacts and relationship history</span></div>
            <div class="metric"><strong>ERP</strong><span>Sales, purchasing, stock, teams and operational workflows</span></div>
            <div class="metric"><strong>BI</strong><span>KPIs, reports, trends, aging and profitability insights</span></div>
            <div class="metric"><strong>AI</strong><span>Permission-aware assistance connected to business tools</span></div>
        </div>
    </div>
</section>

<section class="section">
    <div class="shell split">
        <div class="copy-block">
            <div class="kicker">Designed for growth</div>
            <h2>Start simple. Add control as complexity grows.</h2>
            <p>Use the core tools you need today, then expand into deeper reporting, automation, multiple warehouses, approvals, staff operations and AI as your company grows.</p>
            <div class="check-list">
                <div class="check-row"><b>✓</b><span>Flexible plans for different team sizes.</span></div>
                <div class="check-row"><b>✓</b><span>Add seats, storage and AI capacity as required.</span></div>
                <div class="check-row"><b>✓</b><span>Keep the same business data model as workflows become more advanced.</span></div>
            </div>
        </div>
        <div class="contact-card">
            <div class="kicker">A better operating rhythm</div>
            <h3>Know what changed, what is at risk and what needs action.</h3>
            <p>Use dashboards, notifications, collections, inventory signals, approval queues and report builders to move from recording activity to actively managing the business.</p>
            <a class="button button-secondary" href="{{ route('marketing.features') }}">See all major capabilities</a>
        </div>
    </div>
</section>

<section class="section">
    <div class="shell cta-panel">
        <div>
            <h2>Ready to put your business in one place?</h2>
            <p>Explore AccoNova, compare plans, or contact us if you want to discuss migration, setup or the right starting point for your company.</p>
        </div>
        <div class="cta-actions">
            <a class="button button-primary" href="/register">Create an account</a>
            <a class="button button-secondary" href="{{ route('marketing.contact') }}">Contact us</a>
        </div>
    </div>
</section>
@endsection
