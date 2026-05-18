import { Head, Link, usePage } from '@inertiajs/react';
import BackgroundScene from '@/components/background-scene';
import { dashboard, login, register } from '@/routes';

export default function Welcome({
    canRegister = true,
}: {
    canRegister?: boolean;
}) {
    const { auth, currentTeam } = usePage().props;
    const dashboardUrl = currentTeam ? dashboard(currentTeam.slug) : '/';

    return (
        <>
            <Head title="Welcome" />

            {/* Fullscreen animated background */}
            <BackgroundScene />

            {/* Foreground content */}
            <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6">
                {/* Header */}
                <nav className="absolute top-0 right-0 flex items-center gap-3 p-6">
                    {auth.user ? (
                        <Link
                            href={dashboardUrl}
                            className="rounded-md border border-white/20 bg-white/5 px-5 py-2 text-sm text-white backdrop-blur-sm transition hover:bg-white/10"
                        >
                            Dashboard
                        </Link>
                    ) : (
                        <>
                            <Link
                                href={login()}
                                className="px-4 py-2 text-sm text-white/70 transition hover:text-white"
                            >
                                Log in
                            </Link>
                            {canRegister && (
                                <Link
                                    href={register()}
                                    className="rounded-md border border-emerald-400/40 bg-emerald-400/10 px-5 py-2 text-sm text-emerald-300 backdrop-blur-sm transition hover:bg-emerald-400/20 hover:text-emerald-200"
                                >
                                    Get started
                                </Link>
                            )}
                        </>
                    )}
                </nav>

                {/* Hero */}
                <div className="flex flex-col items-center gap-6 text-center">
                    <img src="/logo.jpg" alt="Fleet Analytics" className="h-20 w-20 rounded-2xl object-cover" />

                    <div className="space-y-3">
                        <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl">
                            Fleet Analytics
                        </h1>
                        <p className="max-w-md text-base text-white/50 sm:text-lg">
                            Real-time P&amp;L, dispatcher performance, and driver insights — all in one place.
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center justify-center gap-3">
                        {auth.user ? (
                            <Link
                                href={dashboardUrl}
                                className="rounded-lg bg-emerald-500 px-6 py-2.5 text-sm font-semibold text-black transition hover:bg-emerald-400"
                            >
                                Go to Dashboard
                            </Link>
                        ) : (
                            <>
                                {canRegister && (
                                    <Link
                                        href={register()}
                                        className="rounded-lg bg-emerald-500 px-6 py-2.5 text-sm font-semibold text-black transition hover:bg-emerald-400"
                                    >
                                        Get started free
                                    </Link>
                                )}
                                <Link
                                    href={login()}
                                    className="rounded-lg border border-white/15 px-6 py-2.5 text-sm font-semibold text-white/80 transition hover:border-white/30 hover:text-white"
                                >
                                    Sign in
                                </Link>
                            </>
                        )}
                    </div>

                    {/* Feature pills */}
                    <div className="mt-4 flex flex-wrap justify-center gap-2">
                        {['P&L Reports', 'Dispatcher Charts', 'Driver Configs', 'Team Expenses', 'Utilization Rates'].map((f) => (
                            <span
                                key={f}
                                className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/50"
                            >
                                {f}
                            </span>
                        ))}
                    </div>
                </div>
            </div>
        </>
    );
}
