// Generic benchmarks, deliberately not labeled as official unit datasheets.
export const attacks = [
  {
    label: "Rifle squad",
    values: {
      name: "Rifle squad",
      models: 5,
      attacks: 2,
      skill: 3,
      strength: 4,
      ap: 0,
      damage: 1,
    },
  },
  {
    label: "Heavy melee squad",
    values: {
      name: "Heavy melee squad",
      models: 5,
      attacks: 3,
      skill: 3,
      strength: 5,
      ap: -2,
      damage: 2,
    },
  },
  {
    label: "Anti-tank gun",
    values: {
      name: "Anti-tank gun",
      models: 1,
      attacks: 2,
      skill: 3,
      strength: 12,
      ap: -3,
      damage: "D6+1",
    },
  },
  {
    label: "Flamer squad",
    values: {
      name: "Flamer squad",
      models: 5,
      attacks: "D6",
      skill: 3,
      strength: 4,
      ap: 0,
      damage: 1,
      torrent: true,
    },
  },
];
export const targets = [
  {
    label: "Light infantry",
    values: { models: 10, wounds: 1, toughness: 3, save: 5 },
  },
  {
    label: "Armoured infantry",
    values: { models: 5, wounds: 2, toughness: 4, save: 3 },
  },
  {
    label: "Heavy elite infantry",
    values: { models: 5, wounds: 3, toughness: 5, save: 2, invulnerable: 4 },
  },
  {
    label: "Medium vehicle",
    values: { models: 1, wounds: 12, toughness: 10, save: 3 },
  },
  {
    label: "Large monster",
    values: { models: 1, wounds: 14, toughness: 11, save: 3, invulnerable: 4 },
  },
];
