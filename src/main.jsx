import { createRoot } from "react-dom/client";
import "leaflet/dist/leaflet.css";
import "./tokens.css";
import "./base.css";
import App from "./App";

createRoot(document.getElementById("root")).render(<App />);
