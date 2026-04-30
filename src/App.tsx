/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, RotateCcw, Award, Info, Zap, Snowflake, Circle } from 'lucide-react';
import { Piece, Player, GameState, BOARD_SIZE, MOVE_COOLDOWN } from './types';
import { getPieceAt, isValidSquare, isDarkSquare, getValidMoves, aiThink, Move } from './gameLogic';

const INITIAL_PIECES: Piece[] = (() => {
  const pieces: Piece[] = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (isDarkSquare(r, c)) {
        if (r < 3) {
          pieces.push({
            id: `ai-${r}-${c}`,
            player: 'ai',
            isKing: false,
            row: r,
            col: c,
            cooldownTurns: 0,
            isFrozen: false
          });
        } else if (r > 4) {
          pieces.push({
            id: `human-${r}-${c}`,
            player: 'human',
            isKing: false,
            row: r,
            col: c,
            cooldownTurns: 0,
            isFrozen: false
          });
        }
      }
    }
  }
  return pieces;
})();

export default function App() {
  const [gameState, setGameState] = useState<GameState>({
    pieces: INITIAL_PIECES,
    selectedPieceId: null,
    magicCharges: { human: 0, ai: 0 },
    magicMode: false,
    winner: null,
    currentTurn: 'human',
    gameMode: null,
    gameVariant: null
  });
  
  const [freezeUsedThisTurn, setFreezeUsedThisTurn] = useState(false);

  const passTurn = useCallback(() => {
    setGameState(prev => {
      const player = prev.currentTurn;
      const oppositePlayer = player === 'human' ? 'ai' : 'human';
      
      const nextPieces = prev.pieces.map(p => {
        let cooldownTurns = p.cooldownTurns;
        let pIsFrozen = p.isFrozen;
        
        if (p.player === player) {
          pIsFrozen = false; // Unfreeze pieces of the player whose turn is ending
        }

        if (p.player === oppositePlayer && cooldownTurns > 0) {
          cooldownTurns -= 1;
        }
        
        return { ...p, cooldownTurns, isFrozen: pIsFrozen };
      });

      return {
        ...prev,
        pieces: nextPieces,
        currentTurn: oppositePlayer,
        selectedPieceId: null,
      };
    });
    setFreezeUsedThisTurn(false);
  }, []);

  // Skip Turn & Win/Loss Logic
  useEffect(() => {
    if (gameState.winner || !gameState.gameMode) return;

    const currentPlayer = gameState.currentTurn;
    const playerPieces = gameState.pieces.filter(p => p.player === currentPlayer);
    const opponentPlayer = currentPlayer === 'human' ? 'ai' : 'human';
    const opponentPieces = gameState.pieces.filter(p => p.player === opponentPlayer);
    
    // Win detection
    if (playerPieces.length === 0) {
      setGameState(prev => ({ ...prev, winner: opponentPlayer }));
      return;
    }
    if (opponentPieces.length === 0) {
      setGameState(prev => ({ ...prev, winner: currentPlayer }));
      return;
    }

    // Draw check: 1 human King and 1 ai King remaining
    const humanPieces = gameState.pieces.filter(p => p.player === 'human');
    const aiPieces = gameState.pieces.filter(p => p.player === 'ai');
    if (humanPieces.length === 1 && aiPieces.length === 1 && humanPieces[0].isKing && aiPieces[0].isKing) {
      setGameState(prev => ({ ...prev, winner: 'draw' }));
      return;
    }

    const hasAnyValidMove = playerPieces.some(p => 
      getValidMoves(p, gameState.pieces, gameState.gameVariant || 'classic').length > 0
    );

    if (!hasAnyValidMove) {
      // Check if they could move if they weren't frozen/on cooldown
      const canEventuallyMove = playerPieces.some(p => 
        getValidMoves({ ...p, cooldownTurns: 0, isFrozen: false }, gameState.pieces, gameState.gameVariant || 'classic').length > 0
      );

      if (canEventuallyMove) {
        // They are locked but could move eventually. Auto-skip turn.
        const skipTimeout = setTimeout(() => {
          passTurn();
        }, 1200);
        return () => clearTimeout(skipTimeout);
      } else {
        // Total defeat - no pieces can EVER move again
        setGameState(prev => ({ ...prev, winner: opponentPlayer }));
      }
    }
  }, [gameState.pieces, gameState.currentTurn, gameState.winner, gameState.gameMode, gameState.gameVariant, passTurn]);

  // AI Think Loop
  useEffect(() => {
    if (gameState.winner || gameState.currentTurn !== 'ai' || gameState.gameMode !== 'single') return;

    const aiTimeout = setTimeout(() => {
      // AI Logic for using magic
      if (gameState.magicCharges.ai > 0 && !freezeUsedThisTurn && !gameState.magicMode) {
        const humanPieces = gameState.pieces.filter(p => p.player === 'human' && !p.isFrozen);
        if (humanPieces.length > 0) {
          // Strategic targeting: Kings first, then pieces with many moves
          const kings = humanPieces.filter(p => p.isKing);
          let target: Piece | null = kings.length > 0 ? kings[Math.floor(Math.random() * kings.length)] : null;
          
          if (!target) {
            // Find most dangerous piece (one with most moves)
            const mobilityMap = humanPieces.map(p => ({
              p,
              moves: getValidMoves(p, gameState.pieces, gameState.gameVariant || 'classic').length
            }));
            mobilityMap.sort((a, b) => b.moves - a.moves);
            target = mobilityMap[0].p;
          }

          if (target) {
            setGameState(prev => ({
              ...prev,
              pieces: prev.pieces.map(p => p.id === (target as Piece).id ? { ...p, isFrozen: true } : p),
              magicCharges: { ...prev.magicCharges, ai: prev.magicCharges.ai - 1 }
            }));
            setFreezeUsedThisTurn(true);
            addLog(`AI activated STASIS field on ${String.fromCharCode(65 + target.col)}${BOARD_SIZE - target.row}.`, 'ai');
            return;
          }
        }
      }

      const move = aiThink(gameState.pieces, gameState.gameVariant || 'classic');
      if (move) {
        handleMove('ai', move);
      }
    }, 1500);

    return () => clearTimeout(aiTimeout);
  }, [gameState.pieces, gameState.winner, gameState.currentTurn, gameState.gameMode, gameState.gameVariant, freezeUsedThisTurn, gameState.magicMode, gameState.magicCharges.ai]);

  // Tactical Log State
  const [logs, setLogs] = useState<{ id: string, msg: string, time: string, type: 'human' | 'ai' | 'system' }[]>([]);

  const addLog = (msg: string, type: 'human' | 'ai' | 'system') => {
    const time = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setLogs(prev => [{ id: Math.random().toString(36).substr(2, 9), msg, time, type }, ...prev].slice(0, 8));
  };

  const handleMove = (player: Player, move: Move) => {
    setFreezeUsedThisTurn(false);
    setGameState(prev => {
      const oppositePlayer = player === 'human' ? 'ai' : 'human';
      const activePiece = prev.pieces.find(pc => pc.row === move.from.row && pc.col === move.from.col);
      
      const playerPiecesCount = prev.pieces.filter(p => p.player === player).length;
      const cooldownValue = playerPiecesCount <= 2 ? 0 : 2;

      const nextPieces = prev.pieces.map(p => {
        // Decrease cooldown and unfreeze for pieces of the player who just MOVED
        let cooldownTurns = p.cooldownTurns;
        let pIsFrozen = p.isFrozen;
        
        if (p.player === player) {
          pIsFrozen = false; // Unfreeze current player's pieces after their turn
        }

        if (p.player === oppositePlayer && cooldownTurns > 0) {
          cooldownTurns -= 1;
        }

        if (p.id === activePiece?.id) {
          const willBeKing = p.isKing || (player === 'human' ? move.to.row === 0 : move.to.row === BOARD_SIZE - 1);
          return {
            ...p,
            row: move.to.row,
            col: move.to.col,
            isKing: willBeKing,
            cooldownTurns: cooldownValue,
            isFrozen: false
          };
        }
        return { ...p, cooldownTurns, isFrozen: pIsFrozen };
      }).filter(p => !move.capturedPieceIds?.includes(p.id));

      const pos = `${String.fromCharCode(65 + move.to.col)}${BOARD_SIZE - move.to.row}`;
      addLog(`${player === 'human' ? 'P1' : (prev.gameMode === 'single' ? 'AI' : 'P2')} moved to ${pos}`, player);

      const humanPieces = nextPieces.filter(p => p.player === 'human');
      const aiPieces = nextPieces.filter(p => p.player === 'ai');
      let winner = prev.winner;
      if (humanPieces.length === 0) winner = 'ai';
      if (aiPieces.length === 0) winner = 'human';

      // Draw check: 1 human King and 1 ai King remaining
      if (humanPieces.length === 1 && aiPieces.length === 1 && humanPieces[0].isKing && aiPieces[0].isKing) {
        winner = 'draw';
      }

      let magicCharges = { ...prev.magicCharges };
      if (move.capturedPieceIds && move.capturedPieceIds.length > 0) {
        magicCharges[player] += move.capturedPieceIds.length;
        addLog(`${player === 'human' ? 'P1' : 'P2'} secured ${move.capturedPieceIds.length} Core(s)`, 'system');
      }

      return {
        ...prev,
        pieces: nextPieces,
        selectedPieceId: null,
        magicCharges,
        magicMode: false,
        winner,
        currentTurn: oppositePlayer
      };
    });
  };

  const handleSquareClick = (r: number, c: number) => {
    if (gameState.winner || !gameState.gameMode) return;
    
    // In multi-player, we need to allow clicking for both
    const activePlayer = gameState.currentTurn;

    if (gameState.magicMode) {
      const targetPiece = getPieceAt(gameState.pieces, r, c);
      const enemyPlayer = activePlayer === 'human' ? 'ai' : 'human';
      if (targetPiece && targetPiece.player === enemyPlayer) {
        setGameState(prev => ({
          ...prev,
          pieces: prev.pieces.map(p => p.id === targetPiece.id ? { ...p, isFrozen: true } : p),
          magicCharges: { ...prev.magicCharges, [prev.currentTurn]: prev.magicCharges[prev.currentTurn] - 1 },
          magicMode: false
        }));
        setFreezeUsedThisTurn(true);
        addLog(`Chronostatic pulse applied to Core ${targetPiece.id.split('-')[2]}`, 'system');
      }
      return;
    }

    const clickedPiece = getPieceAt(gameState.pieces, r, c);

    if (clickedPiece) {
      if (clickedPiece.player === activePlayer && clickedPiece.cooldownTurns <= 0 && !clickedPiece.isFrozen) {
        setGameState(prev => ({ ...prev, selectedPieceId: clickedPiece.id }));
      }
    } else if (gameState.selectedPieceId) {
      const selectedPiece = gameState.pieces.find(p => p.id === gameState.selectedPieceId);
      if (selectedPiece && selectedPiece.player === activePlayer) {
        const validMoves = getValidMoves(selectedPiece, gameState.pieces, gameState.gameVariant || 'classic');
        const move = validMoves.find(m => m.to.row === r && m.to.col === c);
        if (move) {
          handleMove(activePlayer, move);
        } else {
          setGameState(prev => ({ ...prev, selectedPieceId: null }));
        }
      }
    }
  };

  const selectMode = (mode: 'single' | 'multi') => {
    setGameState(prev => ({ ...prev, gameMode: mode, winner: null, pieces: INITIAL_PIECES, currentTurn: 'human' }));
  };

  const selectVariant = (variant: 'classic' | 'bishop' | 'chain' | 'vortex') => {
    setGameState(prev => ({ ...prev, gameVariant: variant }));
    setLogs([{ id: 'init', msg: `Initializing ${variant.toUpperCase()} combat protocol`, time: new Date().toLocaleTimeString([], { hour12: false }), type: 'system' }]);
  };

  const resetToMenu = () => {
    setGameState(prev => ({ ...prev, gameMode: null, gameVariant: null, winner: null, pieces: INITIAL_PIECES }));
    setFreezeUsedThisTurn(false);
  };

  const resetGame = () => {
    setGameState(prev => ({ ...prev, winner: null, pieces: INITIAL_PIECES, currentTurn: 'human', magicMode: false, magicCharges: { human: 0, ai: 0 } }));
    setFreezeUsedThisTurn(false);
  };

  const toggleMagicMode = () => {
    if (gameState.winner || !gameState.gameMode || freezeUsedThisTurn) return;
    const currentCharges = gameState.currentTurn === 'human' ? gameState.magicCharges.human : gameState.magicCharges.ai;
    if (currentCharges > 0) {
      setGameState(prev => ({ ...prev, magicMode: !prev.magicMode }));
    }
  };

  const humanCount = gameState.pieces.filter(p => p.player === 'human').length;
  const aiCount = gameState.pieces.filter(p => p.player === 'ai').length;
  const essencePercent = Math.round((humanCount / 12) * 100);

  return (
    <div className="h-screen w-full bg-[#06080c] text-slate-200 font-sans overflow-hidden flex flex-col">
      {/* Mode Selection Overlay */}
      <AnimatePresence>
        {!gameState.gameMode && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-[#06080c] flex items-center justify-center p-6"
          >
            <div className="max-w-md w-full space-y-12 text-center">
              <div>
                <motion.div 
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="w-20 h-20 bg-cyan-500/10 border border-cyan-500/20 rounded-[2rem] mx-auto mb-6 flex items-center justify-center shadow-[0_0_50px_rgba(34,211,238,0.1)]"
                >
                  <Sparkles className="w-10 h-10 text-cyan-400" />
                </motion.div>
                <h1 className="text-4xl font-black italic uppercase tracking-[0.2em] text-white mb-2 drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]">Chronos Checkers</h1>
                <p className="text-slate-500 uppercase tracking-widest text-[10px] font-bold">Select Combat Protocol</p>
              </div>

              <div className="grid gap-4">
                <button 
                  onClick={() => selectMode('single')}
                  className="group relative p-6 bg-white/5 border border-white/10 rounded-3xl hover:bg-cyan-500/10 hover:border-cyan-500/40 transition-all duration-300 overflow-hidden"
                >
                  <div className="relative z-10 text-left">
                    <h3 className="text-xl font-bold uppercase tracking-tight text-white group-hover:text-cyan-400 transition-colors">Single Player</h3>
                    <p className="text-xs text-slate-500 group-hover:text-slate-300">Challenge the Hyperion Core Engine</p>
                  </div>
                  <div className="absolute right-6 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-all group-hover:translate-x-2">
                    <Zap className="w-8 h-8 text-cyan-400" />
                  </div>
                </button>

                <button 
                  onClick={() => selectMode('multi')}
                  className="group relative p-6 bg-white/5 border border-white/10 rounded-3xl hover:bg-amber-500/10 hover:border-amber-500/40 transition-all duration-300 overflow-hidden"
                >
                  <div className="relative z-10 text-left">
                    <h3 className="text-xl font-bold uppercase tracking-tight text-white group-hover:text-amber-400 transition-colors">2 Players</h3>
                    <p className="text-xs text-slate-500 group-hover:text-slate-300">Local temporal combat vs an ally</p>
                  </div>
                  <div className="absolute right-6 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-all group-hover:translate-x-2">
                    <RotateCcw className="w-8 h-8 text-amber-400" />
                  </div>
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {gameState.gameMode && !gameState.gameVariant && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-[#06080c] flex items-center justify-center p-6"
          >
            <div className="max-w-md w-full space-y-12 text-center">
              <div>
                <motion.div 
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="w-16 h-16 bg-white/5 border border-white/10 rounded-2xl mx-auto mb-6 flex items-center justify-center"
                >
                  <Award className="w-8 h-8 text-slate-400" />
                </motion.div>
                <h2 className="text-2xl font-black uppercase tracking-[0.2em] text-white mb-2">Variant Config</h2>
                <p className="text-slate-500 uppercase tracking-widest text-[10px] font-bold">Protocol Augmentation</p>
              </div>

              <div className="grid gap-4">
                <button 
                  onClick={() => selectVariant('classic')}
                  className="group relative p-6 bg-white/5 border border-white/10 rounded-3xl hover:bg-white/10 transition-all duration-300 overflow-hidden"
                >
                  <div className="relative z-10 text-left">
                    <h3 className="text-xl font-bold uppercase tracking-tight text-white transition-colors">Classic Mode</h3>
                    <p className="text-xs text-slate-500 group-hover:text-slate-300">Traditional leap-capture mechanics</p>
                  </div>
                  <div className="absolute right-6 top-1/2 -translate-y-1/2 opacity-40">
                    <Circle className="w-12 h-12 text-slate-700" />
                  </div>
                </button>

                <button 
                  onClick={() => selectVariant('bishop')}
                  className="group relative p-6 bg-white/5 border border-white/10 rounded-3xl hover:bg-cyan-500/10 hover:border-cyan-500/40 transition-all duration-300 overflow-hidden"
                >
                  <div className="relative z-10 text-left">
                    <h3 className="text-xl font-bold uppercase tracking-tight text-white group-hover:text-cyan-400 transition-colors">Aether Bishop</h3>
                    <p className="text-xs text-slate-500 group-hover:text-slate-300">Kings move and capture like Bishops</p>
                  </div>
                  <div className="absolute right-6 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-all group-hover:translate-x-2">
                    <Zap className="w-10 h-10 text-cyan-400" />
                  </div>
                </button>

                <button 
                  onClick={() => selectVariant('chain')}
                  className="group relative p-6 bg-white/5 border border-white/10 rounded-3xl hover:bg-emerald-500/10 hover:border-emerald-500/40 transition-all duration-300 overflow-hidden"
                >
                  <div className="relative z-10 text-left">
                    <h3 className="text-xl font-bold uppercase tracking-tight text-white group-hover:text-emerald-400 transition-colors">Chain Surge</h3>
                    <p className="text-xs text-slate-500 group-hover:text-slate-300">Unleash devastating multi-capture jumps</p>
                  </div>
                  <div className="absolute right-6 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-all group-hover:translate-x-2">
                    <RotateCcw className="w-10 h-10 text-emerald-400" />
                  </div>
                </button>

                <button 
                  onClick={() => selectVariant('vortex')}
                  className="group relative p-6 bg-white/5 border border-white/10 rounded-3xl hover:bg-violet-500/10 hover:border-violet-500/40 transition-all duration-300 overflow-hidden"
                >
                  <div className="relative z-10 text-left">
                    <h3 className="text-xl font-bold uppercase tracking-tight text-white group-hover:text-violet-400 transition-colors">Hyperion Vortex</h3>
                    <p className="text-xs text-slate-500 group-hover:text-slate-300">Bishop Kings + Chain Jumps merged</p>
                  </div>
                  <div className="absolute right-6 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-all group-hover:translate-x-2">
                    <Sparkles className="w-10 h-10 text-violet-400" />
                  </div>
                </button>
              </div>

              <button 
                onClick={resetToMenu}
                className="text-[10px] uppercase tracking-widest text-slate-600 hover:text-slate-400 font-bold"
              >
                ← Back to Core Selection
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header Section */}
      <header className="h-20 border-b border-white/5 bg-black/40 backdrop-blur-md px-10 flex justify-between items-center shrink-0">
        <div className="flex flex-col cursor-pointer" onClick={resetToMenu}>
          <h1 className="text-2xl font-black tracking-[0.2em] text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.5)] uppercase italic">Chronos Checkers</h1>
          <span className="text-[10px] text-slate-500 tracking-[0.3em] font-bold uppercase flex gap-2">
            Advanced Aetheric Combat Engine • <span className="text-white/40">{gameState.gameMode === 'single' ? 'SOLO' : 'VERSUS'}</span>
          </span>
        </div>
        <div className="flex gap-12">
          <div className="text-right">
            <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mb-1">Current Phase</p>
            <p className={`text-sm font-mono tracking-tighter ${gameState.currentTurn === 'human' ? 'text-cyan-300' : 'text-amber-300 animate-pulse'}`}>
              {gameState.magicMode ? 'SURGE STATE' : gameState.currentTurn === 'human' ? 'P1_READY' : (gameState.gameMode === 'single' ? 'AI_THINK' : 'P2_READY')}
            </p>
          </div>
          <div className="w-px h-10 bg-white/10"></div>
          <div className="text-right flex flex-col items-end">
            <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mb-1">Combat Identity</p>
            <p className="text-sm font-mono text-white tracking-tighter uppercase">X-{Math.random().toString(16).slice(2, 6).toUpperCase()}</p>
          </div>
        </div>
      </header>

      <main className="flex-1 flex p-8 gap-8 overflow-hidden">
        {/* Sidebar Left: Magic & Player Stats */}
        <aside className="w-64 flex flex-col gap-6 shrink-0">
          <div className="p-5 bg-gradient-to-br from-cyan-950/40 to-transparent border border-cyan-500/20 rounded-2xl shadow-xl shadow-cyan-500/5">
            <h2 className="text-xs font-bold text-cyan-400 uppercase tracking-widest mb-4 flex items-center gap-2">
               Vortex Sanctum (P1)
            </h2>
            <div className="space-y-4">
              <div className="relative h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: '100%' }}
                  animate={{ width: `${essencePercent}%` }}
                  className="absolute left-0 top-0 h-full bg-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.8)]" 
                />
              </div>
              <div className="flex justify-between items-end">
                <span className="text-[10px] text-slate-400 uppercase font-mono">Essence Gauge</span>
                <span className="text-xl font-black text-white">{essencePercent}%</span>
              </div>
            </div>
          </div>

          <div className="flex-1 p-5 bg-black/40 border border-white/5 rounded-2xl flex flex-col shadow-inner">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-6 border-b border-white/5 pb-2">Aetheric Matrix</h2>
            <div className="space-y-4">
              <button 
                onClick={toggleMagicMode}
                disabled={freezeUsedThisTurn || (gameState.currentTurn === 'human' ? gameState.magicCharges.human : gameState.magicCharges.ai) === 0}
                className={`w-full p-3 rounded-xl relative overflow-hidden group transition-all duration-500 border text-left ${
                  gameState.magicMode 
                    ? 'bg-cyan-500/10 border-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.2)]' 
                    : (gameState.currentTurn === 'human' ? gameState.magicCharges.human : gameState.magicCharges.ai) > 0 && !freezeUsedThisTurn
                      ? 'bg-cyan-500/5 border-cyan-500/30 hover:border-cyan-400 cursor-pointer'
                      : 'bg-slate-900/50 border-white/5 opacity-50 cursor-not-allowed'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded flex items-center justify-center transition-colors ${
                    gameState.magicMode || (gameState.currentTurn === 'human' ? gameState.magicCharges.human : gameState.magicCharges.ai) > 0 ? 'bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.5)]' : 'bg-slate-800'
                  }`}>
                    <Zap className={`w-5 h-5 ${gameState.magicMode || (gameState.currentTurn === 'human' ? gameState.magicCharges.human : gameState.magicCharges.ai) > 0 ? 'text-black' : 'text-slate-500'}`} />
                  </div>
                  <div>
                    <p className={`text-xs font-bold uppercase ${gameState.magicMode || (gameState.currentTurn === 'human' ? gameState.magicCharges.human : gameState.magicCharges.ai) > 0 ? 'text-white' : 'text-slate-500'}`}>Aether Freeze</p>
                    <p className={`text-[9px] font-mono uppercase ${gameState.magicMode ? 'text-cyan-400 animate-pulse' : 'text-slate-600'}`}>
                      {gameState.magicMode ? 'SELECT TARGET' : `${gameState.currentTurn === 'human' ? gameState.magicCharges.human : gameState.magicCharges.ai} CHARGE(S)`}
                    </p>
                  </div>
                </div>
              </button>
              
              <div className="p-4 bg-white/5 border border-white/10 rounded-xl space-y-2">
                <div className="flex justify-between items-center">
                   <span className="text-[10px] text-slate-500 uppercase font-bold">P1 Units</span>
                   <span className="text-xs font-mono text-cyan-400">{humanCount}</span>
                </div>
                <div className="flex justify-between items-center">
                   <span className="text-[10px] text-slate-500 uppercase font-bold">{gameState.gameMode === 'single' ? 'AI Units' : 'P2 Units'}</span>
                   <span className={`text-xs font-mono ${gameState.gameMode === 'single' ? 'text-red-500' : 'text-amber-500'}`}>{aiCount}</span>
                </div>
              </div>
            </div>
            
            <div className="mt-auto pt-6 border-t border-white/5">
              <div className="flex flex-col gap-2">
                <button 
                  onClick={resetToMenu}
                  className="w-full py-3 bg-white/5 border border-white/10 rounded-xl text-[10px] uppercase tracking-[0.2em] font-black hover:bg-white/10 transition-colors"
                >
                  Exit Strategy
                </button>
              </div>
            </div>
          </div>
        </aside>

        {/* Center: The Checkers Board */}
        <div className="flex-1 flex justify-center items-center relative">
          <div className="p-3 bg-[#1a1c22] rounded-lg shadow-[0_0_100px_rgba(0,0,0,0.8)] border-4 border-[#252830]">
            <div 
              className="grid grid-cols-8 grid-rows-8 w-[min(70vh,560px)] aspect-square border border-white/10"
              style={{ gridTemplateColumns: 'repeat(8, 1fr)', gridTemplateRows: 'repeat(8, 1fr)' }}
            >
              {Array.from({ length: 64 }).map((_, i) => {
                const r = Math.floor(i / 8);
                const c = i % 8;
                const isDark = isDarkSquare(r, c);
                const piece = getPieceAt(gameState.pieces, r, c);
                const isSelected = piece?.id === gameState.selectedPieceId;
                const activePiece = gameState.selectedPieceId ? gameState.pieces.find(p => p.id === gameState.selectedPieceId) : null;
                const canMoveHere = activePiece && !piece && isDark && getValidMoves(activePiece, gameState.pieces, gameState.gameVariant || 'classic').some(m => m.to.row === r && m.to.col === c);

                return (
                  <div
                    key={i}
                    onClick={() => handleSquareClick(r, c)}
                    className={`relative flex items-center justify-center cursor-pointer transition-colors duration-500 ${
                      isDark ? 'bg-[#111318]' : 'bg-[#2a2d35]'
                    } ${canMoveHere ? 'after:content-[""] after:w-3 after:h-3 after:rounded-full after:bg-cyan-400/40 after:shadow-[0_0_8px_rgba(34,211,238,0.5)]' : ''}`}
                  >
                    {piece && (
                      <motion.div
                        layoutId={piece.id}
                        className={`relative w-[80%] h-[80%] rounded-full shadow-2xl flex items-center justify-center 
                          ${piece.player === 'human' 
                            ? 'bg-gradient-to-br from-cyan-600 to-blue-900 border-2 border-cyan-300 shadow-[0_0_15px_rgba(6,182,212,0.4)]' 
                            : gameState.gameMode === 'single' 
                              ? 'bg-gradient-to-br from-red-800 to-black border-2 border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.3)]'
                              : 'bg-gradient-to-br from-amber-600 to-black border-2 border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.3)]'
                          }
                          ${isSelected ? 'ring-4 ring-white/20 ring-offset-2 ring-offset-black scale-105 z-20' : ''}
                        `}
                      >
                        {piece.isKing && (
                          <Award className={`w-1/2 h-1/2 ${piece.player === 'human' ? 'text-amber-300/60' : 'text-slate-400/60'}`} />
                        )}

                        {/* Cooldown Timer Turns */}
                        {piece.cooldownTurns > 0 && (
                          <div className="absolute -top-1 -right-1 w-6 h-6 bg-slate-950 border border-cyan-400 rounded-full flex items-center justify-center shadow-lg">
                            <span className="text-[10px] font-mono text-cyan-400 font-bold">
                              {piece.cooldownTurns}
                            </span>
                          </div>
                        )}

                        {/* Frozen Layer */}
                        {piece.isFrozen && (
                          <div className="absolute inset-0 rounded-full bg-cyan-400/20 backdrop-blur-[1.5px] border-2 border-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.4)] flex items-center justify-center">
                            <Snowflake className="text-cyan-200 w-1/2 h-1/2 animate-pulse" />
                          </div>
                        )}
                      </motion.div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Win / Loss Overlays */}
          <AnimatePresence>
            {gameState.winner && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-12"
              >
                <div className={`w-full max-w-sm p-8 rounded-3xl border-2 text-center shadow-2xl ${
                  gameState.winner === 'human' ? 'bg-cyan-950/80 border-cyan-500 shadow-cyan-500/20' : 
                  gameState.winner === 'draw' ? 'bg-slate-900/80 border-slate-500 shadow-slate-500/20' :
                  'bg-red-950/80 border-red-500 shadow-red-500/20'
                }`}>
                  <h2 className="text-4xl font-black italic uppercase tracking-tighter mb-2 italic">
                    {gameState.winner === 'draw' ? 'DRAW' : gameState.winner === 'human' ? 'VICTORY' : 'DEFEAT'}
                  </h2>
                  <p className="text-[10px] text-slate-400 uppercase tracking-widest font-mono mb-8 italic">
                    Combat Protocol Concluded • {
                      gameState.winner === 'draw' ? 'STALEMATE DETECTED' :
                      gameState.gameMode === 'multi' ? (gameState.winner === 'human' ? 'P1 WINS' : 'P2 WINS') : 
                      (gameState.winner === 'human' ? 'AI DOMINATED' : 'AI VICTORY')
                    }
                  </p>
                  <div className="grid gap-2">
                    <button 
                      onClick={resetGame}
                      className="w-full py-4 bg-white/5 border border-white/20 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-white/10 transition-all hover:scale-[1.02]"
                    >
                      Restart Session
                    </button>
                    <button 
                      onClick={resetToMenu}
                      className="w-full py-4 bg-transparent border border-white/10 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:text-white transition-all"
                    >
                      Return to Matrix
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Sidebar Right: AI Status & Move Feed */}
        <aside className="w-64 flex flex-col gap-6 shrink-0">
          <div className={`p-5 bg-gradient-to-br border rounded-2xl shadow-xl ${
            gameState.gameMode === 'single' 
              ? 'from-red-950/30 border-red-500/20 shadow-red-500/5' 
              : 'from-amber-950/30 border-amber-500/20 shadow-amber-500/5'
          }`}>
            <div className="flex justify-between items-start mb-4">
              <h2 className={`text-xs font-bold uppercase tracking-widest ${gameState.gameMode === 'single' ? 'text-red-500' : 'text-amber-500'}`}>
                {gameState.gameMode === 'single' ? 'AI Engine' : 'Opponent'}
              </h2>
              <span className={`text-[9px] px-2 py-0.5 rounded font-black tracking-tighter text-white ${
                gameState.gameMode === 'single' ? 'bg-red-500' : 'bg-amber-500'
              }`}>
                {gameState.gameMode === 'single' ? 'DEEP_THINK' : 'HUMAN_INPUT'}
              </span>
            </div>
            <p className="text-sm text-white font-mono mb-1">{gameState.gameMode === 'single' ? 'Hyperion 7.0' : 'Player 2 Core'}</p>
            <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">
              Status: {gameState.currentTurn === 'ai' ? 'CALCULATING' : 'AWAITING_MANEUVER'}
            </p>
          </div>

          <div className="flex-1 p-5 bg-black/40 border border-white/5 rounded-2xl flex flex-col overflow-hidden shadow-inner">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 border-b border-white/5 pb-2">Tactical Feed</h2>
            <div className="flex-1 overflow-y-auto pr-2 space-y-4 font-mono scrollbar-hide">
              <AnimatePresence initial={false}>
                {logs.map((log) => (
                  <motion.div 
                    key={log.id}
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="text-[10px] flex gap-3 group"
                  >
                    <span className="text-slate-600 shrink-0">{log.time}</span>
                    <p className={`leading-snug ${
                      log.type === 'human' ? 'text-slate-300' : 
                      log.type === 'ai' ? 'text-amber-400' : 
                      'text-cyan-400 italic font-bold'
                    }`}>
                      {log.msg}
                    </p>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
            
            <button 
              onClick={resetGame}
              className="mt-6 w-full py-3 bg-white/5 border border-white/10 rounded-xl text-[10px] uppercase tracking-[0.2em] font-black hover:bg-white/10 transition-colors"
            >
              Reset Session
            </button>
          </div>
        </aside>
      </main>

      {/* Footer Bar */}
      <footer className="h-10 bg-black px-10 border-t border-white/5 flex items-center justify-between text-[10px] text-slate-500 font-bold tracking-widest shrink-0">
        <div className="flex gap-6 uppercase">
          <span>Session Protocol: {gameState.gameMode?.toUpperCase() || 'SCANNING'}</span>
          <span className="text-slate-700">|</span>
          <span className="text-emerald-500/60 uppercase">System Integrity: 99.8%</span>
        </div>
        <div className="flex gap-6 uppercase">
          <span className="text-cyan-500">● Temporal Field Active</span>
          <span className="text-white/20 uppercase tracking-tighter underline decoration-cyan-500/20">Aetheric_Link: POSITIVE</span>
        </div>
      </footer>
    </div>
  );
}
