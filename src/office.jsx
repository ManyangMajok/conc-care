import React, { useState, useEffect } from "react";
import { Link, NavLink, useNavigate, useParams } from "react-router-dom";
import { api } from "./api";
import {
  Field,
  ErrorBox,
  Pager,
  Relation,
  Confirm,
  stageNames,
  sources,
  cn,
} from "./components";
import services from "./services.json";
const names = {
  leads: "Leads",
  contacts: "Contacts",
  sites: "Sites",
  quotes: "Quotes",
  invoices: "Invoices",
  segments: "Segments",
};
const defaults = {
  leads: {
    name: "",
    email: "",
    phone: "",
    address: "",
    service: "other",
    source: "other",
    details: "",
    stage: "new",
    contact_id: null,
    site_id: null,
    followup: "",
  },
  contacts: {
    name: "",
    company: "",
    email: "",
    phone: "",
    source: "other",
    background: "",
    permission: "unknown",
    evidence: "",
    tags: [],
  },
  sites: { name: "", contact_id: null, address: "", access_notes: "" },
  quotes: {
    name: "",
    contact_id: null,
    site_id: null,
    lead_id: null,
    amount_cents: null,
    scope: "",
    exclusions: "",
    valid_until: "",
    status: "draft",
  },
  invoices: {
    name: "",
    contact_id: null,
    site_id: null,
    amount_cents: null,
    scope: "",
    exclusions: "",
    due_date: "",
    status: "draft",
  },
  segments: { name: "", tag: "", source: "" },
};
export function useData(path, revision = 0) {
  const [data, setData] = useState(null),
    [error, setError] = useState(null);
  useEffect(() => {
    let current = true;
    setData(null);
    setError(null);
    api(path)
      .then((d) => current && setData(d))
      .catch((e) => current && setError(e));
    return () => {
      current = false;
    };
  }, [path, revision]);
  return { data, error };
}
function Loading({ error }) {
  return error ? (
    <ErrorBox error={error} />
  ) : (
    <p role="status">Loading workspace…</p>
  );
}
export function Login({ onLogin }) {
  const [error, setError] = useState(null),
    [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onLogin(
        await api("/login", {
          method: "POST",
          body: Object.fromEntries(new FormData(e.currentTarget)),
        }),
      );
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login">
      <Link to="/">
        <img src="/assets/images/logo-white.png" alt="Conc Care Group" />
      </Link>
      <div className="login-card">
        <p className="eyebrow">Conc Care Office</p>
        <h1>Welcome back.</h1>
        <p>Sign in to your sales workspace.</p>
        <form onSubmit={submit}>
          <Field
            label="Email"
            name="email"
            type="email"
            autoComplete="username"
            required
            error={error?.fields.email}
          />
          <Field
            label="Password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            error={error?.fields.password}
          />
          <ErrorBox error={error} />
          <button className="primary" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className="muted">
          Need access? Contact your application administrator.
        </p>
      </div>
      <Link to="/">← Back to website</Link>
    </main>
  );
}
export function OfficeShell({ user, onLogout, children }) {
  const [error, setError] = useState(null);
  const links = [
    ["", "Overview"],
    ["pipeline", "Sales pipeline"],
    ["leads", "Leads"],
    ["contacts", "Contacts"],
    ["sites", "Sites"],
    ["quotes", "Quotes"],
    ["invoices", "Invoices"],
    ["followups", "Follow-ups"],
    ["marketing", "Marketing"],
    ["activity", "Activity"],
  ];
  return (
    <div className="office">
      <a className="skip" href="#workspace">
        Skip to workspace
      </a>
      <aside className="sidebar">
        <Link to="/office">
          <img src="/assets/images/logo-white.png" alt="Conc Care Group" />
        </Link>
        <p className="eyebrow">Office workspace</p>
        <nav aria-label="Office navigation">
          {links.map(([url, label], i) => (
            <NavLink key={url} end to={`/office${url ? "/" + url : ""}`}>
              <span aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
              {label}
            </NavLink>
          ))}
          {user.role === "admin" && (
            <NavLink to="/office/admin">Administration</NavLink>
          )}
        </nav>
        <div className="sidebar-bottom">
          <span>{user.name}</span>
          <small>
            {user.role === "admin" ? "Administrator" : "Office user"}
          </small>
          <button
            onClick={async () => {
              try {
                await api("/logout", {
                  method: "POST",
                  csrf: user.csrf,
                  body: {},
                });
                onLogout();
              } catch (e) {
                setError(e);
              }
            }}
          >
            Sign out
          </button>
          <Link to="/">View website ↗</Link>
          <ErrorBox error={error} />
        </div>
      </aside>
      <div className="office-body">
        <header className="office-top">
          <span>
            Conc Care Group <span className="muted">/ Office</span>
          </span>
          <span>Sales & relationships</span>
        </header>
        <main id="workspace">{children}</main>
      </div>
    </div>
  );
}
function LeadRows({ rows }) {
  return (
    <div
      className="table-scroll"
      tabIndex={0}
      role="region"
      aria-label="Lead records"
    >
      <table>
        <thead>
          <tr>
            <th>Enquiry</th>
            <th>Service</th>
            <th>Stage</th>
            <th>Follow-up</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>
                <Link to={`/office/leads/${r.id}`}>{r.name}</Link>
                <small>{r.email}</small>
              </td>
              <td>
                {services.find((s) => s.slug === r.service)?.title || r.service}
              </td>
              <td>
                <span className="badge">{stageNames[r.stage]}</span>
              </td>
              <td>{r.followup || "Not scheduled"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function Overview({ pipelineOnly = false }) {
  const { data, error } = useData("/overview");
  if (!data) return <Loading error={error} />;
  return (
    <>
      <div className="workspace-heading">
        <div>
          <p className="eyebrow">Your office, at a glance</p>
          <h1>{pipelineOnly ? "Sales pipeline" : "Overview"}</h1>
          <p>
            {pipelineOnly
              ? "Open a card to review the enquiry and update its stage."
              : `Keep the next conversation moving. Follow-ups use ${data.today} in the business timezone.`}
          </p>
        </div>
        <Link className="button primary" to="/office/leads/new">
          + New lead
        </Link>
      </div>
      {!pipelineOnly && (
        <div className="stats">
          {[
            [data.newLeads, "New enquiries", "leads?stage=new"],
            [data.due, "Due follow-ups", "followups"],
            [data.awaiting, "Quotes awaiting reply", "quotes?status=sent"],
            [data.audience, "Eligible contacts", "marketing"],
          ].map(([n, label, url]) => (
            <Link to={`/office/${url}`} className="stat" key={label}>
              <span>{label}</span>
              <strong>{n}</strong>
              <small>View records ↗</small>
            </Link>
          ))}
        </div>
      )}
      <section className="panel">
        <div className="section-heading">
          <h2>Sales pipeline</h2>
          <span className="muted">
            Lead stages are maintained separately from quotes
          </span>
        </div>
        <div
          className="pipeline"
          tabIndex={0}
          role="region"
          aria-label="Sales pipeline"
        >
          {data.pipeline.map((col) => (
            <div className="pipeline-column" key={col.stage}>
              <h3>
                {stageNames[col.stage]} <span>{col.count}</span>
              </h3>
              {pipelineOnly ? (
                col.items.map((r) => (
                  <Link
                    className="lead-card"
                    key={r.id}
                    to={`/office/leads/${r.id}`}
                  >
                    <strong>{r.name}</strong>
                    <small>{r.service}</small>
                    <small>
                      {r.followup
                        ? `Follow-up ${r.followup}`
                        : "No follow-up scheduled"}
                    </small>
                  </Link>
                ))
              ) : (
                <strong className="pipeline-count">{col.count}</strong>
              )}
              {!col.items.length && <p className="muted">No enquiries</p>}
              <Link to={`/office/leads?stage=${col.stage}`}>View all ↗</Link>
            </div>
          ))}
        </div>
      </section>
      {!pipelineOnly && (
        <section className="panel">
          <div className="section-heading">
            <h2>Recent enquiries</h2>
            <Link to="/office/leads">View all ↗</Link>
          </div>
          {data.recent.length ? (
            <LeadRows rows={data.recent} />
          ) : (
            <Empty
              text="Your next customer conversation starts here."
              to="/office/leads/new"
              label="Create a lead"
            />
          )}
        </section>
      )}
    </>
  );
}
function Empty({ text, to, label }) {
  return (
    <div className="empty">
      <h3>No records yet</h3>
      <p>{text}</p>
      <Link className="button" to={to}>
        {label}
      </Link>
    </div>
  );
}
export function RecordList({ type, followups = false }) {
  const [q, setQ] = useState(""),
    [filter, setFilter] = useState(
      new URLSearchParams(location.search).get(
        ["quotes", "invoices"].includes(type) ? "status" : "stage",
      ) || "",
    ),
    [page, setPage] = useState(1);
  const { data, error } = useData(
    `/records/${type}?q=${encodeURIComponent(q)}&page=${page}&${["quotes", "invoices"].includes(type) ? "status" : "stage"}=${filter}${followups ? "&due=1" : ""}`,
  );
  return (
    <>
      <div className="workspace-heading">
        <div>
          <p className="eyebrow">Relationships & sales</p>
          <h1>{followups ? "Follow-ups" : names[type]}</h1>
          <p>
            {followups
              ? "Open leads due today or overdue. Complete the follow-up from the lead."
              : `Manage your ${names[type]?.toLowerCase()} and keep every conversation connected.`}
          </p>
        </div>
        <Link className="button primary" to={`/office/${type}/new`}>
          + New {type.slice(0, -1)}
        </Link>
      </div>
      <section className="panel">
        <div className="filters">
          <Field
            label="Search records"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="Name or email"
          />
          {["leads", "quotes", "invoices"].includes(type) && (
            <Field
              label={type === "leads" ? "Stage" : "Status"}
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value);
                setPage(1);
              }}
            >
              <select>
                <option value="">All</option>
                {(type === "leads"
                  ? Object.keys(stageNames)
                  : type === "invoices"
                    ? ["draft", "issued", "paid", "void"]
                    : ["draft", "sent", "accepted", "declined"]
                ).map((s) => (
                  <option key={s} value={s}>
                    {stageNames[s] || s}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>
        {!data ? (
          <Loading error={error} />
        ) : (
          <>
            {!data.items.length ? (
              <Empty
                text="Try another search or add a record."
                to={`/office/${type}/new`}
                label={`Create ${type.slice(0, -1)}`}
              />
            ) : type === "leads" ? (
              <LeadRows rows={data.items} />
            ) : (
              <div
                className="table-scroll"
                tabIndex={0}
                role="region"
                aria-label={`${names[type]} records`}
              >
                <table>
                  <thead>
                    <tr>
                      <th>Name / reference</th>
                      <th>
                        {["quotes", "invoices"].includes(type)
                          ? "Status"
                          : type === "sites"
                            ? "Address"
                            : "Email"}
                      </th>
                      <th>
                        {["quotes", "invoices"].includes(type)
                          ? "AUD total"
                          : type === "sites"
                            ? "Contact"
                            : "Source"}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <Link to={`/office/${type}/${r.id}`}>{r.name}</Link>
                          <small>#{r.id}</small>
                        </td>
                        <td>{r.status || r.address || r.email || "—"}</td>
                        <td>
                          {["quotes", "invoices"].includes(type) ? (
                            r.amount_cents === null ? (
                              "Not entered"
                            ) : (
                              new Intl.NumberFormat("en-AU", {
                                style: "currency",
                                currency: "AUD",
                              }).format(r.amount_cents / 100)
                            )
                          ) : type === "sites" ? (
                            <Link to={`/office/contacts/${r.contact_id}`}>
                              Contact #{r.contact_id}
                            </Link>
                          ) : (
                            r.source
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <Pager data={data} page={page} setPage={setPage} />
          </>
        )}
      </section>
    </>
  );
}
export function RecordEditor({ user }) {
  const { type, id } = useParams(),
    navigate = useNavigate(),
    [revision, setRevision] = useState(0),
    [page, setPage] = useState(1);
  const [form, setForm] = useState(null),
    [error, setError] = useState(null),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(""),
    [detail, setDetail] = useState(null),
    [amount, setAmount] = useState(""),
    [tagsText, setTagsText] = useState("");
  useEffect(() => {
    let current = true;
    setForm(null);
    setError(null);
    setSaved("");
    if (!defaults[type]) {
      setError(new Error("Record type not found."));
      return;
    }
    const apply = (item, details) => {
      if (!current) return;
      const f = {
        ...defaults[type],
        ...Object.fromEntries(
          Object.keys(defaults[type])
            .filter((k) => k in item)
            .map((k) => [k, item[k]]),
        ),
        version: item.version,
        note: "",
        ...(type === "contacts" ? { confirm_consent: false } : {}),
      };
      setForm(f);
      setDetail(details);
      setAmount(
        item.amount_cents == null ? "" : (item.amount_cents / 100).toFixed(2),
      );
      setTagsText((item.tags || []).join(", "));
    };
    if (id === "new") apply({}, null);
    else
      api(`/records/${type}/${id}?page=${page}`)
        .then((d) => apply(d.item, d))
        .catch((e) => current && setError(e));
    return () => {
      current = false;
    };
  }, [type, id, revision, page]);
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const locked =
    ["quotes", "invoices"].includes(type) &&
    detail?.item.status !== "draft" &&
    !!detail;
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload = { ...form };
      if (["quotes", "invoices"].includes(type)) {
        if (amount !== "" && !/^\d{1,8}(\.\d{1,2})?$/.test(amount))
          throw Object.assign(
            new Error("Enter an AUD amount with up to two decimal places."),
            { fields: { amount_cents: "Use at most two decimal places." } },
          );
        payload.amount_cents =
          amount === ""
            ? null
            : Number(amount.split(".")[0]) * 100 +
              Number((amount.split(".")[1] || "").padEnd(2, "0"));
      }
      if (type === "contacts")
        payload.tags = tagsText
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
      const result = await api(
        `/records/${type}${id === "new" ? "" : `/${id}`}`,
        {
          method: id === "new" ? "POST" : "PUT",
          csrf: user.csrf,
          body: payload,
        },
      );
      if (id === "new") navigate(`/office/${type}/${result.id}`);
      else {
        setRevision((r) => r + 1);
        setTimeout(() => setSaved("Changes saved."), 100);
      }
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }
  async function action(name, extra = {}) {
    setBusy(true);
    setError(null);
    try {
      const item = await api(`/records/${type}/${id}/${name}`, {
        method: "POST",
        csrf: user.csrf,
        body: { version: form.version, ...extra },
      });
      if (name === "prepare-quote") navigate(`/office/quotes/${item.id}`);
      else if (name === "convert-invoice")
        navigate(`/office/invoices/${item.id}`);
      else setRevision((r) => r + 1);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  if (!form) return <Loading error={error} />;
  const field = (
    key,
    label,
    kind = "text",
    required = false,
    options = null,
  ) => (
    <Field
      key={key}
      label={label}
      name={key}
      required={required}
      type={kind}
      value={form[key] ?? ""}
      disabled={locked && key !== "status" && key !== "note"}
      onChange={(e) => set(key, e.target.value)}
      error={error?.fields?.[key]}
    >
      {options ? (
        <select>
          {options.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      ) : kind === "textarea" ? (
        <textarea rows={4} />
      ) : undefined}
    </Field>
  );
  const relation = (key, label, target, required = false) => (
    <Relation
      label={label}
      type={target}
      value={form[key]}
      onChange={(value) => {
        set(key, value);
        if (key === "contact_id" && "site_id" in defaults[type])
          set("site_id", null);
      }}
      error={error?.fields?.[key]}
      contactId={
        key === "site_id" || key === "lead_id" ? form.contact_id : undefined
      }
      required={required}
      disabled={locked}
    />
  );
  return (
    <>
      <div className="workspace-heading">
        <div>
          <Link
            to={type === "segments" ? "/office/marketing" : `/office/${type}`}
          >
            ← {names[type]}
          </Link>
          <h1>
            {id === "new" ? `New ${type.slice(0, -1)}` : detail?.item.name}
          </h1>
          {type === "quotes" && (
            <p>
              Revision {detail?.item.revision || 1} · Staff statuses do not send
              emails or prove customer acceptance. AUD totals; GST is not
              calculated.
            </p>
          )}
        </div>
      </div>
      <div className="editor-layout">
        <section className="panel">
          <form onSubmit={submit} aria-busy={busy}>
            {field(
              "name",
              type === "contacts" ? "Full name" : "Name / reference",
              "text",
              true,
            )}
            {type === "leads" && (
              <>
                <div className="form-grid">
                  {field("email", "Email", "email")}
                  {field("phone", "Phone")}
                  {field("service", "Service", "text", false, [
                    ...services.map((s) => [s.slug, s.title]),
                    ["other", "Other / not sure"],
                  ])}
                  {field(
                    "source",
                    "Source",
                    "text",
                    false,
                    sources.map((s) => [s, s]),
                  )}
                  {field(
                    "stage",
                    "Sales stage",
                    "text",
                    false,
                    Object.entries(stageNames),
                  )}
                  {field("followup", "Follow-up date", "date")}
                </div>
                {field("address", "Enquiry site address")}
                {field("details", "Enquiry details", "textarea")}
                {relation("contact_id", "Contact", "contacts")}
                {relation("site_id", "Site", "sites")}
              </>
            )}
            {type === "contacts" && (
              <>
                <div className="form-grid">
                  {field("company", "Company")}
                  {field("email", "Email", "email")}
                  {field("phone", "Phone")}
                  {field(
                    "source",
                    "Source",
                    "text",
                    false,
                    sources.map((s) => [s, s]),
                  )}
                </div>
                <Field
                  label="Tags (comma separated)"
                  value={tagsText}
                  onChange={(e) => setTagsText(e.target.value)}
                  error={error?.fields?.tags}
                />
                {field("background", "Background", "textarea")}
                <h2>Marketing permission</h2>
                <p className="muted">
                  New consent, a changed email or reversal of suppression
                  requires fresh evidence and confirmation. Unsubscribing
                  suppresses this address across duplicates.
                </p>
                {field("permission", "Permission", "text", false, [
                  ["unknown", "Not recorded"],
                  ["subscribed", "Opted in"],
                  ["unsubscribed", "Unsubscribed"],
                ])}
                {field(
                  "evidence",
                  "Permission evidence, including source and date",
                  "textarea",
                )}
                <label className="check">
                  <input
                    type="checkbox"
                    checked={form.confirm_consent}
                    onChange={(e) => set("confirm_consent", e.target.checked)}
                  />
                  I confirm I have fresh consent evidence for this email
                  address.
                </label>
                {error?.fields?.confirm_consent && (
                  <p className="field-error" role="alert">
                    {error.fields.confirm_consent}
                  </p>
                )}
              </>
            )}
            {type === "sites" && (
              <>
                {relation("contact_id", "Contact", "contacts", true)}
                {field("address", "Site address", "text", true)}
                {field("access_notes", "Access notes", "textarea")}
              </>
            )}
            {type === "quotes" && (
              <>
                {locked && (
                  <div className="notice">
                    Issued commercial content is locked. Create a new revision
                    to change it.
                  </div>
                )}
                {relation("contact_id", "Contact", "contacts", true)}
                {relation("site_id", "Site", "sites")}
                {relation("lead_id", "Lead", "leads")}
                <div className="form-grid">
                  <Field
                    label="Total (AUD)"
                    inputMode="decimal"
                    value={amount}
                    disabled={locked}
                    onChange={(e) => setAmount(e.target.value)}
                    error={error?.fields?.amount_cents}
                  />
                  {field("valid_until", "Valid until", "date")}
                </div>
                {field("scope", "Scope", "textarea")}
                {field("exclusions", "Exclusions", "textarea")}
                {field(
                  "status",
                  "Staff-recorded status",
                  "text",
                  false,
                  {
                    draft: ["draft", "sent"],
                    sent: ["sent", "accepted", "declined"],
                    accepted: ["accepted"],
                    declined: ["declined"],
                  }[detail?.item.status || "draft"].map((s) => [s, s]),
                )}
              </>
            )}
            {type === "invoices" && (
              <>
                <p>
                  {detail
                    ? "Invoice INV-" + detail.item.id
                    : "Invoice number assigned when saved."}{" "}
                  · AUD total. GST is not calculated. No email or payment is
                  processed.
                </p>
                {detail?.item.quote_id && (
                  <p>
                    <Link to={"/office/quotes/" + detail.item.quote_id}>
                      Source quote #{detail.item.quote_id}
                    </Link>{" "}
                    · Revision {detail.item.quote_revision}
                  </p>
                )}
                {locked && (
                  <p className="notice">
                    Issued or void invoice details are locked.
                  </p>
                )}
                {relation("contact_id", "Contact", "contacts", true)}
                {relation("site_id", "Site", "sites")}
                <div className="form-grid">
                  <Field
                    label="Total (AUD)"
                    inputMode="decimal"
                    value={amount}
                    disabled={locked}
                    onChange={(e) => setAmount(e.target.value)}
                    error={error?.fields?.amount_cents}
                  />
                  {field("due_date", "Due date", "date")}
                </div>
                {field("scope", "Work description", "textarea")}
                {field("exclusions", "Exclusions", "textarea")}
                {field(
                  "status",
                  "Invoice status",
                  "text",
                  false,
                  {
                    draft: ["draft", "issued", "void"],
                    issued: ["issued", "paid", "void"],
                    paid: ["paid"],
                    void: ["void"],
                  }[detail?.item.status || "draft"].map((s) => [s, s]),
                )}
                {detail?.item.issued_snapshot && (
                  <InvoiceSnapshot
                    snapshot={JSON.parse(detail.item.issued_snapshot)}
                  />
                )}
              </>
            )}
            {type === "segments" && (
              <>
                {field("tag", "Match tag (blank = any)")}
                {field("source", "Match source", "text", false, [
                  ["", "Any source"],
                  ...sources.map((s) => [s, s]),
                ])}
                <p>
                  Both tag and source must match. This is a live audience
                  definition.
                </p>
              </>
            )}
            {field("note", "Activity note", "textarea")}
            <ErrorBox error={error} />
            <p role="status">{saved}</p>
            <div className="actions">
              <button className="primary" disabled={busy}>
                {busy ? "Saving…" : "Save changes"}
              </button>
              {id !== "new" && (
                <button type="button" onClick={() => setRevision((r) => r + 1)}>
                  Reload record
                </button>
              )}
            </div>
          </form>
        </section>
        <aside>
          {id !== "new" && (
            <section className="panel">
              <h2>Next action</h2>
              <div className="stack">
                {type === "leads" && (
                  <>
                    <button
                      disabled={busy || !!detail.item.contact_id}
                      onClick={() => action("link-contact")}
                    >
                      {detail.item.contact_id
                        ? "Contact linked"
                        : "Create / link contact by email"}
                    </button>
                    <button
                      disabled={busy || !detail.item.contact_id}
                      onClick={() => action("prepare-quote")}
                    >
                      Prepare quote
                    </button>
                    {detail.item.followup && (
                      <Confirm
                        label="Complete follow-up"
                        title="Complete this follow-up?"
                        description="This records completion and clears the current date. You can then save a new follow-up date."
                        disabled={busy}
                        onConfirm={() => action("complete-followup")}
                      />
                    )}
                  </>
                )}
                {type === "quotes" && (
                  <>
                    <button
                      disabled={busy}
                      onClick={() => action("convert-invoice")}
                    >
                      Convert to invoice
                    </button>
                    <p className="muted">
                      Uses the saved quote. Save changes first. An existing
                      invoice is opened if already converted.
                    </p>
                    <Confirm
                      label="Create next revision"
                      title="Create a new draft revision?"
                      description="The issued snapshot is retained. The current quote moves to a new draft; the lead stage stays unchanged."
                      disabled={busy || !locked}
                      onConfirm={() => action("revise")}
                    />
                  </>
                )}{" "}
                {type === "contacts" && (
                  <>
                    {["sites", "leads", "quotes", "invoices"].map((t) => (
                      <Link key={t} to={`/office/contacts/${id}/related/${t}`}>
                        View linked {t} ↗
                      </Link>
                    ))}
                  </>
                )}
                {type === "segments" && (
                  <Link
                    to={`/office/marketing?tag=${encodeURIComponent(form.tag)}&source=${form.source}`}
                  >
                    Preview matching audience ↗
                  </Link>
                )}
              </div>
            </section>
          )}
          {detail && (
            <section className="panel">
              <h2>Activity history</h2>
              <ul className="timeline">
                {detail.history.map((h) => (
                  <li key={h.id}>
                    <p>{h.message}</p>
                    <small>
                      {h.actor} · {h.created_at} UTC
                    </small>
                  </li>
                ))}
              </ul>
              <Pager
                data={{ total: detail.historyTotal }}
                page={page}
                setPage={setPage}
              />
              {detail.consent.length > 0 && (
                <>
                  <h2>Permission history</h2>
                  {detail.consent.map((c) => (
                    <div className="history-entry" key={c.id}>
                      <strong>
                        {c.permission} · {c.email}
                      </strong>
                      <p>{c.evidence || "No evidence recorded"}</p>
                      <small>
                        {c.actor} · {c.created_at} UTC
                      </small>
                    </div>
                  ))}
                </>
              )}
              {detail.snapshots.length > 0 && (
                <>
                  <h2>Issued snapshots</h2>
                  {detail.snapshots.map((s) => {
                    const snap = JSON.parse(s.snapshot);
                    return (
                      <details key={s.id}>
                        <summary>
                          Revision {s.revision} · AUD{" "}
                          {(snap.amount_cents / 100).toFixed(2)}
                        </summary>
                        <p>
                          {snap.contact.name} · {snap.contact.email}
                        </p>
                        <p>{snap.site?.address || "No site linked"}</p>
                        <p>Scope: {snap.scope}</p>
                        <p>Exclusions: {snap.exclusions || "None recorded"}</p>
                        <p>
                          Valid until: {snap.valid_until || "Not specified"}
                        </p>
                        <small>
                          {s.actor} · {s.created_at} UTC
                        </small>
                      </details>
                    );
                  })}
                </>
              )}
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
function InvoiceSnapshot({ snapshot: s }) {
  return (
    <details>
      <summary>Issued invoice INV-{s.id}</summary>
      <p>
        {s.contact.name} · {s.contact.company} · {s.contact.email}
      </p>
      <p>{s.site?.address || "No site linked"}</p>
      <p>Work: {s.scope}</p>
      <p>Exclusions: {s.exclusions || "None recorded"}</p>
      <p>
        AUD {(s.amount_cents / 100).toFixed(2)} · Due {s.due_date}
      </p>
      <small>Issued {s.issued_at}</small>
    </details>
  );
}
export function Related() {
  const { id, type } = useParams(),
    [page, setPage] = useState(1);
  const { data, error } = useData(
    `/records/${type}?contact_id=${id}&page=${page}`,
  );
  return (
    <>
      <Link to={`/office/contacts/${id}`}>← Contact</Link>
      <h1>Linked {type}</h1>
      <section className="panel">
        {data ? (
          <>
            {data.items.length ? (
              data.items.map((r) => (
                <p key={r.id}>
                  <Link to={`/office/${type}/${r.id}`}>
                    #{r.id} · {r.name}
                  </Link>
                </p>
              ))
            ) : (
              <p>No linked records.</p>
            )}
            <Pager data={data} page={page} setPage={setPage} />
          </>
        ) : (
          <Loading error={error} />
        )}
      </section>
    </>
  );
}
export function Marketing() {
  const params = new URLSearchParams(location.search),
    [tag, setTag] = useState(params.get("tag") || ""),
    [source, setSource] = useState(params.get("source") || ""),
    [page, setPage] = useState(1),
    [segmentPage, setSegmentPage] = useState(1);
  const { data, error } = useData(
      `/audience?tag=${encodeURIComponent(tag)}&source=${source}&page=${page}`,
    ),
    segments = useData(`/records/segments?page=${segmentPage}`);
  return (
    <>
      <div className="workspace-heading">
        <div>
          <p className="eyebrow">Permission first</p>
          <h1>Marketing audiences</h1>
          <p>Preview the people you have permission to contact.</p>
        </div>
        <Link className="button" to="/office/segments/new">
          + Save a live segment
        </Link>
      </div>
      <div className="notice">
        <strong>Campaign sending is a future feature.</strong> No marketing
        emails can be sent from this workspace. Eligibility requires an email,
        opt-in, evidence and no suppression; addresses are deduplicated.
      </div>
      <section className="panel">
        <h2>Audience preview</h2>
        <div className="filters">
          <Field
            label="Tag (exact match)"
            value={tag}
            onChange={(e) => {
              setTag(e.target.value);
              setPage(1);
            }}
          />
          <Field
            label="Source"
            value={source}
            onChange={(e) => {
              setSource(e.target.value);
              setPage(1);
            }}
          >
            <select>
              <option value="">Any source</option>
              {sources.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
        </div>
        {data ? (
          <>
            <h3>{data.total} eligible email addresses</h3>
            {data.items.length ? (
              <div
                className="table-scroll"
                tabIndex={0}
                role="region"
                aria-label="Eligible contacts"
              >
                <table>
                  <thead>
                    <tr>
                      <th>Contact</th>
                      <th>Email</th>
                      <th>Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((c) => (
                      <tr key={c.id}>
                        <td>
                          <Link to={`/office/contacts/${c.id}`}>{c.name}</Link>
                        </td>
                        <td>{c.email}</td>
                        <td>{c.source}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p>
                No eligible contacts match these criteria. Review contact
                permissions before adding anyone.
              </p>
            )}
            <Pager data={data} page={page} setPage={setPage} />
          </>
        ) : (
          <Loading error={error} />
        )}
      </section>
      <section className="panel">
        <h2>Saved live segments</h2>
        {segments.data ? (
          <>
            {segments.data.items.map((s) => (
              <div className="segment" key={s.id}>
                <Link to={`/office/segments/${s.id}`}>{s.name}</Link>
                <span>
                  {s.tag || "Any tag"} · {s.source || "Any source"}
                </span>
                <button
                  onClick={() => {
                    setTag(s.tag);
                    setSource(s.source);
                    setPage(1);
                  }}
                >
                  Preview
                </button>
              </div>
            ))}
            {!segments.data.items.length && <p>No segments saved yet.</p>}
            <Pager
              data={segments.data}
              page={segmentPage}
              setPage={setSegmentPage}
            />
          </>
        ) : (
          <Loading error={segments.error} />
        )}
      </section>
    </>
  );
}
export function Activity() {
  const [page, setPage] = useState(1),
    { data, error } = useData(`/activity?page=${page}`);
  return (
    <>
      <h1>Activity</h1>
      <p>A timestamped record of meaningful office changes.</p>
      <section className="panel">
        {data ? (
          <>
            <ul className="timeline">
              {data.items.map((a) => (
                <li key={a.id}>
                  <p>{a.message}</p>
                  <small>
                    {a.actor} · {a.created_at} UTC ·{" "}
                    {a.entity === "users" ? (
                      `User #${a.entity_id}`
                    ) : (
                      <Link to={`/office/${a.entity}/${a.entity_id}`}>
                        {a.entity} #{a.entity_id}
                      </Link>
                    )}
                  </small>
                </li>
              ))}
            </ul>
            {!data.items.length && <p>No activity yet.</p>}
            <Pager data={data} page={page} setPage={setPage} />
          </>
        ) : (
          <Loading error={error} />
        )}
      </section>
    </>
  );
}
export function Admin({ user }) {
  const [page, setPage] = useState(1),
    [mailPage, setMailPage] = useState(1),
    [revision, setRevision] = useState(0),
    [error, setError] = useState(null),
    [busy, setBusy] = useState(false),
    [success, setSuccess] = useState("");
  const accounts = useData(`/admin/users?page=${page}`, revision),
    mail = useData(`/admin/mail?page=${mailPage}`, revision);
  if (user.role !== "admin") return <h1>Administrator access required</h1>;
  async function submit(e) {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true);
    setError(null);
    try {
      await api("/admin/users", {
        method: "POST",
        csrf: user.csrf,
        body: Object.fromEntries(new FormData(form)),
      });
      form.reset();
      setRevision((r) => r + 1);
      setSuccess("Account created.");
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }
  async function access(u) {
    try {
      await api(`/admin/users/${u.id}/access`, {
        method: "POST",
        csrf: user.csrf,
        body: { active: !u.active },
      });
      setRevision((r) => r + 1);
    } catch (e) {
      setError(e);
    }
  }
  return (
    <>
      <h1>Administration</h1>
      <p>Manage office access and review enquiry email delivery.</p>
      <ErrorBox error={error} />
      <section className="panel">
        <h2>Create account</h2>
        <form onSubmit={submit}>
          <div className="form-grid">
            <Field
              label="Full name"
              name="name"
              required
              error={error?.fields.name}
            />
            <Field
              label="Email"
              name="email"
              type="email"
              required
              error={error?.fields.email}
            />
            <Field
              label="Temporary password (12+ characters)"
              name="password"
              type="password"
              minLength={12}
              autoComplete="new-password"
              required
              error={error?.fields.password}
            />
            <Field label="Role" name="role">
              <select defaultValue="office">
                <option value="office">Office</option>
                <option value="admin">Administrator</option>
              </select>
            </Field>
          </div>
          <button className="primary" disabled={busy}>
            Create account
          </button>
          <p role="status">{success}</p>
        </form>
      </section>
      <section className="panel">
        <h2>Accounts</h2>
        {accounts.data ? (
          <>
            {accounts.data.items.map((u) => (
              <div className="segment" key={u.id}>
                <span>
                  {u.name}
                  <small>
                    {u.email} · {u.role} · {u.active ? "Active" : "Inactive"}
                  </small>
                </span>
                <Confirm
                  label={u.active ? "Revoke access" : "Restore access"}
                  title="Change account access?"
                  description="Existing sessions for this account will be ended."
                  disabled={u.id === user.id}
                  onConfirm={() => access(u)}
                />
              </div>
            ))}
            <Pager data={accounts.data} page={page} setPage={setPage} />
          </>
        ) : (
          <Loading error={accounts.error} />
        )}
      </section>
      <section className="panel">
        <h2>Enquiry email log</h2>
        <p>
          Disabled means no delivery was attempted. Failed or interrupted
          deliveries require administrator review.
        </p>
        {mail.data ? (
          <>
            {mail.data.items.map((m) => (
              <p key={m.id}>
                Enquiry #{m.lead_id} · {m.recipient} ·{" "}
                <strong>{m.status}</strong> {m.error}
              </p>
            ))}
            <Pager data={mail.data} page={mailPage} setPage={setMailPage} />
          </>
        ) : (
          <Loading error={mail.error} />
        )}
      </section>
    </>
  );
}
