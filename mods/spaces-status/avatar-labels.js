// Display names only. Original IDs, sources and attribution stay in the catalog.
const names = {
    "arachnid-icon": "Spider", "atmosian-icon": "Engineer", "bee-icon": "Bee",
    "carp-carpplush": "Carp", "carp-magicplush": "Magic carp", "carp-holoplush": "Holographic carp",
    "carp-rainbowcarpplush": "Rainbow carp", "diona-plushie_diona": "Leafling",
    "diona-plushie_diona1": "Sprout", "expi-icon": "Explorer", "hampter-icon": "Hamster",
    "human-icon": "Crewmate", "lamp-icon": "Lamp", "lizard-icon": "Lizard",
    "lizard-plushie_spacelizard": "Space lizard", "lizard-rainbowlizardplush": "Rainbow lizard",
    "lizard-plushie_lizard_inversed": "Pale lizard", "moth-icon": "Moth", "narsie-icon": "Crimson",
    "nukie-icon": "Operative", "penguin-icon": "Penguin", "ratvar-icon": "Clockwork",
    "rouny-icon": "Runner", "shark-blue": "Blue shark", "shark-pink": "Pink shark",
    "shark-grey": "Grey shark", "sheep-sheeptoy": "Sheep", "sheep-spacesheeptoy": "Space sheep",
    "slime-icon": "Slime", "snake-icon": "Snake", "vox-icon": "Bird", "xeno-icon": "Alien",
};
export const characterLabel = (id) => names[id.replace(/^ss14-/, "")] ?? "Character";
