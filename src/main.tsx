import React from "react"
import { createRoot } from "react-dom/client"
import App from "./ui/App"
import { boot } from "./ui/runtime"
import "./styles.css"

const root = createRoot(document.getElementById("root")!)
boot()
  .catch(error => console.error("[Tommy] Startup failed", error))
  .finally(() =>
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    ),
  )
