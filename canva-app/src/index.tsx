// Canva 앱 부트스트랩 (SDK 2.x 기준)
import { AppUiProvider } from "@canva/app-ui-kit";
import { createRoot } from "react-dom/client";
import { App } from "./app";
import "@canva/app-ui-kit/styles.css";
import type { DesignEditorIntent } from "@canva/intents/design";
import { prepareDesignEditor } from "@canva/intents/design";

async function render() {
  const root = createRoot(document.getElementById("root") as Element);
  root.render(
    <AppUiProvider>
      <App />
    </AppUiProvider>,
  );
}

const designEditor: DesignEditorIntent = { render };
prepareDesignEditor(designEditor);

// HMR (개발 모드에서 app.tsx 변경 시 자동 리로드)
declare const module: { hot?: { accept: (path: string, cb: () => void) => void } };
if (module.hot) {
  module.hot.accept("./app", render);
}
