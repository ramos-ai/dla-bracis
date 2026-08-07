import React from "react";
import "./Footer.scss";

const version = import.meta.env.VITE_APP_VERSION ?? "0.0.1";
const year = new Date().getFullYear();

const Footer: React.FC = () => (
  <footer className="app-footer" role="contentinfo">
    v{version} – {year}
  </footer>
);

export default Footer;
