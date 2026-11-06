import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import App from "./App";
import { RELEASE, installerMB } from "./content";

export function render() {
  return renderToString(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

export const meta = { version: RELEASE.version, installerMB, release: RELEASE };
