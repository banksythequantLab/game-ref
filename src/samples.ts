// Built-in rulebooks for classic public-domain games, written for Game Ref, so the app works out of the box.
import type { Game } from "./store";

const s = (id: string, title: string, text: string) => ({ id, title, text });

export const SAMPLES: Game[] = [
  {
    id: "sample-chess",
    name: "Chess",
    origin: "sample",
    addedAt: 1,
    houseRules: [],
    sections: [
      s("1", "Board and setup", "Two players use an 8x8 board placed so each player has a light square in the right-hand corner nearest them. Each side has a king, a queen, two rooks, two bishops, two knights and eight pawns. The queen starts on the square of her own color. White moves first, then players alternate."),
      s("2", "Object of the game", "The goal is to checkmate the opposing king: attack it so that it cannot escape capture on the next move. A game can also end by resignation, by a draw, or on time when a clock is used."),
      s("3", "King", "The king moves one square in any direction. A king may never move onto a square attacked by an enemy piece, and the two kings can never stand on adjacent squares."),
      s("4", "Queen, rook and bishop", "The queen moves any number of squares along a rank, file or diagonal. The rook moves any number of squares along a rank or file. The bishop moves any number of squares diagonally. None of these pieces may jump over another piece."),
      s("5", "Knight", "The knight moves in an L shape: two squares along a rank or file and then one square at a right angle. It is the only piece that jumps over other pieces, and it captures only on the square where it lands."),
      s("6", "Pawn movement and capture", "A pawn moves straight forward one square onto an empty square. From its starting square it may instead move two squares forward if both squares are empty. A pawn captures only diagonally forward one square, and cannot capture straight ahead."),
      s("7", "En passant", "When a pawn moves two squares forward from its starting square and lands beside an enemy pawn on the same rank, the enemy pawn may capture it as if it had moved only one square. This capture is only allowed on the very next move; otherwise the right is lost."),
      s("8", "Promotion", "A pawn that reaches the far rank is immediately replaced, as part of the same move, by a queen, rook, bishop or knight of the same color chosen by its owner. It cannot become a king or stay a pawn. The choice is not limited to pieces that have been captured, so a player may have two or more queens."),
      s("9", "Castling", "Castling moves the king two squares toward a rook and places that rook on the square the king passed over. It is allowed only if neither the king nor that rook has moved, all squares between them are empty, the king is not in check, and the king does not pass through or land on a square attacked by the opponent. The rook may pass over an attacked square (this happens when castling queenside)."),
      s("10", "Check", "A king that is attacked is in check. A player in check must get out of check on that move by moving the king, capturing the attacking piece, or blocking the attack. A player may never make a move that leaves or places their own king in check."),
      s("11", "Checkmate and stalemate", "If a player is in check and has no legal move, it is checkmate and that player loses. If a player is not in check but has no legal move, it is stalemate and the game is a draw."),
      s("12", "Draws", "The game is drawn by agreement, by stalemate, when the same position occurs three times with the same player to move (threefold repetition, which a player may claim), when fifty consecutive moves by each player have been made with no capture and no pawn move (fifty-move rule, which a player may claim), or when neither side has enough material to checkmate."),
      s("13", "Touch-move (tournament play)", "In tournament play, a player who deliberately touches one of their own pieces must move it if it has a legal move, and a player who deliberately touches an opponent's piece must capture it if it can legally be captured. To adjust a piece without committing, the player first says \"I adjust\". Once a player releases a piece on a legal square, the move cannot be taken back."),
      s("14", "Illegal moves", "An illegal move must be taken back and replaced with a legal move; under touch-move it must be made with the same piece if possible. In clock games, tournament rules may add time to the opponent's clock for an illegal move."),
    ],
  },
  {
    id: "sample-checkers",
    name: "Checkers (American / English draughts)",
    origin: "sample",
    addedAt: 2,
    houseRules: [],
    sections: [
      s("1", "Board and setup", "Two players use an 8x8 board, playing only on the dark squares, with a dark square in each player's lower-left corner. Each player has 12 pieces placed on the dark squares of the three rows nearest them. The player with the dark (black or red) pieces moves first, then players alternate."),
      s("2", "Moving a man", "An uncrowned piece (a man) moves one square diagonally forward onto an empty dark square. Men never move backward, and they may only capture forward; only kings move and capture backward."),
      s("3", "Capturing", "A piece captures by jumping diagonally over an adjacent enemy piece onto the empty square directly beyond it. The jumped piece is removed from the board. A man may only jump forward."),
      s("4", "Captures are compulsory", "If a player can make a capture, they must capture instead of making a normal move. If more than one capture is available, the player may choose any of them; they are not required to choose the sequence that captures the most pieces."),
      s("5", "Multiple jumps", "If, after a jump, the same piece can jump again, it must continue jumping in the same turn until no further jump is available. The player may choose the path when there are branches, but must complete the chosen sequence."),
      s("6", "Crowning", "When a man reaches the far row it becomes a king and is crowned by stacking a second piece on it. If a man reaches the far row by capturing, its turn ends there; it cannot continue jumping as a king until the next turn."),
      s("7", "Kings", "A king moves one square diagonally in any direction, forward or backward, and captures by jumping forward or backward. Kings are not \"flying\": they cannot move or jump across more than one square at a time."),
      s("8", "Winning", "A player wins when the opponent has no pieces left or cannot make any legal move on their turn."),
      s("9", "Draws", "A game is drawn by agreement. In tournament play a draw may also be declared if neither player has made a capture or moved an uncrowned piece forward within a set number of moves (commonly 40 moves each) after a draw is claimed."),
      s("10", "Touch rules", "In tournament play, if a player touches a playable piece they must move that piece. A piece released on a square completes the move."),
    ],
  },
  {
    id: "sample-crazy-eights",
    name: "Crazy Eights",
    origin: "sample",
    addedAt: 3,
    houseRules: [],
    sections: [
      s("1", "Players and deal", "Crazy Eights is for 2 to 5 players using a standard 52-card deck. With two players each player is dealt 7 cards; with three or more, each is dealt 5. The rest of the deck is placed face down as the stock, and its top card is turned face up to start the discard pile. If that card is an eight, it is shuffled back into the stock and a new card is turned."),
      s("2", "Turn order", "The player to the dealer's left goes first, and play continues clockwise."),
      s("3", "Playing a card", "On your turn you play one card face up onto the discard pile. It must match the top discard in rank or in suit. For example, on the 7 of hearts you may play any heart or any 7."),
      s("4", "Eights are wild", "An eight may be played on any card, regardless of the top card. The player who plays an eight names a suit, and the next player must play a card of that named suit or another eight."),
      s("5", "Drawing", "If you cannot or choose not to play, you draw cards from the stock one at a time until you draw a card you can play, and then you may play it. A player may choose to draw even when holding a playable card."),
      s("6", "Empty stock", "If the stock runs out and a player cannot play, that player passes. If no player can play, the hand ends and is scored."),
      s("7", "Going out", "The first player to play their last card wins the hand."),
      s("8", "Scoring", "The winner of the hand scores points for the cards left in opponents' hands: 50 for each eight, 10 for each king, queen or jack, 1 for each ace, and face value for every other card. If the hand ended with a blocked game, the player with the lowest count in hand wins the difference. Play continues until a player reaches an agreed target such as 100 points."),
    ],
  },
];
