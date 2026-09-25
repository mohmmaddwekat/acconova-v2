@extends('marketing.layout')

@section('content')
<section class="page-hero">
    <div class="shell">
        <div class="breadcrumbs"><a href="{{ route('marketing.home') }}">Home</a><span>/</span><span>About</span></div>
        <div class="section-header">
            <div class="kicker">About AccoNova</div>
            <h1>Business software should help teams act, not just store records.</h1>
            <p>AccoNova is being built as a connected operating system for growing companies: one place to manage relationships, money, inventory, teams, reporting and the decisions that connect them.</p>
        </div>
    </div>
</section>

<section class="section">
    <div class="shell split">
        <div class="copy-block">
            <div class="kicker">Our product direction</div>
            <h2>From fragmented tools to one operating context.</h2>
            <p>Many businesses start with spreadsheets, separate invoicing tools, messaging apps and disconnected inventory systems. As they grow, the biggest cost becomes the gaps between those tools.</p>
            <p>AccoNova is designed around a different idea: customers, products, transactions, staff activity and operational signals should live in one connected model so every workflow can use the same context.</p>
        </div>
        <div class="contact-card">
            <h3>What AccoNova connects</h3>
            <div class="check-list">
                <div class="check-row"><b>✓</b><span>Customer and supplier relationships with finance activity.</span></div>
                <div class="check-row"><b>✓</b><span>Products, stock, purchasing, warehouses and production.</span></div>
                <div class="check-row"><b>✓</b><span>Teams, tasks, departments, approvals and operational controls.</span></div>
                <div class="check-row"><b>✓</b><span>Dashboards, reports, alerts and AI-assisted business workflows.</span></div>
            </div>
        </div>
    </div>
</section>

<section class="section section-soft">
    <div class="shell">
        <div class="section-header center">
            <div class="kicker">Product principles</div>
            <h2>Clarity, control and useful intelligence.</h2>
            <p>The platform is shaped around practical principles that matter in day-to-day business operations.</p>
        </div>
        <div class="feature-grid">
            <article class="feature-card"><div class="icon-box">1</div><h3>One source of truth</h3><p>Reduce duplicate records by connecting workflows around the same customers, products, teams and transactions.</p></article>
            <article class="feature-card"><div class="icon-box">2</div><h3>Action over dashboards</h3><p>Reports should lead to follow-ups, approvals, collections, inventory actions and operational decisions.</p></article>
            <article class="feature-card"><div class="icon-box">3</div><h3>Controls that fit growth</h3><p>Permissions, approvals and audit-oriented workflows become more important as teams and financial responsibility expand.</p></article>
            <article class="feature-card"><div class="icon-box">4</div><h3>Useful AI</h3><p>AI should work inside the same permissions and business context as the rest of the system, not as a disconnected chatbot.</p></article>
            <article class="feature-card"><div class="icon-box">5</div><h3>Global-ready foundations</h3><p>AccoNova is designed for businesses that need flexible currencies, languages, workflows and operational structures.</p></article>
            <article class="feature-card"><div class="icon-box">6</div><h3>Progressive complexity</h3><p>Teams can begin with core workflows and add deeper automation, intelligence and controls as their needs grow.</p></article>
        </div>
    </div>
</section>

<section class="section">
    <div class="shell cta-panel">
        <div><h2>See what the platform can manage.</h2><p>Explore AccoNova capabilities across CRM, finance, inventory, teams, reporting, approvals and AI-assisted operations.</p></div>
        <div class="cta-actions"><a class="button button-primary" href="{{ route('marketing.features') }}">Explore features</a><a class="button button-secondary" href="{{ route('marketing.contact') }}">Contact us</a></div>
    </div>
</section>
@endsection
