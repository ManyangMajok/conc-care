import React, { useEffect, useId, useState } from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { api } from "./api";
export const cn = (...args) => twMerge(clsx(args));
export const stageNames = {
  new: "New enquiry",
  contacted: "Contacted",
  qualified: "Qualified",
  quoted: "Quoted",
  won: "Won",
  lost: "Lost",
};
export const sources = [
  "website",
  "phone",
  "referral",
  "google",
  "social",
  "repeat",
  "other",
];
export function Field({ label, name, error, children, ...props }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children ? (
        React.cloneElement(children, {
          id,
          name,
          "aria-invalid": !!error,
          "aria-describedby": error ? `${id}-error` : undefined,
          ...props,
        })
      ) : (
        <input
          id={id}
          name={name}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
          {...props}
        />
      )}{" "}
      {error && (
        <span id={`${id}-error`} className="field-error">
          {error}
        </span>
      )}
    </div>
  );
}
export function ErrorBox({ error }) {
  return error ? (
    <div className="error" role="alert">
      {error.message}
    </div>
  ) : null;
}
export function Pager({ data, page, setPage }) {
  return (
    <div className="pager">
      <span>
        {data.total} records · Page {page} of{" "}
        {Math.max(1, Math.ceil(data.total / 25))}
      </span>
      <button disabled={page <= 1} onClick={() => setPage(page - 1)}>
        Previous
      </button>
      <button
        disabled={page * 25 >= data.total}
        onClick={() => setPage(page + 1)}
      >
        Next
      </button>
    </div>
  );
}
export function Confirm({ label, title, description, onConfirm, disabled }) {
  return (
    <AlertDialog.Root>
      <AlertDialog.Trigger asChild>
        <button disabled={disabled}>{label}</button>
      </AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="overlay" />
        <AlertDialog.Content className="dialog">
          <AlertDialog.Title>{title}</AlertDialog.Title>
          <AlertDialog.Description>{description}</AlertDialog.Description>
          <div className="actions">
            <AlertDialog.Cancel asChild>
              <button>Cancel</button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <button className="primary" onClick={onConfirm}>
                Confirm
              </button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
export function Relation({
  label,
  type,
  value,
  onChange,
  error,
  contactId,
  required,
  disabled,
}) {
  const [q, setQ] = useState(""),
    [rows, setRows] = useState([]),
    [current, setCurrent] = useState(null),
    [failure, setFailure] = useState(null);
  useEffect(() => {
    let active = true;
    api(
      `/records/${type}?q=${encodeURIComponent(q)}${contactId ? `&contact_id=${contactId}` : ""}`,
    )
      .then((d) => {
        if (active) {
          setRows(d.items);
          setFailure(null);
        }
      })
      .catch((e) => active && setFailure(e));
    return () => {
      active = false;
    };
  }, [type, q, contactId]);
  useEffect(() => {
    let active = true;
    if (value)
      api(`/records/${type}/${value}`)
        .then((d) => active && setCurrent(d.item))
        .catch((e) => active && setFailure(e));
    else setCurrent(null);
    return () => {
      active = false;
    };
  }, [type, value]);
  const options =
    current && !rows.some((r) => r.id === current.id)
      ? [current, ...rows]
      : rows;
  return (
    <div className="relation">
      <Field
        label={`Find ${label.toLowerCase()}`}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by name"
        disabled={disabled}
      />
      <Field
        label={label}
        error={error}
        required={required}
        disabled={disabled}
        value={value || ""}
        onChange={(e) =>
          onChange(e.target.value ? Number(e.target.value) : null)
        }
      >
        <select>
          <option value="">Choose {label.toLowerCase()}</option>
          {options.map((r) => (
            <option key={r.id} value={r.id}>
              #{r.id} · {r.name}
            </option>
          ))}
        </select>
      </Field>
      <small>Up to 25 matches. Search to narrow the list.</small>
      <ErrorBox error={failure} />
    </div>
  );
}
