import { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Initialize user from localStorage
  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    const storedToken = localStorage.getItem('token');

    if (storedUser && storedToken) {
      setUser(JSON.parse(storedUser));
    }
    setLoading(false);
  }, []);

  const login = (userData, token) => {
    localStorage.setItem('user', JSON.stringify(userData));
    localStorage.setItem('token', token);
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    setUser(null);
  };

  const isAuthenticated = !!user;
  const isOrganizer = user?.role === 'ORGANIZER';
  // Keep isAdmin for backward compatibility with existing components.
  const isAdmin = isOrganizer || user?.role === 'ADMIN';
  const isStudent = user?.role === 'STUDENT';
  const isCheckInStaff = user?.role === 'CHECKIN_STAFF';

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAuthenticated,
        isOrganizer,
        isAdmin,
        isStudent,
        isCheckInStaff,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
