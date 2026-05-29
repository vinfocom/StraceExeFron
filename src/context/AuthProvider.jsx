import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { homeApi } from '../api/apiEndpoints';
import { sha256 } from 'js-sha256';
import { setAuthErrorHandler } from '../api/apiService';
import { AuthContext } from './AuthContextBase'; // Import from Base
import {
  clearProjectSessionCache,
  setProjectSessionCacheUserScope,
} from '../utils/projectSessionCache';

const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);
  const authRequestVersionRef = useRef(0);

  const navigate = useNavigate();

  const isSuccessResponse = (response) =>
    response?.success === true || response?.Status === 1 || response?.status === 1;

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
    sessionStorage.removeItem('user');
    clearProjectSessionCache();
  }, []);

  const handleAuthError = useCallback(() => {
    clearSession();
    navigate('/', { replace: true });
  }, [clearSession, navigate]);

  useEffect(() => {
    const verifyAuthStatus = async () => {
      const requestVersion = ++authRequestVersionRef.current;
      try {
        const response = await homeApi.getAuthStatus();
        if (requestVersion !== authRequestVersionRef.current) return;

        const authUser = extractUserFromResponse(response);
        if (authUser) {
          setUser(authUser);
          sessionStorage.setItem('user', JSON.stringify(authUser));
          setProjectSessionCacheUserScope(authUser);
        } else {
          clearSession();
        }
      } catch {
        if (requestVersion !== authRequestVersionRef.current) return;
        clearSession();
      } finally {
        if (requestVersion === authRequestVersionRef.current) {
          setLoading(false);
        }
      }
    };

    verifyAuthStatus();
  }, [clearSession]);

  useEffect(() => {
    setAuthErrorHandler(handleAuthError);
    return () => setAuthErrorHandler(null);
  }, [handleAuthError]);

  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === 'logout-event') {
        clearSession();
        navigate('/', { replace: true });
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [clearSession, navigate]);

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

      // Try modern flow first (plain password), then legacy fallback (sha256 pre-hash).
      let response = await homeApi.login({
        ...basePayload,
        Password: Password || '',
      });

      if (!isSuccessResponse(response)) {
        const message = String(
          response?.message ||
          response?.Message ||
          response?.data?.message ||
          response?.data?.Message ||
          ''
        ).toLowerCase();

        if (message.includes('invalid email or password')) {
          response = await homeApi.login({
            ...basePayload,
            Password: sha256(Password || ''),
          });
        }
      }

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
        sessionStorage.setItem('user', JSON.stringify(userData));
        setProjectSessionCacheUserScope(userData);

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
      return { success: false, message: errorMessage };
    } catch (error) {
      const errorMessage =
        error.response?.data?.message ||
        error.response?.data?.Message ||
        error.response?.data?.error ||
        error.message ||
        'Login failed';
      setAuthError(errorMessage);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      setLoading(true);

      await homeApi.logout();

      localStorage.setItem('logout-event', Date.now().toString());
      localStorage.removeItem('logout-event');
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
      sessionStorage.setItem('user', JSON.stringify(updatedUser));
      setProjectSessionCacheUserScope(updatedUser);
      return updatedUser;
    });
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const response = await homeApi.getAuthStatus();
      const authUser = extractUserFromResponse(response);
      if (authUser) {
        setUser(authUser);
        sessionStorage.setItem('user', JSON.stringify(authUser));
        setProjectSessionCacheUserScope(authUser);
        return authUser;
      }
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        clearSession();
      }
    }
    return null;
  }, [clearSession]);

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
