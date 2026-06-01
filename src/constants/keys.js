// localStorage keys — only lightweight prefs live here.
// Heavy activity data lives in IndexedDB (see db/indexedDB.js).
export const DATA_KEY           = 'runlytics_data_v1';   // legacy: migration read-only
export const GOALS_KEY          = 'runlytics_goals_v1';
export const HR_KEY             = 'runlytics_hr_profile_v1';
export const PROFILE_KEY        = 'runlytics_profile_v1';
export const TASKS_KEY          = 'runlytics_tasks_v2';
export const BADGES_KEY         = 'runlytics_badges_v1';
export const TIERS_KEY          = 'runlytics_tiers_v1';
export const TAB_KEY            = 'runlytics_tab_v1';
export const STRAVA_KEY         = 'runlytics_strava_v1';
export const EDITOR_PRESETS_KEY = 'runlytics_share_presets_v1';

export const SHOES_KEY          = 'runlytics_shoes_v1';
export const ONBOARDING_KEY     = 'runlytics_onboarding_v1';
export const MILESTONES_KEY     = 'runlytics_milestones_v1';
export const THEME_KEY          = 'runlytics_theme_v1';

// IndexedDB identifiers
export const IDB_NAME     = 'runlytics_db';
export const IDB_VERSION  = 2;
export const IDB_ACTS     = 'activities';
export const IDB_PHOTOS   = 'photos';
export const IDB_MIGRATED = 'runlytics_idb_v1';
