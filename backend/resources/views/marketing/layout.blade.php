<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{{ $seo['title'] }}</title>
    <meta name="description" content="{{ $seo['description'] }}">
    <meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1">
    <meta name="author" content="AccoNova">
    <link rel="canonical" href="{{ $seo['canonical'] }}">
    <link rel="icon" type="image/svg+xml" href="/favicon.svg">
    <link rel="stylesheet" href="/marketing.css?v=1">

    <meta property="og:type" content="website">
    <meta property="og:site_name" content="AccoNova">
    <meta property="og:title" content="{{ $seo['title'] }}">
    <meta property="og:description" content="{{ $seo['description'] }}">
    <meta property="og:url" content="{{ $seo['canonical'] }}">
    <meta property="og:locale" content="en_US">

    <meta name="twitter:card" content="summary">
    <meta name="twitter:title" content="{{ $seo['title'] }}">
    <meta name="twitter:description" content="{{ $seo['description'] }}">

    @foreach ($schema as $item)
        <script type="application/ld+json">{!! json_encode($item, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) !!}</script>
    @endforeach
</head>
<body>
<a class="skip-link" href="#main">Skip to content</a>
<header class="site-header">
    <div class="shell header-inner">
        <a class="brand" href="{{ route('marketing.home') }}" aria-label="AccoNova home">
            <span class="brand-mark" aria-hidden="true">A</span>
            <span class="brand-name">AccoNova</span>
        </a>

        <nav class="desktop-nav" aria-label="Primary navigation">
            <a href="{{ route('marketing.features') }}" @class(['active' => request()->routeIs('marketing.features')])>Features</a>
            <a href="{{ route('marketing.pricing') }}" @class(['active' => request()->routeIs('marketing.pricing')])>Pricing</a>
            <a href="{{ route('marketing.security') }}" @class(['active' => request()->routeIs('marketing.security')])>Security</a>
            <a href="{{ route('marketing.about') }}" @class(['active' => request()->routeIs('marketing.about')])>About</a>
            <a href="{{ route('marketing.faq') }}" @class(['active' => request()->routeIs('marketing.faq')])>FAQ</a>
        </nav>

        <div class="header-actions">
            <a class="text-link" href="/login">Sign in</a>
            <a class="button button-primary button-small" href="/register">Start with AccoNova</a>
        </div>

        <details class="mobile-menu">
            <summary aria-label="Open navigation">Menu</summary>
            <nav aria-label="Mobile navigation">
                <a href="{{ route('marketing.features') }}">Features</a>
                <a href="{{ route('marketing.pricing') }}">Pricing</a>
                <a href="{{ route('marketing.security') }}">Security</a>
                <a href="{{ route('marketing.about') }}">About</a>
                <a href="{{ route('marketing.faq') }}">FAQ</a>
                <a href="{{ route('marketing.contact') }}">Contact</a>
                <a href="/login">Sign in</a>
                <a class="button button-primary" href="/register">Start with AccoNova</a>
            </nav>
        </details>
    </div>
</header>

<main id="main">
    @yield('content')
</main>

<footer class="site-footer">
    <div class="shell footer-grid">
        <div>
            <a class="brand footer-brand" href="{{ route('marketing.home') }}">
                <span class="brand-mark" aria-hidden="true">A</span>
                <span class="brand-name">AccoNova</span>
            </a>
            <p class="footer-copy">One connected workspace for customers, finance, inventory, teams, reporting and AI-assisted business operations.</p>
        </div>
        <div>
            <h2>Product</h2>
            <a href="{{ route('marketing.features') }}">Features</a>
            <a href="{{ route('marketing.pricing') }}">Pricing</a>
            <a href="{{ route('marketing.security') }}">Security</a>
            <a href="{{ route('marketing.faq') }}">FAQ</a>
        </div>
        <div>
            <h2>Solutions</h2>
            <a href="{{ route('marketing.solutions.erp') }}">Small business ERP</a>
            <a href="{{ route('marketing.solutions.crm') }}">CRM for small business</a>
            <a href="{{ route('marketing.solutions.inventory') }}">Inventory management</a>
            <a href="{{ route('marketing.solutions.invoicing') }}">Invoicing & payments</a>
            <a href="{{ route('marketing.solutions.reporting') }}">Business reporting</a>
        </div>
        <div>
            <h2>Company</h2>
            <a href="{{ route('marketing.about') }}">About</a>
            <a href="{{ route('marketing.contact') }}">Contact</a>
            <a href="{{ route('marketing.privacy') }}">Privacy</a>
            <a href="{{ route('marketing.terms') }}">Terms</a>
        </div>
        <div>
            <h2>Get started</h2>
            <a href="/register">Create an account</a>
            <a href="/login">Sign in</a>
            <a href="{{ route('marketing.contact') }}">Talk to us</a>
        </div>
    </div>
    <div class="shell footer-bottom">
        <span>&copy; {{ date('Y') }} AccoNova. All rights reserved.</span>
        <span>Built for growing businesses.</span>
    </div>
</footer>
</body>
</html>
