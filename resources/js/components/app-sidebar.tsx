import { usePage } from '@inertiajs/react';
import { Cog, GitCompareIcon, Settings2, TrendingUp } from 'lucide-react';
import { NavMain } from '@/components/nav-main';
import { NavUser } from '@/components/nav-user';
import { TeamSwitcher } from '@/components/team-switcher';
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuItem,
} from '@/components/ui/sidebar';
import type { NavItem } from '@/types';

export function AppSidebar() {
    const page = usePage();
    const slug = page.props.currentTeam?.slug;
    // Viewers are analytics-only — no access to configuration.
    const isViewer = page.props.currentTeam?.role === 'viewer';

    // Side-by-side comparison only makes sense when the user is in 2+
    // non-personal teams; otherwise hide the nav entry entirely.
    const accessibleTeams = page.props.teams ?? [];
    const canCompare = accessibleTeams.filter((t) => !t.isPersonal).length >= 2;

    const mainNavItems: NavItem[] = [
        {
            title: 'Analytics',
            href: slug ? `/${slug}/analytics` : '#',
            icon: TrendingUp,
        },
        ...(canCompare
            ? [
                  {
                      title: 'Compare',
                      href: '/compare',
                      icon: GitCompareIcon,
                  } as NavItem,
              ]
            : []),
    ];

    const configNavItems: NavItem[] = isViewer
        ? []
        : [
              {
                  title: 'Configurations',
                  href: slug ? `/${slug}/configuration` : '#',
                  icon: Settings2,
              },
          ];

    const adminNavItems: NavItem[] = [
        {
            title: 'Administration',
            href: '/administration',
            icon: Cog,
        },
    ];

    return (
        <Sidebar collapsible="icon" variant="inset">
            <SidebarHeader>
                <SidebarMenu>
                    <SidebarMenuItem>
                        <TeamSwitcher />
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarHeader>

            <SidebarContent>
                <NavMain items={mainNavItems} />
                {configNavItems.length > 0 && (
                    <NavMain items={configNavItems} label="Settings" />
                )}
                <NavMain items={adminNavItems} label="Administration" />
            </SidebarContent>

            <SidebarFooter>
                <NavUser />
            </SidebarFooter>
        </Sidebar>
    );
}
