import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { homeApi } from '../api/apiEndpoints';
import { setAuthErrorHandler } from '../api/apiService';
import { AuthContext } from './AuthContextBase'; // Import from Base
import {
  clearProjectSessionCache,
  setProjectSessionCacheUserScope,
} from '../utils/projectSessionCache';
import {
  clearStoredUser,
  readStoredUser,
  writeStoredUser,
} from '../utils/authSession';

const TRANSITION_INTENT_KEY = 'authTransitionIntent';
const LOGIN_EVENT_KEY = 'login-event';
const LOGOUT_EVENT_KEY = 'logout-event';

const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => readStoredUser());
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);
  const authRequestVersionRef = useRef(0);

  const navigate = useNavigate();

  const isSuccessResponse = (response) =>
    response?.success === true ||
    response?.Status === 1 ||
    response?.status === 1 ||
    String(response?.message || '').toLowerCase() === 'login successful';

  const extractUserFromResponse = (response) => {
    if (!response) return null;

    return (
      response?.user ||
      response?.User ||
      response?.data?.user ||
      response?.data?.User ||
      response?.Data?.user ||
      response?.Data?.User ||
      response?.Data ||
      response?.data ||
      null
    );
  };

  const clearSession = useCallback(() => {
    setUser(null);
    setAuthError(null);
    clearStoredUser();
    clearProjectSessionCache();
  }, []);

  useEffect(() => {
    if (user) {
      setProjectSessionCacheUserScope(user);
    }
  }, [user]);

  const refreshUser = useCallback(async () => {
    try {
      const response = await homeApi.getAuthStatus();
      const authUser = extractUserFromResponse(response);
      if (authUser) {
        setUser(authUser);
        writeStoredUser(authUser);
        setProjectSessionCacheUserScope(authUser);
        setAuthError(null);
        return authUser;
      }
      clearSession();
      return null;
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        clearSession();
        return null;
      }
      throw error;
    }
  }, [clearSession]);

  const handleAuthError = useCallback(() => {
    clearSession();
    navigate('/', { replace: true });
  }, [clearSession, navigate]);

  useEffect(() => {
    const verifyAuthStatus = async () => {
      const requestVersion = ++authRequestVersionRef.current;
      try {
        const authUser = await refreshUser();
        if (requestVersion !== authRequestVersionRef.current) return;
        if (authUser) {
          return;
        }
      } catch (error) {
        if (requestVersion !== authRequestVersionRef.current) return;
        setAuthError(error?.message || 'Unable to verify your session right now.');
      } finally {
        if (requestVersion === authRequestVersionRef.current) {
          setLoading(false);
        }
      }
    };

    verifyAuthStatus();
  }, [clearSession, refreshUser]);

  useEffect(() => {
    setAuthErrorHandler(handleAuthError);
    return () => setAuthErrorHandler(null);
  }, [handleAuthError]);

  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === LOGIN_EVENT_KEY && e.newValue) {
        authRequestVersionRef.current += 1;
        setLoading(true);
        refreshUser().finally(() => {
          setLoading(false);
        });
        return;
      }

      if (e.key === LOGOUT_EVENT_KEY) {
        clearSession();
        navigate('/', { replace: true });
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [clearSession, navigate, refreshUser]);

  const login = async ({ Email, Password, IP = '', ForceLogin = false, country_code }) => {
    try {
      setAuthError(null);
      setLoading(true);
      authRequestVersionRef.current += 1;

      const basePayload = {
        Email,
        IP,
        ForceLogin,
      };
      if (country_code) {
        basePayload.country_code = country_code;
      }

      const response = await homeApi.login({
        ...basePayload,
        Password: Password || '',
      });

if (isSuccessResponse(response)) {
          let userData = extractUserFromResponse(response);

          if (!userData) {
            try {
              const statusResponse = await homeApi.getAuthStatus();
              userData = extractUserFromResponse(statusResponse);
            } catch {
              // Handled below.
            }
          }

        if (!userData) {
          const errorMessage = 'Login succeeded but no authenticated user context was returned.';
          setAuthError(errorMessage);
          clearSession();
          return { success: false, message: errorMessage };
        }

        clearProjectSessionCache();
        setUser(userData);
        writeStoredUser(userData);
        setProjectSessionCacheUserScope(userData);
        localStorage.setItem(LOGIN_EVENT_KEY, Date.now().toString());
        localStorage.removeItem(LOGIN_EVENT_KEY);

        return { success: true, user: userData };
      }

      const errorMessage =
        response?.message ||
        response?.Message ||
        response?.data?.message ||
        response?.data?.Message ||
        response?.Data?.message ||
        response?.Data?.Message ||
        'Login failed';
      setAuthError(errorMessage);
      return {
        success: false,
        message: errorMessage,
        already_logged_in:
          response?.already_logged_in ??
          response?.AlreadyLoggedIn ??
          response?.data?.already_logged_in ??
          response?.data?.AlreadyLoggedIn ??
          false,
        can_force_logout:
          response?.can_force_logout ??
          response?.CanForceLogout ??
          response?.data?.can_force_logout ??
          response?.data?.CanForceLogout ??
          false,
        active_login:
          response?.active_login ??
          response?.ActiveLogin ??
          response?.data?.active_login ??
          response?.data?.ActiveLogin ??
          null,
      };
    } catch (error) {
      const errorMessage =
        error.data?.message ||
        error.data?.Message ||
        error.data?.error ||
        error.response?.data?.message ||
        error.response?.data?.Message ||
        error.response?.data?.error ||
        error.message ||
        'Login failed';
      setAuthError(errorMessage);
      error.active_login =
        error?.response?.data?.active_login ??
        error?.response?.data?.ActiveLogin ??
        null;
      error.already_logged_in =
        error?.response?.data?.already_logged_in ??
        error?.response?.data?.AlreadyLoggedIn ??
        false;
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      sessionStorage.setItem(TRANSITION_INTENT_KEY, 'logout');
      setLoading(true);

      await homeApi.logout();

      localStorage.setItem(LOGOUT_EVENT_KEY, Date.now().toString());
      localStorage.removeItem(LOGOUT_EVENT_KEY);
    } catch (error) {
      console.warn('Logout API failed; clearing local session anyway.', error);
    } finally {
      clearSession();
      setLoading(false);
      navigate('/', { replace: true });
    }
  };

  const isAuthenticated = useCallback(() => !!user, [user]);

  const updateUser = useCallback((updates) => {
    setUser((prevUser) => {
      if (!prevUser) return null;
      const updatedUser = { ...prevUser, ...updates };
      writeStoredUser(updatedUser);
      setProjectSessionCacheUserScope(updatedUser);
      return updatedUser;
    });
  }, []);

  const contextValue = {
    user,
    loading,
    authError,
    isLoggedIn: !!user,
    login,
    logout,
    isAuthenticated,
    clearSession,
    updateUser,
    refreshUser,
    setAuthError,
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthProvider;
