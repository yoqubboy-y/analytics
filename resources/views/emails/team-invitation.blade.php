@component('mail::message')
# You're invited to join {{ $team }}

**{{ $inviter }}** has invited you to join the **{{ $team }}** team on {{ config('app.name') }} as a **{{ $role }}**.

@component('mail::button', ['url' => $acceptUrl])
Accept invitation
@endcomponent

This invitation expires {{ $expires }}.

If you weren't expecting this invitation, you can safely ignore this email.

Thanks,<br>
{{ config('app.name') }}

@slot('subcopy')
If you're having trouble clicking the "Accept invitation" button, copy and paste the URL below into your web browser:

[{{ $acceptUrl }}]({{ $acceptUrl }})
@endslot
@endcomponent
