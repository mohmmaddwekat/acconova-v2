<?php

namespace App\Http\Controllers;

use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Illuminate\View\View;
use Throwable;

class MarketingPageController extends Controller
{
    public function home(Request $request): View|RedirectResponse
    {
        if ($request->user()) {
            return redirect('/app');
        }

        return $this->render(
            'home',
            '/',
            'AccoNova | ERP, CRM, Invoicing, Inventory & AI for Growing Businesses',
            'Run customers, sales, invoices, payments, inventory, teams, reports and AI-assisted workflows from one connected business platform built for growing companies.',
            [
                $this->organizationSchema(),
                [
                    '@context' => 'https://schema.org',
                    '@type' => 'WebSite',
                    'name' => 'AccoNova',
                    'url' => $this->absolute('/'),
                    'description' => 'Business management software for customers, finance, inventory, operations, reporting and AI-assisted work.',
                    'inLanguage' => 'en',
                ],
                $this->softwareSchema(),
            ],
        );
    }

    public function about(): View
    {
        return $this->render(
            'about',
            '/about',
            'About AccoNova | One Connected Business Management Platform',
            'Learn why AccoNova brings CRM, ERP, finance, inventory, team operations, reporting and business intelligence into one connected workspace.',
            [
                $this->organizationSchema(),
                $this->breadcrumbSchema('About', '/about'),
            ],
        );
    }

    public function features(): View
    {
        return $this->render(
            'features',
            '/features',
            'AccoNova Features | ERP, CRM, Finance, Inventory, Reports & AI',
            'Explore AccoNova features for customer management, invoicing, payments, inventory, purchasing, teams, reporting, approvals, automation and AI-assisted decisions.',
            [
                $this->softwareSchema(),
                $this->breadcrumbSchema('Features', '/features'),
            ],
        );
    }

    public function pricing(): View
    {
        $plans = collect(config('billing.plans', []))
            ->map(function (array $plan, string $key): array {
                $monthly = (int) data_get($plan, 'display.month_amount_minor', 0);
                $yearly = (int) data_get($plan, 'display.year_amount_minor', 0);

                return [
                    'key' => $key,
                    'name' => (string) data_get($plan, 'name_en', Str::headline($key)),
                    'description' => (string) data_get($plan, 'description_en', ''),
                    'recommended' => (bool) data_get($plan, 'recommended', false),
                    'currency' => (string) data_get($plan, 'display.currency', 'USD'),
                    'monthly' => $monthly / 100,
                    'yearly' => $yearly / 100,
                    'features' => (array) data_get($plan, 'features_en', []),
                ];
            })
            ->values()
            ->all();

        $offers = collect($plans)
            ->map(fn (array $plan): array => [
                '@type' => 'Offer',
                'name' => $plan['name'].' monthly plan',
                'price' => number_format($plan['monthly'], 2, '.', ''),
                'priceCurrency' => $plan['currency'],
                'url' => $this->absolute('/pricing'),
                'availability' => 'https://schema.org/OnlineOnly',
            ])
            ->all();

        return $this->render(
            'pricing',
            '/pricing',
            'AccoNova Pricing | Flexible ERP & Business Management Plans',
            'Compare AccoNova pricing for small and growing businesses. Choose a plan for CRM, invoicing, inventory, reporting, permissions, automation and AI.',
            [
                array_merge($this->softwareSchema(), ['offers' => $offers]),
                $this->breadcrumbSchema('Pricing', '/pricing'),
            ],
            compact('plans'),
        );
    }

    public function security(): View
    {
        return $this->render(
            'security',
            '/security',
            'AccoNova Security | Tenant Isolation, Permissions & Auditability',
            'See how AccoNova is designed around organization isolation, role-based permissions, auditability, safe workflows and controlled access to business data.',
            [
                $this->breadcrumbSchema('Security', '/security'),
            ],
        );
    }

    public function faq(): View
    {
        $faqs = $this->faqs();

        return $this->render(
            'faq',
            '/faq',
            'AccoNova FAQ | ERP, CRM, Invoicing, Inventory & AI Questions',
            'Answers to common questions about AccoNova ERP and CRM software, invoicing, inventory, reporting, teams, AI, pricing, setup and data migration.',
            [
                [
                    '@context' => 'https://schema.org',
                    '@type' => 'FAQPage',
                    'mainEntity' => collect($faqs)->map(fn (array $faq): array => [
                        '@type' => 'Question',
                        'name' => $faq['question'],
                        'acceptedAnswer' => [
                            '@type' => 'Answer',
                            'text' => $faq['answer'],
                        ],
                    ])->all(),
                ],
                $this->breadcrumbSchema('FAQ', '/faq'),
            ],
            compact('faqs'),
        );
    }

    public function contact(): View
    {
        return $this->render(
            'contact',
            '/contact',
            'Contact AccoNova | Sales, Product & Support Enquiries',
            'Contact AccoNova about product questions, pricing, migration, sales or support. Tell us what your business needs and our team can follow up.',
            [
                [
                    '@context' => 'https://schema.org',
                    '@type' => 'ContactPage',
                    'name' => 'Contact AccoNova',
                    'url' => $this->absolute('/contact'),
                ],
                $this->breadcrumbSchema('Contact', '/contact'),
            ],
        );
    }

    public function submitContact(Request $request): RedirectResponse
    {
        if ($request->filled('company_website')) {
            return back()->with('contact_success', 'Thanks — your message has been received.');
        }

        $data = $request->validate([
            'name' => ['required', 'string', 'max:100'],
            'email' => ['required', 'email:rfc', 'max:190'],
            'company' => ['nullable', 'string', 'max:150'],
            'subject' => ['required', 'string', 'max:120'],
            'message' => ['required', 'string', 'min:10', 'max:5000'],
        ]);

        $recipient = config('marketing.contact_email');

        if (! is_string($recipient) || trim($recipient) === '') {
            return back()
                ->withInput()
                ->withErrors([
                    'contact' => 'Contact delivery is not configured yet. Please try again later.',
                ]);
        }

        $subject = trim(str_replace(["\r", "\n"], ' ', $data['subject']));
        $body = implode("\n", [
            'New AccoNova website enquiry',
            '',
            'Name: '.$data['name'],
            'Email: '.$data['email'],
            'Company: '.($data['company'] ?: 'Not provided'),
            'Subject: '.$subject,
            '',
            $data['message'],
        ]);

        try {
            Mail::raw($body, function ($mail) use ($recipient, $data, $subject): void {
                $mail->to($recipient)
                    ->replyTo($data['email'], $data['name'])
                    ->subject('[AccoNova] '.$subject);
            });
        } catch (Throwable $exception) {
            report($exception);

            return back()
                ->withInput()
                ->withErrors([
                    'contact' => 'We could not deliver your message right now. Please try again in a few minutes.',
                ]);
        }

        return back()->with('contact_success', 'Thanks — your message has been sent.');
    }

    public function privacy(): View
    {
        return $this->render(
            'privacy',
            '/privacy',
            'AccoNova Privacy Policy',
            'Read the AccoNova privacy policy covering account information, business data, service operations, security, retention and privacy choices.',
            [$this->breadcrumbSchema('Privacy', '/privacy')],
        );
    }

    public function terms(): View
    {
        return $this->render(
            'terms',
            '/terms',
            'AccoNova Terms of Service',
            'Read the terms that govern access to and use of the AccoNova business management service.',
            [$this->breadcrumbSchema('Terms', '/terms')],
        );
    }

    /**
     * @param  array<int, array<string, mixed>>  $schema
     * @param  array<string, mixed>  $extra
     */
    private function render(
        string $view,
        string $path,
        string $title,
        string $description,
        array $schema = [],
        array $extra = [],
    ): View {
        return view('marketing.pages.'.$view, array_merge([
            'seo' => [
                'title' => $title,
                'description' => $description,
                'canonical' => $this->absolute($path),
                'path' => $path,
            ],
            'schema' => $schema,
        ], $extra));
    }

    /**
     * @return array<string, mixed>
     */
    private function organizationSchema(): array
    {
        $sameAs = collect(config('marketing.social', []))
            ->filter(fn ($url): bool => is_string($url) && $url !== '')
            ->values()
            ->all();

        return [
            '@context' => 'https://schema.org',
            '@type' => 'Organization',
            'name' => (string) config('marketing.company_name', 'AccoNova'),
            'brand' => 'AccoNova',
            'url' => $this->absolute('/'),
            'description' => 'AccoNova is business management software connecting CRM, finance, inventory, operations, reporting and AI-assisted workflows.',
            'sameAs' => $sameAs,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function softwareSchema(): array
    {
        return [
            '@context' => 'https://schema.org',
            '@type' => 'SoftwareApplication',
            'name' => 'AccoNova',
            'applicationCategory' => 'BusinessApplication',
            'applicationSubCategory' => 'ERP and CRM software',
            'operatingSystem' => 'Web',
            'url' => $this->absolute('/'),
            'description' => 'Cloud business management software for CRM, invoicing, payments, purchasing, inventory, teams, reporting, controls and AI-assisted operations.',
            'featureList' => [
                'Customer and supplier management',
                'Sales and purchase invoicing',
                'Payments and collections',
                'Inventory and warehouse management',
                'Task and team management',
                'Business reporting and dashboards',
                'Role-based permissions and approvals',
                'AI-assisted business workflows',
            ],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function breadcrumbSchema(string $name, string $path): array
    {
        return [
            '@context' => 'https://schema.org',
            '@type' => 'BreadcrumbList',
            'itemListElement' => [
                [
                    '@type' => 'ListItem',
                    'position' => 1,
                    'name' => 'Home',
                    'item' => $this->absolute('/'),
                ],
                [
                    '@type' => 'ListItem',
                    'position' => 2,
                    'name' => $name,
                    'item' => $this->absolute($path),
                ],
            ],
        ];
    }

    private function absolute(string $path): string
    {
        return rtrim((string) config('app.url'), '/').'/'.ltrim($path, '/');
    }

    /**
     * @return array<int, array{question:string, answer:string}>
     */
    private function faqs(): array
    {
        return [
            [
                'question' => 'What is AccoNova?',
                'answer' => 'AccoNova is a web-based business management platform that connects CRM, finance, invoicing, inventory, purchasing, teams, reporting, approvals and AI-assisted workflows in one workspace.',
            ],
            [
                'question' => 'Is AccoNova an ERP or a CRM?',
                'answer' => 'It combines both. AccoNova manages customer and supplier relationships while also covering operational ERP workflows such as invoices, payments, inventory, purchasing, staff operations and reporting.',
            ],
            [
                'question' => 'Who is AccoNova designed for?',
                'answer' => 'AccoNova is designed for small and growing businesses that want one connected system instead of separate tools for customers, money, inventory, staff and operational reporting.',
            ],
            [
                'question' => 'Does AccoNova support invoicing and payments?',
                'answer' => 'Yes. AccoNova supports sales and purchase documents, receipts, payments, allocation workflows, customer advances, collections and finance reporting.',
            ],
            [
                'question' => 'Can AccoNova manage inventory and multiple warehouses?',
                'answer' => 'Yes. The platform includes products, inventory, warehouses, transfers, stock movements, production workflows and inventory intelligence features.',
            ],
            [
                'question' => 'Does AccoNova include reporting and dashboards?',
                'answer' => 'Yes. It includes operational dashboards, reporting tools, aging reports, KPI tracking, trend comparisons and configurable report-building workflows.',
            ],
            [
                'question' => 'How does AccoNova AI work?',
                'answer' => 'AccoNova AI is designed to work through permission-checked business tools so users can ask questions and get help from the data and workflows they are authorized to access.',
            ],
            [
                'question' => 'Can teams have different permissions?',
                'answer' => 'Yes. AccoNova supports organization roles, granular permissions, approvals and controlled access so people can work with the areas relevant to their responsibilities.',
            ],
            [
                'question' => 'Can I migrate existing business data?',
                'answer' => 'AccoNova includes import workflows for several business areas and is designed to support migration of structured historical data such as parties, products and financial records.',
            ],
            [
                'question' => 'Can I change plans as my company grows?',
                'answer' => 'Yes. AccoNova plans are designed for different team sizes and capacity needs, with additional seats, storage and AI capacity available as required.',
            ],
        ];
    }
}
