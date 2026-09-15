<!DOCTYPE html>
<html
    lang="{{ $locale }}"
    dir="{{ $rtl ? 'rtl' : 'ltr' }}"
>
    <head>
        <meta charset="utf-8">

        <title>
            {{ __('exports.parties.title', [], $locale) }}
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
                {{ __('exports.parties.title', [], $locale) }}
            </h1>

            <div class="meta">
                {{ __('exports.parties.workspace', [], $locale) }}:
                {{ $organizationName }}

                &nbsp; · &nbsp;

                {{ __('exports.parties.total', [], $locale) }}:
                {{ $parties->count() }}

                &nbsp; · &nbsp;

                {{ __('exports.parties.generated_at', [], $locale) }}:
                {{ $generatedAt }}
            </div>
        </div>

        <table>
            <thead>
                <tr>
                    <th>
                        {{ __('exports.parties.columns.type', [], $locale) }}
                    </th>

                    <th>
                        {{ __('exports.parties.columns.name', [], $locale) }}
                    </th>

                    <th>
                        {{ __('exports.parties.columns.roles', [], $locale) }}
                    </th>

                    <th>
                        {{ __('exports.parties.columns.email', [], $locale) }}
                    </th>

                    <th>
                        {{ __('exports.parties.columns.phone', [], $locale) }}
                    </th>

                    <th>
                        {{ __('exports.parties.columns.city', [], $locale) }}
                    </th>

                    <th>
                        {{ __('exports.parties.columns.country', [], $locale) }}
                    </th>
                </tr>
            </thead>

            <tbody>
                @foreach ($parties as $party)
                    <tr>
                        <td>
                            {{
                                __(
                                    'exports.parties.types.'.$party->type->value,
                                    [],
                                    $locale
                                )
                            }}
                        </td>

                        <td>
                            {{
                                $party->type->value === 'company'
                                    ? $party->company_name
                                    : $party->name
                            }}
                        </td>

                        <td>
                            {{
                                $party->roles
                                    ->map(
                                        fn ($role) => __(
                                            'exports.parties.roles.'.$role->role->value,
                                            [],
                                            $locale
                                        )
                                    )
                                    ->implode(', ')
                            }}
                        </td>

                        <td>
                            {{ $party->email ?: '—' }}
                        </td>

                        <td>
                            {{ $party->phone ?: '—' }}
                        </td>

                        <td>
                            {{ $party->city ?: '—' }}
                        </td>

                        <td>
                            {{ $party->country_code ?: '—' }}
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