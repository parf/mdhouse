import { createContext } from 'preact';
import { useContext } from 'preact/hooks';

/**
 * Team access is active (`Settings.team`): Git, Run Flow, the Agent Bus and RAG are refused by the server for now, so
 * their controls are not offered. Set once at the root of the app; reading, Files and editing are unaffected.
 */
export const TeamContext = createContext(false);
export const useTeam = (): boolean => useContext(TeamContext);
