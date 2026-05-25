@component('mail::message')
# Reset your password

You're receiving this email because we received a password reset request for your {{ config('app.name') }} account.

@component('mail::button', ['url' => $url])
Reset password
@endcomponent

This password reset link will expire in {{ $count }} minutes.

If you didn't request a password reset, no further action is required.

Thanks,<br>
{{ config('app.name') }}

@slot('subcopy')
If you're having trouble clicking the "Reset password" button, copy and paste the URL below into your web browser:

[{{ $url }}]({{ $url }})
@endslot
@endcomponent
