import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { hasSupabaseConfig, supabase } from "./lib/supabase";
import type {
  AdminDirectory,
  ManagedRole,
  ManagedUser,
  Profile,
  UserField,
  UserRole,
} from "./lib/types";

const ADMIN_LOGIN = "sysadmin";
const INTERNAL_AUTH_DOMAIN = "auth.tahfeez.local";

type AdminPath = "/admin" | "/admin/students" | "/admin/muhaffiz";

function emailForLogin(login: string, role: UserRole) {
  const normalized = login.trim().toLowerCase();
  return `${role === "admin" ? ADMIN_LOGIN : normalized}@${INTERNAL_AUTH_DOMAIN}`;
}

function isValidItsId(itsId: string) {
  return /^\d{8}$/.test(itsId);
}

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

function currentPath(): AdminPath | "/" {
  const path = window.location.hash.replace("#", "") || "/";
  return path === "/admin/students" || path === "/admin/muhaffiz" || path === "/admin"
    ? path
    : "/";
}

function navigate(path: AdminPath | "/") {
  window.location.hash = path === "/" ? "" : path;
}

async function getProfile(userId: string): Promise<Profile> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, its_id, role, full_name, phone, email, marhala, program, created_at")
    .eq("id", userId)
    .single();

  if (error) throw error;
  return data as Profile;
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [path, setPath] = useState<AdminPath | "/">(currentPath());

  const hydrate = useCallback(async (nextSession: Session | null) => {
    setSession(nextSession);
    if (!nextSession) {
      setProfile(null);
      setLoading(false);
      return;
    }

    try {
      setProfile(await getProfile(nextSession.user.id));
    } catch {
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onHashChange = () => setPath(currentPath());
    window.addEventListener("hashchange", onHashChange);
    void supabase.auth.getSession().then(({ data }) => hydrate(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      void hydrate(nextSession);
    });

    return () => {
      window.removeEventListener("hashchange", onHashChange);
      listener.subscription.unsubscribe();
    };
  }, [hydrate]);

  const signIn = async (role: UserRole, login: string, password: string) => {
    if (role !== "admin" && !isValidItsId(login)) {
      throw new Error("ITS ID must contain exactly 8 digits.");
    }
    if (role === "admin" && login.trim().toLowerCase() !== ADMIN_LOGIN) {
      throw new Error("Use the administrator user ID provided by your system owner.");
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: emailForLogin(login, role),
      password,
    });
    if (error || !data.user) throw error || new Error("Unable to sign in.");

    const nextProfile = await getProfile(data.user.id);
    if (nextProfile.role !== role) {
      await supabase.auth.signOut();
      throw new Error("This account is not permitted to use that sign-in area.");
    }

    setSession(data.session);
    setProfile(nextProfile);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  if (!hasSupabaseConfig) return <SetupRequired />;
  if (loading) return <LoadingScreen />;

  if (!session || !profile) {
    return path === "/admin" ? (
      <AdminLogin onSignIn={signIn} onBack={() => navigate("/")} />
    ) : (
      <MemberLogin onSignIn={signIn} onAdmin={() => navigate("/admin")} />
    );
  }

  if (profile.role === "admin") {
    return <AdminArea profile={profile} path={path} onNavigate={navigate} onSignOut={signOut} />;
  }

  return <MemberDashboard profile={profile} onSignOut={signOut} />;
}

function SetupRequired() {
  return (
    <main className="setup-screen">
      <Brand />
      <section className="setup-card">
        <p className="eyebrow">Configuration needed</p>
        <h1>Connect Tahfeez to Supabase</h1>
        <p>
          Copy <code>.env.example</code> to <code>.env</code>, add your Supabase URL and anon key,
          then restart the development server.
        </p>
      </section>
    </main>
  );
}

function LoadingScreen() {
  return (
    <main className="loading-screen" aria-label="Loading Tahfeez">
      <div className="loading-mark">۞</div>
      <p>Preparing your Tahfeez space…</p>
    </main>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? "brand-compact" : ""}`}>
      <div className="brand-mark" aria-hidden="true">۞</div>
      <div>
        <span className="brand-name">Tahfeez</span>
        {!compact && <span className="brand-tagline">Hifz management</span>}
      </div>
    </div>
  );
}

function MemberLogin({
  onSignIn,
  onAdmin,
}: {
  onSignIn: (role: UserRole, login: string, password: string) => Promise<void>;
  onAdmin: () => void;
}) {
  const [role, setRole] = useState<ManagedRole>("student");
  const [itsId, setItsId] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await onSignIn(role, itsId, password);
    } catch (caught) {
      setError(messageFrom(caught));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="auth-layout">
      <section className="auth-welcome">
        <Brand />
        <p className="eyebrow">A gentle place for steady progress</p>
        <h1>Every ayah learned is a light carried forward.</h1>
        <p className="auth-intro">
          A focused home for students, Muhaffiz, and the work of preserving the Qur&apos;an.
        </p>
        <div className="ornament" aria-hidden="true">✦</div>
      </section>

      <section className="auth-panel" aria-label="Member sign in">
        <div className="panel-heading">
          <p className="eyebrow">Welcome back</p>
          <h2>Sign in to Tahfeez</h2>
          <p>Use the ITS ID and password issued by your administrator.</p>
        </div>

        <div className="role-toggle" role="tablist" aria-label="Choose account type">
          <button
            className={role === "student" ? "active" : ""}
            type="button"
            role="tab"
            aria-selected={role === "student"}
            onClick={() => setRole("student")}
          >
            Student
          </button>
          <button
            className={role === "muhaffiz" ? "active" : ""}
            type="button"
            role="tab"
            aria-selected={role === "muhaffiz"}
            onClick={() => setRole("muhaffiz")}
          >
            Muhaffiz
          </button>
        </div>

        <form className="auth-form" onSubmit={submit}>
          <label>
            ITS ID
            <input
              value={itsId}
              onChange={(event) => setItsId(event.target.value.replace(/\D/g, "").slice(0, 8))}
              inputMode="numeric"
              autoComplete="username"
              pattern="[0-9]{8}"
              maxLength={8}
              placeholder="8 digit ITS ID"
              required
            />
          </label>
          <label>
            Password
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              autoComplete="current-password"
              placeholder="Your administrator-issued password"
              required
            />
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button button-primary" disabled={submitting} type="submit">
            {submitting ? "Signing in…" : `Continue as ${role === "student" ? "Student" : "Muhaffiz"}`}
          </button>
        </form>

        <div className="admin-link">
          <span>Administrator?</span>
          <button className="button button-quiet" type="button" onClick={onAdmin}>
            Admin sign in
          </button>
        </div>
      </section>
    </main>
  );
}

function AdminLogin({
  onSignIn,
  onBack,
}: {
  onSignIn: (role: UserRole, login: string, password: string) => Promise<void>;
  onBack: () => void;
}) {
  const [login, setLogin] = useState(ADMIN_LOGIN);
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await onSignIn("admin", login, password);
    } catch (caught) {
      setError(messageFrom(caught));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="admin-auth-layout">
      <section className="admin-auth-card">
        <Brand />
        <p className="eyebrow">Administration</p>
        <h1>Safeguard the learning community.</h1>
        <p>Authorized Tahfeez administrators only.</p>
        <form className="auth-form" onSubmit={submit}>
          <label>
            Admin user ID
            <input
              value={login}
              onChange={(event) => setLogin(event.target.value)}
              autoComplete="username"
              required
            />
          </label>
          <label>
            Password
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button button-primary" disabled={submitting} type="submit">
            {submitting ? "Verifying…" : "Enter admin area"}
          </button>
        </form>
        <button className="text-link" type="button" onClick={onBack}>← Back to member sign in</button>
      </section>
    </main>
  );
}

function MemberDashboard({ profile, onSignOut }: { profile: Profile; onSignOut: () => Promise<void> }) {
  const isStudent = profile.role === "student";
  const title = isStudent ? "Student dashboard" : "Muhaffiz dashboard";

  return (
    <main className="member-dashboard">
      <header className="topbar">
        <Brand compact />
        <div className="topbar-actions">
          <span className="role-chip">{isStudent ? "Student" : "Muhaffiz"}</span>
          <button className="button button-outline" onClick={() => void onSignOut()} type="button">Sign out</button>
        </div>
      </header>
      <section className="dashboard-content">
        <p className="eyebrow">Assalamu alaikum, {profile.full_name.split(" ")[0]}</p>
        <h1>{title}</h1>
        <p className="dashboard-lead">
          {isStudent
            ? "Your learning record and recitation journey will appear here as your Muhaffiz updates it."
            : "Your student groups and progress reviews will appear here as they are assigned."}
        </p>
        <div className="dashboard-grid">
          <section className="dashboard-card featured-card">
            <p className="card-label">Today&apos;s intention</p>
            <h2>Consistency, clarity, and sincerity.</h2>
            <p>Let each revision session be a small, deliberate step toward preservation.</p>
          </section>
          <section className="dashboard-card">
            <p className="card-label">Your account</p>
            <dl className="account-details">
              <div><dt>ITS ID</dt><dd>{profile.its_id}</dd></div>
              {isStudent && (
                <>
                  <div><dt>Marhala</dt><dd>{profile.marhala || "Not assigned"}</dd></div>
                  <div><dt>Program</dt><dd>{profile.program || "Not assigned"}</dd></div>
                </>
              )}
              <div><dt>Email</dt><dd>{profile.email || "Not recorded"}</dd></div>
              <div><dt>Phone</dt><dd>{profile.phone || "Not recorded"}</dd></div>
            </dl>
          </section>
        </div>
      </section>
    </main>
  );
}

function AdminArea({
  profile,
  path,
  onNavigate,
  onSignOut,
}: {
  profile: Profile;
  path: AdminPath | "/";
  onNavigate: (path: AdminPath | "/") => void;
  onSignOut: () => Promise<void>;
}) {
  const activePath: AdminPath = path === "/admin/students" || path === "/admin/muhaffiz" ? path : "/admin";
  const managementRole: ManagedRole | null = activePath === "/admin/students"
    ? "student"
    : activePath === "/admin/muhaffiz"
      ? "muhaffiz"
      : null;

  return (
    <main className="admin-area">
      <aside className="sidebar">
        <Brand />
        <nav aria-label="Admin navigation">
          <NavButton active={activePath === "/admin"} onClick={() => onNavigate("/admin")}>Overview</NavButton>
          <NavButton active={activePath === "/admin/students"} onClick={() => onNavigate("/admin/students")}>Manage Students</NavButton>
          <NavButton active={activePath === "/admin/muhaffiz"} onClick={() => onNavigate("/admin/muhaffiz")}>Manage Muhaffiz</NavButton>
        </nav>
        <div className="sidebar-footer">
          <span>{profile.full_name}</span>
          <button className="text-link" type="button" onClick={() => void onSignOut()}>Sign out</button>
        </div>
      </aside>
      <section className="admin-main">
        {managementRole ? (
          <ManagementPage role={managementRole} />
        ) : (
          <AdminOverview onNavigate={onNavigate} />
        )}
      </section>
    </main>
  );
}

function NavButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return <button className={`nav-button ${active ? "active" : ""}`} type="button" onClick={onClick}>{children}</button>;
}

function AdminOverview({ onNavigate }: { onNavigate: (path: AdminPath) => void }) {
  return (
    <div className="page-shell">
      <p className="eyebrow">Administration</p>
      <h1>Build a caring learning community.</h1>
      <p className="page-intro">Create accounts, keep records organized, and give every learner the support they need.</p>
      <div className="overview-actions">
        <button className="action-card" type="button" onClick={() => onNavigate("/admin/students")}>
          <span>01</span>
          <h2>Manage Students</h2>
          <p>Create student accounts and define the details you want to record.</p>
          <strong>Open students →</strong>
        </button>
        <button className="action-card" type="button" onClick={() => onNavigate("/admin/muhaffiz")}>
          <span>02</span>
          <h2>Manage Muhaffiz</h2>
          <p>Create Muhaffiz accounts and capture their supporting information.</p>
          <strong>Open Muhaffiz →</strong>
        </button>
      </div>
      <section className="security-note">
        <span aria-hidden="true">◆</span>
        <div><h2>Privacy first</h2><p>Accounts are created through a server-side Supabase function. Passwords are never stored in profile records.</p></div>
      </section>
    </div>
  );
}

function ManagementPage({ role }: { role: ManagedRole }) {
  const [directory, setDirectory] = useState<AdminDirectory>({ users: [], fields: [] });
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const roleLabel = role === "student" ? "Student" : "Muhaffiz";

  const invoke = useCallback(async (body: Record<string, unknown>) => {
    const { data, error: functionError } = await supabase.functions.invoke("admin-users", { body });
    if (functionError) throw functionError;
    if (data?.error) throw new Error(data.error);
    return data;
  }, []);

  const loadDirectory = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await invoke({ action: "list", role });
      setDirectory(data as AdminDirectory);
    } catch (caught) {
      setError(messageFrom(caught));
    } finally {
      setLoading(false);
    }
  }, [invoke, role]);

  useEffect(() => { void loadDirectory(); }, [loadDirectory]);

  const createUser = async (payload: Record<string, unknown>) => {
    setError("");
    setNotice("");
    try {
      await invoke({ action: "create", role, ...payload });
      setNotice(`${roleLabel} account created successfully.`);
      await loadDirectory();
    } catch (caught) {
      setError(messageFrom(caught));
      throw caught;
    }
  };

  const updateUser = async (payload: Record<string, unknown>) => {
    setError("");
    setNotice("");
    try {
      await invoke({ action: "update", ...payload });
      setNotice(`${roleLabel} account updated successfully.`);
      await loadDirectory();
    } catch (caught) {
      setError(messageFrom(caught));
      throw caught;
    }
  };

  const createField = async (payload: Record<string, unknown>) => {
    setError("");
    setNotice("");
    try {
      await invoke({ action: "create_field", role, ...payload });
      setNotice("Custom field added to this account type.");
      await loadDirectory();
    } catch (caught) {
      setError(messageFrom(caught));
      throw caught;
    }
  };

  const removeUser = async (user: ManagedUser) => {
    if (!window.confirm(`Remove ${user.full_name}'s account? This cannot be undone.`)) return;
    setError("");
    setNotice("");
    try {
      await invoke({ action: "delete", userId: user.id });
      setNotice("Account removed.");
      await loadDirectory();
    } catch (caught) {
      setError(messageFrom(caught));
    }
  };

  const resetPassword = async (user: ManagedUser) => {
    const password = window.prompt(`Set a new password for ${user.full_name}. Use at least 10 characters.`);
    if (password === null) return;
    if (password.length < 10) {
      setError("New passwords must contain at least 10 characters.");
      return;
    }
    setError("");
    setNotice("");
    try {
      await invoke({ action: "reset_password", userId: user.id, password });
      setNotice("Password reset successfully.");
    } catch (caught) {
      setError(messageFrom(caught));
    }
  };

  return (
    <div className="page-shell management-page">
      <p className="eyebrow">Account management</p>
      <h1>Manage {roleLabel === "Student" ? "Students" : "Muhaffiz"}</h1>
      <p className="page-intro">Create secure sign-ins and record the information that matters to your Tahfeez program.</p>
      {error && <p className="form-error page-message" role="alert">{error}</p>}
      {notice && <p className="form-success page-message" role="status">{notice}</p>}
      <div className="management-grid">
        <UserCreateForm role={role} fields={directory.fields} onCreate={createUser} />
        <CustomFieldForm onCreate={createField} />
      </div>
      <section className="directory-section">
        <div className="section-title-row">
          <div><p className="eyebrow">Directory</p><h2>{roleLabel}s</h2></div>
          <span className="count-badge">{directory.users.length} total</span>
        </div>
        {loading ? (
          <p className="muted">Loading directory…</p>
        ) : directory.users.length === 0 ? (
          <div className="empty-state">No {roleLabel.toLowerCase()} accounts yet. Create the first one above.</div>
        ) : (
          <UserDirectory users={directory.users} fields={directory.fields} onDelete={removeUser} onReset={resetPassword} onEdit={setEditingUser} />
        )}
      </section>

      {editingUser && (
        <EditUserModal
          user={editingUser}
          fields={directory.fields}
          onClose={() => setEditingUser(null)}
          onSave={updateUser}
        />
      )}
    </div>
  );
}

function UserCreateForm({
  role,
  fields,
  onCreate,
}: {
  role: ManagedRole;
  fields: UserField[];
  onCreate: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const [form, setForm] = useState({ itsId: "", password: "", fullName: "", phone: "", email: "", marhala: "", program: "" });
  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const label = role === "student" ? "student" : "Muhaffiz";

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isValidItsId(form.itsId)) return;
    setSubmitting(true);
    try {
      await onCreate({ ...form, customValues });
      setForm({ itsId: "", password: "", fullName: "", phone: "", email: "", marhala: "", program: "" });
      setCustomValues({});
    } catch {
      // The parent displays the server-safe error message.
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="form-card">
      <p className="eyebrow">New account</p>
      <h2>Add {label}</h2>
      <form className="management-form" onSubmit={submit}>
        <label>Full name<input required value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} /></label>
        <label>ITS ID<input required inputMode="numeric" pattern="[0-9]{8}" maxLength={8} value={form.itsId} onChange={(event) => setForm({ ...form, itsId: event.target.value.replace(/\D/g, "").slice(0, 8) })} placeholder="8 digits" /></label>
        <label>Initial password<input required minLength={10} type="password" autoComplete="new-password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder="At least 10 characters" /></label>
        <label>Phone number<input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} type="tel" autoComplete="tel" /></label>
        <label>Email<input value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} type="email" autoComplete="email" /></label>
        
        {role === "student" && (
          <>
            <label>Marhala<input value={form.marhala} onChange={(event) => setForm({ ...form, marhala: event.target.value })} placeholder="e.g. Stage 1" /></label>
            <label>Program<input value={form.program} onChange={(event) => setForm({ ...form, program: event.target.value })} placeholder="e.g. Full Hifz" /></label>
          </>
        )}

        {fields.map((field) => (
          <DynamicField key={field.id} field={field} value={customValues[field.id] || ""} onChange={(value) => setCustomValues({ ...customValues, [field.id]: value })} />
        ))}
        <button className="button button-primary" disabled={submitting} type="submit">{submitting ? "Creating…" : `Create ${label}`}</button>
      </form>
    </section>
  );
}

function DynamicField({ field, value, onChange }: { field: UserField; value: string; onChange: (value: string) => void }) {
  if (field.field_type === "select") {
    return <label>{field.label}<select required={field.is_required} value={value} onChange={(event) => onChange(event.target.value)}><option value="">Select…</option>{field.select_options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>;
  }
  return <label>{field.label}<input required={field.is_required} type={field.field_type} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function CustomFieldForm({ onCreate }: { onCreate: (payload: Record<string, unknown>) => Promise<void> }) {
  const [label, setLabel] = useState("");
  const [fieldType, setFieldType] = useState<UserField["field_type"]>("text");
  const [options, setOptions] = useState("");
  const [required, setRequired] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await onCreate({
        label,
        fieldType,
        isRequired: required,
        selectOptions: options.split(",").map((option) => option.trim()).filter(Boolean),
      });
      setLabel("");
      setFieldType("text");
      setOptions("");
      setRequired(false);
    } catch {
      // The parent displays the server-safe error message.
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="form-card custom-card">
      <p className="eyebrow">Flexible records</p>
      <h2>Add a custom field</h2>
      <p className="card-description">This field will be available whenever you create this type of account.</p>
      <form className="management-form" onSubmit={submit}>
        <label>Field label<input required value={label} onChange={(event) => setLabel(event.target.value)} placeholder="e.g. Madrasa" /></label>
        <label>Field type<select value={fieldType} onChange={(event) => setFieldType(event.target.value as UserField["field_type"])}><option value="text">Text</option><option value="number">Number</option><option value="date">Date</option><option value="select">Choice list</option></select></label>
        {fieldType === "select" && <label>Choices<input required value={options} onChange={(event) => setOptions(event.target.value)} placeholder="Option one, Option two" /></label>}
        <label className="checkbox-label"><input type="checkbox" checked={required} onChange={(event) => setRequired(event.target.checked)} /> Required when creating an account</label>
        <button className="button button-outline" disabled={submitting} type="submit">{submitting ? "Adding…" : "Add custom field"}</button>
      </form>
    </section>
  );
}

function UserDirectory({
  users,
  fields,
  onDelete,
  onReset,
  onEdit,
}: {
  users: ManagedUser[];
  fields: UserField[];
  onDelete: (user: ManagedUser) => Promise<void>;
  onReset: (user: ManagedUser) => Promise<void>;
  onEdit: (user: ManagedUser) => void;
}) {
  const valuesFor = (user: ManagedUser) => new Map(user.profile_field_values.map((value) => [value.field_id, value.value]));

  return (
    <div className="directory-list">
      {users.map((user) => {
        const values = valuesFor(user);
        return (
          <article className="user-row" key={user.id}>
            <div className="user-primary"><div className="avatar">{user.full_name.charAt(0).toUpperCase()}</div><div><h3>{user.full_name}</h3><p>ITS ID · {user.its_id}</p></div></div>
            <div className="user-details">
              <span>{user.email || "No email"}</span>
              <span>{user.phone || "No phone"}</span>
              {user.role === "student" && (
                <>
                  <span><strong>Marhala:</strong> {user.marhala || "—"}</span>
                  <span><strong>Program:</strong> {user.program || "—"}</span>
                </>
              )}
              {fields.map((field) => <span key={field.id}><strong>{field.label}:</strong> {String(values.get(field.id) ?? "—")}</span>)}
            </div>
            <div className="user-actions">
              <button className="text-link" type="button" onClick={() => onEdit(user)}>Edit</button>
              <button className="text-link" type="button" onClick={() => void onReset(user)}>Reset password</button>
              <button className="text-link danger-link" type="button" onClick={() => void onDelete(user)}>Remove</button>
            </div>
          </article>
        );
      })}
    </div>
  );
}

interface EditUserModalProps {
  user: ManagedUser;
  fields: UserField[];
  onClose: () => void;
  onSave: (payload: Record<string, unknown>) => Promise<void>;
}

function EditUserModal({ user, fields, onClose, onSave }: EditUserModalProps) {
  const [form, setForm] = useState({
    fullName: user.full_name || "",
    itsId: user.its_id || "",
    phone: user.phone || "",
    email: user.email || "",
    marhala: user.marhala || "",
    program: user.program || "",
  });
  
  const initialCustomValues = useMemo(() => {
    const map: Record<string, string> = {};
    user.profile_field_values.forEach((v) => {
      map[v.field_id] = String(v.value ?? "");
    });
    return map;
  }, [user]);

  const [customValues, setCustomValues] = useState<Record<string, string>>(initialCustomValues);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isValidItsId(form.itsId)) {
      setError("ITS ID must contain exactly 8 digits.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      await onSave({
        userId: user.id,
        ...form,
        customValues,
      });
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save updates.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Edit {user.role === "student" ? "Student" : "Muhaffiz"}</h2>
          <button className="close-button" type="button" onClick={onClose} aria-label="Close modal">&times;</button>
        </div>
        {error && <p className="form-error" role="alert" style={{ margin: "0 0 1rem 0" }}>{error}</p>}
        <form className="management-form" onSubmit={submit}>
          <label>Full name<input required value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} /></label>
          <label>ITS ID<input required inputMode="numeric" pattern="[0-9]{8}" maxLength={8} value={form.itsId} onChange={(event) => setForm({ ...form, itsId: event.target.value.replace(/\D/g, "").slice(0, 8) })} placeholder="8 digits" /></label>
          <label>Phone number<input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} type="tel" autoComplete="tel" /></label>
          <label>Email<input value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} type="email" autoComplete="email" /></label>
          
          {user.role === "student" && (
            <>
              <label>Marhala<input value={form.marhala} onChange={(event) => setForm({ ...form, marhala: event.target.value })} placeholder="e.g. Stage 1" /></label>
              <label>Program<input value={form.program} onChange={(event) => setForm({ ...form, program: event.target.value })} placeholder="e.g. Full Hifz" /></label>
            </>
          )}

          {fields.map((field) => (
            <DynamicField
              key={field.id}
              field={field}
              value={customValues[field.id] || ""}
              onChange={(value) => setCustomValues({ ...customValues, [field.id]: value })}
            />
          ))}

          <div className="modal-actions" style={{ display: "flex", gap: "1rem", marginTop: "1.5rem" }}>
            <button className="button button-outline" type="button" onClick={onClose} style={{ flex: 1 }}>Cancel</button>
            <button className="button button-primary" disabled={submitting} type="submit" style={{ flex: 1 }}>{submitting ? "Saving…" : "Save changes"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

