export type Player = 'human' | 'ai';
export type GameMode = 'single' | 'multi' | null;
export type GameVariant = 'classic' | 'bishop' | 'chain' | 'vortex' | null;

export interface Piece {
  id: string;
  player: Player;
  isKing: boolean;
  row: number;
  col: number;
  cooldownTurns: number; // number of enemy moves to wait
  isFrozen: boolean;
}

export interface GameState {
  pieces: Piece[];
  selectedPieceId: string | null;
  magicCharges: { human: number, ai: number };
  magicMode: boolean; // targeting mode
  winner: Player | 'draw' | null;
  currentTurn: Player;
  gameMode: GameMode;
  gameVariant: GameVariant;
}

export const BOARD_SIZE = 8;
export const MOVE_COOLDOWN = 3000; // 3 seconds
