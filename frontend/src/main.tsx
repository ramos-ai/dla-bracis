import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
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
