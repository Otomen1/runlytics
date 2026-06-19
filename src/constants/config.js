// Central config — all tunables in one place
export const SYNC_COOLDOWN_MS   = 60 * 1000;        // min gap between Strava syncs
export const SYNC_INTERVAL_MS   = 5 * 60 * 1000;    // background sync polling interval
export const PULL_THRESHOLD_PX  = 60;               // pull-to-refresh activation distance
export const PULL_MAX_PX        = 110;              // max pull overdraw
export const UNDO_WINDOW_MS     = 3500;             // ms before a delete is committed to IDB
export const MAX_PHOTO_MB       = 10;               // max photo upload size
export const ROUTE_MAX_PTS      = 500;              // max route points stored per activity
export const TOAST_DURATION_MS  = 4000;             // milestone toast auto-dismiss
