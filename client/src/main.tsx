import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

function normalizeLegacyHashRoute() {
  const { hash, search } = window.location;
  if (!hash.startsWith("#/")) return;

  const hashRoute = hash.slice(1);
  const [hashPathAndSearch, fragment] = hashRoute.split("#");
  const hasHashSearch = hashPathAndSearch.includes("?");
  const mergedSearch = search
    ? hasHashSearch
      ? `&${search.slice(1)}`
      : search
    : "";
  const nextUrl = `${hashPathAndSearch}${mergedSearch}${fragment ? `#${fragment}` : ""}`;
  window.history.replaceState({}, "", nextUrl);
}

normalizeLegacyHashRoute();

createRoot(document.getElementById("root")!).render(<App />);
