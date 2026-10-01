import "../../../vendor/desert-pants/build/web/tokens.css";
import "../../../vendor/desert-pants/build/web/themes.css";
import "../../../vendor/desert-pants/build/web/fonts.css";
import "./app.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { applyStoredTheme } from "./theme";

const initialTheme = applyStoredTheme();

const root = document.getElementById("root");
if (root === null) throw new Error("Isoscope root element was not found.");
createRoot(root).render(<StrictMode><App initialTheme={initialTheme} /></StrictMode>);
