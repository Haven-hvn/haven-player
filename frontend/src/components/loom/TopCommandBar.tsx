import React, { useCallback } from "react";
import { Box, IconButton, TextField, Typography } from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import TuneIcon from "@mui/icons-material/Tune";
import SplitscreenIcon from "@mui/icons-material/Splitscreen";
import { useHavenStore } from "@/haven/state/havenStore";
import { contentMonoSx } from "@/theme/havenTheme";

export function TopCommandBar(props: { title: string }): React.ReactElement {
  const { state, dispatch } = useHavenStore();

  const onQueryChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      dispatch({ type: "filters:setQuery", query: e.target.value });
    },
    [dispatch]
  );

  const toggleSplit = useCallback(() => {
    dispatch({ type: "split:setEnabled", enabled: !state.selection.splitView.enabled });
  }, [dispatch, state.selection.splitView.enabled]);

  return (
    <Box
      sx={{
        height: 56,
        display: "flex",
        alignItems: "center",
        gap: 2,
        px: 2,
      }}
    >
      <Typography variant="h2" sx={{ flex: "0 0 auto" }}>
        Haven
      </Typography>
      <Typography variant="body2" sx={{ color: "text.secondary" }}>
        / {props.title}
      </Typography>

      <Box sx={{ flex: 1 }} />

      <TextField
        size="small"
        value={state.filters.searchQuery}
        onChange={onQueryChange}
        placeholder="Search artifacts, hubs, people…"
        InputProps={{
          startAdornment: <SearchIcon fontSize="small" style={{ opacity: 0.75, marginRight: 8 }} />,
        }}
        sx={{
          width: 420,
          "& .MuiOutlinedInput-root": {
            borderRadius: 999,
            backgroundColor: "rgba(0,0,0,0.18)",
          },
          "& input": {
            ...contentMonoSx,
            fontSize: "0.85rem",
          },
        }}
      />

      <IconButton
        aria-label="Toggle split view"
        onClick={toggleSplit}
        sx={{
          border: "1px solid rgba(255,255,255,0.12)",
          backgroundColor: state.selection.splitView.enabled
            ? "rgba(122,167,255,0.18)"
            : "rgba(0,0,0,0.18)",
        }}
      >
        <SplitscreenIcon fontSize="small" />
      </IconButton>

      <IconButton
        aria-label="Filters"
        sx={{ border: "1px solid rgba(255,255,255,0.12)", backgroundColor: "rgba(0,0,0,0.18)" }}
      >
        <TuneIcon fontSize="small" />
      </IconButton>
    </Box>
  );
}

