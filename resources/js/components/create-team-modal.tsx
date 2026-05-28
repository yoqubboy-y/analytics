import { Form } from '@inertiajs/react';
import type { PropsWithChildren } from 'react';
import { useState } from 'react';
import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { store } from '@/routes/teams';

type DataSource = 'analytics_db' | 'xlsx';

export default function CreateTeamModal({ children }: PropsWithChildren) {
    const [open, setOpen] = useState(false);
    const [dataSource, setDataSource] = useState<DataSource>('analytics_db');

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                setOpen(next);
                if (next) setDataSource('analytics_db');
            }}
        >
            <DialogTrigger asChild>{children}</DialogTrigger>
            <DialogContent>
                <Form
                    key={String(open)}
                    {...store.form()}
                    className="space-y-6"
                    onSuccess={() => setOpen(false)}
                >
                    {({ errors, processing }) => (
                        <>
                            <DialogHeader>
                                <DialogTitle>Create a new team</DialogTitle>
                                <DialogDescription>
                                    Pick a data source and configure how this team's analytics are fed.
                                </DialogDescription>
                            </DialogHeader>

                            <div className="grid gap-2">
                                <Label htmlFor="name">Team name</Label>
                                <Input
                                    id="name"
                                    name="name"
                                    data-test="create-team-name"
                                    placeholder="My team"
                                    required
                                />
                                <InputError message={errors.name} />
                            </div>

                            <div className="grid gap-2">
                                <Label>Data source</Label>
                                <div className="grid grid-cols-2 gap-2">
                                    <SourceCard
                                        active={dataSource === 'analytics_db'}
                                        title="Analytics DB"
                                        description="Reads weekly P&L from the configured Postgres source."
                                        onClick={() => setDataSource('analytics_db')}
                                    />
                                    <SourceCard
                                        active={dataSource === 'xlsx'}
                                        title="XLSX upload"
                                        description="Members import weekly spreadsheets manually."
                                        onClick={() => setDataSource('xlsx')}
                                    />
                                </div>
                                <input type="hidden" name="data_source" value={dataSource} />
                                <InputError message={errors.data_source} />
                            </div>

                            {dataSource === 'analytics_db' && (
                                <div className="grid gap-2">
                                    <Label htmlFor="external_company_id">External company ID</Label>
                                    <Input
                                        id="external_company_id"
                                        name="external_company_id"
                                        type="number"
                                        min={1}
                                        placeholder="e.g. 42"
                                        required
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        Numeric company identifier used to filter rows in the analytics
                                        Postgres. Required when the source is the analytics DB.
                                    </p>
                                    <InputError message={errors.external_company_id} />
                                </div>
                            )}

                            <DialogFooter className="gap-2">
                                <DialogClose asChild>
                                    <Button variant="secondary">Cancel</Button>
                                </DialogClose>

                                <Button
                                    type="submit"
                                    data-test="create-team-submit"
                                    disabled={processing}
                                >
                                    Create team
                                </Button>
                            </DialogFooter>
                        </>
                    )}
                </Form>
            </DialogContent>
        </Dialog>
    );
}

function SourceCard({
    active,
    title,
    description,
    onClick,
}: {
    active: boolean;
    title: string;
    description: string;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={
                'flex flex-col gap-1 rounded-md border p-3 text-left text-sm transition-colors ' +
                (active
                    ? 'border-primary bg-primary/5'
                    : 'border-input hover:bg-accent')
            }
        >
            <span className="font-medium">{title}</span>
            <span className="text-xs text-muted-foreground">{description}</span>
        </button>
    );
}
