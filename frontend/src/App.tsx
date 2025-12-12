import React from "react";
import { CssBaseline, ThemeProvider } from "@mui/material";
import { havenTheme } from "@/theme/havenTheme";
import { HavenStoreProvider } from "@/haven/state/havenStore";
import { LoomWorkspace } from "@/components/loom/LoomWorkspace";

const App: React.FC = () => {
  return (
    <ThemeProvider theme={havenTheme}>
      <CssBaseline />
      <HavenStoreProvider>
        <LoomWorkspace />
      </HavenStoreProvider>
    </ThemeProvider>
  );
};

export default App;
