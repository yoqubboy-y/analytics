import { Head, router } from '@inertiajs/react';
import { formatDistanceToNow } from 'date-fns';
import { Check, Mail, MoreHorizontal, Search, UserPlus } from 'lucide-react';
import { useMemo, useState } from 'react';
import CancelInvitationModal from '@/components/cancel-invitation-modal';
import CreateUserModal from '@/components/create-user-modal';
import DeleteTeamModal from '@/components/delete-team-modal';
import Heading from '@/components/heading';
import InviteMemberModal from '@/components/invite-member-modal';
import RemoveMemberModal from '@/components/remove-member-modal';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { useInitials } from '@/hooks/use-initials';
import { index as administrationIndex } from '@/routes/administration';
import { show as showTeam } from '@/routes/administration/teams';
import { update as updateTeam } from '@/routes/teams';
import { resend as resendInvitation } from '@/routes/teams/invitations';
import { update as updateMember } from '@/routes/teams/members';
import type {
    RoleOption,
    Team,
    TeamInvitation,
    TeamMember,
    TeamPermissions,
} from '@/types';

type AdminMember = TeamMember & { last_active_at: string | null };
type AdminInvitation = TeamInvitation & { expires_at: string | null };

type Props = {
    team: Team;
    members: AdminMember[];
    invitations: AdminInvitation[];
    permissions: TeamPermissions;
    availableRoles: RoleOption[];
};

const VISIT = { preserveScroll: true, preserveState: true } as const;

function lastActiveLabel(iso: string | null): string {
    if (!iso) {
        return '—';
    }

    return formatDistanceToNow(new Date(iso), { addSuffix: true });
}

export default function AdministrationTeam({
    team,
    members,
    invitations,
    permissions,
    availableRoles,
}: Props) {
    const getInitials = useInitials();

    const [name, setName] = useState(team.name);
    const [search, setSearch] = useState('');
    const [roleFilter, setRoleFilter] = useState('all');

    const [inviteOpen, setInviteOpen] = useState(false);
    const [createOpen, setCreateOpen] = useState(false);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [memberToRemove, setMemberToRemove] = useState<AdminMember | null>(
        null,
    );
    const [invitationToCancel, setInvitationToCancel] =
        useState<AdminInvitation | null>(null);

    const roleFilters = useMemo(
        () => [
            { value: 'all', label: 'All' },
            { value: 'owner', label: 'Owner' },
            ...availableRoles,
        ],
        [availableRoles],
    );

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();

        const matches = (role: string, name: string, email: string) =>
            (roleFilter === 'all' || role === roleFilter) &&
            (q === '' ||
                name.toLowerCase().includes(q) ||
                email.toLowerCase().includes(q));

        const memberRows = members.filter((m) =>
            matches(m.role, m.name, m.email),
        );
        const invitationRows = invitations.filter((i) =>
            matches(i.role, '', i.email),
        );

        return { memberRows, invitationRows };
    }, [members, invitations, search, roleFilter]);

    const hasRows =
        filtered.memberRows.length > 0 || filtered.invitationRows.length > 0;

    function saveTeam(e: React.FormEvent) {
        e.preventDefault();
        router.patch(updateTeam.url(team.slug), { name }, VISIT);
    }

    function changeRole(member: AdminMember, role: string) {
        router.patch(updateMember.url([team.slug, member.id]), { role }, VISIT);
    }

    function resend(invitation: AdminInvitation) {
        router.post(
            resendInvitation.url([team.slug, invitation.code]),
            {},
            VISIT,
        );
    }

    return (
        <>
            <Head title={`${team.name} · Administration`} />

            <div className="flex flex-col gap-8 p-4">
                {/* Team settings */}
                {permissions.canUpdateTeam && (
                    <section className="flex flex-col gap-4">
                        <Heading
                            variant="small"
                            title="Team"
                            description="Update your team name."
                        />
                        <form
                            onSubmit={saveTeam}
                            className="flex max-w-md items-end gap-3"
                        >
                            <div className="flex flex-1 flex-col gap-1.5">
                                <Label htmlFor="team-name">Team name</Label>
                                <Input
                                    id="team-name"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    required
                                />
                            </div>
                            <Button type="submit" disabled={name === team.name}>
                                Save
                            </Button>
                        </form>
                    </section>
                )}

                {/* User management */}
                <section className="flex flex-col gap-4">
                    <Heading
                        variant="small"
                        title="Users"
                        description="Manage members and pending invitations."
                    />

                    <div className="flex flex-wrap items-center gap-2">
                        <div className="relative flex flex-1 items-center">
                            <Search className="pointer-events-none absolute left-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search by name or email"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="pl-8"
                            />
                        </div>
                        <Select
                            value={roleFilter}
                            onValueChange={setRoleFilter}
                        >
                            <SelectTrigger className="w-32">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {roleFilters.map((r) => (
                                    <SelectItem key={r.value} value={r.value}>
                                        {r.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {permissions.canAddMember && (
                            <Button
                                className="gap-1.5"
                                onClick={() => setCreateOpen(true)}
                            >
                                <UserPlus className="h-4 w-4" />
                                Create user
                            </Button>
                        )}
                        {permissions.canCreateInvitation && (
                            <Button
                                variant="outline"
                                className="gap-1.5"
                                onClick={() => setInviteOpen(true)}
                            >
                                <Mail className="h-4 w-4" />
                                Invite
                            </Button>
                        )}
                    </div>

                    <div className="overflow-x-auto rounded-lg border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>User</TableHead>
                                    <TableHead>Role</TableHead>
                                    <TableHead>Last active</TableHead>
                                    <TableHead className="w-12" />
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {/* Pending invitations first */}
                                {filtered.invitationRows.map((invitation) => (
                                    <TableRow key={`inv-${invitation.code}`}>
                                        <TableCell>
                                            <div className="flex items-center gap-3">
                                                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted">
                                                    <Mail className="h-4 w-4 text-muted-foreground" />
                                                </div>
                                                <span className="truncate">
                                                    {invitation.email}
                                                </span>
                                                <Badge
                                                    variant="secondary"
                                                    className="bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-500"
                                                >
                                                    Invited
                                                </Badge>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            {invitation.role_label}
                                        </TableCell>
                                        <TableCell className="text-muted-foreground">
                                            —
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {(permissions.canCreateInvitation ||
                                                permissions.canCancelInvitation) && (
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger
                                                        asChild
                                                    >
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-8 w-8"
                                                            aria-label="Invitation actions"
                                                        >
                                                            <MoreHorizontal className="h-4 w-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        {permissions.canCreateInvitation && (
                                                            <DropdownMenuItem
                                                                onSelect={() =>
                                                                    resend(
                                                                        invitation,
                                                                    )
                                                                }
                                                            >
                                                                Resend
                                                                invitation
                                                            </DropdownMenuItem>
                                                        )}
                                                        {permissions.canCancelInvitation && (
                                                            <DropdownMenuItem
                                                                variant="destructive"
                                                                onSelect={() =>
                                                                    setInvitationToCancel(
                                                                        invitation,
                                                                    )
                                                                }
                                                            >
                                                                Cancel
                                                                invitation
                                                            </DropdownMenuItem>
                                                        )}
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}

                                {/* Members */}
                                {filtered.memberRows.map((member) => {
                                    const isOwner = member.role === 'owner';
                                    const canEdit =
                                        !isOwner &&
                                        (permissions.canUpdateMember ||
                                            permissions.canRemoveMember);

                                    return (
                                        <TableRow key={`mem-${member.id}`}>
                                            <TableCell>
                                                <div className="flex items-center gap-3">
                                                    <Avatar className="h-9 w-9">
                                                        {member.avatar && (
                                                            <AvatarImage
                                                                src={
                                                                    member.avatar
                                                                }
                                                                alt={
                                                                    member.name
                                                                }
                                                            />
                                                        )}
                                                        <AvatarFallback>
                                                            {getInitials(
                                                                member.name,
                                                            )}
                                                        </AvatarFallback>
                                                    </Avatar>
                                                    <div className="min-w-0">
                                                        <div className="truncate font-medium">
                                                            {member.name}
                                                        </div>
                                                        <div className="truncate text-sm text-muted-foreground">
                                                            {member.email}
                                                        </div>
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                {member.role_label}
                                            </TableCell>
                                            <TableCell className="text-muted-foreground">
                                                {lastActiveLabel(
                                                    member.last_active_at,
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                {canEdit && (
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger
                                                            asChild
                                                        >
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-8 w-8"
                                                                aria-label="Member actions"
                                                            >
                                                                <MoreHorizontal className="h-4 w-4" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end">
                                                            {permissions.canUpdateMember && (
                                                                <>
                                                                    <DropdownMenuLabel>
                                                                        Role
                                                                    </DropdownMenuLabel>
                                                                    {availableRoles.map(
                                                                        (
                                                                            role,
                                                                        ) => (
                                                                            <DropdownMenuItem
                                                                                key={
                                                                                    role.value
                                                                                }
                                                                                onSelect={() =>
                                                                                    changeRole(
                                                                                        member,
                                                                                        role.value,
                                                                                    )
                                                                                }
                                                                            >
                                                                                {
                                                                                    role.label
                                                                                }
                                                                                {member.role ===
                                                                                    role.value && (
                                                                                    <Check className="ml-auto h-4 w-4" />
                                                                                )}
                                                                            </DropdownMenuItem>
                                                                        ),
                                                                    )}
                                                                </>
                                                            )}
                                                            {permissions.canUpdateMember &&
                                                                permissions.canRemoveMember && (
                                                                    <DropdownMenuSeparator />
                                                                )}
                                                            {permissions.canRemoveMember && (
                                                                <DropdownMenuItem
                                                                    variant="destructive"
                                                                    onSelect={() =>
                                                                        setMemberToRemove(
                                                                            member,
                                                                        )
                                                                    }
                                                                >
                                                                    Remove from
                                                                    team
                                                                </DropdownMenuItem>
                                                            )}
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}

                                {!hasRows && (
                                    <TableRow>
                                        <TableCell
                                            colSpan={4}
                                            className="py-10 text-center text-sm text-muted-foreground"
                                        >
                                            No users match your filters.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </section>

                {/* Danger zone */}
                {permissions.canDeleteTeam && !team.isPersonal && (
                    <section className="flex flex-col gap-4">
                        <Heading
                            variant="small"
                            title="Delete team"
                            description="Permanently delete this team. This cannot be undone."
                        />
                        <div>
                            <Button
                                variant="destructive"
                                onClick={() => setDeleteOpen(true)}
                            >
                                Delete team
                            </Button>
                        </div>
                    </section>
                )}
            </div>

            {permissions.canAddMember && (
                <CreateUserModal
                    team={team}
                    availableRoles={availableRoles}
                    open={createOpen}
                    onOpenChange={setCreateOpen}
                />
            )}

            {permissions.canCreateInvitation && (
                <InviteMemberModal
                    team={team}
                    availableRoles={availableRoles}
                    open={inviteOpen}
                    onOpenChange={setInviteOpen}
                />
            )}

            <RemoveMemberModal
                team={team}
                member={memberToRemove}
                open={memberToRemove !== null}
                onOpenChange={(open) => !open && setMemberToRemove(null)}
            />

            <CancelInvitationModal
                team={team}
                invitation={invitationToCancel}
                open={invitationToCancel !== null}
                onOpenChange={(open) => !open && setInvitationToCancel(null)}
            />

            {permissions.canDeleteTeam && !team.isPersonal && (
                <DeleteTeamModal
                    team={team}
                    open={deleteOpen}
                    onOpenChange={setDeleteOpen}
                />
            )}
        </>
    );
}

AdministrationTeam.layout = (props: { team: Team }) => ({
    breadcrumbs: [
        { title: 'Administration', href: administrationIndex() },
        { title: props.team.name, href: showTeam(props.team.slug) },
    ],
});
