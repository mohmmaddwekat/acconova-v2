<!DOCTYPE html>
<html lang="{{ $locale }}" dir="{{ $rtl ? 'rtl' : 'ltr' }}">
    <head>
        <meta charset="utf-8">
        <title>{{ $title }}</title>
        <style>
            @page { margin: 14mm; }
            body { margin: 0; font-family: dejavusans, sans-serif; color: #19231f; direction: {{ $rtl ? 'rtl' : 'ltr' }}; font-size: 10px; line-height: 1.45; }
            h1 { margin: 7px 0 0; font-size: 22px; }
            .brand { font-size: 10px; font-weight: 700; letter-spacing: 1px; color: #145b46; }
            .meta { margin: 8px 0 16px; color: #65736d; }
            table { width: 100%; border-collapse: collapse; }
            th, td { padding: 6px 8px; border-bottom: 1px solid #dfe5e1; text-align: {{ $rtl ? 'right' : 'left' }}; }
            th { background: #f2f6f4; font-size: 9px; text-transform: uppercase; }
        </style>
    </head>
    <body @if ($autoPrint) onload="window.print()" @endif>
        <div class="brand">ACCONOVA</div>
        <h1>{{ $title }}</h1>
        <div class="meta">{{ $organizationName }} · {{ $generatedAt }}</div>
        <table>
            <thead>
                <tr>@foreach ($headings as $heading)<th>{{ $heading }}</th>@endforeach</tr>
            </thead>
            <tbody>
                @foreach ($rows as $row)
                    <tr>@foreach ($row as $cell)<td>{{ $cell }}</td>@endforeach</tr>
                @endforeach
            </tbody>
        </table>
    </body>
</html>
