@extends('marketing.layout')

@section('content')
<section class="page-hero">
    <div class="shell">
        <div class="breadcrumbs"><a href="{{ route('marketing.home') }}">Home</a><span>/</span><span>Privacy</span></div>
        <div class="section-header"><div class="kicker">Privacy</div><h1>AccoNova Privacy Policy</h1><p>This page explains the main categories of information AccoNova may process when you use the website and business management service.</p></div>
    </div>
</section>

<section class="section">
    <div class="shell prose">
        <p class="updated">Last updated: September 25, 2026</p>

        <h2>1. Information you provide</h2>
        <p>We may process account information such as your name, email address and organization details, as well as business information you choose to enter into AccoNova. Business data can include customers, suppliers, products, invoices, payments, inventory, staff-related records, tasks, reports and other operational records.</p>

        <h2>2. Service and usage information</h2>
        <p>We may process technical and usage information needed to operate, secure and improve the service. This can include authentication activity, request metadata, application events, feature usage, error information and records needed to maintain account and billing status.</p>

        <h2>3. Why information is used</h2>
        <p>Information may be used to provide the service, authenticate users, apply organization and permission boundaries, process requested transactions, provide support, prevent abuse, troubleshoot problems, improve product quality and communicate about the account or service.</p>

        <h2>4. Business data and access</h2>
        <p>AccoNova is designed so organization data is accessed within the relevant workspace and according to application permissions. Workspace administrators are responsible for deciding which members should have access to business data inside their organization.</p>

        <h2>5. Service providers</h2>
        <p>AccoNova may rely on service providers for infrastructure, payment processing, email delivery, monitoring, storage or other technical functions. Those providers may process information only as needed to provide their services to AccoNova and its users, subject to their applicable terms and safeguards.</p>

        <h2>6. AI-assisted features</h2>
        <p>When AI-assisted features are used, relevant prompts, instructions and authorized business context may be processed to provide the requested result. AccoNova is designed to expose business tools to AI according to application permissions rather than granting unrestricted access to all organization data.</p>

        <h2>7. Data retention</h2>
        <p>Information may be retained for as long as needed to operate the account, provide the service, meet legitimate business and security needs, resolve disputes, comply with applicable obligations and preserve records that should not be silently destroyed. Retention can vary by record type and account status.</p>

        <h2>8. Security</h2>
        <p>We use technical and organizational measures intended to protect the service and limit unauthorized access. No internet service can guarantee absolute security, and users should also protect account credentials and assign permissions carefully.</p>

        <h2>9. Your choices</h2>
        <p>Depending on your account, role and applicable law, you may be able to update account information, manage workspace members, export certain data, request account assistance or ask questions about information associated with your use of the service.</p>

        <h2>10. Changes to this policy</h2>
        <p>We may update this policy as the service changes. The current version will be published on this page with an updated date when material changes are made.</p>

        <h2>11. Contact</h2>
        <p>For privacy questions or requests, use the <a href="{{ route('marketing.contact') }}">AccoNova contact page</a> and include “Privacy” in the subject.</p>
    </div>
</section>
@endsection
