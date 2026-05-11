#!/usr/bin/env node
// One-shot backfill for SRD 5.1 species ability score increases.
// The seed data shipped with `abilityScoreIncreases: []` everywhere,
// which is correct for 2024 species (Custom Origin) but wrong for 5.1
// (canonical fixed bonuses — Dwarf +2 CON, Elf +2 DEX, etc.). Run once
// to patch the JSON, then commit the result.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataPath = path.join(__dirname, '..', 'packages/content/src/srd/data/species.json');

const ASI = {
  'dragonborn-srd-5-1': [
    { ability: 'strength', amount: 2 },
    { ability: 'charisma', amount: 1 },
  ],
  'dwarf-srd-5-1':      [{ ability: 'constitution', amount: 2 }],
  'hill-dwarf-srd-5-1': [
    { ability: 'constitution', amount: 2 },
    { ability: 'wisdom',       amount: 1 },
  ],
  'elf-srd-5-1':        [{ ability: 'dexterity', amount: 2 }],
  'high-elf-srd-5-1':   [
    { ability: 'dexterity',    amount: 2 },
    { ability: 'intelligence', amount: 1 },
  ],
  'gnome-srd-5-1':      [{ ability: 'intelligence', amount: 2 }],
  'rock-gnome-srd-5-1': [
    { ability: 'intelligence', amount: 2 },
    { ability: 'constitution', amount: 1 },
  ],
  'half-elf-srd-5-1':   [{ ability: 'charisma', amount: 2 }],
  'half-orc-srd-5-1':   [
    { ability: 'strength',     amount: 2 },
    { ability: 'constitution', amount: 1 },
  ],
  'halfling-srd-5-1':   [{ ability: 'dexterity', amount: 2 }],
  'lightfoot-srd-5-1':  [
    { ability: 'dexterity', amount: 2 },
    { ability: 'charisma',  amount: 1 },
  ],
  'human-srd-5-1': [
    { ability: 'strength',     amount: 1 },
    { ability: 'dexterity',    amount: 1 },
    { ability: 'constitution', amount: 1 },
    { ability: 'intelligence', amount: 1 },
    { ability: 'wisdom',       amount: 1 },
    { ability: 'charisma',     amount: 1 },
  ],
  'tiefling-srd-5-1': [
    { ability: 'charisma',     amount: 2 },
    { ability: 'intelligence', amount: 1 },
  ],
};

// Half-Elf 5.1 player choice: +1 to two non-CHA abilities on top of
// the fixed +2 CHA. (Variant Human would also use this shape if/when
// we ship it.)
const CHOICES = {
  'half-elf-srd-5-1': [
    {
      count: 2,
      amount: 1,
      from: ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom'],
    },
  ],
};

const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
let patched = 0;
for (const entry of data) {
  if (ASI[entry.key]) {
    entry.abilityScoreIncreases = ASI[entry.key];
    patched++;
  }
  if (CHOICES[entry.key]) {
    entry.abilityScoreChoices = CHOICES[entry.key];
  }
}
fs.writeFileSync(dataPath, JSON.stringify(data, null, 2) + '\n');
console.log(`Patched ${patched} species entries.`);
