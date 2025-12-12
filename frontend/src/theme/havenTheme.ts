import { createTheme } from "@mui/material/styles";

export const havenTheme = createTheme({
  palette: {
    mode: "dark",
    primary: { main: "#7AA7FF" },
    secondary: { main: "#2EC4B6" },
    background: {
      default: "#06070A",
      paper: "rgba(255,255,255,0.06)",
    },
    text: {
      primary: "#EDEFF5",
      secondary: "rgba(237,239,245,0.72)",
    },
    divider: "rgba(255,255,255,0.10)",
  },
  typography: {
    fontFamily: '"Inter", system-ui, -apple-system, "Segoe UI", Arial, sans-serif',
    h1: { fontWeight: 600, fontSize: "1.4rem", letterSpacing: "-0.02em" },
    h2: { fontWeight: 600, fontSize: "1.1rem", letterSpacing: "-0.02em" },
    body1: { fontSize: "0.9rem", lineHeight: 1.55 },
    body2: { fontSize: "0.8rem", lineHeight: 1.45 },
    button: { textTransform: "none", fontWeight: 600 },
  },
  shape: { borderRadius: 16 },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          background:
            "radial-gradient(1200px 800px at 15% 10%, rgba(122,167,255,0.12) 0%, rgba(0,0,0,0) 50%), radial-gradient(900px 700px at 85% 20%, rgba(46,196,182,0.10) 0%, rgba(0,0,0,0) 45%), #06070A",
        },
      },
    },
  },
});

export const glassPanelSx = {
  backgroundColor: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.10)",
  backdropFilter: "blur(14px)",
  boxShadow: "0 24px 70px rgba(0,0,0,0.45)",
};

export const contentMonoSx = {
  fontFamily: '"JetBrains Mono", "SF Mono", ui-monospace, Menlo, Monaco, Consolas, monospace',
};

