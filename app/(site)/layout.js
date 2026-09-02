import React from 'react';
import { getSnapshot } from '../../lib/snapshot';
import { LeagueProvider } from '../../lib/LeagueContext';
import Shell from '../../components/site/Shell';

export const revalidate = 60;

export default async function SiteLayout({ children }) {
  const snapshot = await getSnapshot();
  return (
    <LeagueProvider initial={snapshot}>
      <Shell>{children}</Shell>
    </LeagueProvider>
  );
}
