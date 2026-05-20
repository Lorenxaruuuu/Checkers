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

const COLOR_OPTIONS = [
  { id: 'cyan', name: 'Cyan', bg: 'bg-cyan-500', bgSubtle: 'bg-cyan-500/20', border: 'border-cyan-400', from: 'from-cyan-600', to: 'to-cyan-900', shadow: 'shadow-cyan-500/50', accent: 'text-cyan-400', glow: 'shadow-cyan-500/50' },
  { id: 'amber', name: 'Amber', bg: 'bg-amber-500', bgSubtle: 'bg-amber-500/20', border: 'border-amber-400', from: 'from-amber-600', to: 'to-amber-900', shadow: 'shadow-amber-500/50', accent: 'text-amber-400', glow: 'shadow-amber-500/50' },
  { id: 'rose', name: 'Rose', bg: 'bg-rose-500', bgSubtle: 'bg-rose-500/20', border: 'border-rose-400', from: 'from-rose-600', to: 'to-rose-900', shadow: 'shadow-rose-500/50', accent: 'text-rose-400', glow: 'shadow-rose-500/50' },
  { id: 'emerald', name: 'Emerald', bg: 'bg-emerald-500', bgSubtle: 'bg-emerald-500/20', border: 'border-emerald-400', from: 'from-emerald-600', to: 'to-emerald-900', shadow: 'shadow-emerald-500/50', accent: 'text-emerald-400', glow: 'shadow-emerald-500/50' },
  { id: 'purple', name: 'Purple', bg: 'bg-purple-500', bgSubtle: 'bg-purple-500/20', border: 'border-purple-400', from: 'from-purple-600', to: 'to-purple-900', shadow: 'shadow-purple-500/50', accent: 'text-purple-400', glow: 'shadow-purple-500/50' },
  { id: 'orange', name: 'Orange', bg: 'bg-orange-500', bgSubtle: 'bg-orange-500/20', border: 'border-orange-400', from: 'from-orange-600', to: 'to-orange-900', shadow: 'shadow-orange-500/50', accent: 'text-orange-400', glow: 'shadow-orange-500/50' },
  { id: 'red', name: 'Crimson', bg: 'bg-red-600', bgSubtle: 'bg-red-600/20', border: 'border-red-400', from: 'from-red-700', to: 'to-red-950', shadow: 'shadow-red-600/50', accent: 'text-red-400', glow: 'shadow-red-600/50' },
];

export default function App() {
  const [p1Name, setP1Name] = useState('P1');
  const [p2Name, setP2Name] = useState('AI');
  const [p1Color, setP1Color] = useState('cyan');
  const [p2Color, setP2Color] = useState('amber');
  const [setupStep, setSetupStep] = useState<'mode' | 'names' | 'match'>('mode');
  const [tempMode, setTempMode] = useState<'single' | 'multi' | null>(null);

  const [gameState, setGameState] = useState<GameState>({
    pieces: INITIAL_PIECES,
    selectedPieceId: null,
    magicCharges: { human: 0, ai: 0 },
    magicMode: false,
    winner: null,
    currentTurn: 'human',
    gameMode: null,
    gameVariant: null,
    playerNames: { human: 'P1', ai: 'AI' },
    playerColors: { human: 'cyan', ai: 'amber' },
    matchSettings: {
      bestOf: 1,
      p1Score: 0,
      p2Score: 0
    }
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
    const humanPieces = gameState.pieces.filter(p => p.player === 'human');
    const aiPieces = gameState.pieces.filter(p => p.player === 'ai');
    const playerPieces = gameState.currentTurn === 'human' ? humanPieces : aiPieces;
    const opponentPlayer = currentPlayer === 'human' ? 'ai' : 'human';
    const opponentPieces = gameState.currentTurn === 'human' ? aiPieces : humanPieces;
    
    // Win detection
    if (playerPieces.length === 0 || opponentPieces.length === 0 || (humanPieces.length === 1 && aiPieces.length === 1 && humanPieces[0].isKing && aiPieces[0].isKing)) {
      let winType: Player | 'draw' | null = null;
      if (playerPieces.length === 0) winType = opponentPlayer;
      else if (opponentPieces.length === 0) winType = currentPlayer;
      else if (humanPieces.length === 1 && aiPieces.length === 1 && humanPieces[0].isKing && aiPieces[0].isKing) winType = 'draw';

      if (winType) {
        setGameState(prev => {
          const newP1Score = winType === 'human' ? prev.matchSettings.p1Score + 1 : prev.matchSettings.p1Score;
          const newP2Score = winType === 'ai' ? prev.matchSettings.p2Score + 1 : prev.matchSettings.p2Score;
          
          return {
            ...prev,
            winner: winType,
            matchSettings: {
              ...prev.matchSettings,
              p1Score: newP1Score,
              p2Score: newP2Score
            }
          };
        });
      }
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
            addLog(`${gameState.playerNames.ai} activated STASIS field on ${String.fromCharCode(65 + target.col)}${BOARD_SIZE - target.row}.`, 'ai');
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
  const [logs, setLogs] = useState<{ human: any[], ai: any[] }>({ human: [], ai: [] });

  const addLog = (msg: string, type: 'human' | 'ai' | 'system') => {
    const time = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const entry = { id: Math.random().toString(36).substr(2, 9), msg, time, type };
    setLogs(prev => {
      // In multi-player, we log to respective matrices. In single, maybe AI feed shows all.
      // Actually, let's just push to both for system, and specific ones for players if we want "separation"
      // or just push EVERYTHING to both but keep the containers separate.
      // Re-reading: "separate aetheric matrix". I'll push EVERYTHING to both but labeled.
      const newHuman = [entry, ...prev.human].slice(0, 10);
      const newAi = [entry, ...prev.ai].slice(0, 10);
      return { human: newHuman, ai: newAi };
    });
  };

  const handleMove = (player: Player, move: Move) => {
    setFreezeUsedThisTurn(false);

    // Side effects like logging should happen outside the state updater
    const pos = `${String.fromCharCode(65 + move.to.col)}${BOARD_SIZE - move.to.row}`;
    addLog(`${player === 'human' ? gameState.playerNames.human : gameState.playerNames.ai} moved to ${pos}`, player);
    if (move.capturedPieceIds && move.capturedPieceIds.length > 0) {
      addLog(`${player === 'human' ? gameState.playerNames.human : gameState.playerNames.ai} secured ${move.capturedPieceIds.length} Core(s)`, 'system');
    }

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

      const humanPieces = nextPieces.filter(p => p.player === 'human');
      const aiPieces = nextPieces.filter(p => p.player === 'ai');

      let winner = prev.winner;
      let newP1Score = prev.matchSettings.p1Score;
      let newP2Score = prev.matchSettings.p2Score;

      if (humanPieces.length === 0) {
        winner = 'ai';
        newP2Score += 1;
      }
      if (aiPieces.length === 0) {
        winner = 'human';
        newP1Score += 1;
      }

      // Draw check: 1 human King and 1 ai King remaining
      if (humanPieces.length === 1 && aiPieces.length === 1 && humanPieces[0].isKing && aiPieces[0].isKing) {
        winner = 'draw';
      }

      let magicCharges = { ...prev.magicCharges };
      if (move.capturedPieceIds && move.capturedPieceIds.length > 0) {
        magicCharges[player] += move.capturedPieceIds.length;
      }

      return {
        ...prev,
        pieces: nextPieces,
        selectedPieceId: null,
        magicCharges,
        magicMode: false,
        winner,
        currentTurn: oppositePlayer,
        matchSettings: {
          ...prev.matchSettings,
          p1Score: newP1Score,
          p2Score: newP2Score
        }
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
    setTempMode(mode);
    setSetupStep('names');
    if (mode === 'single') {
      setP1Name('P1');
      setP2Name('AI');
      setP1Color('cyan');
      setP2Color('red');
    } else {
      setP1Name('PLAYER 1');
      setP2Name('PLAYER 2');
      setP1Color('cyan');
      setP2Color('amber');
    }
  };

  const confirmNames = () => {
    if (!tempMode) return;
    setGameState(prev => ({ 
      ...prev, 
      gameMode: tempMode, 
      winner: null, 
      pieces: INITIAL_PIECES, 
      currentTurn: 'human',
      playerNames: { 
        human: p1Name || 'P1', 
        ai: tempMode === 'single' ? (p2Name || 'AI') : (p2Name || 'P2') 
      },
      playerColors: {
        human: p1Color,
        ai: p2Color
      }
    }));
  };

  const selectVariant = (variant: 'classic' | 'bishop' | 'chain' | 'vortex') => {
    setGameState(prev => ({ ...prev, gameVariant: variant }));
    setSetupStep('match');
  };

  const selectBestOf = (count: number) => {
    setGameState(prev => ({
      ...prev,
      matchSettings: {
        ...prev.matchSettings,
        bestOf: count,
        p1Score: 0,
        p2Score: 0
      }
    }));
    setSetupStep('mode'); // This will be ignored since gameMode is set, but we need to change it from 'match'
    // Actually let's use a clear indicator that setup is done
    const entry = { id: 'init', msg: `Initializing ${gameState.gameVariant?.toUpperCase()} combat protocol`, time: new Date().toLocaleTimeString([], { hour12: false }), type: 'system' as const };
    setLogs({ human: [entry], ai: [entry] });
  };

  const resetToMenu = () => {
    setGameState(prev => ({ 
      ...prev, 
      gameMode: null, 
      gameVariant: null, 
      winner: null, 
      pieces: INITIAL_PIECES,
      matchSettings: { bestOf: 1, p1Score: 0, p2Score: 0 }
    }));
    setSetupStep('mode');
    setTempMode(null);
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
  const p1HealthPercent = Math.round((humanCount / 12) * 100);
  const p2HealthPercent = Math.round((aiCount / 12) * 100);
  const p1EssencePercent = Math.round((gameState.magicCharges.human / 5) * 100);
  const p2EssencePercent = Math.round((gameState.magicCharges.ai / 5) * 100);

  const p1ColorConfig = COLOR_OPTIONS.find(c => c.id === gameState.playerColors.human) || COLOR_OPTIONS[0];
  const p2ColorConfig = COLOR_OPTIONS.find(c => c.id === gameState.playerColors.ai) || COLOR_OPTIONS[1];

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
                  className="w-16 h-16 bg-white/5 border border-white/10 rounded-2xl mx-auto mb-6 flex items-center justify-center"
                >
                  <Circle className="w-8 h-8 text-white/20" />
                </motion.div>
                <h1 className="text-4xl font-black italic uppercase tracking-[0.2em] text-white mb-2 drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]">Chronos Checkers</h1>
                <p className="text-slate-500 uppercase tracking-widest text-[10px] font-bold">
                  {setupStep === 'mode' ? 'Select Combat Protocol' : 'Identity Verification'}
                </p>
              </div>

              <div className="space-y-6">
                {setupStep === 'mode' ? (
                  <div className="grid gap-4">
                    <button 
                      onClick={() => selectMode('single')}
                      className="group relative p-6 bg-white/5 border border-white/10 rounded-3xl hover:bg-cyan-500/10 hover:border-cyan-500/40 transition-all duration-300 overflow-hidden text-left"
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
                        <h3 className="text-xl font-bold uppercase tracking-tight text-white group-hover:text-amber-400 transition-colors">Two Players</h3>
                        <p className="text-xs text-slate-500 group-hover:text-slate-300">Local temporal combat vs an ally</p>
                      </div>
                      <div className="absolute right-6 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-all group-hover:translate-x-2">
                        <RotateCcw className="w-8 h-8 text-amber-400" />
                      </div>
                    </button>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="grid gap-4">
                      <div className="text-left">
                        <label className="text-[10px] text-slate-500 uppercase font-black tracking-widest ml-4 mb-2 block">
                          {tempMode === 'single' ? 'Enter User Identity' : 'Player 1 Identity'}
                        </label>
                        <input 
                          type="text" 
                          value={p1Name}
                          onChange={(e) => setP1Name(e.target.value)}
                          className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-white focus:outline-none focus:border-cyan-500/50 transition-colors uppercase font-bold tracking-tight text-lg mb-3"
                        />
                        <div className="flex gap-2 px-4 mb-6">
                           {COLOR_OPTIONS.map(c => {
                             const isLocked = c.id === p2Color;
                             const isSelected = c.id === p1Color;
                             return (
                               <button
                                 key={c.id}
                                 disabled={isLocked}
                                 onClick={() => setP1Color(c.id)}
                                 className={`w-6 h-6 rounded-full border-2 transition-all relative flex items-center justify-center
                                   ${isSelected ? 'scale-125 border-white shadow-[0_0_10px_white]' : 'border-transparent'} 
                                   ${isLocked ? 'opacity-10 cursor-not-allowed' : 'opacity-50 hover:opacity-100 cursor-pointer'} 
                                   ${c.bg}`}
                               >
                                 {isLocked && <div className="text-[8px] font-black text-white/40">X</div>}
                               </button>
                             );
                           })}
                        </div>
                      </div>

                      {tempMode === 'multi' && (
                        <div className="text-left">
                          <label className="text-[10px] text-slate-500 uppercase font-black tracking-widest ml-4 mb-2 block">Player 2 Identity</label>
                          <input 
                            type="text" 
                            value={p2Name}
                            onChange={(e) => setP2Name(e.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-white focus:outline-none focus:border-amber-500/50 transition-colors uppercase font-bold tracking-tight text-lg mb-3"
                          />
                          <div className="flex gap-2 px-4 mb-4">
                            {COLOR_OPTIONS.map(c => {
                              const isLocked = c.id === p1Color;
                              const isSelected = c.id === p2Color;
                              return (
                                <button
                                  key={c.id}
                                  disabled={isLocked}
                                  onClick={() => setP2Color(c.id)}
                                  className={`w-6 h-6 rounded-full border-2 transition-all relative flex items-center justify-center
                                    ${isSelected ? 'scale-125 border-white shadow-[0_0_10px_white]' : 'border-transparent'} 
                                    ${isLocked ? 'opacity-10 cursor-not-allowed' : 'opacity-50 hover:opacity-100 cursor-pointer'} 
                                    ${c.bg}`}
                                >
                                  {isLocked && <div className="text-[8px] font-black text-white/40">X</div>}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex gap-4">
                      <button 
                        onClick={() => setSetupStep('mode')}
                        className="flex-1 p-4 bg-white/5 border border-white/10 rounded-2xl text-slate-400 font-bold uppercase tracking-widest text-xs hover:bg-white/10 transition-colors"
                      >
                        Back
                      </button>
                      <button 
                        onClick={confirmNames}
                        className="flex-[2] p-4 bg-cyan-500/20 border border-cyan-500/40 rounded-2xl text-cyan-400 font-bold uppercase tracking-widest text-xs hover:bg-cyan-500/30 transition-colors shadow-[0_0_20px_rgba(34,211,238,0.1)]"
                      >
                        Confirm Sync
                      </button>
                    </div>
                  </div>
                )}
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

        {gameState.gameMode && gameState.gameVariant && setupStep === 'match' && (
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
                  <Award className="w-8 h-8 text-cyan-400" />
                </motion.div>
                <h2 className="text-2xl font-black uppercase tracking-[0.2em] text-white mb-2">Match Protocol</h2>
                <p className="text-slate-500 uppercase tracking-widest text-[10px] font-bold">Series Length Optimization</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {[1, 3, 5, 7].map((count) => (
                  <button 
                    key={count}
                    onClick={() => selectBestOf(count)}
                    className="group relative p-6 bg-white/5 border border-white/10 rounded-3xl hover:bg-cyan-500/10 hover:border-cyan-500/40 transition-all duration-300 overflow-hidden"
                  >
                    <div className="relative z-10">
                      <h3 className="text-2xl font-black text-white group-hover:text-cyan-400 transition-colors">BO{count}</h3>
                      <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Best of {count}</p>
                      <p className="text-[8px] text-slate-600 mt-2 italic">Needs {Math.floor(count / 2) + 1} Wins</p>
                    </div>
                  </button>
                ))}
              </div>

              <button 
                onClick={() => setSetupStep('names')}
                className="text-[10px] uppercase tracking-widest text-slate-600 hover:text-slate-400 font-bold"
              >
                ← Back to Identity Verification
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header Section */}
      <header className="h-20 border-b border-white/5 bg-black/40 backdrop-blur-md px-10 flex justify-between items-center shrink-0">
        <div className="flex flex-col cursor-pointer" onClick={resetToMenu}>
          <h1 className="text-2xl font-black tracking-[0.1em] text-white uppercase italic">Chronos Checkers</h1>
          <span className="text-[10px] text-slate-500 tracking-[0.2em] font-bold uppercase">
             {gameState.gameMode === 'single' ? 'SOLO PROTOCOL' : 'VERSUS LINK'}
          </span>
        </div>
        <div className="flex gap-12">
          {gameState.matchSettings.bestOf > 1 && (
            <div className="flex items-center gap-6">
               <div className="text-right">
                  <p className="text-[10px] text-slate-500 uppercase font-black mb-1">Match Series</p>
                  <div className="flex gap-1">
                    {[...Array(gameState.matchSettings.bestOf)].map((_, i) => {
                      const winsNeeded = Math.floor(gameState.matchSettings.bestOf / 2) + 1;
                      const isP1Win = i < gameState.matchSettings.p1Score;
                      // Show P2 wins from the right side
                      const isP2Win = i >= gameState.matchSettings.bestOf - gameState.matchSettings.p2Score;
                      
                      return (
                        <div key={i} className={`h-1.5 w-4 rounded-full transition-all duration-500 ${
                          isP1Win ? p1ColorConfig.bg : 
                          isP2Win ? p2ColorConfig.bg :
                          'bg-white/10'
                        }`} />
                      );
                    })}
                  </div>
               </div>
               <div className="flex items-center gap-4 bg-white/5 px-4 py-2 rounded-xl border border-white/10">
                  <div className="text-center">
                    <p className={`text-[9px] font-black uppercase ${p1ColorConfig.accent}`}>{gameState.playerNames.human.slice(0, 3)}</p>
                    <p className="text-lg font-black text-white leading-none">{gameState.matchSettings.p1Score}</p>
                  </div>
                  <div className="w-px h-6 bg-white/10" />
                  <div className="text-center">
                    <p className={`text-[9px] font-black uppercase ${p2ColorConfig.accent}`}>{gameState.playerNames.ai.slice(0, 3)}</p>
                    <p className="text-lg font-black text-white leading-none">{gameState.matchSettings.p2Score}</p>
                  </div>
                  <div className="w-px h-6 bg-white/10" />
                  <div className="text-[10px] font-mono text-slate-500 font-black">BO{gameState.matchSettings.bestOf}</div>
               </div>
            </div>
          )}
          <div className="text-right">
            <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mb-1">Current Phase</p>
            <p className={`text-sm font-mono tracking-tighter ${gameState.currentTurn === 'human' ? COLOR_OPTIONS.find(c => c.id === gameState.playerColors.human)?.accent : COLOR_OPTIONS.find(c => c.id === gameState.playerColors.ai)?.accent + ' animate-pulse'}`}>
              {gameState.magicMode ? 'SURGE STATE' : gameState.currentTurn === 'human' ? `${gameState.playerNames.human.toUpperCase()}_READY` : `${gameState.playerNames.ai.toUpperCase()}_READY`}
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
        {/* Sidebar Left: Nexus P1 */}
        <aside className="w-64 flex flex-col gap-6 shrink-0">
          {/* Status Panel */}
          <div className={`p-5 bg-gradient-to-br from-black/40 to-transparent border ${p1ColorConfig.border}/20 rounded-2xl shadow-xl ${p1ColorConfig.glow}/5`}>
            <h2 className={`text-xs font-bold ${p1ColorConfig.accent} uppercase tracking-widest mb-4 flex items-center gap-2`}>
               {gameState.playerNames.human} NEXUS
            </h2>
            <div className="space-y-5">
              {/* Vitality (Health) */}
              <div>
                <div className="flex justify-between items-center mb-1.5 grayscale opacity-50">
                  <span className="text-[9px] text-slate-400 uppercase font-black tracking-widest">Vitality Scan</span>
                  <span className={`text-[10px] font-mono ${p1ColorConfig.accent}`}>{humanCount}/12</span>
                </div>
                <div className="relative h-1.5 w-full bg-slate-800/50 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${p1HealthPercent}%` }}
                    className={`absolute left-0 top-0 h-full ${p1ColorConfig.bg} ${p1ColorConfig.glow}`} 
                  />
                </div>
              </div>

              {/* Essence (Charges) */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[9px] text-slate-400 uppercase font-black tracking-widest">Essence Level</span>
                  <span className={`text-[10px] font-mono ${p1ColorConfig.accent}`}>{p1EssencePercent}%</span>
                </div>
                <div className="flex gap-1.5">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className={`h-2.5 flex-1 rounded-full border transition-all duration-500 ${
                      i < gameState.magicCharges.human 
                      ? `${p1ColorConfig.bg} ${p1ColorConfig.border} ${p1ColorConfig.glow}/40` 
                      : 'bg-slate-900 border-white/5'
                    }`} />
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="flex-1 p-5 bg-black/40 border border-white/5 rounded-2xl flex flex-col shadow-inner overflow-hidden">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 border-b border-white/5 pb-2">Aetheric Matrix</h2>
            <div className="flex-1 overflow-y-auto pr-1 space-y-4 font-mono scrollbar-hide mb-4">
              <AnimatePresence initial={false}>
                {logs.human.map((log) => (
                  <motion.div 
                    key={log.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="text-[9px] flex gap-2"
                  >
                    <span className="text-slate-700 shrink-0">{log.time}</span>
                    <p className={`${
                      log.type === 'human' ? p1ColorConfig.accent : 
                      log.type === 'ai' ? 'text-slate-500' : 
                      'text-white/60 italic font-bold'
                    }`}>
                      {log.msg}
                    </p>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
            
            <div className="space-y-4">
              <button 
                onClick={toggleMagicMode}
                disabled={gameState.currentTurn !== 'human' || gameState.magicCharges.human === 0 || freezeUsedThisTurn}
                className={`w-full p-3 rounded-xl relative overflow-hidden group transition-all duration-500 border text-left ${
                  gameState.currentTurn === 'human' && gameState.magicMode 
                    ? `${p1ColorConfig.bgSubtle} ${p1ColorConfig.border} shadow-[0_0_15px_rgba(0,0,0,0.2)]` 
                    : (gameState.currentTurn === 'human' && gameState.magicCharges.human > 0 && !freezeUsedThisTurn)
                      ? `bg-white/5 border-white/10 hover:${p1ColorConfig.border} cursor-pointer`
                      : 'bg-slate-900/50 border-white/5 opacity-50 cursor-not-allowed'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded flex items-center justify-center transition-colors ${
                    gameState.currentTurn === 'human' && (gameState.magicMode || gameState.magicCharges.human > 0) ? `${p1ColorConfig.bg} text-black` : 'bg-slate-800 text-slate-500'
                  }`}>
                    <Zap className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-white">Aether Freeze</p>
                    <p className={`text-[8px] font-mono ${p1ColorConfig.accent}/60 uppercase`}>
                      {gameState.currentTurn === 'human' && gameState.magicMode ? 'Target Piece' : `${gameState.magicCharges.human} Energy Available`}
                    </p>
                  </div>
                </div>
              </button>

              <button 
                onClick={resetToMenu}
                className="w-full py-3 bg-white/5 border border-white/10 rounded-xl text-[10px] uppercase tracking-[0.2em] font-black hover:bg-white/10 transition-colors"
              >
                Exit Strategy
              </button>
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

                const activeColorConfig = activePiece?.player === 'human' ? p1ColorConfig : p2ColorConfig;

                return (
                  <div
                    key={i}
                    onClick={() => handleSquareClick(r, c)}
                    className={`relative flex items-center justify-center cursor-pointer transition-colors duration-500 ${
                      isDark ? 'bg-[#111318]' : 'bg-[#2a2d35]'
                    }`}
                  >
                    {canMoveHere && (
                      <div className={`absolute w-3 h-3 rounded-full opacity-40 animate-pulse ${activeColorConfig.bg} ${activeColorConfig.shadow}`} />
                    )}
                    {piece && (
                      <motion.div
                        layoutId={piece.id}
                        className={`relative w-[80%] h-[80%] rounded-full shadow-2xl flex items-center justify-center 
                          ${piece.player === 'human' 
                            ? `bg-gradient-to-br ${p1ColorConfig.from} ${p1ColorConfig.to} border-2 ${p1ColorConfig.border} ${p1ColorConfig.glow}` 
                            : `bg-gradient-to-br ${p2ColorConfig.from} ${p2ColorConfig.to} border-2 ${p2ColorConfig.border} ${p2ColorConfig.glow}`
                          }
                          ${isSelected ? 'ring-4 ring-white/20 ring-offset-2 ring-offset-black scale-105 z-20' : ''}
                        `}
                      >
                        {piece.isKing && (
                          <Award className={`w-1/2 h-1/2 ${piece.player === 'human' ? 'text-white/60' : 'text-slate-400/60'}`} />
                        )}

                        {/* Cooldown Timer Turns */}
                        {piece.cooldownTurns > 0 && (
                          <div className={`absolute -top-1 -right-1 w-6 h-6 bg-slate-950 border ${piece.player === 'human' ? p1ColorConfig.border : p2ColorConfig.border} rounded-full flex items-center justify-center shadow-lg`}>
                            <span className={`text-[10px] font-mono ${piece.player === 'human' ? p1ColorConfig.accent : p2ColorConfig.accent} font-bold`}>
                              {piece.cooldownTurns}
                            </span>
                          </div>
                        )}

                        {/* Frozen Layer */}
                        {piece.isFrozen && (
                          <div className={`absolute inset-0 rounded-full bg-cyan-400/20 backdrop-blur-[1.5px] border-2 border-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.4)] flex items-center justify-center`}>
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
                <div className={`w-full max-w-sm p-8 rounded-3xl border-2 text-center shadow-2xl bg-[#06080c]/95 ${
                  gameState.winner === 'human' ? `${p1ColorConfig.border} ${p1ColorConfig.glow}/20` : 
                  gameState.winner === 'draw' ? 'border-slate-500 shadow-slate-500/20' :
                  `${p2ColorConfig.border} ${p2ColorConfig.glow}/20`
                }`}>
                  {(() => {
                    const winsNeeded = Math.floor(gameState.matchSettings.bestOf / 2) + 1;
                    const matchOver = gameState.matchSettings.p1Score >= winsNeeded || gameState.matchSettings.p2Score >= winsNeeded;
                    const matchWinner = gameState.matchSettings.p1Score >= winsNeeded ? 'human' : 'ai';
                    
                    return (
                      <>
                        <h2 className="text-4xl font-black italic uppercase tracking-tighter mb-2 italic">
                          {matchOver ? (matchWinner === 'human' ? 'SERIES VICTORY' : 'SERIES DEFEAT') : (gameState.winner === 'draw' ? 'DRAW' : gameState.winner === 'human' ? 'GAME WON' : 'GAME LOST')}
                        </h2>
                        
                        <div className="flex justify-center gap-8 mb-6 py-4 bg-white/5 rounded-2xl border border-white/5">
                          <div className="text-center">
                            <p className={`text-[10px] font-black uppercase ${p1ColorConfig.accent}`}>{gameState.playerNames.human}</p>
                            <p className="text-3xl font-black text-white">{gameState.matchSettings.p1Score}</p>
                          </div>
                          <div className="flex items-center text-slate-700 font-black text-xl italic">—</div>
                          <div className="text-center">
                            <p className={`text-[10px] font-black uppercase ${p2ColorConfig.accent}`}>{gameState.playerNames.ai}</p>
                            <p className="text-3xl font-black text-white">{gameState.matchSettings.p2Score}</p>
                          </div>
                        </div>

                        <p className="text-[10px] text-slate-400 uppercase tracking-widest font-mono mb-8 italic">
                          {matchOver ? 'MATCH PROTOCOL COMPLETED' : `BEST OF ${gameState.matchSettings.bestOf} • SERIES IN PROGRESS`}
                        </p>
                        
                        <div className="grid gap-2">
                          {!matchOver && (
                            <button 
                              onClick={resetGame}
                              className="w-full py-4 bg-gradient-to-r from-cyan-600 to-cyan-400 text-black border-none rounded-xl text-xs font-black uppercase tracking-widest hover:brightness-110 transition-all hover:scale-[1.02]"
                            >
                              Next Battle
                            </button>
                          )}
                          <button 
                            onClick={resetToMenu}
                            className={`w-full py-4 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                              matchOver ? 'bg-white/10 text-white' : 'bg-transparent border border-white/10 text-slate-500 hover:text-white'
                            }`}
                          >
                            {matchOver ? 'Finalize Protocol' : 'Abandon Series'}
                          </button>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Sidebar Right: Nexus P2 / AI */}
        <aside className="w-64 flex flex-col gap-6 shrink-0">
          {/* Status Panel */}
          <div className={`p-5 bg-gradient-to-br from-black/40 to-transparent border ${p2ColorConfig.border}/20 rounded-2xl shadow-xl ${p2ColorConfig.glow}/5`}>
            <h2 className={`text-xs font-bold uppercase tracking-widest mb-4 flex items-center justify-between ${p2ColorConfig.accent}`}>
               <span>{gameState.playerNames.ai} NEXUS</span>
               <span className="text-[8px] px-1.5 py-0.5 rounded-sm bg-white/5 border border-white/10 opacity-70 font-black">
                 {gameState.gameMode === 'single' ? 'AI_CORE' : 'P2_LINK'}
               </span>
            </h2>
            <div className="space-y-5">
              {/* Vitality (Health) */}
              <div>
                <div className="flex justify-between items-center mb-1.5 grayscale opacity-50">
                  <span className="text-[9px] text-slate-400 uppercase font-black tracking-widest">Vitality Scan</span>
                  <span className={`text-[10px] font-mono ${p2ColorConfig.accent}`}>{aiCount}/12</span>
                </div>
                <div className="relative h-1.5 w-full bg-slate-800/50 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${p2HealthPercent}%` }}
                    className={`absolute left-0 top-0 h-full ${p2ColorConfig.bg} ${p2ColorConfig.glow}`}
                  />
                </div>
              </div>

              {/* Essence (Charges) */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[9px] text-slate-400 uppercase font-black tracking-widest">Essence Level</span>
                  <span className={`text-[10px] font-mono ${p2ColorConfig.accent}`}>{p2EssencePercent}%</span>
                </div>
                <div className="flex gap-1.5">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className={`h-2.5 flex-1 rounded-full border transition-all duration-500 ${
                      i < gameState.magicCharges.ai 
                      ? `${p2ColorConfig.bg} ${p2ColorConfig.border} ${p2ColorConfig.glow}/40` 
                      : 'bg-slate-900 border-white/5'
                    }`} />
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="flex-1 p-5 bg-black/40 border border-white/5 rounded-2xl flex flex-col shadow-inner overflow-hidden">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 border-b border-white/5 pb-2">Aetheric Matrix</h2>
            <div className="flex-1 overflow-y-auto pr-1 space-y-4 font-mono scrollbar-hide mb-4">
              <AnimatePresence initial={false}>
                {logs.ai.map((log) => (
                  <motion.div 
                    key={log.id}
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="text-[9px] flex gap-2"
                  >
                    <span className="text-slate-700 shrink-0">{log.time}</span>
                    <p className={`${
                      log.type === 'ai' ? p2ColorConfig.accent : 
                      log.type === 'human' ? 'text-slate-500' : 
                      'text-white/60 italic font-bold'
                    }`}>
                      {log.msg}
                    </p>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
            
            {gameState.gameMode === 'multi' && (
              <button 
                onClick={toggleMagicMode}
                disabled={gameState.currentTurn !== 'ai' || gameState.magicCharges.ai === 0 || freezeUsedThisTurn}
                className={`w-full p-3 rounded-xl relative overflow-hidden group transition-all duration-500 border text-left ${
                  gameState.currentTurn === 'ai' && gameState.magicMode 
                    ? `${p2ColorConfig.bgSubtle} ${p2ColorConfig.border} shadow-[0_0_15px_rgba(0,0,0,0.2)]` 
                    : (gameState.currentTurn === 'ai' && gameState.magicCharges.ai > 0 && !freezeUsedThisTurn)
                      ? `bg-white/5 border-white/10 hover:${p2ColorConfig.border} cursor-pointer`
                      : 'bg-slate-900/50 border-white/5 opacity-50 cursor-not-allowed'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded flex items-center justify-center transition-colors ${
                    gameState.currentTurn === 'ai' && (gameState.magicMode || gameState.magicCharges.ai > 0) ? `${p2ColorConfig.bg} text-black` : 'bg-slate-800 text-slate-500'
                  }`}>
                    <Zap className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-white">Aether Freeze</p>
                    <p className={`text-[8px] font-mono ${p2ColorConfig.accent}/60 uppercase`}>
                      {gameState.currentTurn === 'ai' && gameState.magicMode ? 'Target Piece' : `${gameState.magicCharges.ai} Energy Available`}
                    </p>
                  </div>
                </div>
              </button>
            )}

            {gameState.gameMode === 'single' && (
              <div className={`p-4 ${p2ColorConfig.bgSubtle} border ${p2ColorConfig.border}/20 rounded-xl`}>
                 <p className="text-[9px] text-slate-500 uppercase font-black mb-1">Status Protocol</p>
                 <p className="text-xs font-mono text-white tracking-widest">{gameState.currentTurn === 'ai' ? 'PROCESSING...' : 'STANDBY'}</p>
                 <div className="mt-3 flex gap-1">
                   {[...Array(3)].map((_, i) => (
                     <div key={i} className={`h-1 flex-1 rounded-full ${gameState.currentTurn === 'ai' ? p2ColorConfig.bg + ' animate-pulse' : 'bg-slate-800'}`} />
                   ))}
                 </div>
              </div>
            )}
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
