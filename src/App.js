import React, { useEffect, useRef, useState } from "react";
import {
  getSolidDataset,
  getThing,
  getStringNoLocale,
  getUrl,
} from "@inrupt/solid-client";
import session from "./solidSession";
import "./App.css";
import DataManager from "./components/DataManager";
import LoginScreen from "./components/LoginScreen";
import FooterBar from "./components/FooterBar";
import { I18nProvider, LanguageSelect } from "./i18n";
import "./LanguageSelect.css";

const VCARD_FN = "http://www.w3.org/2006/vcard/ns#fn";
const VCARD_HAS_PHOTO = "http://www.w3.org/2006/vcard/ns#hasPhoto";
const FOAF_NAME = "http://xmlns.com/foaf/0.1/name";
const FOAF_IMG = "http://xmlns.com/foaf/0.1/img";
const FOAF_DEPICTION = "http://xmlns.com/foaf/0.1/depiction";
const SCHEMA_NAME = "http://schema.org/name";

const App = () => {
  const [webId, setWebId] = useState("");
  const [sessionActive, setSessionActive] = useState(false);
  const [profile, setProfile] = useState({
    name: "",
    podHost: "",
    photoUrl: "",
  });
  const [avatarUrl, setAvatarUrl] = useState("");
  const avatarObjectUrlRef = useRef("");

  useEffect(() => {
    document.title = "Solid Data Manager";
    if (session.info.isLoggedIn) {
      const w = session.info.webId;
      if (w) {
        setWebId(w);
        setSessionActive(true);
      }
    }
  }, []);

  useEffect(() => {
    if (!sessionActive || !webId) return;
    let ignore = false;
    const loadProfile = async () => {
      try {
        const profileCard = webId.split("#")[0];
        const dataset = await getSolidDataset(profileCard, { fetch: session.fetch });
        const thing = getThing(dataset, webId);
        const name =
          (thing && (getStringNoLocale(thing, VCARD_FN) || getStringNoLocale(thing, FOAF_NAME))) ||
          (thing && getStringNoLocale(thing, SCHEMA_NAME)) ||
          "";
        const photoUrl =
          (thing && (getUrl(thing, VCARD_HAS_PHOTO) || getUrl(thing, FOAF_IMG))) ||
          (thing && getUrl(thing, FOAF_DEPICTION)) ||
          "";
        const podHost = new URL(webId).origin;
        if (!ignore) {
          setProfile({ name, podHost, photoUrl });
        }
      } catch {
        if (!ignore) {
          const podHost = new URL(webId).origin;
          setProfile((prev) => ({ ...prev, podHost, photoUrl: "" }));
        }
      }
    };
    loadProfile();
    return () => {
      ignore = true;
    };
  }, [sessionActive, webId]);

  useEffect(() => {
    let cancelled = false;
    const loadAvatar = async () => {
      if (!profile.photoUrl) {
        setAvatarUrl("");
        return;
      }
      try {
        const res = await session.fetch(profile.photoUrl);
        if (!res.ok) throw new Error("Avatar fetch failed");
        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        if (avatarObjectUrlRef.current) {
          URL.revokeObjectURL(avatarObjectUrlRef.current);
        }
        avatarObjectUrlRef.current = objectUrl;
        setAvatarUrl(objectUrl);
      } catch {
        setAvatarUrl("");
      }
    };
    loadAvatar();
    return () => {
      cancelled = true;
    };
  }, [profile.photoUrl]);

  const loginToSolid = async (issuer) => {
    if (!issuer) return;
    await session.login({
      oidcIssuer: issuer,
      redirectUrl: window.location.href,
      clientName: "Solid Data Manager",
    });
  };

  const handleLogout = async () => {
    try {
      await session.logout();
    } finally {
      setSessionActive(false);
      setWebId("");
      setProfile({ name: "", podHost: "", photoUrl: "" });
      if (avatarObjectUrlRef.current) {
        URL.revokeObjectURL(avatarObjectUrlRef.current);
        avatarObjectUrlRef.current = "";
      }
      setAvatarUrl("");
    }
  };

  if (!sessionActive) {
    return (
      <I18nProvider>
        <div className="standalone-login-page">
          <LanguageSelect className="language-select--standalone" />
          <LoginScreen onLogin={loginToSolid} />
        </div>
      </I18nProvider>
    );
  }

  return (
    <I18nProvider>
      <div className="container">
        <LanguageSelect className="language-select--standalone" />
        <DataManager
          webId={webId}
          headerUser={{
            name: profile.name,
            podHost: profile.podHost,
            avatarUrl,
            webId,
          }}
          onLogout={handleLogout}
        />
        <div className="footer-spacer" />
        <FooterBar />
      </div>
    </I18nProvider>
  );
};

export default App;
