@props(['url'])
<tr>
<td class="header">
<a href="{{ $url }}" style="display: inline-block;">
<img src="{{ rtrim(config('app.url'), '/') }}/logo.jpg" class="logo" alt="{{ config('app.name') }}" style="height: 48px; max-height: 48px; width: auto; border-radius: 8px;">
</a>
</td>
</tr>
