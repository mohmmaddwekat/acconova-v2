@extends('marketing.layout')

@section('content')
<section class="page-hero">
    <div class="shell">
        <div class="breadcrumbs"><a href="{{ route('marketing.home') }}">Home</a><span>/</span><span>FAQ</span></div>
        <div class="section-header">
            <div class="kicker">Frequently asked questions</div>
            <h1>Questions about AccoNova, answered clearly.</h1>
            <p>Learn how AccoNova fits ERP, CRM, finance, inventory, reporting, teams and AI-assisted operations into one business platform.</p>
        </div>
    </div>
</section>

<section class="section section-soft">
    <div class="shell">
        <div class="faq-list">
            @foreach ($faqs as $faq)
                <details class="faq-item" @if ($loop->first) open @endif>
                    <summary>{{ $faq['question'] }}</summary>
                    <p>{{ $faq['answer'] }}</p>
                </details>
            @endforeach
        </div>
    </div>
</section>

<section class="section">
    <div class="shell cta-panel">
        <div><h2>Still have a question?</h2><p>Tell us about your business, current tools or migration needs and we can help you understand whether AccoNova is a good fit.</p></div>
        <div class="cta-actions"><a class="button button-primary" href="{{ route('marketing.contact') }}">Ask us</a><a class="button button-secondary" href="{{ route('marketing.features') }}">Explore features</a></div>
    </div>
</section>
@endsection
