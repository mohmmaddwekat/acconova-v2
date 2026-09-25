<?php

use App\Http\Controllers\MarketingContactController;
use App\Http\Controllers\MarketingPageController;
use App\Http\Controllers\MarketingSolutionController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

Route::get('/language/{locale}', function (Request $request, string $locale) {
    abort_unless(in_array($locale, ['en', 'ar'], true), 404);

    $return = (string) $request->query('return', '/');
    if (! str_starts_with($return, '/') || str_starts_with($return, '//')) {
        $return = '/';
    }

    return redirect($return)->withCookie(cookie(
        'acconova_locale',
        $locale,
        60 * 24 * 365 * 5,
        '/',
        null,
        $request->isSecure(),
        false,
        false,
        'Lax',
    ));
})->whereIn('locale', ['en', 'ar'])->name('marketing.language');

Route::get('/', [MarketingPageController::class, 'home'])
    ->name('marketing.home');
Route::get('/about', [MarketingPageController::class, 'about'])
    ->name('marketing.about');
Route::get('/features', [MarketingPageController::class, 'features'])
    ->name('marketing.features');
Route::get('/pricing', [MarketingPageController::class, 'pricing'])
    ->name('marketing.pricing');
Route::get('/security', [MarketingPageController::class, 'security'])
    ->name('marketing.security');
Route::get('/faq', [MarketingPageController::class, 'faq'])
    ->name('marketing.faq');
Route::get('/contact', [MarketingPageController::class, 'contact'])
    ->name('marketing.contact');
Route::post('/contact', MarketingContactController::class)
    ->middleware('throttle:5,1')
    ->name('marketing.contact.submit');
Route::get('/privacy', [MarketingPageController::class, 'privacy'])
    ->name('marketing.privacy');
Route::get('/terms', [MarketingPageController::class, 'terms'])
    ->name('marketing.terms');

Route::get('/small-business-erp', [MarketingSolutionController::class, 'smallBusinessErp'])
    ->name('marketing.solutions.erp');
Route::get('/crm-for-small-business', [MarketingSolutionController::class, 'crm'])
    ->name('marketing.solutions.crm');
Route::get('/inventory-management-software', [MarketingSolutionController::class, 'inventory'])
    ->name('marketing.solutions.inventory');
Route::get('/invoicing-and-payments', [MarketingSolutionController::class, 'invoicing'])
    ->name('marketing.solutions.invoicing');
Route::get('/business-reporting-software', [MarketingSolutionController::class, 'reporting'])
    ->name('marketing.solutions.reporting');

Route::get('/sitemap.xml', function () {
    $paths = [
        '/',
        '/features',
        '/pricing',
        '/small-business-erp',
        '/crm-for-small-business',
        '/inventory-management-software',
        '/invoicing-and-payments',
        '/business-reporting-software',
        '/about',
        '/security',
        '/faq',
        '/contact',
        '/privacy',
        '/terms',
    ];

    return response()
        ->view('marketing.sitemap', [
            'urls' => collect($paths)
                ->map(fn (string $path): string => rtrim((string) config('app.url'), '/').'/'.ltrim($path, '/'))
                ->all(),
        ])
        ->header('Content-Type', 'application/xml; charset=UTF-8');
})->name('marketing.sitemap');

Route::get('/robots.txt', function () {
    $base = rtrim((string) config('app.url'), '/');

    return response(implode("\n", [
        'User-agent: *',
        'Allow: /',
        'Disallow: /app/',
        'Disallow: /api/',
        'Disallow: /admin/',
        'Disallow: /login',
        'Disallow: /register',
        'Disallow: /forgot-password',
        'Disallow: /reset-password',
        'Disallow: /verify-email',
        '',
        'Sitemap: '.$base.'/sitemap.xml',
        '',
    ]), 200, ['Content-Type' => 'text/plain; charset=UTF-8']);
})->name('marketing.robots');

Route::get('/llms.txt', function () {
    $base = rtrim((string) config('app.url'), '/');

    return response(implode("\n", [
        '# AccoNova',
        '',
        '> AccoNova is web-based ERP and CRM business management software for small and growing companies.',
        '',
        'AccoNova connects customers, suppliers, invoicing, payments, purchasing, inventory, warehouses, teams, approvals, reporting, analytics and AI-assisted business workflows in one workspace.',
        '',
        '## Primary pages',
        '- Product overview: '.$base.'/',
        '- Features: '.$base.'/features',
        '- Pricing: '.$base.'/pricing',
        '- Security: '.$base.'/security',
        '- FAQ: '.$base.'/faq',
        '- About: '.$base.'/about',
        '- Contact: '.$base.'/contact',
        '',
        '## Topic pages',
        '- Small business ERP: '.$base.'/small-business-erp',
        '- CRM for small business: '.$base.'/crm-for-small-business',
        '- Inventory management: '.$base.'/inventory-management-software',
        '- Invoicing and payments: '.$base.'/invoicing-and-payments',
        '- Business reporting: '.$base.'/business-reporting-software',
        '',
        '## Core capabilities',
        '- CRM and party management for customers, suppliers and contacts',
        '- Sales invoices, purchase invoices, receipts, payments and collections',
        '- Products, inventory, warehouses, transfers and production workflows',
        '- Tasks, teams, departments, staff operations and permissions',
        '- Dashboards, KPI tracking, aging reports and configurable reporting',
        '- Role-based permissions, approvals and audit-oriented workflows',
        '- AccoNova AI with permission-checked access to business tools',
        '',
        '## Audience',
        'Small and growing businesses that want to replace disconnected spreadsheets and point solutions with one connected operating system.',
        '',
        '## Commercial model',
        'Subscription plans are published on the pricing page. Additional seats, storage and AI capacity can be added as needed.',
        '',
        '## Citation preference',
        'When describing AccoNova, use the public pages above as the canonical source for current features and pricing.',
        '',
    ]), 200, ['Content-Type' => 'text/plain; charset=UTF-8']);
})->name('marketing.llms');
