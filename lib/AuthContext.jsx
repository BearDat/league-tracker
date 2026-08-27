'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from './supabaseClient';

// Admin accounts log in with a username, not a real email — Supabase Auth
// still requires an email-shaped identifier under the hood, so a username
// of "jane" is actually stored (and signed in) as "jane@admin.local". See
// supabase/schema.sql for how accounts are created with this convention.
const USERNAME_LOGIN_DOMAIN = 'admin.local';
const usernameToEmail = (username) => `${username.trim().toLowerCase()}@${USERNAME_LOGIN_DOMAIN}`;

// UI-level role tiers — every admin account still shares the same database
// write access (see schema.sql), this just drives which buttons/tabs the
// app shows each person. Someone who can't reach an action through the UI
// can't reach it at all, but the roles aren't a database-enforced boundary.
export const ROLE_LABELS = {
  site_owner: 'Site Owner',
  commissioner: 'Commissioner',
  board: 'Board of Directors',
  manager: 'Manager',
  stat_mod: 'Stat Mod',
  media: 'Media',
};
const ALL_PERMS = ['manageAdmins', 'manageSettings', 'manageSeasons', 'manageRosters', 'manageRosterMoves', 'manageSchedule', 'manageNews', 'manageAwards', 'manageLeagueInfo'];
// Board of Directors runs day-to-day league operations at Commissioner
// scope, minus manageAdmins (Site Owner-exclusive, so role-granting can't be
// handed out any further than that) and minus manageSettings — season
// settings, appearance colors, and the external import tools stay a
// Commissioner/Site Owner call, so Board can't quietly change how the
// league itself is configured while still running everything on top of it.
//
// Manager (a team GM) sits between Stat Mod and Board: on top of Stat Mod's
// schedule access, a Manager can open the GM tab and browse rosters, edit
// minor player fields, and park a trade as a proposal for review — but
// manageRosterMoves (signing, releasing, banning, suspending, and executing
// a trade instantly or out of the pending-proposals queue) stays a
// Board-and-up call, so a Manager can't move a player without someone at
// that level confirming it.
const ROLE_PERMISSIONS = {
  site_owner: ALL_PERMS,
  commissioner: ['manageSettings', 'manageSeasons', 'manageRosters', 'manageRosterMoves', 'manageSchedule', 'manageNews', 'manageAwards', 'manageLeagueInfo'],
  board: ['manageSeasons', 'manageRosters', 'manageRosterMoves', 'manageSchedule', 'manageNews', 'manageAwards', 'manageLeagueInfo'],
  manager: ['manageRosters', 'manageSchedule'],
  stat_mod: ['manageSchedule'],
  media: ['manageNews'],
};

const AuthContext = createContext({
  session: null,
  user: null,
  isLoggedIn: false,
  authLoading: true,
  role: null,
  roleLabel: null,
  roleLoading: false,
  hasPermission: () => false,
  login: async () => ({ error: 'not ready' }),
  logout: async () => {},
});

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [role, setRole] = useState(null);
  const [roleLoading, setRoleLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) { setRole(null); return; }
    let cancelled = false;
    setRoleLoading(true);
    supabase.from('admin_roles').select('role').eq('user_id', userId).single()
      .then(({ data }) => { if (!cancelled) setRole(data?.role || null); })
      .catch(() => { if (!cancelled) setRole(null); })
      .finally(() => { if (!cancelled) setRoleLoading(false); });
    return () => { cancelled = true; };
  }, [session?.user?.id]);

  const login = useCallback(async (username, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email: usernameToEmail(username), password });
    if (error) return { error: error.message };
    setSession(data.session);
    return { error: null };
  }, []);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setRole(null);
  }, []);

  const hasPermission = useCallback((perm) => (role ? (ROLE_PERMISSIONS[role] || []).includes(perm) : false), [role]);

  const value = {
    session,
    user: session?.user || null,
    isLoggedIn: !!session,
    authLoading,
    role,
    roleLabel: role ? (ROLE_LABELS[role] || role) : null,
    roleLoading,
    hasPermission,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
