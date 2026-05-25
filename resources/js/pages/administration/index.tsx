import { Head, Link } from '@inertiajs/react';
import { Building2, ChevronRight, Plus } from 'lucide-react';
import CreateTeamModal from '@/components/create-team-modal';
import Heading from '@/components/heading';
import { Button } from '@/components/ui/button';
import {
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
} from '@/components/ui/empty';
import { index as administrationIndex } from '@/routes/administration';
import { show as showTeam } from '@/routes/administration/teams';

type AdminTeam = {
    id: number;
    name: string;
    slug: string;
    is_personal: boolean;
    role: string;
    role_label: string;
    members_count: number;
};

type Props = {
    teams: AdminTeam[];
};

export default function AdministrationIndex({ teams }: Props) {
    return (
        <>
            <Head title="Administration" />

            <div className="flex flex-col gap-6 p-4">
                <div className="flex items-start justify-between gap-4">
                    <Heading
                        variant="small"
                        title="Teams"
                        description="Select a team to manage its members and users, or create a new one."
                    />
                    <CreateTeamModal>
                        <Button size="sm" className="gap-1.5">
                            <Plus className="h-4 w-4" />
                            New team
                        </Button>
                    </CreateTeamModal>
                </div>

                {teams.length === 0 ? (
                    <Empty>
                        <EmptyHeader>
                            <EmptyMedia variant="icon">
                                <Building2 />
                            </EmptyMedia>
                            <EmptyTitle>No teams to manage</EmptyTitle>
                            <EmptyDescription>
                                Create a team to start inviting and managing
                                users.
                            </EmptyDescription>
                        </EmptyHeader>
                    </Empty>
                ) : (
                    <div className="flex max-w-2xl flex-col gap-2">
                        {teams.map((team) => (
                            <Link
                                key={team.id}
                                href={showTeam(team.slug)}
                                className="group flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-accent"
                            >
                                <div className="flex min-w-0 items-center gap-3">
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                                        <Building2 className="h-5 w-5 text-muted-foreground" />
                                    </div>
                                    <div className="min-w-0">
                                        <div className="truncate font-medium">
                                            {team.name}
                                        </div>
                                        <div className="text-sm text-muted-foreground">
                                            {team.members_count} member
                                            {team.members_count !== 1
                                                ? 's'
                                                : ''}{' '}
                                            · {team.role_label}
                                        </div>
                                    </div>
                                </div>
                                <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                            </Link>
                        ))}
                    </div>
                )}
            </div>
        </>
    );
}

AdministrationIndex.layout = () => ({
    breadcrumbs: [{ title: 'Administration', href: administrationIndex() }],
});
