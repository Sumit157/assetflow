import type { InvitationPublic, MemberPublic, MembershipRole } from '@assetflow/types';
import { ASSIGNABLE_ROLES, PERMISSIONS, ROLE_LABELS, hasPermission } from '@assetflow/shared';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { useState } from 'react';
import { FormError, SubmitButton, TextField } from '../../components/form';
import { RequirePermission } from '../../components/route-guards';
import { errorMessage } from '../../lib/error-message';
import { zodResolver } from '../../lib/form-resolver';
import {
  useCreateInvitation,
  useInvitations,
  useRevokeInvitation,
} from '../../features/invitations/api';
import { useMembers, useRemoveMember, useUpdateMemberRole } from '../../features/organisation/api';
import { useAuthStore } from '../../stores/auth-store';

const inviteSchema = z.object({
  email: z.email('Enter a valid email address.'),
  role: z.enum(ASSIGNABLE_ROLES as unknown as [MembershipRole, ...MembershipRole[]]),
});

type InviteValues = z.infer<typeof inviteSchema>;

function InviteForm() {
  const organisation = useAuthStore((state) => state.organisation);
  const createInvitation = useCreateInvitation(organisation?.id ?? null);
  const [done, setDone] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<InviteValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: '', role: 'VIEWER' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setDone(false);
    try {
      await createInvitation.mutateAsync(values);
      reset({ email: '', role: 'VIEWER' });
      setDone(true);
    } catch {
      setDone(false);
    }
  });

  return (
    <form onSubmit={(event) => void onSubmit(event)} noValidate className="space-y-4">
      {createInvitation.isError ? (
        <FormError testId="invite-error">
          {errorMessage(createInvitation.error, 'Could not send the invitation.')}
        </FormError>
      ) : null}
      {done ? (
        <p className="text-sm text-success" data-testid="invite-sent">
          Invitation sent.
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
        <TextField
          label="Email"
          type="email"
          placeholder="teammate@company.com"
          error={errors.email?.message}
          {...register('email')}
        />
        <div>
          <label htmlFor="invite-role" className="block text-sm font-medium">
            Role
          </label>
          <select
            id="invite-role"
            className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30"
            {...register('role')}
          >
            {ASSIGNABLE_ROLES.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </select>
          {errors.role ? (
            <p role="alert" className="mt-1.5 text-xs text-danger">
              {errors.role.message}
            </p>
          ) : null}
        </div>
      </div>

      <SubmitButton
        busy={isSubmitting || createInvitation.isPending}
        busyLabel="Inviting…"
        className="w-auto px-4"
      >
        Send invitation
      </SubmitButton>
    </form>
  );
}

function InvitationRow({
  invitation,
  onRevoke,
  busy,
}: {
  invitation: InvitationPublic;
  onRevoke: () => void;
  busy: boolean;
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{invitation.email}</p>
        <p className="text-xs text-muted-fg">
          {ROLE_LABELS[invitation.role]} ·{' '}
          <span className="capitalize" data-testid="invitation-status">
            {invitation.status}
          </span>
        </p>
      </div>
      {invitation.status === 'pending' ? (
        <button
          type="button"
          onClick={onRevoke}
          disabled={busy}
          className="rounded-md border border-border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-60"
        >
          {busy ? 'Revoking…' : 'Revoke'}
        </button>
      ) : null}
    </li>
  );
}

function MemberRow({ member }: { member: MemberPublic }) {
  const organisation = useAuthStore((state) => state.organisation);
  const currentUserId = useAuthStore((state) => state.user?.id);
  const myRole = useAuthStore((state) => state.membership?.role);
  const updateRole = useUpdateMemberRole(organisation?.id ?? null);
  const removeMember = useRemoveMember(organisation?.id ?? null);
  const [confirming, setConfirming] = useState(false);
  const isSelf = member.userId === currentUserId;
  const canManage = Boolean(myRole && hasPermission(myRole, PERMISSIONS.USERS_MANAGE));

  const remove = () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    void removeMember.mutateAsync(member.userId).catch(() => setConfirming(false));
  };

  return (
    <tr data-testid="member-row">
      <td className="py-3 pr-4">
        <p className="text-sm font-medium">
          {member.name}
          {isSelf ? <span className="ml-2 text-xs text-muted-fg">(you)</span> : null}
        </p>
        <p className="text-xs text-muted-fg">
          {member.email}
          {member.emailVerified ? null : <span className="ml-1.5 text-warning">· unverified</span>}
        </p>
      </td>
      <td className="py-3 pr-4">
        {canManage && !isSelf ? (
          <>
            <label className="sr-only" htmlFor={`role-${member.userId}`}>
              Role for {member.name}
            </label>
            <select
              id={`role-${member.userId}`}
              value={member.role}
              disabled={updateRole.isPending}
              onChange={(event) => {
                void updateRole
                  .mutateAsync({
                    userId: member.userId,
                    role: event.target.value as MembershipRole,
                  })
                  .catch(() => undefined);
              }}
              className="rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus-visible:border-primary"
            >
              {ASSIGNABLE_ROLES.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </select>
          </>
        ) : (
          <span className="text-sm">{ROLE_LABELS[member.role]}</span>
        )}
      </td>
      <td className="py-3 pr-4 text-sm text-muted-fg">
        {new Date(member.joinedAt).toLocaleDateString()}
      </td>
      <td className="py-3 text-right">
        {canManage && !isSelf ? (
          <button
            type="button"
            onClick={remove}
            onBlur={() => setConfirming(false)}
            disabled={removeMember.isPending}
            data-testid={`remove-${member.userId}`}
            className="rounded-md border border-border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-60"
          >
            {removeMember.isPending ? 'Removing…' : confirming ? 'Confirm remove?' : 'Remove'}
          </button>
        ) : null}
        {updateRole.isError ? (
          <p role="alert" className="mt-1 text-xs text-danger">
            {errorMessage(updateRole.error, 'Could not change this role.')}
          </p>
        ) : removeMember.isError ? (
          <p role="alert" className="mt-1 text-xs text-danger">
            {errorMessage(removeMember.error, 'Could not remove this member.')}
          </p>
        ) : null}
      </td>
    </tr>
  );
}

function MembersError({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-danger/40 bg-danger/5 p-4 text-sm text-danger"
    >
      {message}
    </div>
  );
}

function ManageSection() {
  const organisation = useAuthStore((state) => state.organisation);
  const orgId = organisation?.id ?? null;
  const invitations = useInvitations(orgId);
  const revokeInvitation = useRevokeInvitation(orgId);

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-border bg-surface p-6">
        <h2 className="text-sm font-semibold">Invite a teammate</h2>
        <div className="mt-4">
          <InviteForm />
        </div>
      </section>

      <section className="rounded-lg border border-border bg-surface p-6">
        <h2 className="text-sm font-semibold">Invitations</h2>
        {invitations.isPending ? (
          <p className="mt-3 text-sm text-muted-fg">Loading invitations…</p>
        ) : invitations.isError ? (
          <div className="mt-3">
            <MembersError
              message={errorMessage(invitations.error, 'Could not load invitations.')}
            />
          </div>
        ) : invitations.data.length === 0 ? (
          <p className="mt-3 text-sm text-muted-fg" data-testid="invitations-empty">
            No invitations yet. Invite a teammate above.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-border" data-testid="invitations-list">
            {invitations.data.map((invitation) => (
              <InvitationRow
                key={invitation.id}
                invitation={invitation}
                busy={revokeInvitation.isPending && revokeInvitation.variables === invitation.id}
                onRevoke={() => void revokeInvitation.mutate(invitation.id)}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export function MembersPage() {
  const organisation = useAuthStore((state) => state.organisation);
  const orgId = organisation?.id ?? null;
  const members = useMembers(orgId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Members</h1>
        <p className="mt-1 text-sm text-muted-fg">
          Everyone with access to {organisation?.name ?? 'your organisation'}.
        </p>
      </div>

      <section className="rounded-lg border border-border bg-surface p-6">
        <h2 className="text-sm font-semibold">People</h2>
        {members.isPending ? (
          <p className="mt-3 text-sm text-muted-fg">Loading members…</p>
        ) : members.isError ? (
          <div className="mt-3">
            <MembersError message={errorMessage(members.error, 'Could not load members.')} />
          </div>
        ) : members.data.length === 0 ? (
          <p className="mt-3 text-sm text-muted-fg">No members found.</p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-fg">
                  <th className="py-2 pr-4 font-medium">Member</th>
                  <th className="py-2 pr-4 font-medium">Role</th>
                  <th className="py-2 pr-4 font-medium">Joined</th>
                  <th className="py-2 text-right font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {members.data.map((member) => (
                  <MemberRow key={member.userId} member={member} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <RequirePermission permission="users.manage">
        <ManageSection />
      </RequirePermission>
    </div>
  );
}
