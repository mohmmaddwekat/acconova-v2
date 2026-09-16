<!DOCTYPE html>
<html
    lang="{{ $locale }}"
    dir="{{ $rtl ? 'rtl' : 'ltr' }}"
>
    <head>
        <meta charset="utf-8">

        <title>
            {{ __('exports.products.title', [], $locale) }}
        </title>

        <style>
            @page {
                margin: 14mm;
            }

            * {
                box-sizing: border-box;
            }

            body {
                margin: 0;
                font-family: dejavusans, sans-serif;
                color: #19231f;
                direction: {{ $rtl ? 'rtl' : 'ltr' }};
                font-size: 10px;
                line-height: 1.45;
            }

            .header {
                margin-bottom: 20px;
                padding-bottom: 14px;
                border-bottom: 1px solid #dfe5e1;
            }

            .brand {
                font-size: 10px;
                font-weight: 700;
                letter-spacing: 1px;
                color: #145b46;
            }

            h1 {
                margin: 7px 0 0;
                font-size: 25px;
                line-height: 1.1;
            }

            .meta {
                margin-top: 10px;
                color: #65736d;
            }

            table {
                width: 100%;
                border-collapse: collapse;
                table-layout: fixed;
            }

            th {
                padding: 8px 6px;
                border-bottom: 1px solid #aebbb5;
                background: #eef3ef;
                font-size: 8px;
                text-align: {{ $rtl ? 'right' : 'left' }};
            }

            td {
                padding: 8px 6px;
                border-bottom: 1px solid #e7ebe8;
                vertical-align: top;
                word-break: break-word;
            }

            tr:nth-child(even) td {
                background: #fafbf9;
            }

            .muted {
                color: #7d8a84;
            }

            .no-print {
                margin-bottom: 18px;
            }

            @media print {
                .no-print {
                    display: none;
                }
            }
        </style>
    </head>

    <body>
        @if ($autoPrint)
            <div class="no-print">
                <button
                    type="button"
                    onclick="window.print()"
                >
                    Print
                </button>
            </div>
        @endif

        <div class="header">
            <div class="brand">
                ACCONOVA
            </div>

            <h1>
                {{ __('exports.products.title', [], $locale) }}
            </h1>

            <div class="meta">
                {{ __('exports.products.workspace', [], $locale) }}:
                {{ $organizationName }}

                &nbsp; · &nbsp;

                {{ __('exports.products.total', [], $locale) }}:
                {{ $products->count() }}

                &nbsp; · &nbsp;

                {{ __('exports.products.generated_at', [], $locale) }}:
                {{ $generatedAt }}
            </div>
        </div>

        <table>
            <thead>
                <tr>
                    <th>
                        {{ __('exports.products.columns.type', [], $locale) }}
                    </th>

                    <th>
                        {{ __('exports.products.columns.name', [], $locale) }}
                    </th>

                    <th>
                        {{ __('exports.products.columns.sku', [], $locale) }}
                    </th>

                    <th>
                        {{ __('exports.products.columns.unit', [], $locale) }}
                    </th>

                    <th>
                        {{ __('exports.products.columns.unit_price', [], $locale) }}
                    </th>

                    <th>
                        {{ __('exports.products.columns.cost_price', [], $locale) }}
                    </th>

                    <th>
                        {{ __('exports.products.columns.tax_rate', [], $locale) }}
                    </th>

                    <th>
                        {{ __('exports.products.columns.status', [], $locale) }}
                    </th>
                </tr>
            </thead>

            <tbody>
                @foreach ($products as $product)
                    <tr>
                        <td>
                            {{
                                __(
                                    'exports.products.types.'.$product->type->value,
                                    [],
                                    $locale
                                )
                            }}
                        </td>

                        <td>
                            {{ $product->name }}
                        </td>

                        <td>
                            {{ $product->sku ?: '—' }}
                        </td>

                        <td>
                            {{ $product->unit }}
                        </td>

                        <td>
                            {{ $product->unit_price }}
                        </td>

                        <td>
                            {{ $product->cost_price ?: '—' }}
                        </td>

                        <td>
                            {{ $product->tax_rate }}%
                        </td>

                        <td>
                            {{
                                __(
                                    'exports.products.lifecycle.'
                                        .($product->trashed() ? 'archived' : 'active'),
                                    [],
                                    $locale
                                )
                            }}
                        </td>
                    </tr>
                @endforeach
            </tbody>
        </table>

        @if ($autoPrint)
            <script>
                window.addEventListener(
                    'load',
                    () => {
                        window.print();
                    },
                );
            </script>
        @endif
    </body>
</html>
