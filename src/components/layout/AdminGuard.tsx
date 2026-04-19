import React, { useEffect } from 'react';
import type { User } from '../../types';

export interface AdminGuardProps {
  user: User;
  onRedirect: () => void;
  children: React.ReactNode;
}

export const AdminGuard: React.FC<AdminGuardProps> = ({ user, onRedirect, children }) => {
  useEffect(() => {
    if (user.role !== 'admin') {
      onRedirect();
    }
  }, [user, onRedirect]);

  if (user.role !== 'admin') {
    return null;
  }

  return <>{children}</>;
};
