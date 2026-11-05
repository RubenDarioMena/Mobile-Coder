// Entrada del paquete web/vendor/servicios-web/servicios-web.js (lo arma herramientas/lenguajes.mjs con esbuild).
// Expone en el Worker de lenguajes (app/lenguaje-web.js) los servicios de HTML y CSS de VS Code, sin modificar.
import * as html from "vscode-html-languageservice";
import * as css from "vscode-css-languageservice";
import { TextDocument } from "vscode-languageserver-textdocument";

self.ServiciosWeb = { html, css, TextDocument };
