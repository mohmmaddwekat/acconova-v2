@extends('marketing.layout')

@section('content')
<section class="page-hero">
    <div class="shell">
        <div class="breadcrumbs"><a href="{{ route('marketing.home') }}">Home</a><span>/</span><span>Contact</span></div>
        <div class="section-header">
            <div class="kicker">Contact AccoNova</div>
            <h1>Tell us what your business needs.</h1>
            <p>Ask about product fit, pricing, migration, setup, security or support. Share enough context and we can give you a more useful answer.</p>
        </div>
    </div>
</section>

<section class="section">
    <div class="shell contact-grid">
        <div>
            <div class="contact-card">
                <h3>Good things to include</h3>
                <p>The more specific you are, the easier it is to point you toward the right workflow or plan.</p>
                <div class="contact-points">
                    <div class="contact-point"><b>1</b><div><strong>Your business type</strong><br><span>What you sell or manage today.</span></div></div>
                    <div class="contact-point"><b>2</b><div><strong>Your current tools</strong><br><span>Spreadsheets, accounting software, ERP or separate apps.</span></div></div>
                    <div class="contact-point"><b>3</b><div><strong>Your main problem</strong><br><span>What is slow, disconnected or difficult to control.</span></div></div>
                    <div class="contact-point"><b>4</b><div><strong>Team size</strong><br><span>How many people need access and what they do.</span></div></div>
                </div>
            </div>
        </div>

        <div class="contact-card">
            @if (session('contact_success'))
                <div class="alert alert-success">{{ session('contact_success') }}</div>
            @endif
            @if ($errors->has('contact'))
                <div class="alert alert-error">{{ $errors->first('contact') }}</div>
            @endif

            <form method="POST" action="{{ route('marketing.contact.submit') }}" class="contact-form">
                @csrf
                <div class="honeypot" aria-hidden="true">
                    <label for="company_website">Website</label>
                    <input id="company_website" name="company_website" type="text" tabindex="-1" autocomplete="off">
                </div>

                <div class="field">
                    <label for="name">Name</label>
                    <input id="name" name="name" type="text" value="{{ old('name') }}" autocomplete="name" required>
                    @error('name')<span class="form-error">{{ $message }}</span>@enderror
                </div>
                <div class="field">
                    <label for="email">Work email</label>
                    <input id="email" name="email" type="email" value="{{ old('email') }}" autocomplete="email" required>
                    @error('email')<span class="form-error">{{ $message }}</span>@enderror
                </div>
                <div class="field">
                    <label for="company">Company</label>
                    <input id="company" name="company" type="text" value="{{ old('company') }}" autocomplete="organization">
                    @error('company')<span class="form-error">{{ $message }}</span>@enderror
                </div>
                <div class="field">
                    <label for="subject">Subject</label>
                    <input id="subject" name="subject" type="text" value="{{ old('subject') }}" required>
                    @error('subject')<span class="form-error">{{ $message }}</span>@enderror
                </div>
                <div class="field full">
                    <label for="message">How can we help?</label>
                    <textarea id="message" name="message" required>{{ old('message') }}</textarea>
                    @error('message')<span class="form-error">{{ $message }}</span>@enderror
                </div>
                <div class="field full">
                    <button class="button button-primary" type="submit">Send message</button>
                </div>
            </form>
        </div>
    </div>
</section>
@endsection
