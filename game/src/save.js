// Port Solano — save and load.
// The storage is injected (localStorage in the browser, a Map-backed fake
// in tests), so the round-trip is testable without a browser.
export const SAVE_KEY = 'port-solano-save-v1';
export const SAVE_VERSION = 1;

export function defaultSave() {
  return {
    version: SAVE_VERSION,
    cash: 250,
    completedMissions: [],
    activeMissionId: null,
    stats: { carsStolen: 0, missionsDone: 0, wantedMax: 0, distanceDriven: 0 },
    player: { x: 24, z: 96, heading: 0, health: 100 },
    savedAt: new Date().toISOString(),
  };
}

export function createSaveSystem(storage) {
  return {
    save(state) {
      const record = { ...state, version: SAVE_VERSION, savedAt: new Date().toISOString() };
      storage.setItem(SAVE_KEY, JSON.stringify(record));
      return record;
    },
    load() {
      const raw = storage.getItem(SAVE_KEY);
      if (!raw) return null;
      try {
        const data = JSON.parse(raw);
        if (data.version !== SAVE_VERSION) return null;
        return data;
      } catch {
        return null;
      }
    },
    clear() {
      storage.removeItem(SAVE_KEY);
    },
  };
}
