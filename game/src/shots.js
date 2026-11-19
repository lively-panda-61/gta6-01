// Port Solano — screenshot staging.
// A ?shot=<name> URL parameter puts the game into a deterministic,
// menu-free scene for the screenshot capture: the cover shows a police
// chase with the HUD, drive shows the coast road, combat shows a
// firefight at the plaza, and vista shows the downtown skyline.
export function applyShot(game, name) {
  const g = game;
  g.startPlaying({ silent: true });
  if (name === 'cover') {
    // Chase: the player in a sports car on Palma Avenue, wanted 3, two
    // police cars on the tail, the cash-drop mission active. The car
    // drives itself so the shot catches it at speed, clear of any pole
    // that happened to stand behind it.
    g.placePlayerInCar(24, 72, Math.PI, 'sports');
    g.autoDrive = true;
    g.police.addWanted(3, 'staged chase');
    g.police.spawnNear(g.playerPos(), 2);
    g.missions.start('m5-cash-drop');
  } else if (name === 'drive') {
    // Coastal cruise down Marina Way (road z=168), mission one active.
    g.placePlayerInCar(-120, 168, Math.PI / 2, 'sedan');
    g.autoDrive = true;
    g.missions.start('m1-first-job');
  } else if (name === 'combat') {
    // Firefight at Civic Plaza: the player on foot at the plaza's south
    // edge, facing north into Marlow's crew, mission three running.
    g.teleportPlayer(48, 66, 0);
    g.missions.start('m3-turf-war');
    g.combat.spawnEnemies([[48, 48], [56, 44], [40, 44]]);
    g.police.addWanted(2, 'staged shootout');
    g.player.aiming = true;
  } else if (name === 'vista') {
    // Skyline: high camera over Downtown, the tower and the bay beyond.
    g.placePlayerInCar(24, 120, 0, 'sedan');
    g.setVistaCamera(
      { x: 150, y: 95, z: 190 },
      { x: 0, y: 35, z: -20 },
    );
    g.missions.start('m2-harbor-run');
  }
}
