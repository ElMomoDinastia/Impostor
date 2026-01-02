"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.transition = transition;
exports.transitionToClues = transitionToClues;

const types_1 = require("./types");

function shuffle(array) {
    return [...array].sort(() => Math.random() - 0.5);
}

function transition(state, action) {
    switch (action.type) {
        case 'PLAYER_JOIN':
            const newPlayers = new Map(state.players);
            newPlayers.set(action.player.id, {
                ...action.player,
                joinedAt: Date.now()
            });

            return { 
                state: { ...state, players: newPlayers }, 
                sideEffects: [{ 
                    type: 'ANNOUNCE_PRIVATE', 
                    playerId: action.player.id, 
                    message: '⚽ ¡Bienvenido! Escribe "jugar" para entrar.' 
                }] 
            };
        
        case 'PLAYER_LEAVE': {
            const playersAfterLeave = new Map(state.players);
            playersAfterLeave.delete(action.playerId);
            const queueAfterLeave = state.queue.filter(id => id !== action.playerId);
            
            const isGameActive = state.currentRound && 
                                 state.phase !== types_1.GamePhase.WAITING && 
                                 state.phase !== types_1.GamePhase.REVEAL;

            if (isGameActive) {
                if (action.playerId === state.currentRound.impostorId) {
                    return {
                        state: { 
                            ...state, 
                            players: playersAfterLeave, 
                            queue: queueAfterLeave, 
                            phase: types_1.GamePhase.REVEAL 
                        },
                        sideEffects: [
                            { type: 'CLEAR_TIMER' },
                            { type: 'ANNOUNCE_PUBLIC', message: `🏃 EL IMPOSTOR HA ABANDONADO LA SALA...`, style: { color: 0xFFFF00 } },
                            { type: 'ANNOUNCE_PUBLIC', message: `🏆 ¡VICTORIA PARA LOS INOCENTES!`, style: { color: 0x00FF00, fontWeight: 'bold' } },
                            { type: 'UPDATE_STATS', winnerRole: 'INOCENTE', winners: state.currentRound.normalPlayerIds.filter(id => id !== action.playerId) },
                            { type: 'SET_PHASE_TIMER', durationSeconds: 5, nextAction: 'RESET_GAME' }
                        ]
                    };
                }

                const newRound = {
                    ...state.currentRound,
                    clueOrder: state.currentRound.clueOrder.filter(id => id !== action.playerId),
                    normalPlayerIds: state.currentRound.normalPlayerIds.filter(id => id !== action.playerId)
                };

                return { 
                    state: { ...state, players: playersAfterLeave, queue: queueAfterLeave, currentRound: newRound }, 
                    sideEffects: [{ type: 'ANNOUNCE_PUBLIC', message: `⚠️ Un inocente se ha retirado.` }] 
                };
            }

            return { 
                state: { ...state, players: playersAfterLeave, queue: queueAfterLeave }, 
                sideEffects: [] 
            };
        }

       case 'JOIN_QUEUE':
            if (state.queue.includes(action.playerId)) return { state, sideEffects: [] };
                        if (state.currentRound?.clueOrder.includes(action.playerId)) {
                return { 
                    state, 
                    sideEffects: [{ type: 'ANNOUNCE_PRIVATE', playerId: action.playerId, message: '❌ Ya estás jugando la ronda actual.' }] 
                };
            }

            const updatedQueue = [...state.queue, action.playerId];
            const playerPosition = updatedQueue.length;
            const playerName = state.players.get(action.playerId)?.name || "Jugador";
            
            const message = playerPosition <= 5 && state.phase === types_1.GamePhase.WAITING
                ? `✅ @${playerName} anotado (${playerPosition}/5)`
                : `⏳ @${playerName} en espera (Posición: ${state.phase === types_1.GamePhase.WAITING ? playerPosition : playerPosition})`;

            return { 
                state: { ...state, queue: updatedQueue }, 
                sideEffects: [{ type: 'ANNOUNCE_PUBLIC', message, style: { color: 0x00FFCC } }] 
            };

        case 'START_GAME': {
            const participants = state.queue.slice(0, 5);
            const impostorId = participants[Math.floor(Math.random() * participants.length)];
            const footballer = action.footballers[Math.floor(Math.random() * action.footballers.length)];
            const round = {
                footballer, impostorId,
                normalPlayerIds: participants.filter(id => id !== impostorId),
                clueOrder: shuffle(participants),
                currentClueIndex: 0,
                clues: new Map(), votes: new Map()
            };
            const effects = [
                { type: 'ANNOUNCE_PUBLIC', message: '━━━━━━━━━━━━━━━━━━━━━━━━' },
                { type: 'ANNOUNCE_PUBLIC', message: '🕵️ RONDA INICIADA. ¡REVISEN SUS PRIVADOS!', style: { color: 0x00FFFF, fontWeight: 'bold' } },
                { type: 'ANNOUNCE_PUBLIC', message: '━━━━━━━━━━━━━━━━━━━━━━━━' }
            ];
            participants.forEach(id => {
                const msg = id === impostorId ? '🕵️ ERES EL IMPOSTOR. Disimula y sobrevive.' : `⚽ EL JUGADOR ES: ${footballer.toUpperCase()}`;
                effects.push({ type: 'ANNOUNCE_PRIVATE', playerId: id, message: msg });
            });
            return { 
                state: { ...state, phase: types_1.GamePhase.ASSIGN, currentRound: round, queue: state.queue.slice(5) }, 
                sideEffects: effects 
            };
        }

        case 'SUBMIT_CLUE': {
            const rClue = state.currentRound;
            if (!rClue || state.phase !== types_1.GamePhase.CLUES) return { state, sideEffects: [] };
            if (rClue.clues.has(action.playerId)) return { state, sideEffects: [] };
            
            const newClues = new Map(rClue.clues).set(action.playerId, action.clue);
            const isLastClue = rClue.currentClueIndex >= rClue.clueOrder.length - 1;
            
            if (isLastClue) {
                const effects = [
                    { type: 'ANNOUNCE_PUBLIC', message: `💬 Última pista: "${action.clue}"` },
                    { type: 'ANNOUNCE_PUBLIC', message: "📜 --- RESUMEN DE PISTAS ---", style: { color: 0xFFFF00, fontWeight: 'bold' } }
                ];

                rClue.clueOrder.forEach((id) => {
                    const name = state.players.get(id)?.name || "Desconectado";
                    const clueText = id === action.playerId ? action.clue : (newClues.get(id) || "Sin pista");
                    effects.push({ type: 'ANNOUNCE_PUBLIC', message: `📍 ${name.toUpperCase()}: "${clueText}"`, style: { color: 0xFFFFFF } });
                });

                effects.push({ type: 'ANNOUNCE_PUBLIC', message: `🗣️ DEBATE (${state.settings.discussionTimeSeconds}s)`, style: { color: 0xFF9900, fontWeight: "bold" } });
                effects.push({ type: 'SET_PHASE_TIMER', durationSeconds: state.settings.discussionTimeSeconds });

                return { 
                    state: { ...state, phase: types_1.GamePhase.DISCUSSION, currentRound: { ...rClue, clues: newClues } }, 
                    sideEffects: effects
                };
            }

            const nextIndex = rClue.currentClueIndex + 1;
            const nextPlayerId = rClue.clueOrder[nextIndex];
            const nextPlayer = state.players.get(nextPlayerId);

            if (!nextPlayer) {
                return { 
                    state: { ...state, currentRound: { ...rClue, clues: newClues, currentClueIndex: nextIndex } }, 
                    sideEffects: [{ type: 'SET_PHASE_TIMER', durationSeconds: 0.1 }] 
                };
            }

            return { 
                state: { ...state, currentRound: { ...rClue, clues: newClues, currentClueIndex: nextIndex } }, 
                sideEffects: [
                    { type: 'ANNOUNCE_PUBLIC', message: `💬 Pista: "${action.clue}"` },
                    { type: 'ANNOUNCE_PUBLIC', message: `🔔 TURNO DE: ${nextPlayer.name.toUpperCase()}`, style: { color: 0xFFFF00, fontWeight: "bold" } },
                    { type: 'SET_PHASE_TIMER', durationSeconds: state.settings.clueTimeSeconds }
                ]
            };
        }

        case 'END_DISCUSSION': {
            if (!state.currentRound) return { state, sideEffects: [] };
            const list = state.currentRound.clueOrder
                .map((id, i) => {
                    const p = state.players.get(id);
                    return `[ ${i + 1} ] ${p ? p.name.toUpperCase() : "---"}`;
                })
                .join('    ');

            return { 
                state: { ...state, phase: types_1.GamePhase.VOTING }, 
                sideEffects: [
                    { type: 'ANNOUNCE_PUBLIC', message: `🗳️ ¡A VOTAR! ESCRIBAN EL NÚMERO:`, style: { color: 0xFF0000, fontWeight: "bold" } },
                    { type: 'ANNOUNCE_PUBLIC', message: list, style: { color: 0x00FFFF, fontWeight: "bold" } },
                    { type: 'SET_PHASE_TIMER', durationSeconds: state.settings.votingTimeSeconds }
                ] 
            };
        }

        case 'SUBMIT_VOTE': {
            const rVote = state.currentRound;
            if (!rVote || state.phase !== types_1.GamePhase.VOTING) return { state, sideEffects: [] };
            if (rVote.votes.has(action.playerId)) return { state, sideEffects: [] };

            const newVotes = new Map(rVote.votes).set(action.playerId, action.votedId);
            if (newVotes.size >= rVote.clueOrder.length) {
                return handleEndVoting({ ...state, currentRound: { ...rVote, votes: newVotes } });
            }
            return { state: { ...state, currentRound: { ...rVote, votes: newVotes } }, sideEffects: [] };
        }

        case 'END_VOTING': return handleEndVoting(state);
        
        case 'RESET_GAME': 
            return { 
                state: { ...state, phase: types_1.GamePhase.WAITING, currentRound: null }, 
                sideEffects: [
                    { type: 'CLEAR_TIMER' },
                    { type: 'ANNOUNCE_PUBLIC', message: '━━━━━━━━━━━━━━━━━━━━━━━━' },
                    { type: 'ANNOUNCE_PUBLIC', message: '🎮 ¡PARTIDA FINALIZADA!', style: { color: 0x00FFCC, fontWeight: 'bold' } },
                    { type: 'ANNOUNCE_PUBLIC', message: '👉 Escriban "jugar" para la próxima.', style: { color: 0xFFFF00, fontWeight: 'bold' } },
                    { type: 'ANNOUNCE_PUBLIC', message: '━━━━━━━━━━━━━━━━━━━━━━━━' },
                    { type: 'AUTO_START_GAME' } 
                ] 
            };
            
        default: return { state, sideEffects: [] };
    }
}

function handleEndVoting(state) {
    const round = state.currentRound;
    if (!round) return { state, sideEffects: [] };

    const counts = {};
    round.votes.forEach(v => counts[v] = (counts[v] || 0) + 1);
    const sorted = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
    
    if (sorted.length === 0) {
        return { 
            state: { ...state, phase: types_1.GamePhase.REVEAL }, 
            sideEffects: [
                { type: 'ANNOUNCE_PUBLIC', message: "❌ NADIE VOTÓ. Empate técnico." }, 
                { type: 'SET_PHASE_TIMER', durationSeconds: 5, nextAction: 'RESET_GAME' }
            ] 
        };
    }

    const votedOutId = parseInt(sorted[0]); 
    const isImpostor = votedOutId === round.impostorId;
    const votedPlayer = state.players.get(votedOutId);
    const votedName = (votedPlayer?.name || "Alguien").toUpperCase();

    if (isImpostor) {
        return { 
            state: { ...state, phase: types_1.GamePhase.REVEAL }, 
            sideEffects: [
                { type: 'CLEAR_TIMER' },
                { type: 'ANNOUNCE_PUBLIC', message: `━━━━━━━━━━━━━━━━━━━━━━━━` },
                { type: 'ANNOUNCE_PUBLIC', message: `🎯 ¡LO CAZARON! ${votedName} ERA EL IMPOSTOR`, style: { color: 0x00FF00, fontWeight: "bold" } },
                { type: 'ANNOUNCE_PUBLIC', message: `🏆 ¡VICTORIA PARA LOS INOCENTES!`, style: { color: 0x00FF00, fontWeight: "bold" } },
                { type: 'ANNOUNCE_PUBLIC', message: `━━━━━━━━━━━━━━━━━━━━━━━━` },
                { type: 'UPDATE_STATS', winnerRole: 'INOCENTE', winners: round.clueOrder.filter(id => id !== round.impostorId) },
                { type: 'SET_PHASE_TIMER', durationSeconds: 7, nextAction: 'RESET_GAME' }
            ] 
        };
    } 

    const remainingInnocents = round.normalPlayerIds.filter(id => id !== votedOutId);
    
    if (remainingInnocents.length <= 1) {
        const impName = (state.players.get(round.impostorId)?.name || "El Impostor").toUpperCase();
        return { 
            state: { ...state, phase: types_1.GamePhase.REVEAL }, 
            sideEffects: [
                { type: 'CLEAR_TIMER' },
                { type: 'ANNOUNCE_PUBLIC', message: `━━━━━━━━━━━━━━━━━━━━━━━━` },
                { type: 'ANNOUNCE_PUBLIC', message: `💀 ¡GAME OVER! GANÓ EL IMPOSTOR (${impName})`, style: { color: 0xFF0000, fontWeight: "bold" } },
                { type: 'ANNOUNCE_PUBLIC', message: `❌ ${votedName} ERA INOCENTE.`, style: { color: 0xFFFFFF } },
                { type: 'ANNOUNCE_PUBLIC', message: `━━━━━━━━━━━━━━━━━━━━━━━━` },
                { type: 'UPDATE_STATS', winnerRole: 'IMPOSTOR', winners: [round.impostorId] },
                { type: 'SET_PHASE_TIMER', durationSeconds: 7, nextAction: 'RESET_GAME' }
            ] 
        };
    }

    const nextClueOrder = round.clueOrder.filter(id => id !== votedOutId);
    const firstPlayerId = nextClueOrder[0];
    const firstPlayerName = (state.players.get(firstPlayerId)?.name || "ALGUIEN").toUpperCase();

    const nextRound = {
        ...round,
        normalPlayerIds: remainingInnocents,
        clueOrder: nextClueOrder,
        currentClueIndex: 0,
        clues: new Map(),
        votes: new Map()
    };

    return { 
        state: { ...state, phase: types_1.GamePhase.CLUES, currentRound: nextRound }, 
        sideEffects: [
            { type: 'CLEAR_TIMER' },
            { type: 'ANNOUNCE_PUBLIC', message: `❌ ${votedName} ERA INOCENTE.`, style: { color: 0xFF4444, fontWeight: "bold" } },
            { type: 'ANNOUNCE_PUBLIC', message: `📝 NUEVA RONDA DE PISTAS...`, style: { color: 0xFFFF00, fontWeight: "bold" } },
            { type: 'ANNOUNCE_PUBLIC', message: `🔔 TURNO DE: ${firstPlayerName}`, style: { color: 0x00FFCC, fontWeight: "bold" } },
            { type: 'SET_PHASE_TIMER', durationSeconds: state.settings.clueTimeSeconds }
        ] 
    };
}

function transitionToClues(state) {
    if (!state.currentRound || !state.currentRound.clueOrder.length) return { state, sideEffects: [] };
    const firstId = state.currentRound.clueOrder[0];
    const first = state.players.get(firstId);
    return { 
        state: { ...state, phase: types_1.GamePhase.CLUES }, 
        sideEffects: [
            { type: 'ANNOUNCE_PUBLIC', message: `📝 EMPIEZAN LAS PISTAS. TURNO DE: ${first?.name.toUpperCase() || "DESCONOCIDO"}`, style: { color: 0x00FFCC, fontWeight: "bold" } },
            { type: 'SET_PHASE_TIMER', durationSeconds: state.settings.clueTimeSeconds }
        ] 
    };
}
