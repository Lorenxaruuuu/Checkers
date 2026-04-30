import { Piece, Player, BOARD_SIZE, GameVariant } from './types';

export const getPieceAt = (pieces: Piece[], row: number, col: number) => {
  return pieces.find(p => p.row === row && p.col === col);
};

export const isValidSquare = (row: number, col: number) => {
  return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
};

export const isDarkSquare = (row: number, col: number) => {
  return (row + col) % 2 === 1;
};

export interface Move {
  from: { row: number, col: number };
  to: { row: number, col: number };
  capturedPieceIds?: string[];
}

const getChainJumps = (row: number, col: number, piece: Piece, allPieces: Piece[], alreadyCaptured: string[]): Move[] => {
  const chainMoves: Move[] = [];
  const directions = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  const jumpDirections = piece.isKing ? directions : (piece.player === 'human' ? [[-1, 1], [-1, -1]] : [[1, 1], [1, -1]]);

  for (const [dr, dc] of jumpDirections) {
    const nr = row + dr;
    const nc = col + dc;
    const jr = row + dr * 2;
    const jc = col + dc * 2;

    if (isValidSquare(jr, jc)) {
      const target = getPieceAt(allPieces, nr, nc);
      const landing = getPieceAt(allPieces, jr, jc);
      
      if (target && target.player !== piece.player && !alreadyCaptured.includes(target.id) && 
         (!landing || (landing.row === piece.row && landing.col === piece.col))) {
        
        const newCaptured = [...alreadyCaptured, target.id];
        const baseMove: Move = {
          from: { row: piece.row, col: piece.col },
          to: { row: jr, col: jc },
          capturedPieceIds: newCaptured
        };

        const subJumps = getChainJumps(jr, jc, piece, allPieces, newCaptured);
        if (subJumps.length > 0) {
          chainMoves.push(...subJumps);
        } else {
          chainMoves.push(baseMove);
        }
      }
    }
  }
  return chainMoves;
};

const getFlyingKingCaptures = (row: number, col: number, piece: Piece, allPieces: Piece[], alreadyCaptured: string[], originalRow: number, originalCol: number): Move[] => {
  const chainMoves: Move[] = [];
  const directions = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

  for (const [dr, dc] of directions) {
    let nr = row + dr;
    let nc = col + dc;
    
    // Slide until we hit something
    while (isValidSquare(nr, nc)) {
      const p = getPieceAt(allPieces, nr, nc);
      if (p) {
        // If it's a piece we already captured in this chain, skip it (it's "removed")
        if (alreadyCaptured.includes(p.id)) {
          nr += dr;
          nc += dc;
          continue;
        }
        // If it's the original piece itself (at its starting position), skip it
        if (p.id === piece.id) {
          nr += dr;
          nc += dc;
          continue;
        }

        // Found a piece. Is it an enemy?
        if (p.player !== piece.player) {
          // Check landing squares behind it
          let lr = nr + dr;
          let lc = nc + dc;
          while (isValidSquare(lr, lc)) {
            const lp = getPieceAt(allPieces, lr, lc);
            // Must land on empty square (or original start square)
            if (!lp || (lp.row === originalRow && lp.col === originalCol)) {
              const newCaptured = [...alreadyCaptured, p.id];
              const baseMove: Move = {
                from: { row: originalRow, col: originalCol },
                to: { row: lr, col: lc },
                capturedPieceIds: newCaptured
              };
              
              // Add this move (allowing stopping here)
              chainMoves.push(baseMove);

              // Seek sub-jumps from this landing spot
              const subJumps = getFlyingKingCaptures(lr, lc, piece, allPieces, newCaptured, originalRow, originalCol);
              chainMoves.push(...subJumps);
            } else {
              break; // Path blocked
            }
            lr += dr;
            lc += dc;
          }
        }
        break; // Blocked by any piece (after trying capture)
      }
      nr += dr;
      nc += dc;
    }
  }
  return chainMoves;
};

export const getValidMoves = (piece: Piece, allPieces: Piece[], variant: GameVariant = 'classic'): Move[] => {
  if (piece.cooldownTurns > 0 || piece.isFrozen) return [];

  const moves: Move[] = [];
  
  if (piece.isKing) {
    if (variant === 'bishop' || variant === 'vortex') {
      // Slidings (Non-capture)
      const directions = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
      for (const [dr, dc] of directions) {
        let nr = piece.row + dr;
        let nc = piece.col + dc;
        while (isValidSquare(nr, nc) && !getPieceAt(allPieces, nr, nc)) {
          moves.push({ from: { row: piece.row, col: piece.col }, to: { row: nr, col: nc } });
          nr += dr;
          nc += dc;
        }
      }

      // Captures
      if (variant === 'vortex') {
        moves.push(...getFlyingKingCaptures(piece.row, piece.col, piece, allPieces, [], piece.row, piece.col));
      } else {
        // Bishop mode: single flying jump (can choose landing square)
        for (const [dr, dc] of directions) {
          let nr = piece.row + dr;
          let nc = piece.col + dc;
          // Slide to hit something
          while (isValidSquare(nr, nc) && !getPieceAt(allPieces, nr, nc)) {
            nr += dr;
            nc += dc;
          }
          if (isValidSquare(nr, nc)) {
            const target = getPieceAt(allPieces, nr, nc);
            if (target && target.player !== piece.player) {
              let lr = nr + dr;
              let lc = nc + dc;
              // Can land on any empty square behind the piece
              while (isValidSquare(lr, lc) && !getPieceAt(allPieces, lr, lc)) {
                moves.push({ 
                  from: { row: piece.row, col: piece.col }, 
                  to: { row: lr, col: lc },
                  capturedPieceIds: [target.id]
                });
                lr += dr;
                lc += dc;
              }
            }
          }
        }
      }
    } else {
      // Classic and Chain: move 1 square
      const directions = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
      for (const [dr, dc] of directions) {
        // Normal move (1 square)
        const nr = piece.row + dr;
        const nc = piece.col + dc;
        if (isValidSquare(nr, nc) && !getPieceAt(allPieces, nr, nc)) {
          moves.push({ from: { row: piece.row, col: piece.col }, to: { row: nr, col: nc } });
        }

        // Capture move (jump over)
        const jr = piece.row + dr * 2;
        const jc = piece.col + dc * 2;
        if (isValidSquare(jr, jc)) {
          const target = getPieceAt(allPieces, nr, nc);
          const landing = getPieceAt(allPieces, jr, jc);
          if (target && target.player !== piece.player && !landing) {
            const baseMove: Move = { 
              from: { row: piece.row, col: piece.col }, 
              to: { row: jr, col: jc }, 
              capturedPieceIds: [target.id] 
            };

            if (variant === 'chain') {
              const chainMoves = getChainJumps(jr, jc, piece, allPieces, [target.id]);
              if (chainMoves.length > 0) {
                moves.push(...chainMoves);
              } else {
                moves.push(baseMove);
              }
            } else {
              moves.push(baseMove);
            }
          }
        }
      }
    }
  } else {
    const directions = piece.player === 'human' ? [[-1, 1], [-1, -1]] : [[1, 1], [1, -1]];

    for (const [dr, dc] of directions) {
      const nr = piece.row + dr;
      const nc = piece.col + dc;
      if (isValidSquare(nr, nc) && !getPieceAt(allPieces, nr, nc)) {
        moves.push({ from: { row: piece.row, col: piece.col }, to: { row: nr, col: nc } });
      }

      const jr = piece.row + dr * 2;
      const jc = piece.col + dc * 2;
      if (isValidSquare(jr, jc)) {
        const targetPiece = getPieceAt(allPieces, nr, nc);
        const landingPiece = getPieceAt(allPieces, jr, jc);
        if (targetPiece && targetPiece.player !== piece.player && !landingPiece) {
          const baseMove: Move = { 
            from: { row: piece.row, col: piece.col }, 
            to: { row: jr, col: jc },
            capturedPieceIds: [targetPiece.id]
          };

          if (variant === 'chain' || variant === 'vortex') {
            const chainMoves = getChainJumps(jr, jc, piece, allPieces, [targetPiece.id]);
            if (chainMoves.length > 0) {
              moves.push(...chainMoves);
            } else {
              moves.push(baseMove);
            }
          } else {
            moves.push(baseMove);
          }
        }
      }
    }
  }

  return moves;
};

export const evaluateBoard = (pieces: Piece[], player: Player): number => {
  let score = 0;
  for (const p of pieces) {
    let value = p.isKing ? 10 : 3;
    
    // Position bonus (prefer center and advancing)
    const distToKingRow = p.player === 'human' ? p.row : (BOARD_SIZE - 1 - p.row);
    value += (BOARD_SIZE - 1 - distToKingRow) * 0.1;

    // Safety bonus (pieces on edges or back row are safer)
    if (p.col === 0 || p.col === BOARD_SIZE - 1 || p.row === 0 || p.row === BOARD_SIZE - 1) {
      value += 0.5;
    }

    if (p.isFrozen) value -= 2;
    if (p.cooldownTurns > 0) value -= p.cooldownTurns * 0.5;

    if (p.player === player) {
      score += value;
    } else {
      score -= value;
    }
  }
  return score;
};

const minimax = (
  pieces: Piece[], 
  depth: number, 
  isMaximizing: boolean, 
  alpha: number, 
  beta: number, 
  variant: GameVariant
): number => {
  if (depth === 0) return evaluateBoard(pieces, 'ai');

  const player: Player = isMaximizing ? 'ai' : 'human';
  const playerPieces = pieces.filter(p => p.player === player && !p.isFrozen && p.cooldownTurns <= 0);
  
  const allMoves: { move: Move, newPieces: Piece[] }[] = [];
  for (const p of playerPieces) {
    const validMoves = getValidMoves(p, pieces, variant);
    for (const m of validMoves) {
      const nextPieces = pieces.map(np => {
        if (np.id === p.id) {
          const isKing = np.isKing || (player === 'human' ? m.to.row === 0 : m.to.row === BOARD_SIZE - 1);
          return { ...np, row: m.to.row, col: m.to.col, isKing };
        }
        return np;
      }).filter(np => !m.capturedPieceIds?.includes(np.id));
      allMoves.push({ move: m, newPieces: nextPieces });
    }
  }

  if (allMoves.length === 0) return isMaximizing ? -1000 : 1000;

  if (isMaximizing) {
    let maxEval = -Infinity;
    for (const { newPieces } of allMoves) {
      const evaluation = minimax(newPieces, depth - 1, false, alpha, beta, variant);
      maxEval = Math.max(maxEval, evaluation);
      alpha = Math.max(alpha, evaluation);
      if (beta <= alpha) break;
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    for (const { newPieces } of allMoves) {
      const evaluation = minimax(newPieces, depth - 1, true, alpha, beta, variant);
      minEval = Math.min(minEval, evaluation);
      beta = Math.min(beta, evaluation);
      if (beta <= alpha) break;
    }
    return minEval;
  }
};

export const aiThink = (pieces: Piece[], variant: GameVariant = 'classic'): Move | null => {
  const aiPieces = pieces.filter(p => p.player === 'ai' && p.cooldownTurns <= 0 && !p.isFrozen);
  if (aiPieces.length === 0) return null;

  let bestMove: Move | null = null;
  let maxEval = -Infinity;

  const depth = pieces.length > 12 ? 3 : 4;

  for (const p of aiPieces) {
    const moves = getValidMoves(p, pieces, variant);
    for (const m of moves) {
      const noise = (Math.random() - 0.5) * 0.1;
      const nextPieces = pieces.map(np => {
        if (np.id === p.id) {
          const isKing = np.isKing || (m.to.row === BOARD_SIZE - 1);
          return { ...np, row: m.to.row, col: m.to.col, isKing };
        }
        return np;
      }).filter(np => !m.capturedPieceIds?.includes(np.id));

      const evaluation = minimax(nextPieces, depth - 1, false, -Infinity, Infinity, variant) + noise;
      if (evaluation > maxEval) {
        maxEval = evaluation;
        bestMove = m;
      }
    }
  }
  return bestMove;
};
