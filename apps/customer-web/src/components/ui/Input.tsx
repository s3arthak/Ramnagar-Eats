import type { InputHTMLAttributes } from "react";
type Props = InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string };
export function Input({ label, error, id, ...props }: Props) { const fieldId = id ?? label.toLowerCase().replace(/\W+/g, "-"); return <label className="ui-field" htmlFor={fieldId}><span>{label}</span><input id={fieldId} className={error ? "has-error" : ""} {...props} />{error && <small role="alert">{error}</small>}</label>; }
