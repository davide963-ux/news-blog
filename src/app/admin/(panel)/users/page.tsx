import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { Badge, Field, Flash, PageHeader, Table } from '@/components/admin/ui';
import { createUserAction, resetPasswordAction, toggleUserAction } from '../../actions';
import { timeAgo } from '@/lib/utils';

export const metadata = { title: 'Users' };

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const me = await requireUser('ADMIN');
  const sp = await searchParams;
  const users = await db.user.findMany({ orderBy: { createdAt: 'asc' } });
  return (
    <>
      <PageHeader title="Users" subtitle="Administrators manage everything. Editors can review, edit, publish and correct articles but cannot change sources, settings or users." />
      <Flash ok={sp.ok} err={sp.err} />
      <Table head={['User', 'Role', 'Last sign-in', 'Status', 'Actions']}>
        {users.map((u) => (
          <tr key={u.id} className="align-top">
            <td className="px-4 py-3"><p className="font-semibold">{u.name}</p><p className="text-xs text-muted">{u.email}</p></td>
            <td className="px-4 py-3"><Badge tone={u.role === 'ADMIN' ? 'blue' : 'gray'}>{u.role.toLowerCase()}</Badge></td>
            <td className="px-4 py-3 text-muted">{u.lastLoginAt ? timeAgo(u.lastLoginAt) : 'never'}</td>
            <td className="px-4 py-3">{u.active ? <Badge tone="green">active</Badge> : <Badge tone="red">disabled</Badge>}</td>
            <td className="px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                {u.id !== me.id && <form action={toggleUserAction}><input type="hidden" name="id" value={u.id} /><button className="btn !px-2.5 !py-1 !text-xs">{u.active ? 'Deactivate' : 'Activate'}</button></form>}
                <form action={resetPasswordAction} className="flex gap-1.5"><input type="hidden" name="id" value={u.id} /><input name="password" type="password" minLength={12} required placeholder="New password" autoComplete="new-password" className="input !w-36 !py-1 !text-xs" aria-label={`New password for ${u.email}`} /><button className="btn !px-2.5 !py-1 !text-xs">Reset</button></form>
              </div>
            </td>
          </tr>
        ))}
      </Table>
      <h2 className="mb-4 mt-10 font-serif text-2xl font-black">Add a user</h2>
      <form action={createUserAction} className="panel grid max-w-3xl gap-4 p-5 md:grid-cols-2">
        <Field label="Name"><input name="name" required className="input" /></Field>
        <Field label="Email"><input name="email" type="email" required className="input" /></Field>
        <Field label="Password (12+ chars, mixed case, digit)"><input name="password" type="password" minLength={12} required autoComplete="new-password" className="input" /></Field>
        <Field label="Role"><select name="role" className="input"><option value="EDITOR">Editor</option><option value="ADMIN">Administrator</option></select></Field>
        <div className="md:col-span-2"><button className="btn btn-primary">Create user</button></div>
      </form>
    </>
  );
}
