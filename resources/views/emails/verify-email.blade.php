@component('mail::message')
# Verify your email address

Thanks for signing up for {{ config('app.name') }}. Please confirm your email address by clicking the button below.

@component('mail::button', ['url' => $url])
Verify email
@endcomponent

If you did not create an account, no further action is required.

Thanks,<br>
{{ config('app.name') }}

@slot('subcopy')
If you're having trouble clicking the "Verify email" button, copy and paste the URL below into your web browser:

[{{ $url }}]({{ $url }})
@endslot
@endcomponent
