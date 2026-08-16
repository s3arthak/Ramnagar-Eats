import { useRef, useState } from "react";
import { ImagePlus, Loader2, RefreshCcw, Trash2, X } from "lucide-react";
import { api } from "../../lib/api";

interface Props {
  value: string; // current image URL ("" = none)
  onChange: (url: string) => void;
  folder?: string;
  label?: string;
  aspect?: "wide" | "square" | "avatar";
  fallbackText?: string;
}

const ACCEPTED = "image/jpeg,image/png,image/webp,image/gif,image/avif";
const MAX_BYTES = 5 * 1024 * 1024;

export function ImageUploader({ value, onChange, folder = "misc", label = "Image", aspect = "wide", fallbackText = "No image" }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [broken, setBroken] = useState(false);

  async function handleFile(file: File | undefined) {
    setError("");
    if (!file) return;
    if (!ACCEPTED.split(",").includes(file.type)) {
      setError("Only JPEG, PNG, WebP, GIF or AVIF images are allowed");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Image must be under 5 MB");
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const data = await api.upload<{ image: { url: string; fileId: string } }>(`/uploads?folder=${encodeURIComponent(folder)}`, form);
      setBroken(false);
      onChange(data.image.url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  function remove() {
    onChange("");
    setBroken(false);
    setError("");
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className={`image-uploader image-uploader--${aspect}`}>
      <div className="image-uploader-preview" onClick={() => !busy && inputRef.current?.click()}>
        {value && !broken ? (
          <img src={value} alt={label} onError={() => setBroken(true)} />
        ) : (
          <div className="image-uploader-empty">
            <ImagePlus size={22} />
            <span>{fallbackText}</span>
          </div>
        )}
        {busy && (
          <div className="image-uploader-busy">
            <Loader2 size={20} className="spin" />
            <span>Uploading…</span>
          </div>
        )}
      </div>
      <div className="image-uploader-actions">
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED}
          hidden
          onChange={(event) => void handleFile(event.target.files?.[0])}
        />
        {value ? (
          <>
            <button type="button" className="ui-button ui-button--secondary" onClick={() => inputRef.current?.click()} disabled={busy}>
              <RefreshCcw size={14} /> Replace
            </button>
            <button type="button" className="ui-button ui-button--ghost" onClick={remove} disabled={busy}>
              <Trash2 size={14} /> Remove
            </button>
          </>
        ) : (
          <button type="button" className="ui-button ui-button--secondary" onClick={() => inputRef.current?.click()} disabled={busy}>
            <ImagePlus size={14} /> Upload
          </button>
        )}
        {error && (
          <span className="image-uploader-error" role="alert">
            <X size={13} /> {error}
          </span>
        )}
      </div>
    </div>
  );
}
