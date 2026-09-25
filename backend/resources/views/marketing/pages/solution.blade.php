@extends('marketing.layout')

@section('content')
<section class="page-hero">
    <div class="shell">
        <div class="breadcrumbs"><a href="{{ route('marketing.home') }}">Home</a><span>/</span><span>{{ $content['label'] }}</span></div>
        <div class="section-header">
            <div class="kicker">{{ $content['label'] }}</div>
            <h1>{{ $content['headline'] }}</h1>
            <p>{{ $content['intro'] }}</p>
        </div>
    </div>
</section>

<section class="section">
    <div class="shell split">
        <div class="copy-block">
            <div class="kicker">Why companies look for a better system</div>
            <h2>Common problems this workflow is designed to solve.</h2>
        </div>
        <div class="contact-card">
            <div class="check-list">
                @foreach ($content['problems'] as $problem)
                    <div class="check-row"><b>!</b><span>{{ $problem }}</span></div>
                @endforeach
            </div>
        </div>
    </div>
</section>

<section class="section section-soft">
    <div class="shell">
        <div class="section-header center">
            <div class="kicker">AccoNova capabilities</div>
            <h2>Keep the workflow connected to the rest of the business.</h2>
        </div>
        <div class="feature-grid">
            @foreach ($content['capabilities'] as $index => $capability)
                <article class="feature-card">
                    <div class="icon-box">{{ $index + 1 }}</div>
                    <h3>{{ $capability[0] }}</h3>
                    <p>{{ $capability[1] }}</p>
                </article>
            @endforeach
        </div>
    </div>
</section>

<section class="section">
    <div class="shell">
        <div class="section-header center">
            <div class="kicker">Questions</div>
            <h2>Frequently asked questions</h2>
        </div>
        <div class="faq-list">
            @foreach ($content['faq'] as $item)
                <details class="faq-item" @if($loop->first) open @endif>
                    <summary>{{ $item[0] }}</summary>
                    <p>{{ $item[1] }}</p>
                </details>
            @endforeach
        </div>
    </div>
</section>

<section class="section">
    <div class="shell cta-panel">
        <div><h2>See how this fits into the full AccoNova platform.</h2><p>Explore connected CRM, finance, inventory, teams, reporting, controls and AI-assisted workflows.</p></div>
        <div class="cta-actions"><a class="button button-primary" href="{{ route('marketing.features') }}">Explore features</a><a class="button button-secondary" href="/register">Create an account</a></div>
    </div>
</section>
@endsection
