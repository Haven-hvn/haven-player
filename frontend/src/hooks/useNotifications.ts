/**
 * useNotifications - Focused hook for notification state management
 * 
 * Extracted from App.tsx to reduce monolithic state and prevent cascading re-renders.
 * Manages snackbar notifications with different severity levels.
 */

import { useState, useCallback } from 'react';

export type NotificationSeverity = 'error' | 'warning' | 'info' | 'success';

export interface NotificationState {
  open: boolean;
  message: string;
  severity: NotificationSeverity;
}

interface UseNotificationsReturn {
  notification: NotificationState;
  showNotification: (message: string, severity: NotificationSeverity) => void;
  showError: (message: string) => void;
  showSuccess: (message: string) => void;
  showWarning: (message: string) => void;
  showInfo: (message: string) => void;
  hideNotification: () => void;
}

const initialState: NotificationState = {
  open: false,
  message: '',
  severity: 'info',
};

export const useNotifications = (): UseNotificationsReturn => {
  const [notification, setNotification] = useState<NotificationState>(initialState);

  const showNotification = useCallback((message: string, severity: NotificationSeverity) => {
    setNotification({ open: true, message, severity });
  }, []);

  const showError = useCallback((message: string) => {
    setNotification({ open: true, message, severity: 'error' });
  }, []);

  const showSuccess = useCallback((message: string) => {
    setNotification({ open: true, message, severity: 'success' });
  }, []);

  const showWarning = useCallback((message: string) => {
    setNotification({ open: true, message, severity: 'warning' });
  }, []);

  const showInfo = useCallback((message: string) => {
    setNotification({ open: true, message, severity: 'info' });
  }, []);

  const hideNotification = useCallback(() => {
    setNotification((prev: NotificationState) => ({ ...prev, open: false }));
  }, []);

  return {
    notification,
    showNotification,
    showError,
    showSuccess,
    showWarning,
    showInfo,
    hideNotification,
  };
};

export default useNotifications;
