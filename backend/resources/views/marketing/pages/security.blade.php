@extends('marketing.layout')

@section('content')
<section class="page-hero">
    <div class="shell">
        <div class="breadcrumbs"><a href="{{ route('marketing.home') }}">Home</a><span>/</span><span>Security</span></div>
        <div class="section-header">
            <div class="kicker">Security by design</div>
            <h1>Business data deserves strong boundaries and clear control.</h1>
            <p>AccoNova is designed around organization isolation, role-based permissions, controlled workflows and audit-oriented history so access can reflect real business responsibilities.</p>
        </div>
    </div>
</section>

<section class="section">
    <div class="shell">
        <div class="feature-grid">
            <article class="feature-card"><div class="icon-box">ORG</div><h3>Organization isolation</h3><p>Business records are scoped to the active organization so one workspace cannot read or mutate another workspace's data through normal application paths.</p></article>
            <article class="feature-card"><div class="icon-box">RBAC</div><h3>Role-based access</h3><p>Permissions can be aligned to responsibilities so finance, inventory, staff, approvals and operational tools are not automatically visible to everyone.</p></article>
            <article class="feature-card"><div class="icon-box">2X</div><h3>Approval controls</h3><p>Sensitive workflows can require independent review, helping teams separate creation from approval where stronger control is appropriate.</p></article>
            <article class="feature-card"><div class="icon-box">LOG</div><h3>Audit-oriented history</h3><p>Important workflows preserve history and correction paths so changes are easier to understand than destructive silent edits.</p></article>
            <article class="feature-card"><div class="icon-box">AI</div><h3>Permission-aware AI</h3><p>AccoNova AI is designed to receive only the business tools a user is authorized to use instead of receiving unrestricted raw database access.</p></article>
            <article class="feature-card"><div class="icon-box">WEB</div><h3>Secure web deployment</h3><p>The application is designed for HTTPS deployment, protected sessions, request validation and server-side handling of sensitive integration credentials.</p></article>
        </div>
    </div>
</section>

<section class="section section-soft">
    <div class="shell split">
        <div class="copy-block">
            <div class="kicker">Operational safety</div>
            <h2>Security also means preventing expensive business mistakes.</h2>
            <p>AccoNova includes validation and control patterns intended to reduce accidental damage from invalid quantities, duplicate transactions, cross-organization access, unauthorized actions and destructive changes to historical records.</p>
        </div>
        <div class="contact-card">
            <h3>Examples of protective controls</h3>
            <div class="check-list">
                <div class="check-row"><b>✓</b><span>Validation around finance, stock and workflow inputs.</span></div>
                <div class="check-row"><b>✓</b><span>Protection of historical records and correction workflows.</span></div>
                <div class="check-row"><b>✓</b><span>Permission checks before sensitive actions.</span></div>
                <div class="check-row"><b>✓</b><span>Tenant-scoped queries and fail-closed behavior in protected areas.</span></div>
            </div>
        </div>
    </div>
</section>

<section class="section">
    <div class="shell cta-panel">
        <div><h2>Have a security or data-handling question?</h2><p>Contact us with your requirements. We prefer accurate answers over broad compliance claims that do not match your specific needs.</p></div>
        <div class="cta-actions"><a class="button button-primary" href="{{ route('marketing.contact') }}">Contact us</a><a class="button button-secondary" href="{{ route('marketing.privacy') }}">Read privacy policy</a></div>
    </div>
</section>
@endsection
