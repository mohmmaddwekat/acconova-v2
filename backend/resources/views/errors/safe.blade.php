<!DOCTYPE html>
<html lang="{{ app()->getLocale() }}" dir="{{ app()->getLocale() === 'ar' ? 'rtl' : 'ltr' }}">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>AccoNova</title>
    </head>
    <body style="font-family: system-ui; background: #f5f7f6; color: #20352d; margin: 0; padding: 24px;">
        <main style="max-width: 480px; margin: 15vh auto; padding: 24px; background: white; border-radius: 24px;">
            <h1>AccoNova</h1>
            <p role="alert">{{ $message }}</p>
            <a href="{{ url('/app') }}">{{ __('feedback.return') }}</a>
        </main>
    </body>
</html>
