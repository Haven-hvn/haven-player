import React from "react";
import {
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Divider,
  Typography,
} from "@mui/material";
import {
  SortByAlpha as SortByAlphaIcon,
  AccessTime as AccessTimeIcon,
  Tag as TagIcon,
  People as PeopleIcon,
  CheckCircle as CheckCircleIcon,
  ArrowUpward as ArrowUpwardIcon,
  ArrowDownward as ArrowDownwardIcon,
} from "@mui/icons-material";
import { SortOption, SortField, SortDirection, getSortLabel } from "@/utils/sortUtils";

interface SortMenuProps {
  anchorEl: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  currentSort: SortOption;
  onSortChange: (sort: SortOption) => void;
}

const SortMenu: React.FC<SortMenuProps> = ({
  anchorEl,
  open,
  onClose,
  currentSort,
  onSortChange,
}) => {
  const handleSortSelect = (field: SortField, direction: SortDirection) => {
    onSortChange({ field, direction });
    onClose();
  };

  const isSelected = (field: SortField, direction: SortDirection): boolean => {
    return currentSort.field === field && currentSort.direction === direction;
  };

  return (
    <Menu
      anchorEl={anchorEl}
      open={open}
      onClose={onClose}
      anchorOrigin={{
        vertical: "bottom",
        horizontal: "right",
      }}
      transformOrigin={{
        vertical: "top",
        horizontal: "right",
      }}
      slotProps={{
        paper: {
          sx: {
            borderRadius: "8px",
            boxShadow: "0 4px 16px rgba(0, 0, 0, 0.12)",
            border: "1px solid #E0E0E0",
            minWidth: 240,
            mt: 1,
          },
        },
      }}
    >
      <Typography
        variant="caption"
        sx={{
          px: 2,
          py: 1,
          color: "#6B6B6B",
          fontWeight: 600,
          fontSize: "11px",
          textTransform: "uppercase",
          letterSpacing: "0.5px",
        }}
      >
        Sort By
      </Typography>
      <Divider />

      {/* Name sorting */}
      <MenuItem
        onClick={() => handleSortSelect("name", "asc")}
        selected={isSelected("name", "asc")}
        sx={{
          fontFamily: '"Inter", "Segoe UI", "Arial", sans-serif',
          fontSize: "14px",
          "&:hover": {
            backgroundColor: "#F5F5F5",
          },
          "&.Mui-selected": {
            backgroundColor: "#F0F0F0",
            "&:hover": {
              backgroundColor: "#E8E8E8",
            },
          },
        }}
      >
        <ListItemIcon>
          <SortByAlphaIcon sx={{ fontSize: 20, color: "#6B6B6B" }} />
        </ListItemIcon>
        <ListItemText
          primary="Name (A-Z)"
          sx={{
            "& .MuiTypography-root": {
              fontFamily: '"Inter", "Segoe UI", "Arial", sans-serif',
              fontSize: "14px",
              fontWeight: isSelected("name", "asc") ? 500 : 400,
            },
          }}
        />
        {isSelected("name", "asc") && (
          <CheckCircleIcon sx={{ fontSize: 18, color: "#000000", ml: 1 }} />
        )}
      </MenuItem>

      <MenuItem
        onClick={() => handleSortSelect("name", "desc")}
        selected={isSelected("name", "desc")}
        sx={{
          fontFamily: '"Inter", "Segoe UI", "Arial", sans-serif',
          fontSize: "14px",
          "&:hover": {
            backgroundColor: "#F5F5F5",
          },
          "&.Mui-selected": {
            backgroundColor: "#F0F0F0",
            "&:hover": {
              backgroundColor: "#E8E8E8",
            },
          },
        }}
      >
        <ListItemIcon>
          <SortByAlphaIcon sx={{ fontSize: 20, color: "#6B6B6B" }} />
        </ListItemIcon>
        <ListItemText
          primary="Name (Z-A)"
          sx={{
            "& .MuiTypography-root": {
              fontFamily: '"Inter", "Segoe UI", "Arial", sans-serif',
              fontSize: "14px",
              fontWeight: isSelected("name", "desc") ? 500 : 400,
            },
          }}
        />
        {isSelected("name", "desc") && (
          <CheckCircleIcon sx={{ fontSize: 18, color: "#000000", ml: 1 }} />
        )}
      </MenuItem>

      <Divider sx={{ my: 0.5 }} />

      {/* Date sorting */}
      <MenuItem
        onClick={() => handleSortSelect("date", "desc")}
        selected={isSelected("date", "desc")}
        sx={{
          fontFamily: '"Inter", "Segoe UI", "Arial", sans-serif',
          fontSize: "14px",
          "&:hover": {
            backgroundColor: "#F5F5F5",
          },
          "&.Mui-selected": {
            backgroundColor: "#F0F0F0",
            "&:hover": {
              backgroundColor: "#E8E8E8",
            },
          },
        }}
      >
        <ListItemIcon>
          <AccessTimeIcon sx={{ fontSize: 20, color: "#6B6B6B" }} />
        </ListItemIcon>
        <ListItemText
          primary="Date (Newest First)"
          sx={{
            "& .MuiTypography-root": {
              fontFamily: '"Inter", "Segoe UI", "Arial", sans-serif',
              fontSize: "14px",
              fontWeight: isSelected("date", "desc") ? 500 : 400,
            },
          }}
        />
        {isSelected("date", "desc") && (
          <CheckCircleIcon sx={{ fontSize: 18, color: "#000000", ml: 1 }} />
        )}
      </MenuItem>

      <MenuItem
        onClick={() => handleSortSelect("date", "asc")}
        selected={isSelected("date", "asc")}
        sx={{
          fontFamily: '"Inter", "Segoe UI", "Arial", sans-serif',
          fontSize: "14px",
          "&:hover": {
            backgroundColor: "#F5F5F5",
          },
          "&.Mui-selected": {
            backgroundColor: "#F0F0F0",
            "&:hover": {
              backgroundColor: "#E8E8E8",
            },
          },
        }}
      >
        <ListItemIcon>
          <AccessTimeIcon sx={{ fontSize: 20, color: "#6B6B6B" }} />
        </ListItemIcon>
        <ListItemText
          primary="Date (Oldest First)"
          sx={{
            "& .MuiTypography-root": {
              fontFamily: '"Inter", "Segoe UI", "Arial", sans-serif',
              fontSize: "14px",
              fontWeight: isSelected("date", "asc") ? 500 : 400,
            },
          }}
        />
        {isSelected("date", "asc") && (
          <CheckCircleIcon sx={{ fontSize: 18, color: "#000000", ml: 1 }} />
        )}
      </MenuItem>

      <Divider sx={{ my: 0.5 }} />

      {/* Mint ID sorting */}
      <MenuItem
        onClick={() => handleSortSelect("mint_id", "asc")}
        selected={isSelected("mint_id", "asc")}
        sx={{
          fontFamily: '"Inter", "Segoe UI", "Arial", sans-serif',
          fontSize: "14px",
          "&:hover": {
            backgroundColor: "#F5F5F5",
          },
          "&.Mui-selected": {
            backgroundColor: "#F0F0F0",
            "&:hover": {
              backgroundColor: "#E8E8E8",
            },
          },
        }}
      >
        <ListItemIcon>
          <TagIcon sx={{ fontSize: 20, color: "#6B6B6B" }} />
        </ListItemIcon>
        <ListItemText
          primary="Mint ID (A-Z)"
          sx={{
            "& .MuiTypography-root": {
              fontFamily: '"Inter", "Segoe UI", "Arial", sans-serif',
              fontSize: "14px",
              fontWeight: isSelected("mint_id", "asc") ? 500 : 400,
            },
          }}
        />
        {isSelected("mint_id", "asc") && (
          <CheckCircleIcon sx={{ fontSize: 18, color: "#000000", ml: 1 }} />
        )}
      </MenuItem>

      <MenuItem
        onClick={() => handleSortSelect("mint_id", "desc")}
        selected={isSelected("mint_id", "desc")}
        sx={{
          fontFamily: '"Inter", "Segoe UI", "Arial", sans-serif',
          fontSize: "14px",
          "&:hover": {
            backgroundColor: "#F5F5F5",
          },
          "&.Mui-selected": {
            backgroundColor: "#F0F0F0",
            "&:hover": {
              backgroundColor: "#E8E8E8",
            },
          },
        }}
      >
        <ListItemIcon>
          <TagIcon sx={{ fontSize: 20, color: "#6B6B6B" }} />
        </ListItemIcon>
        <ListItemText
          primary="Mint ID (Z-A)"
          sx={{
            "& .MuiTypography-root": {
              fontFamily: '"Inter", "Segoe UI", "Arial", sans-serif',
              fontSize: "14px",
              fontWeight: isSelected("mint_id", "desc") ? 500 : 400,
            },
          }}
        />
        {isSelected("mint_id", "desc") && (
          <CheckCircleIcon sx={{ fontSize: 18, color: "#000000", ml: 1 }} />
        )}
      </MenuItem>

      <Divider sx={{ my: 0.5 }} />

      {/* Popularity sorting */}
      <MenuItem
        onClick={() => handleSortSelect("popularity", "desc")}
        selected={isSelected("popularity", "desc")}
        sx={{
          fontFamily: '"Inter", "Segoe UI", "Arial", sans-serif',
          fontSize: "14px",
          "&:hover": {
            backgroundColor: "#F5F5F5",
          },
          "&.Mui-selected": {
            backgroundColor: "#F0F0F0",
            "&:hover": {
              backgroundColor: "#E8E8E8",
            },
          },
        }}
      >
        <ListItemIcon>
          <PeopleIcon sx={{ fontSize: 20, color: "#6B6B6B" }} />
        </ListItemIcon>
        <ListItemText
          primary="Popularity (Most Popular)"
          sx={{
            "& .MuiTypography-root": {
              fontFamily: '"Inter", "Segoe UI", "Arial", sans-serif',
              fontSize: "14px",
              fontWeight: isSelected("popularity", "desc") ? 500 : 400,
            },
          }}
        />
        {isSelected("popularity", "desc") && (
          <CheckCircleIcon sx={{ fontSize: 18, color: "#000000", ml: 1 }} />
        )}
      </MenuItem>

      <MenuItem
        onClick={() => handleSortSelect("popularity", "asc")}
        selected={isSelected("popularity", "asc")}
        sx={{
          fontFamily: '"Inter", "Segoe UI", "Arial", sans-serif',
          fontSize: "14px",
          "&:hover": {
            backgroundColor: "#F5F5F5",
          },
          "&.Mui-selected": {
            backgroundColor: "#F0F0F0",
            "&:hover": {
              backgroundColor: "#E8E8E8",
            },
          },
        }}
      >
        <ListItemIcon>
          <PeopleIcon sx={{ fontSize: 20, color: "#6B6B6B" }} />
        </ListItemIcon>
        <ListItemText
          primary="Popularity (Least Popular)"
          sx={{
            "& .MuiTypography-root": {
              fontFamily: '"Inter", "Segoe UI", "Arial", sans-serif',
              fontSize: "14px",
              fontWeight: isSelected("popularity", "asc") ? 500 : 400,
            },
          }}
        />
        {isSelected("popularity", "asc") && (
          <CheckCircleIcon sx={{ fontSize: 18, color: "#000000", ml: 1 }} />
        )}
      </MenuItem>

      <Divider sx={{ my: 0.5 }} />

      {/* Status sorting */}
      <MenuItem
        onClick={() => handleSortSelect("status", "desc")}
        selected={isSelected("status", "desc")}
        sx={{
          fontFamily: '"Inter", "Segoe UI", "Arial", sans-serif',
          fontSize: "14px",
          "&:hover": {
            backgroundColor: "#F5F5F5",
          },
          "&.Mui-selected": {
            backgroundColor: "#F0F0F0",
            "&:hover": {
              backgroundColor: "#E8E8E8",
            },
          },
        }}
      >
        <ListItemIcon>
          <CheckCircleIcon sx={{ fontSize: 20, color: "#6B6B6B" }} />
        </ListItemIcon>
        <ListItemText
          primary="Status (Active First)"
          sx={{
            "& .MuiTypography-root": {
              fontFamily: '"Inter", "Segoe UI", "Arial", sans-serif',
              fontSize: "14px",
              fontWeight: isSelected("status", "desc") ? 500 : 400,
            },
          }}
        />
        {isSelected("status", "desc") && (
          <CheckCircleIcon sx={{ fontSize: 18, color: "#000000", ml: 1 }} />
        )}
      </MenuItem>

      <MenuItem
        onClick={() => handleSortSelect("status", "asc")}
        selected={isSelected("status", "asc")}
        sx={{
          fontFamily: '"Inter", "Segoe UI", "Arial", sans-serif',
          fontSize: "14px",
          "&:hover": {
            backgroundColor: "#F5F5F5",
          },
          "&.Mui-selected": {
            backgroundColor: "#F0F0F0",
            "&:hover": {
              backgroundColor: "#E8E8E8",
            },
          },
        }}
      >
        <ListItemIcon>
          <CheckCircleIcon sx={{ fontSize: 20, color: "#6B6B6B" }} />
        </ListItemIcon>
        <ListItemText
          primary="Status (Inactive First)"
          sx={{
            "& .MuiTypography-root": {
              fontFamily: '"Inter", "Segoe UI", "Arial", sans-serif',
              fontSize: "14px",
              fontWeight: isSelected("status", "asc") ? 500 : 400,
            },
          }}
        />
        {isSelected("status", "asc") && (
          <CheckCircleIcon sx={{ fontSize: 18, color: "#000000", ml: 1 }} />
        )}
      </MenuItem>
    </Menu>
  );
};

export default SortMenu;

