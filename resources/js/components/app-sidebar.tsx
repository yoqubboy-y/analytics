import { usePage } from '@inertiajs/react';
import { Settings2, TrendingUp } from 'lucide-react';
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

    const mainNavItems: NavItem[] = [
        {
            title: 'Analytics',
            href: slug ? `/${slug}/analytics` : '#',
            icon: TrendingUp,
        },
    ];

    const configNavItems: NavItem[] = [
        {
            title: 'Configurations',
            href: slug ? `/${slug}/configuration` : '#',
            icon: Settings2,
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
                <NavMain items={configNavItems} label="Settings" />
            </SidebarContent>

            <SidebarFooter>
                <NavUser />
            </SidebarFooter>
        </Sidebar>
    );
}
