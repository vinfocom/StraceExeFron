import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { homeApi } from '../api/apiEndpoints';
import { sha256 } from 'js-sha256';
import { setAuthErrorHandler } from '../api/apiService';
import { AuthContext } from './AuthContextBase'; // Import from Base
import { clearProjectSessionCache } from '../utils/projectSessionCache';

const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);
  
  const navigate = useNavigate();

  const clearSession = useCallback(() => {
    setUser(null);
    setAuthError(null);
    sessionStorage.removeItem('user');
    clearProjectSessionCache();
  }, []);

  const handleAuthError = useCallback(() => {
    clearSession();
    navigate('/login', { replace: true });
  }, [clearSession, navigate]);

  useEffect(() => {
    const verifyAuthStatus = async () => {
      try {
        const cachedUser = sessionStorage.getItem('user');
        
        const response = await homeApi.getAuthStatus();
        
        if (response?.user) {
          setUser(response.user);
          sessionStorage.setItem('user', JSON.stringify(response.user));
        } else if (cachedUser && cachedUser !== 'undefined') {
          // API returned success but no user object — trust the cache
          try {
            setUser(JSON.parse(cachedUser));
          } catch {
            clearSession();
          }
        } else {
          clearSession();
        }
      } catch (error) {
        // On 401/403, only clear session if there's no cached user. 
        // If there IS a cached user, trust it — the session cookie may just be 
        // slow to propagate right after a fresh login.
        const cachedUser = sessionStorage.getItem('user');
        const isAuth = error.status === 401 || error.status === 403 || error.isAuthError;
        
        if (isAuth) {
          clearSession();
        } else if (cachedUser && cachedUser !== 'undefined') {
          // Keep cached user only for non-auth/network failures.
          try {
            setUser(JSON.parse(cachedUser));
          } catch {
            clearSession();
          }
        } else {
          clearSession();
        }
      } finally {
        setLoading(false);
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
        navigate('/login', { replace: true });
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [clearSession, navigate]);

  const login = async ({ Email, Password, IP = '', ForceLogin = false }) => {
    try {
      setAuthError(null);
      setLoading(true);
      
      const hashed = sha256(Password || '');
      const response = await homeApi.login({ Email, Password: hashed, IP, ForceLogin });

      if (response.success) {
        const userData = response.user;
        
        setUser(userData);
        sessionStorage.setItem('user', JSON.stringify(userData));
        
        return { success: true, user: userData };
      } else {
        const errorMessage = response.message || 'Login failed';
        setAuthError(errorMessage);
        return { success: false, message: errorMessage };
      }
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'Login failed';
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
      navigate('/login', { replace: true });
    }
  };

  const isAuthenticated = useCallback(() => !!user, [user]);

  const updateUser = useCallback((updates) => {
    setUser((prevUser) => {
      if (!prevUser) return null;
      const updatedUser = { ...prevUser, ...updates };
      sessionStorage.setItem('user', JSON.stringify(updatedUser));
      return updatedUser;
    });
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const response = await homeApi.getAuthStatus();
      if (response?.user) {
        setUser(response.user);
        sessionStorage.setItem('user', JSON.stringify(response.user));
        return response.user;
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
