import { usePage } from '@inertiajs/react';
import { Cog, Settings2, TrendingUp } from 'lucide-react';
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

    const mainNavItems: NavItem[] = [
        {
            title: 'Analytics',
            href: slug ? `/${slug}/analytics` : '#',
            icon: TrendingUp,
        },
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
