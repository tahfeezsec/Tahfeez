import React, { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export interface SiteSettings {
  fontFamily: string;
  loginWallpaper: string;
  wallpaperAlignment: string;
  wallpaperSize: string;
  loginPanelJustify: string;
  loginTitle: string;
  loginSubtitle: string;
}

export const defaultSettings: SiteSettings = {
  fontFamily: "Outfit, Inter, sans-serif",
  loginWallpaper: "/wallpaper.jpg",
  wallpaperAlignment: "center",
  wallpaperSize: "contain",
  loginPanelJustify: "flex-start",
  loginTitle: "Sign in to Tahfeez",
  loginSubtitle: "Use the ITS ID and password issued by your administrator.",
};

interface SiteSettingsContextType {
  settings: SiteSettings;
  setDraftSettings: (settings: SiteSettings) => void;
  saveSettings: (settings: SiteSettings) => Promise<boolean>;
  loading: boolean;
}

const SiteSettingsContext = createContext<SiteSettingsContextType>({
  settings: defaultSettings,
  setDraftSettings: () => {},
  saveSettings: async () => false,
  loading: true,
});

export const useSiteSettings = () => useContext(SiteSettingsContext);

export const SiteSettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<SiteSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const previewSettings = urlParams.get('preview_settings');
    if (previewSettings) {
      try {
        setSettings({ ...defaultSettings, ...JSON.parse(previewSettings) });
        setLoading(false);
        return;
      } catch (e) {
        console.error("Invalid preview settings", e);
      }
    }
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from("site_settings")
        .select("settings")
        .eq("id", 1)
        .single();

      if (error) {
        if (error.code !== "PGRST116") { // Not found error code
          console.error("Error fetching site settings:", error);
        }
      } else if (data?.settings) {
        setSettings({ ...defaultSettings, ...data.settings });
      }
    } catch (err) {
      console.error("Failed to fetch settings:", err);
    } finally {
      setLoading(false);
    }
  };

  const setDraftSettings = (newSettings: SiteSettings) => {
    setSettings(newSettings);
  };

  const saveSettings = async (newSettings: SiteSettings): Promise<boolean> => {
    setSettings(newSettings);
    try {
      const { error } = await supabase
        .from("site_settings")
        .update({ settings: newSettings })
        .eq("id", 1);

      if (error) {
        console.error("Error saving site settings:", error);
        return false;
      }
      return true;
    } catch (err) {
      console.error("Failed to save settings:", err);
      return false;
    }
  };

  // Inject CSS variables
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--app-font", settings.fontFamily);
    root.style.setProperty("--bg-alignment", settings.wallpaperAlignment);
    root.style.setProperty("--bg-size", settings.wallpaperSize);
    root.style.setProperty("--login-panel-justify", settings.loginPanelJustify);
  }, [settings]);

  return (
    <SiteSettingsContext.Provider value={{ settings, setDraftSettings, saveSettings, loading }}>
      {children}
    </SiteSettingsContext.Provider>
  );
};
