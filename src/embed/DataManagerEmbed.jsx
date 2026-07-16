import React from "react";
import DataManager from "../components/DataManager";
import { I18nProvider } from "../i18n";
import "../LanguageSelect.css";

export default function DataManagerEmbed({ webId, language }) {
  return (
    <I18nProvider language={language}>
      <DataManager webId={webId} />
    </I18nProvider>
  );
}
