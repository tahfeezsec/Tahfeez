import React, { FormEvent, useState } from "react";
import { SiteSettings, useSiteSettings } from "../../contexts/SiteSettingsContext";

export function DesignEditor() {
  const { settings, saveSettings } = useSiteSettings();
  const [draft, setDraft] = useState<SiteSettings>(settings);
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState<"desktop" | "mobile">("desktop");
  const [message, setMessage] = useState("");

  const handleChange = (key: keyof SiteSettings, value: string) => {
    setDraft({ ...draft, [key]: value });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage("");
    const success = await saveSettings(draft);
    if (success) {
      setMessage("Settings saved successfully!");
    } else {
      setMessage("Failed to save settings.");
    }
    setSaving(false);
  };

  const previewUrl = `/?preview_settings=${encodeURIComponent(JSON.stringify(draft))}`;

  return (
    <div className="design-editor">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 24, color: "#1a4231" }}>Design & Layout Settings</h2>
        
        <div style={{ display: "flex", gap: 8 }}>
          <button 
            type="button" 
            className={`button ${viewMode === "desktop" ? "button-primary" : "button-secondary"}`}
            onClick={() => setViewMode("desktop")}
          >
            Desktop Preview
          </button>
          <button 
            type="button" 
            className={`button ${viewMode === "mobile" ? "button-primary" : "button-secondary"}`}
            onClick={() => setViewMode("mobile")}
          >
            Mobile Preview
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "350px 1fr", gap: "30px" }}>
        {/* Controls Panel */}
        <div style={{ background: "#fff", padding: "24px", borderRadius: "12px", border: "1px solid #e7e0d3" }}>
          <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            
            <label style={{ display: "flex", flexDirection: "column", gap: "8px", fontWeight: "bold" }}>
              App Font
              <select 
                value={draft.fontFamily} 
                onChange={e => handleChange("fontFamily", e.target.value)}
                style={{ padding: "10px", borderRadius: "8px", border: "1px solid #ccc" }}
              >
                <option value="'Outfit', 'Inter', sans-serif">Outfit (Default)</option>
                <option value="'Inter', sans-serif">Inter</option>
                <option value="'Roboto', sans-serif">Roboto</option>
                <option value="'Lora', serif">Lora (Serif)</option>
                <option value="'Tajawal', sans-serif">Tajawal (Arabic)</option>
              </select>
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: "8px", fontWeight: "bold" }}>
              Login Box Alignment
              <select 
                value={draft.loginPanelJustify} 
                onChange={e => handleChange("loginPanelJustify", e.target.value)}
                style={{ padding: "10px", borderRadius: "8px", border: "1px solid #ccc" }}
              >
                <option value="flex-start">Left</option>
                <option value="center">Center</option>
                <option value="flex-end">Right</option>
              </select>
            </label>
            
            <label style={{ display: "flex", flexDirection: "column", gap: "8px", fontWeight: "bold" }}>
              Wallpaper Alignment
              <select 
                value={draft.wallpaperAlignment} 
                onChange={e => handleChange("wallpaperAlignment", e.target.value)}
                style={{ padding: "10px", borderRadius: "8px", border: "1px solid #ccc" }}
              >
                <option value="center">Center</option>
                <option value="top center">Top Center</option>
                <option value="bottom center">Bottom Center</option>
                <option value="left center">Left Center</option>
                <option value="right center">Right Center</option>
              </select>
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: "8px", fontWeight: "bold" }}>
              Wallpaper Sizing
              <select 
                value={draft.wallpaperSize} 
                onChange={e => handleChange("wallpaperSize", e.target.value)}
                style={{ padding: "10px", borderRadius: "8px", border: "1px solid #ccc" }}
              >
                <option value="contain">Contain (Keep all in frame)</option>
                <option value="cover">Cover (Fill screen entirely)</option>
                <option value="100% 100%">Stretch (Fill screen exactly)</option>
              </select>
            </label>

            <hr style={{ borderTop: "1px solid #e7e0d3", margin: "10px 0" }} />

            <label style={{ display: "flex", flexDirection: "column", gap: "8px", fontWeight: "bold" }}>
              Login Title text
              <input 
                value={draft.loginTitle} 
                onChange={e => handleChange("loginTitle", e.target.value)} 
                style={{ padding: "10px", borderRadius: "8px", border: "1px solid #ccc" }}
              />
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: "8px", fontWeight: "bold" }}>
              Login Subtitle text
              <textarea 
                value={draft.loginSubtitle} 
                onChange={e => handleChange("loginSubtitle", e.target.value)} 
                style={{ padding: "10px", borderRadius: "8px", border: "1px solid #ccc", minHeight: "80px", resize: "vertical" }} 
              />
            </label>

            <button className="button button-primary" type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </button>
            
            {message && (
              <p style={{ color: message.includes("success") ? "green" : "red", fontSize: 14, textAlign: "center", margin: 0 }}>
                {message}
              </p>
            )}
          </form>
        </div>

        {/* Preview Panel */}
        <div style={{ 
          display: "flex", 
          justifyContent: "center", 
          alignItems: "center",
          background: "#eef1ea",
          borderRadius: "12px",
          padding: "20px",
          border: "1px dashed #b9c7b6",
          overflow: "hidden"
        }}>
          <div style={{
            width: viewMode === "mobile" ? "375px" : "100%",
            height: viewMode === "mobile" ? "812px" : "100%",
            minHeight: viewMode === "desktop" ? "600px" : "auto",
            transition: "all 0.3s ease",
            boxShadow: "0 20px 50px rgba(0,0,0,0.1)",
            borderRadius: viewMode === "mobile" ? "30px" : "8px",
            overflow: "hidden",
            border: viewMode === "mobile" ? "12px solid #333" : "1px solid #ccc",
            background: "#fff"
          }}>
            <iframe 
              src={previewUrl}
              style={{ width: "100%", height: "100%", border: "none" }}
              title="Live Preview"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
