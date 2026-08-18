import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LogOut, MapPin, Package } from "lucide-react";
import { PushBell } from "../components/ui/PushBell";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { ImageUploader } from "../components/ui/ImageUploader";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";

export function ProfilePage() {
  const { user, logout, updateMe } = useAuth();
  const { push } = useToast();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user?.name ?? "");
  const [saving, setSaving] = useState(false);

  if (!user) return null;

  async function saveName(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await updateMe({ name: name.trim() });
      push("Profile updated", { tone: "success" });
      setEditing(false);
    } catch (caught) {
      push(caught instanceof Error ? caught.message : "Could not save", { tone: "danger" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="content page profile-page">
      <h1 className="page-title">My profile</h1>
      <section className="profile-card">
        {user.avatar ? (
          <img className="profile-avatar profile-avatar--img" src={user.avatar} alt={user.name} />
        ) : (
          <div className="profile-avatar">{user.name.slice(0, 2).toUpperCase()}</div>
        )}
        <div className="profile-details">
          <h2>{user.name}</h2>
          <p>{user.phone ?? "No phone added"}</p>
          {user.email && <p>{user.email}</p>}
          <span className="badge badge--open">{user.role}</span>
        </div>
      </section>

      <section className="profile-section">
        <h3>Profile photo</h3>
        <ImageUploader
          value={user.avatar ?? ""}
          onChange={(avatar) => {
            void updateMe({ avatar: avatar || undefined }).then(() => push("Photo updated", { tone: "success" })).catch((caught: unknown) =>
              push(caught instanceof Error ? caught.message : "Could not update photo", { tone: "danger" }),
            );
          }}
          folder="avatars"
          label="Profile photo"
          aspect="avatar"
          fallbackText="Add photo"
        />
      </section>

      <section className="profile-section">
        <h3>Name</h3>
        {editing ? (
          <form className="profile-edit-form" onSubmit={(event) => void saveName(event)}>
            <Input label="Full name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" />
            <div className="form-row">
              <Button type="submit" loading={saving}>Save</Button>
              <Button type="button" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
            </div>
          </form>
        ) : (
          <div className="profile-name-row">
            <p>{user.name}</p>
            <Button type="button" variant="secondary" onClick={() => setEditing(true)}>Edit</Button>
          </div>
        )}
      </section>

      <div className="profile-links">
        <Link to="/orders">
          <Package size={18} /> My orders
        </Link>
        <Link to="/addresses">
          <MapPin size={18} /> My addresses
        </Link>
        <PushBell className="profile-push-bell" />
        <button
          onClick={() => {
            void logout().then(() => navigate("/"));
          }}
        >
          <LogOut size={18} /> Sign out
        </button>
      </div>
    </div>
  );
}
