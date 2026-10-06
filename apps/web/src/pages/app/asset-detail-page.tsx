import type {
  AssetHistory,
  AssetPublic,
  MemberPublic,
  MembershipRole,
  Permission,
} from '@assetflow/types';
import { PERMISSIONS, hasPermission } from '@assetflow/shared';
import { QRCodeSVG } from 'qrcode.react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { FormError, SubmitButton } from '../../components/form';
import { RequirePermission } from '../../components/route-guards';
import {
  ASSET_CONDITION_LABELS,
  useAsset,
  useAssetHistory,
  useAssignAsset,
  useDeleteAsset,
  useRetireAsset,
  useReturnAsset,
  useTransferAsset,
} from '../../features/assets/api';
import { useMembers } from '../../features/organisation/api';
import { errorMessage } from '../../lib/error-message';
import { useAuthStore } from '../../stores/auth-store';
import { StatusBadge } from './assets-page';

function can(role: MembershipRole | undefined, permission: Permission) {
  return Boolean(role && hasPermission(role, permission));
}

function sectionTitle(text: string, testId?: string) {
  return (
    <h2 className="text-sm font-semibold" data-testid={testId}>
      {text}
    </h2>
  );
}

function MemberSelect({
  id,
  label,
  members,
  value,
  onChange,
  excludeUserId,
}: {
  id: string;
  label: string;
  members: MemberPublic[];
  value: string;
  onChange: (value: string) => void;
  excludeUserId?: string | null;
}) {
  const options = members.filter((member) => member.userId !== excludeUserId);
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30"
      >
        <option value="">Choose a memberâ€¦</option>
        {options.map((member) => (
          <option key={member.userId} value={member.userId}>
            {member.name} ({member.email})
          </option>
        ))}
      </select>
    </div>
  );
}

function NotesField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div>
      <label htmlFor="action-notes" className="block text-sm font-medium">
        Notes
      </label>
      <input
        id="action-notes"
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Optional"
        className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30"
      />
    </div>
  );
}

function AssignAction({
  asset,
  members,
  role,
}: {
  asset: AssetPublic;
  members: MemberPublic[];
  role: MembershipRole | undefined;
}) {
  const organisation = useAuthStore((state) => state.organisation);
  const assign = useAssignAsset(organisation?.id ?? null, asset.id);
  const [memberId, setMemberId] = useState('');
  const [notes, setNotes] = useState('');

  if (!can(role, PERMISSIONS.ASSETS_ASSIGN)) return null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!memberId) return;
    try {
      await assign.mutateAsync({ assignedToUserId: memberId, notes: notes.trim() || null });
      setMemberId('');
      setNotes('');
    } catch {
      // Error shown below.
    }
  };

  return (
    <form onSubmit={(event) => void submit(event)} className="space-y-3" data-testid="assign-form">
      {sectionTitle('Assign')}
      <MemberSelect
        id="assign-member"
        label="Assign to"
        members={members}
        value={memberId}
        onChange={setMemberId}
      />
      <NotesField value={notes} onChange={setNotes} />
      {assign.isError ? (
        <FormError testId="assign-error">
          {errorMessage(assign.error, 'Could not assign.')}
        </FormError>
      ) : null}
      <SubmitButton
        busy={assign.isPending}
        busyLabel="Assigningâ€¦"
        disabled={!memberId}
        className="w-auto px-4"
      >
        Assign asset
      </SubmitButton>
    </form>
  );
}

function ReturnAction({ asset, role }: { asset: AssetPublic; role: MembershipRole | undefined }) {
  const organisation = useAuthStore((state) => state.organisation);
  const returnAsset = useReturnAsset(organisation?.id ?? null, asset.id);
  const [condition, setCondition] = useState<'good' | 'fair' | 'poor' | ''>('');
  const [notes, setNotes] = useState('');

  if (!can(role, PERMISSIONS.ASSETS_ASSIGN)) return null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await returnAsset.mutateAsync({
        condition: (condition || null) as 'good' | 'fair' | 'poor' | null,
        notes: notes.trim() || null,
      });
      setCondition('');
      setNotes('');
    } catch {
      // Error shown below.
    }
  };

  return (
    <form onSubmit={(event) => void submit(event)} className="space-y-3" data-testid="return-form">
      {sectionTitle('Return')}
      <div>
        <label htmlFor="return-condition" className="block text-sm font-medium">
          Condition on return
        </label>
        <select
          id="return-condition"
          value={condition}
          onChange={(event) => setCondition(event.target.value as 'good' | 'fair' | 'poor' | '')}
          className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30"
        >
          <option value="">Leave unchanged</option>
          <option value="good">Good</option>
          <option value="fair">Fair</option>
          <option value="poor">Poor</option>
        </select>
      </div>
      <NotesField value={notes} onChange={setNotes} />
      {returnAsset.isError ? (
        <FormError testId="return-error">
          {errorMessage(returnAsset.error, 'Could not record the return.')}
        </FormError>
      ) : null}
      <SubmitButton busy={returnAsset.isPending} busyLabel="Returningâ€¦" className="w-auto px-4">
        Record return
      </SubmitButton>
    </form>
  );
}

function TransferAction({
  asset,
  members,
  role,
}: {
  asset: AssetPublic;
  members: MemberPublic[];
  role: MembershipRole | undefined;
}) {
  const organisation = useAuthStore((state) => state.organisation);
  const transfer = useTransferAsset(organisation?.id ?? null, asset.id);
  const [memberId, setMemberId] = useState('');
  const [notes, setNotes] = useState('');

  if (!can(role, PERMISSIONS.ASSETS_TRANSFER)) return null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!memberId) return;
    try {
      await transfer.mutateAsync({ toUserId: memberId, notes: notes.trim() || null });
      setMemberId('');
      setNotes('');
    } catch {
      // Error shown below.
    }
  };

  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="space-y-3"
      data-testid="transfer-form"
    >
      {sectionTitle('Transfer')}
      <MemberSelect
        id="transfer-member"
        label="Transfer to"
        members={members}
        value={memberId}
        onChange={setMemberId}
        excludeUserId={asset.assignedToUserId}
      />
      <NotesField value={notes} onChange={setNotes} />
      {transfer.isError ? (
        <FormError testId="transfer-error">
          {errorMessage(transfer.error, 'Could not transfer.')}
        </FormError>
      ) : null}
      <SubmitButton
        busy={transfer.isPending}
        busyLabel="Transferringâ€¦"
        disabled={!memberId}
        className="w-auto px-4"
      >
        Transfer asset
      </SubmitButton>
    </form>
  );
}

function RetireAction({ asset, role }: { asset: AssetPublic; role: MembershipRole | undefined }) {
  const organisation = useAuthStore((state) => state.organisation);
  const retire = useRetireAsset(organisation?.id ?? null, asset.id);
  const [reason, setReason] = useState('');
  const [confirming, setConfirming] = useState(false);

  if (!can(role, PERMISSIONS.ASSETS_UPDATE)) return null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!confirming) {
      setConfirming(true);
      return;
    }
    try {
      await retire.mutateAsync({ reason: reason.trim() || null });
      setReason('');
      setConfirming(false);
    } catch {
      setConfirming(false);
    }
  };

  return (
    <form onSubmit={(event) => void submit(event)} className="space-y-3" data-testid="retire-form">
      {sectionTitle('Retire')}
      <div>
        <label htmlFor="retire-reason" className="block text-sm font-medium">
          Reason
        </label>
        <input
          id="retire-reason"
          type="text"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="e.g. End of life, written off"
          className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30"
        />
      </div>
      {retire.isError ? (
        <FormError testId="retire-error">
          {errorMessage(retire.error, 'Could not retire.')}
        </FormError>
      ) : null}
      <SubmitButton busy={retire.isPending} busyLabel="Retiringâ€¦" className="w-auto px-4">
        {confirming ? 'Confirm retirement?' : 'Retire asset'}
      </SubmitButton>
      {confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="rounded-md border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
        >
          Cancel
        </button>
      ) : null}
    </form>
  );
}

function historyDate(value: string | null): number {
  return value ? new Date(value).getTime() : 0;
}

function HistorySection({ history }: { history: AssetHistory }) {
  const entries = [
    ...history.assignments.map((row) => ({
      key: `assignment-${row.id}`,
      sortAt: historyDate(row.returnedAt ?? row.assignedAt),
      title: row.returnedAt
        ? `Returned from ${row.assignedToName}`
        : `Assigned to ${row.assignedToName}`,
      detail: [
        row.returnedAt
          ? `checked in ${new Date(row.returnedAt).toLocaleString()}`
          : `assigned ${new Date(row.assignedAt).toLocaleString()} by ${row.assignedByName}`,
        row.returnedAt && row.returnedByName ? `returned by ${row.returnedByName}` : null,
        row.returnCondition ? `condition: ${ASSET_CONDITION_LABELS[row.returnCondition]}` : null,
        row.notes ? `notes: ${row.notes}` : null,
      ]
        .filter(Boolean)
        .join(' Â· '),
    })),
    ...history.transfers.map((row) => ({
      key: `transfer-${row.id}`,
      sortAt: historyDate(row.transferredAt),
      title: `Transferred to ${row.toUserName}`,
      detail: [
        `${row.fromUserName ?? 'Unknown'} â†’ ${row.toUserName}`,
        `${new Date(row.transferredAt).toLocaleString()} by ${row.transferredByName}`,
        row.notes ? `notes: ${row.notes}` : null,
      ]
        .filter(Boolean)
        .join(' Â· '),
    })),
  ].sort((a, b) => b.sortAt - a.sortAt);

  return (
    <section className="rounded-lg border border-border bg-surface p-6">
      {sectionTitle('History', 'history-heading')}
      {entries.length === 0 ? (
        <p className="mt-3 text-sm text-muted-fg" data-testid="history-empty">
          No assignments or transfers recorded yet.
        </p>
      ) : (
        <ol className="mt-4 space-y-4 border-l border-border pl-4" data-testid="history-list">
          {entries.map((entry) => (
            <li key={entry.key} className="relative">
              <span
                aria-hidden="true"
                className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-primary"
              />
              <p className="text-sm font-medium">{entry.title}</p>
              <p className="text-xs text-muted-fg">{entry.detail}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function AssetDetailContent({ asset }: { asset: AssetPublic }) {
  const organisation = useAuthStore((state) => state.organisation);
  const role = useAuthStore((state) => state.membership?.role);
  const orgId = organisation?.id ?? null;
  const navigate = useNavigate();

  const history = useAssetHistory(orgId, asset.id);
  const members = useMembers(orgId);
  const removeAsset = useDeleteAsset(orgId, asset.id);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const handleDelete = async () => {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    try {
      await removeAsset.mutateAsync();
      navigate('/app/assets');
    } catch {
      setConfirmingDelete(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-semibold tracking-tight">{asset.name}</h1>
            <StatusBadge status={asset.status} />
          </div>
          <p className="mt-1 font-mono text-sm text-muted-fg">{asset.assetTag}</p>
        </div>
        <div className="flex items-center gap-2">
          {can(role, PERMISSIONS.ASSETS_UPDATE) ? (
            <Link
              to={`/app/assets/${asset.id}/edit`}
              data-testid="edit-asset"
              className="rounded-md border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted"
            >
              Edit
            </Link>
          ) : null}
          {can(role, PERMISSIONS.ASSETS_DELETE) ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleDelete()}
                onBlur={() => setConfirmingDelete(false)}
                disabled={removeAsset.isPending}
                data-testid="delete-asset"
                className="rounded-md border border-danger/40 px-3 py-1.5 text-sm font-medium text-danger transition-colors hover:bg-danger/5 disabled:opacity-60"
              >
                {removeAsset.isPending
                  ? 'Deletingâ€¦'
                  : confirmingDelete
                    ? 'Confirm delete?'
                    : 'Delete'}
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {removeAsset.isError ? (
        <div
          role="alert"
          data-testid="delete-error"
          className="rounded-lg border border-danger/40 bg-danger/5 p-4 text-sm text-danger"
        >
          {errorMessage(removeAsset.error, 'Could not delete this asset.')}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <section className="rounded-lg border border-border bg-surface p-6">
          {sectionTitle('Details')}
          <dl className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-fg">Category</dt>
              <dd className="mt-1 text-sm">{asset.categoryName ?? 'â€”'}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-fg">Location</dt>
              <dd className="mt-1 text-sm">{asset.locationName ?? 'â€”'}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-fg">Serial number</dt>
              <dd className="mt-1 font-mono text-sm">{asset.serialNumber ?? 'â€”'}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-fg">Condition</dt>
              <dd className="mt-1 text-sm">{ASSET_CONDITION_LABELS[asset.condition]}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-fg">Assigned to</dt>
              <dd className="mt-1 text-sm">{asset.assignedToName ?? 'â€”'}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-fg">Barcode</dt>
              <dd className="mt-1 font-mono text-sm">{asset.barcode}</dd>
            </div>
            {asset.description ? (
              <div className="sm:col-span-2">
                <dt className="text-xs uppercase tracking-wide text-muted-fg">Description</dt>
                <dd className="mt-1 whitespace-pre-wrap text-sm">{asset.description}</dd>
              </div>
            ) : null}
            {asset.retiredAt ? (
              <div className="sm:col-span-2">
                <dt className="text-xs uppercase tracking-wide text-muted-fg">Retired</dt>
                <dd className="mt-1 text-sm">
                  {new Date(asset.retiredAt).toLocaleString()}
                  {asset.retirementReason ? ` Â· ${asset.retirementReason}` : ''}
                </dd>
              </div>
            ) : null}
          </dl>
        </section>

        <section
          className="flex flex-col items-center rounded-lg border border-border bg-surface p-6"
          data-testid="qr-section"
        >
          {sectionTitle('QR code')}
          <div className="mt-4 rounded-lg bg-white p-3">
            <QRCodeSVG value={asset.barcode} size={160} marginSize={2} />
          </div>
          <p className="mt-3 break-all text-center font-mono text-xs text-muted-fg">
            {asset.barcode}
          </p>
          <p className="mt-2 text-center text-xs text-muted-fg">Scan to search for this asset.</p>
        </section>
      </div>

      <section className="rounded-lg border border-border bg-surface p-6">
        {sectionTitle('Actions')}
        {asset.status === 'retired' ? (
          <p className="mt-3 text-sm text-muted-fg">
            This asset is retired. Its history stays readable, but it can no longer be assigned.
          </p>
        ) : (
          <div className="mt-4 grid gap-6 sm:grid-cols-2">
            {asset.status === 'available' ? (
              <>
                <AssignAction asset={asset} members={members.data ?? []} role={role} />
                <RetireAction asset={asset} role={role} />
              </>
            ) : (
              <>
                <ReturnAction asset={asset} role={role} />
                <TransferAction asset={asset} members={members.data ?? []} role={role} />
              </>
            )}
          </div>
        )}
        {members.isError ? (
          <p role="alert" className="mt-3 text-xs text-danger">
            {errorMessage(members.error, 'Could not load members for assignments.')}
          </p>
        ) : null}
      </section>

      {history.isPending ? (
        <p className="text-sm text-muted-fg">Loading historyâ€¦</p>
      ) : history.isError ? (
        <div
          role="alert"
          className="rounded-lg border border-danger/40 bg-danger/5 p-4 text-sm text-danger"
        >
          {errorMessage(history.error, 'Could not load history.')}
        </div>
      ) : (
        <HistorySection history={history.data} />
      )}
    </div>
  );
}

export function AssetDetailPage() {
  const { assetId } = useParams<{ assetId: string }>();
  const organisation = useAuthStore((state) => state.organisation);
  const orgId = organisation?.id ?? null;
  const asset = useAsset(orgId, assetId ?? null);

  return (
    <RequirePermission permission="assets.view">
      {asset.isPending ? (
        <p className="py-6 text-sm text-muted-fg">Loading assetâ€¦</p>
      ) : asset.isError || !asset.data ? (
        <div
          role="alert"
          className="rounded-lg border border-danger/40 bg-danger/5 p-4 text-sm text-danger"
        >
          {errorMessage(asset.error, 'Could not load this asset.')}
        </div>
      ) : (
        <AssetDetailContent asset={asset.data} />
      )}
    </RequirePermission>
  );
}
