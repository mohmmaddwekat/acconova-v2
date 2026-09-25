@extends('marketing.layout')

@section('content')
<section class="page-hero">
    <div class="shell">
        <div class="breadcrumbs"><a href="{{ route('marketing.home') }}">Home</a><span>/</span><span>Terms</span></div>
        <div class="section-header"><div class="kicker">Terms</div><h1>AccoNova Terms of Service</h1><p>These terms describe the basic rules for accessing and using the AccoNova website and business management service.</p></div>
    </div>
</section>

<section class="section">
    <div class="shell prose">
        <p class="updated">Last updated: September 25, 2026</p>

        <h2>1. Using AccoNova</h2>
        <p>You may use AccoNova only for lawful business purposes and in accordance with these terms. You are responsible for the accuracy and legality of information you enter into the service and for activity performed through accounts under your control.</p>

        <h2>2. Accounts and workspace access</h2>
        <p>You are responsible for protecting account credentials and for assigning workspace roles and permissions appropriately. Organization owners and administrators should review access when team responsibilities change or when a member no longer requires access.</p>

        <h2>3. Subscription and billing</h2>
        <p>Paid access is provided according to the plan and billing interval selected during checkout. Current public plan prices and included capacity are published on the <a href="{{ route('marketing.pricing') }}">pricing page</a>. Optional capacity such as additional seats, storage or AI usage may be charged separately when selected.</p>

        <h2>4. Trials, cancellation and access changes</h2>
        <p>If a trial is offered, its duration and any payment requirements are shown in the applicable account or checkout flow. Cancellation, non-payment or the end of an eligible access period may change the availability of protected workspace features. Where the product provides read-only, recovery or retention behavior, those controls are subject to the account state and current service configuration.</p>

        <h2>5. Your business data</h2>
        <p>You retain responsibility for the business data you submit to AccoNova. You grant AccoNova the limited rights needed to host, process, transmit, back up and otherwise handle that data to operate and support the service.</p>

        <h2>6. Acceptable use</h2>
        <p>You must not attempt to bypass access controls, probe other organizations' data, interfere with service operation, upload malicious content, misuse integrations, automate abusive traffic or use AccoNova in a way that violates applicable law or the rights of others.</p>

        <h2>7. AI-assisted features</h2>
        <p>AI-generated output can be incomplete or incorrect and should not replace appropriate professional judgment, especially for financial, legal, tax or other high-impact decisions. Users remain responsible for reviewing actions and outputs before relying on them.</p>

        <h2>8. Service changes</h2>
        <p>We may improve, modify, add or remove product features as the service evolves. We aim to avoid unnecessary disruption and to preserve important business records, but specific features, interfaces and limits may change over time.</p>

        <h2>9. Availability and warranties</h2>
        <p>The service is provided on an “as available” basis to the extent permitted by applicable law. We do not guarantee uninterrupted operation, error-free software, specific business outcomes, search-engine rankings or suitability for every regulatory or accounting requirement.</p>

        <h2>10. Limitation of responsibility</h2>
        <p>To the extent permitted by applicable law, AccoNova is not responsible for indirect or consequential losses arising from use of the service, user-entered data, third-party services or decisions made solely from automated outputs. Any mandatory rights that cannot legally be excluded remain unaffected.</p>

        <h2>11. Changes to these terms</h2>
        <p>We may update these terms as the service develops. The current version will be published on this page with an updated date.</p>

        <h2>12. Contact</h2>
        <p>For questions about these terms, use the <a href="{{ route('marketing.contact') }}">AccoNova contact page</a> and include “Terms” in the subject.</p>
    </div>
</section>
@endsection
