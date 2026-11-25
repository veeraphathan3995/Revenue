import React from 'react';
import { RevenueWorkspaceProvider } from './_components/WorkspaceContext';

export default function RevenueLayout({ children }: { children: React.ReactNode }) {
  return <RevenueWorkspaceProvider>{children}</RevenueWorkspaceProvider>;
}
