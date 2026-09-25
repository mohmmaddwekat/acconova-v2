@extends('marketing.layout')

@section('content')
<section class="page-hero">
    <div class="shell">
        <div class="breadcrumbs"><a href="{{ route('marketing.home') }}">Home</a><span>/</span><span>Pricing</span></div>
        <div class="section-header">
            <div class="kicker">Simple, transparent plans</div>
            <h1>Choose a plan that fits your team today.</h1>
            <p>Start with the capacity you need and grow later. AccoNova plans scale by users, storage, reporting depth, automation and AI capacity.</p>
        </div>
    </div>
</section>

<section class="section">
    <div class="shell">
        <div class="pricing-grid">
            @foreach ($plans as $plan)
                <article @class(['pricing-card', 'recommended' => $plan['recommended']])>
                    @if ($plan['recommended'])
                        <span class="plan-badge">Recommended</span>
                    @endif
                    <div class="plan-name">{{ $plan['name'] }}</div>
                    <div class="plan-description">{{ $plan['description'] }}</div>
                    <div class="plan-price">
                        <strong>${{ number_format($plan['monthly'], 0) }}</strong>
                        <span>/month</span>
                    </div>
                    <div class="year-price">or ${{ number_format($plan['yearly'], 0) }}/year</div>
                    <ul class="plan-features">
                        @foreach ($plan['features'] as $feature)
                            <li>{{ $feature }}</li>
                        @endforeach
                    </ul>
                    <a class="button {{ $plan['recommended'] ? 'button-primary' : 'button-secondary' }}" href="/register">Start with {{ $plan['name'] }}</a>
                </article>
            @endforeach
        </div>

        <div class="pricing-note">
            <strong>Need more capacity?</strong> Extra seats are priced per seat, storage can be expanded by GB, and AccoNova AI capacity can be topped up separately. You are not forced into fixed add-on packs.
        </div>
    </div>
</section>

<section class="section section-soft">
    <div class="shell">
        <div class="section-header center">
            <div class="kicker">How scaling works</div>
            <h2>Keep the same workspace as your needs grow.</h2>
            <p>You can expand capacity without rebuilding your business setup in another system.</p>
        </div>
        <div class="feature-grid">
            <article class="feature-card"><div class="icon-box">+</div><h3>Additional seats</h3><p>Add the exact number of users you need. Seat capacity can be increased or reduced as your team changes.</p></article>
            <article class="feature-card"><div class="icon-box">GB</div><h3>Additional storage</h3><p>Increase storage by the GB instead of buying oversized bundles you may not need.</p></article>
            <article class="feature-card"><div class="icon-box">AI</div><h3>AI wallet</h3><p>Additional AI usage is handled as flexible wallet top-ups rather than forcing another recurring software subscription.</p></article>
        </div>
    </div>
</section>

<section class="section">
    <div class="shell split">
        <div class="copy-block">
            <div class="kicker">Questions before buying?</div>
            <h2>Pick the plan based on operating complexity, not only team size.</h2>
            <p>If you are unsure whether you need stronger reporting, controls, multiple warehouses or more AI capacity, contact us and describe your workflow. We can help you choose a sensible starting point.</p>
        </div>
        <div class="contact-card">
            <h3>Good reasons to move up a plan</h3>
            <div class="check-list">
                <div class="check-row"><b>✓</b><span>You need more users or storage.</span></div>
                <div class="check-row"><b>✓</b><span>You need deeper permissions, automation or reporting.</span></div>
                <div class="check-row"><b>✓</b><span>You operate multiple warehouses or more complex workflows.</span></div>
                <div class="check-row"><b>✓</b><span>You want higher AI or analytics capacity.</span></div>
            </div>
        </div>
    </div>
</section>

<section class="section">
    <div class="shell cta-panel">
        <div><h2>Ready to start?</h2><p>Create an AccoNova account or contact us if you want to discuss migration, setup or plan selection first.</p></div>
        <div class="cta-actions"><a class="button button-primary" href="/register">Create an account</a><a class="button button-secondary" href="{{ route('marketing.contact') }}">Contact us</a></div>
    </div>
</section>
@endsection
