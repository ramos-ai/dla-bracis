import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
/* Load legacy SCSS first (via App), then Studio/Tailwind so cascade order favors utilities where layers allow. */
import App from "./App";
import "./styles/studio.css";
import Authentication from "./contexts/Authentication";
import { SelectedClassProvider } from "./contexts/SelectedClass";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Authentication>
      <BrowserRouter>
        <SelectedClassProvider>
          <App />
        </SelectedClassProvider>
      </BrowserRouter>
    </Authentication>
  </React.StrictMode>
);
