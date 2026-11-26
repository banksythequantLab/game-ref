// Builds public/games.json: the built-in game library, pulled from Wikipedia (CC BY-SA 4.0) with the
// same rules filter the app uses, so the games ship inside the app and work offline.
// Run: node tools/bundle-games.ts   (Node 22.18+ runs TypeScript directly)
import { writeFileSync } from "node:fs";
import { gameFromWikiPage } from "../src/rules-text.ts";

type Entry = [title: string, name: string];
const LIBRARY: Record<string, Entry[]> = {
  "Card games": [
    ["Uno (card game)", "Uno"], ["Gin rummy", "Gin Rummy"], ["Rummy", "Rummy"], ["Spades (card game)", "Spades"],
    ["Hearts (card game)", "Hearts"], ["Euchre", "Euchre"], ["Cribbage", "Cribbage"], ["Contract bridge", "Bridge"],
    ["Blackjack", "Blackjack"], ["Go Fish", "Go Fish"], ["War (card game)", "War"],
    ["Klondike (solitaire)", "Solitaire (Klondike)"], ["Canasta", "Canasta"], ["Pinochle", "Pinochle"],
    ["Old maid (card game)", "Old Maid"], ["Egyptian Ratscrew", "Egyptian Ratscrew"], ["President (card game)", "President"],
    ["Phase 10", "Phase 10"], ["Skip-Bo", "Skip-Bo"], ["Speed (card game)", "Speed"], ["Cheat (game)", "Cheat / BS"],
    ["Slapjack", "Slapjack"], ["Kings in the Corner", "Kings in the Corner"], ["Spit (card game)", "Spit"],
  ],
  "Poker": [
    ["Poker", "Poker (basics & betting)"], ["List of poker hands", "Poker hand rankings"], ["Betting in poker", "Poker betting rules"],
    ["Texas hold 'em", "Texas Hold 'em"], ["Omaha hold 'em", "Omaha"], ["Seven-card stud", "Seven-Card Stud"],
    ["Five-card draw", "Five-Card Draw"], ["Razz (poker)", "Razz"], ["Pineapple (poker)", "Pineapple"],
    ["Six-plus hold 'em", "Short Deck (6+) Hold 'em"], ["Badugi", "Badugi"], ["Lowball (poker)", "Lowball (2-7 / A-5)"],
    ["Chinese poker", "Chinese Poker"], ["Pai gow poker", "Pai Gow Poker"], ["Three card poker", "Three Card Poker"],
    ["Let It Ride", "Let It Ride"], ["Caribbean stud poker", "Caribbean Stud"], ["High-low split", "Hi-Lo Split"],
  ],
  "Board games": [
    ["Monopoly (game)", "Monopoly"], ["Scrabble", "Scrabble"], ["Backgammon", "Backgammon"], ["Connect Four", "Connect Four"],
    ["Cluedo", "Clue"], ["Risk (game)", "Risk"], ["Catan", "Catan"], ["Sorry! (game)", "Sorry!"],
    ["Trouble (board game)", "Trouble"], ["Parcheesi", "Parcheesi"], ["Go (game)", "Go"], ["Chinese checkers", "Chinese Checkers"],
    ["Snakes and ladders", "Chutes and Ladders"], ["Kalah", "Mancala (Kalah)"], ["Battleship (game)", "Battleship"],
    ["Reversi", "Othello / Reversi"], ["Ticket to Ride (board game)", "Ticket to Ride"], ["Stratego", "Stratego"],
    ["Mahjong", "Mahjong"], ["Dominoes", "Dominoes"], ["Mexican Train", "Mexican Train"], ["Mastermind (board game)", "Mastermind"],
    ["Trivial Pursuit", "Trivial Pursuit"], ["Boggle", "Boggle"], ["Candy Land", "Candy Land"], ["Guess Who?", "Guess Who?"],
  ],
  "Dice & party games": [
    ["Yahtzee", "Yahtzee"], ["Farkle", "Farkle"], ["Bunco", "Bunco"], ["Liar's dice", "Liar's Dice"], ["Jenga", "Jenga"],
    ["Pictionary", "Pictionary"], ["Charades", "Charades"], ["Scattergories", "Scattergories"], ["Tic-tac-toe", "Tic-tac-toe"],
  ],
  "Yard, bar & table sports": [
    ["Cornhole", "Cornhole"], ["Beer pong", "Beer Pong"], ["Darts", "Darts"], ["Eight-ball", "Pool (8-Ball)"],
    ["Bocce", "Bocce"], ["Horseshoes", "Horseshoes"], ["Pickleball", "Pickleball"], ["Table tennis", "Ping Pong"],
    ["Roundnet", "Spikeball"], ["Croquet", "Croquet"], ["Shuffleboard", "Shuffleboard"], ["Foosball", "Foosball"],
  ],
};

const UA = "GameRef/1.0 (https://github.com/banksythequantLab/game-ref; hackathon demo)";

async function fetchPage(title: string) {
  const u = new URL("https://en.wikipedia.org/w/api.php");
  u.search = new URLSearchParams({
    action: "query", prop: "extracts|info", inprop: "url", explaintext: "1", exsectionformat: "wiki",
    redirects: "1", titles: title, format: "json", formatversion: "2",
  }).toString();
  const r = await fetch(u, { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const page = (await r.json()).query?.pages?.[0];
  if (!page || page.missing || !page.extract) throw new Error("no article");
  return { title: page.title as string, extract: page.extract as string, fullurl: page.fullurl as string };
}

const out: unknown[] = [];
for (const [category, entries] of Object.entries(LIBRARY)) {
  for (const [title, name] of entries) {
    try {
      const g = gameFromWikiPage(await fetchPage(title), name);
      if (g.sections.length < 3) throw new Error(`only ${g.sections.length} sections`);
      out.push({ ...g, category, library: true, addedAt: 0 });
      console.log(`ok   ${name.padEnd(24)} ${g.sections.length} sections`);
    } catch (e) {
      console.log(`skip ${name.padEnd(24)} ${(e as Error).message}`);
    }
    await new Promise((r) => setTimeout(r, 150));
  }
}
writeFileSync(new URL("../public/games.json", import.meta.url), JSON.stringify(out));
console.log(`\n${out.length} games -> public/games.json`);
