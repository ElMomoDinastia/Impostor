"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.transition = transition;
exports.transitionToClues = transitionToClues;

const types_1 = require("./types");

/**
 * UTILS: Estética y Formateo
 */
const s = (text) => {
    const map = {
        'a': 'ᴀ', 'b': 'ʙ', 'c': 'ᴄ', 'd': 'ᴅ', 'e': 'ᴇ', 'f': 'ꜰ', 'g': 'ɢ', 'h': 'ʜ', 'i': 'ɪ', 
        'j': 'ᴊ', 'k': 'ᴋ', 'l': 'ʟ', 'm': 'ᴍ', 'n': 'ɴ', 'o': 'ᴏ', 'p': 'ᴘ', 'q': 'ǫ', 'r': 'ʀ', 
        's': 'ꜱ', 't': 'ᴛ', 'u': 'ᴜ', 'v': 'ᴠ', 'w': 'ᴡ', 'x': 'x', 'y': 'ʏ', 'z': 'ᴢ'
    };
    return text.toLowerCase().split('').map(char => map[char] || char).join('');
};

const BORDER = "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━";

function shuffle(array) {
    return [...array].sort(() => Math.random() - 0.5);
}

/**
 * LÓGICA DE TRANSICIÓN DE ESTADOS
 */
function transition(state, action) {
    switch (action.type) {
        case 'PLAYER_JOIN': {
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
                    message: `⭐ ${s('ʙɪᴇɴᴠᴇɴɪᴅᴏ')}! ${s('ᴇꜱᴄʀɪʙᴇ')} "jugar" ${s('ᴘᴀʀᴀ ᴇɴᴛʀᴀʀ ᴀ ʟᴀ ꜰɪʟᴀ')}.` 
                }] 
            };
        }
case 'PLAYER_LEAVE': {
            const playersAfterLeave = new Map(state.players);
            playersAfterLeave.delete(action.playerId);
            const queueAfterLeave = state.queue.filter(id => id !== action.playerId);
            
            const isGameActive = state.currentRound && 
                                 state.phase !== types_1.GamePhase.WAITING && 
                                 state.phase !== types_1.GamePhase.REVEAL;

            if (isGameActive) {
                const round = state.currentRound;
                const isImpostor = round.impostorIds.includes(action.playerId);
                const isSpecialMode = round.mode === "DOBLE_IMPOSTOR" || round.mode === "TODO_IMPOSTOR";

                // 1. SI SE VA UN IMPOSTOR
                if (isImpostor) {
                    const remainingImpostors = round.impostorIds.filter(id => id !== action.playerId);

                    // A. Si no quedan más impostores: VICTORIA FINAL
                    if (remainingImpostors.length === 0) {
                        const winners = round.clueOrder.filter(id => id !== action.playerId);
                        return {
                            state: { ...state, players: playersAfterLeave, queue: queueAfterLeave, phase: types_1.GamePhase.REVEAL, currentRound: null },
                            sideEffects: [
                                { type: 'CLEAR_TIMER' },
                                { type: 'ANNOUNCE_PUBLIC', message: `🏃 ${s('ᴇʟ ɪᴍᴘᴏꜱᴛᴏʀ ᴀʙᴀɴᴅᴏɴᴏ ʟᴀ ᴘᴀʀᴛɪᴅᴀ')}...` },
                                { type: 'ANNOUNCE_PUBLIC', message: `🏆 ${s('ᴠɪᴄᴛᴏʀɪᴀ ᴘᴀʀᴀ ʟᴏꜱ ɪɴᴏᴄᴇɴᴛᴇꜱ')}`, style: { color: 0x00FF00, fontWeight: 'bold' } },
                                { type: 'UPDATE_STATS', payload: { winners, losers: [], winnerRole: 'CIVIL' } },
                                { type: 'SET_PHASE_TIMER', durationSeconds: 5, nextAction: 'RESET_GAME' }
                            ]
                        };
                    } 
                    
                    const newClueOrderImp = round.clueOrder.filter(id => id !== action.playerId);
                    return {
                        state: { 
                            ...state, 
                            players: playersAfterLeave, 
                            queue: queueAfterLeave, 
                            currentRound: { ...round, impostorIds: remainingImpostors, clueOrder: newClueOrderImp } 
                        },
                        sideEffects: [{ type: 'ANNOUNCE_PUBLIC', message: `⚠️ ${s('ᴜɴ ɪɴᴏᴄᴇɴᴛᴇ ᴀʙᴀɴᴅᴏɴᴏ')}...` }] 
                    };
                }

                if (round.clueOrder.includes(action.playerId)) {
                    const newClueOrder = round.clueOrder.filter(id => id !== action.playerId);
                    const newNormalIds = round.normalPlayerIds.filter(id => id !== action.playerId);

                    if (newNormalIds.length <= 1 && round.mode !== "TODO_IMPOSTOR") {
                        return {
                            state: { ...state, players: playersAfterLeave, queue: queueAfterLeave, phase: types_1.GamePhase.REVEAL },
                            sideEffects: [
                                { type: 'CLEAR_TIMER' },
                                { type: 'ANNOUNCE_PUBLIC', message: `💀 ${s('ʟᴏꜱ ɪᴍᴘᴏꜱᴛᴏʀᴇꜱ ɢᴀɴᴀɴ ᴘᴏʀ ꜰᴀʟᴛᴀ ᴅᴇ ʀɪᴠᴀʟᴇꜱ')}` },
                                { type: 'UPDATE_STATS', payload: { winners: round.impostorIds, losers: [...newNormalIds], winnerRole: 'IMPOSTOR' } },
                                { type: 'SET_PHASE_TIMER', durationSeconds: 5, nextAction: 'RESET_GAME' }
                            ]
                        };
                    }

                    const newRound = {
                        ...round,
                        clueOrder: newClueOrder,
                        normalPlayerIds: newNormalIds
                    };


                    if (state.phase === types_1.GamePhase.CLUES) {
                        const currentIndex = round.currentClueIndex;
                        const wasHisTurn = round.clueOrder[currentIndex] === action.playerId;
                        const isLastNow = currentIndex >= newClueOrder.length;
                        const nextIndex = isLastNow ? 0 : currentIndex;
                        
                        newRound.currentClueIndex = nextIndex;

                        if (wasHisTurn) {
                            if (isLastNow) {
                                return {
                                    state: { ...state, players: playersAfterLeave, queue: queueAfterLeave, phase: types_1.GamePhase.DISCUSSION, currentRound: newRound },
                                    sideEffects: [
                                        { type: 'ANNOUNCE_PUBLIC', message: `🏃 ${s('ᴇʟ ᴊᴜɢᴀᴅᴏʀ ᴇɴ ᴛᴜʀɴᴏ ꜱᴇ ꜰᴜᴇ')}.` },
                                        { type: 'ANNOUNCE_PUBLIC', message: `🗣️ ${s('ᴘᴀꜱᴀɴᴅᴏ ᴀʟ ᴅᴇʙᴀᴛᴇ')}...` },
                                        { type: 'SET_PHASE_TIMER', durationSeconds: state.settings.discussionTimeSeconds }
                                    ]
                                };
                            }
                            const nextPlayer = state.players.get(newClueOrder[nextIndex]);
                            return {
                                state: { ...state, players: playersAfterLeave, queue: queueAfterLeave, currentRound: newRound },
                                sideEffects: [
                                    { type: 'ANNOUNCE_PUBLIC', message: `⚠️ ${s('ᴇʀᴀ ᴛᴜʀɴᴏ ᴅᴇ ᴀʟɢᴜɪᴇɴ ǫᴜᴇ ꜱᴇ ꜰᴜᴇ')}.` },
                                    { type: 'ANNOUNCE_PUBLIC', message: `🔔 ${s('ᴛᴜʀɴᴏ ᴅᴇ')}: ${nextPlayer?.name.toUpperCase()}` },
                                    { type: 'SET_PHASE_TIMER', durationSeconds: state.settings.clueTimeSeconds }
                                ]
                            };
                        }
                    }

                    if (state.phase === types_1.GamePhase.VOTING) {
                        const newVotes = new Map(round.votes);
                        newVotes.delete(action.playerId); 
                        
                        if (newVotes.size >= newClueOrder.length) {
                            return handleEndVoting({ 
                                ...state, 
                                players: playersAfterLeave, 
                                queue: queueAfterLeave, 
                                currentRound: { ...newRound, votes: newVotes } 
                            });
                        }
                    }

                    return { 
                        state: { ...state, players: playersAfterLeave, queue: queueAfterLeave, currentRound: newRound },
                        sideEffects: [{ type: 'ANNOUNCE_PUBLIC', message: `⚠️ ${s('ᴜɴ ɪɴᴏᴄᴇɴᴛᴇ ᴀʙᴀɴᴅᴏɴᴏ')}.` }] 
                    };
                }
            }

            return { state: { ...state, players: playersAfterLeave, queue: queueAfterLeave }, sideEffects: [] };
        }

        case 'JOIN_QUEUE': {
            if (state.queue.includes(action.playerId)) return { state, sideEffects: [] };
            if (state.currentRound?.clueOrder.includes(action.playerId)) {
                return { 
                    state, 
                    sideEffects: [{ type: 'ANNOUNCE_PRIVATE', playerId: action.playerId, message: `❌ ${s('ʏᴀ ᴇꜱᴛᴀꜱ ᴊᴜɢᴀɴᴅᴏ ʟᴀ ʀᴏɴᴅᴀ ᴀᴄᴛᴜᴀʟ')}.` }] 
                };
            }

            const updatedQueue = [...state.queue, action.playerId];
            const pos = updatedQueue.length;
            const name = state.players.get(action.playerId)?.name || "Player";
            
            const message = pos <= 5 && state.phase === types_1.GamePhase.WAITING
                ? `✅ @${name.toUpperCase()} ${s('ᴀɴᴏᴛᴀᴅᴏ')} [${pos}/5]`
                : `⏳ @${name.toUpperCase()} ${s('ᴇɴ ᴇꜱᴘᴇʀᴀ')} [ᴘᴏꜱɪᴄɪᴏɴ: ${pos}]`;

            return { 
                state: { ...state, queue: updatedQueue }, 
                sideEffects: [{ type: 'ANNOUNCE_PUBLIC', message, style: { color: 0x00FFCC } }] 
            };
        }

    case 'START_GAME': {
            const participants = state.queue.slice(0, 5);
            
            let mode = action.mode; // Si viene un modo forzado por comando, se respeta.

            if (!mode) {
                const rand = Math.random() * 100;
                if (rand < 3) {
                    mode = "TODO_IMPOSTOR";    // 10% Probabilidad
                } else if (rand < 15) {
                    mode = "DOBLE_IMPOSTOR";  // 20% Probabilidad (30 - 10)
                } else {
                    mode = "NORMAL";          // 70% Probabilidad
                }
            }
            // ------------------------------------------

            let impostorIds = [];

            if (mode === "TODO_IMPOSTOR") {
                impostorIds = [...participants];
            } else if (mode === "DOBLE_IMPOSTOR") {
                const shuffledPart = shuffle(participants);
                impostorIds = [shuffledPart[0], shuffledPart[1]];
            } else {
                impostorIds = [participants[Math.floor(Math.random() * participants.length)]];
            }
            
            const lastFootballer = state.lastFootballer || "";
            const available = action.footballers.filter(f => f !== lastFootballer);
            const footballer = available[Math.floor(Math.random() * available.length)];

            const round = {
                footballer, 
                impostorIds,
                normalPlayerIds: participants.filter(id => !impostorIds.includes(id)),
                clueOrder: shuffle(participants),
                currentClueIndex: 0,
                clues: new Map(), 
                votes: new Map(),
                mode: mode 
            };

            const effects = [
                { type: 'ANNOUNCE_PUBLIC', message: BORDER },
                { type: 'ANNOUNCE_PUBLIC', message: `🕵️ ${s('ʀᴏɴᴅᴀ ɪɴɪᴄɪᴀᴅᴀ')} • ${s('ʀᴇᴠɪꜱᴇɴ ꜱᴜꜱ ᴘʀɪᴠᴀᴅᴏꜱ')}`, style: { color: 0x00FFFF, fontWeight: 'bold' } }
            ];

            effects.push({ type: 'ANNOUNCE_PUBLIC', message: BORDER });

            participants.forEach(id => {
                const isImp = impostorIds.includes(id);
                const msg = isImp 
                    ? `👺 ${s('ᴇʀᴇꜱ ᴇʟ ɪᴍᴘᴏꜱᴛᴏʀ')} • ${s('ᴅɪꜱɪᴍᴜʟᴀ ʏ ꜱᴏʙʀᴇᴠɪᴠᴇ')}` 
                    : `⚽ ${s('ᴇʟ ᴊᴜɢᴀᴅᴏʀ ᴇꜱ')}: ${footballer.toUpperCase()}`;
                effects.push({ type: 'ANNOUNCE_PRIVATE', playerId: id, message: msg });
            });

            return { 
                state: { 
                    ...state, 
                    phase: types_1.GamePhase.ASSIGN, 
                    currentRound: round, 
                    queue: state.queue.slice(5),
                    lastFootballer: footballer 
                }, 
                sideEffects: effects 
            };
        }
            
case 'SUBMIT_CLUE': {
            const rClue = state.currentRound;
            
            // LOG DE ENTRADA: Para saber quién intentó hablar y en qué fase está el bot
            console.log(`[SUBMIT_CLUE] Intento de ID: ${action.playerId} | Fase Actual: ${state.phase} | Index: ${rClue?.currentClueIndex}`);

            if (!rClue || state.phase !== types_1.GamePhase.CLUES) {
                console.log(`[SUBMIT_CLUE] Rechazado: Fase incorrecta o sin ronda.`);
                return { state, sideEffects: [] };
            }
            
            if (rClue.clues.has(action.playerId)) {
                console.log(`[SUBMIT_CLUE] Rechazado: El ID ${action.playerId} ya envió pista.`);
                return { state, sideEffects: [] };
            }
            
            const newClues = new Map(rClue.clues).set(action.playerId, action.clue);
            const isLastClue = rClue.currentClueIndex >= rClue.clueOrder.length - 1;
            
            console.log(`[SUBMIT_CLUE] Pista aceptada. ¿Es la última?: ${isLastClue}`);
            
            if (isLastClue) {
                const effects = [
                    { type: 'ANNOUNCE_PUBLIC', message: `💬 ${s('ᴜʟᴛɪᴍᴀ ᴘɪꜱᴛᴀ')}: "${action.clue}"` },
                    { type: 'ANNOUNCE_PUBLIC', message: `📜 --- ${s('ʀᴇꜱᴜᴍᴇɴ ᴅᴇ ᴘɪꜱᴛᴀꜱ')} ---`, style: { color: 0xFFFF00, fontWeight: 'bold' } }
                ];

                rClue.clueOrder.forEach((id) => {
                    const name = state.players.get(id)?.name || "---";
                    const text = id === action.playerId ? action.clue : (newClues.get(id) || s('ꜱɪɴ ᴘɪꜱᴛᴀ'));
                    effects.push({ type: 'ANNOUNCE_PUBLIC', message: `📍 ${name.toUpperCase()}: "${text}"`, style: { color: 0xFFFFFF } });
                });

                effects.push({ type: 'ANNOUNCE_PUBLIC', message: `🗣️ ${s('ᴅᴇʙᴀᴛᴇ ɪɴɪᴄɪᴀᴅᴏ')} (${state.settings.discussionTimeSeconds}ꜱ)`, style: { color: 0xFF9900, fontWeight: "bold" } });
                effects.push({ type: 'SET_PHASE_TIMER', durationSeconds: state.settings.discussionTimeSeconds });

                console.log(`[SUBMIT_CLUE] Transicionando a DISCUSSION...`);

                return { 
                    state: { ...state, phase: types_1.GamePhase.DISCUSSION, currentRound: { ...rClue, clues: newClues } }, 
                    sideEffects: effects
                };
            }

            const nextIndex = rClue.currentClueIndex + 1;
            const nextPlayer = state.players.get(rClue.clueOrder[nextIndex]);
            
            console.log(`[SUBMIT_CLUE] Pasando al siguiente index: ${nextIndex}. Turno de: ${nextPlayer?.name}`);

            return { 
                state: { ...state, currentRound: { ...rClue, clues: newClues, currentClueIndex: nextIndex } }, 
                sideEffects: [
                    { type: 'ANNOUNCE_PUBLIC', message: `💬 ${s('ᴘɪꜱᴛᴀ')}: "${action.clue}"` },
                    { type: 'ANNOUNCE_PUBLIC', message: `🔔 ${s('ᴛᴜʀɴᴏ ᴅᴇ')}: ${nextPlayer?.name.toUpperCase()}`, style: { color: 0xFFFF00, fontWeight: "bold" } },
                    { type: 'SET_PHASE_TIMER', durationSeconds: state.settings.clueTimeSeconds }
                ]
            };
        }

        case 'END_DISCUSSION': {
            if (!state.currentRound) return { state, sideEffects: [] };
            const list = state.currentRound.clueOrder
                .map((id, i) => `[ ${i + 1} ] ${state.players.get(id)?.name.toUpperCase() || "---"}`)
                .join('    ');

            return { 
                state: { ...state, phase: types_1.GamePhase.VOTING }, 
                sideEffects: [
                    { type: 'ANNOUNCE_PUBLIC', message: `🗳️ ${s('¡ᴀ ᴠᴏᴛᴀʀ! ᴇꜱᴄʀɪʙᴀɴ ᴇʟ ɴᴜᴍᴇʀᴏ')}:`, style: { color: 0xFF0000, fontWeight: "bold" } },
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
        
        case 'RESET_GAME': {
            const lastFoot = state.currentRound?.footballer || "---";
            return { 
                state: { ...state, phase: types_1.GamePhase.WAITING, currentRound: null }, 
                sideEffects: [
                    { type: 'CLEAR_TIMER' },
                    { type: 'ANNOUNCE_PUBLIC', message: BORDER },
                    { type: 'ANNOUNCE_PUBLIC', message: `🎮 ${s('ᴘᴀʀᴛɪᴅᴀ ꜰɪɴᴀʟɪᴢᴀᴅᴀ')} • ${s('ᴇʟ ᴊᴜɢᴀᴅᴏʀ ᴇʀᴀ')}: ${lastFoot.toUpperCase()}`, style: { color: 0x00FFCC, fontWeight: 'bold' } },
                    { type: 'ANNOUNCE_PUBLIC', message: `👉 ${s('ᴇꜱᴄʀɪʙᴀɴ')} "jugar" ${s('ᴘᴀʀᴀ ʟᴀ ᴘʀᴏxɪᴍᴀ ʀᴏɴᴅᴀ')}`, style: { color: 0xFFFF00, fontWeight: 'bold' } },
                    { type: 'ANNOUNCE_PUBLIC', message: BORDER },
                    { type: 'AUTO_START_GAME' } 
                ] 
            };
        }
            
        default: return { state, sideEffects: [] };
    }
}

/**
 * LÓGICA DE CIERRE DE VOTACIÓN (REVEAL) - SOPORTE MULTI-IMPOSTOR Y ENGAÑO
 */
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
                { type: 'ANNOUNCE_PUBLIC', message: `❌ ${s('ɴᴀᴅɪᴇ ᴠᴏᴛᴏ')}! ${s('ᴇᴍᴘᴀᴛᴇ ᴛᴇᴄɴɪᴄᴏ')}.` }, 
                { type: 'SET_PHASE_TIMER', durationSeconds: 5, nextAction: 'RESET_GAME' }
            ] 
        };
    }

    const votedOutId = parseInt(sorted[0]); 
    const votedPlayer = state.players.get(votedOutId);
    const votedName = (votedPlayer?.name || "Alguien").toUpperCase();
    const nextClueOrder = round.clueOrder.filter(id => id !== votedOutId);

    // --- LÓGICA ESPECIAL: TODO IMPOSTOR ---
    if (round.mode === "TODO_IMPOSTOR") {
        // Si al eliminar a este quedan 2, revelamos la verdad
        if (nextClueOrder.length <= 2) {
            return {
                state: { ...state, phase: types_1.GamePhase.REVEAL },
                sideEffects: [
                    { type: 'CLEAR_TIMER' },
                    { type: 'MOVE_TO_SPECT', playerId: votedOutId },
                    { type: 'ANNOUNCE_PUBLIC', message: BORDER },
                    { type: 'ANNOUNCE_PUBLIC', message: `🤡 ¡${s('ꜱᴏʀᴘʀᴇꜱᴀ')}! ${s('ᴇʀᴀɴ ᴛᴏᴅᴏꜱ ɪᴍᴘᴏꜱᴛᴏʀᴇꜱ')}`, style: { color: 0xFF00FF, fontWeight: "bold" } },
                    { type: 'ANNOUNCE_PUBLIC', message: `💀 ${s('ꜱᴇ ᴍᴀᴛᴀʀᴏɴ ᴇɴᴛʀᴇ ᴜꜱᴛᴇᴅᴇꜱ')}. ${s('ǫᴜᴇᴅᴀɴ')} ${nextClueOrder.length} ${s('ᴠɪᴠᴏꜱ')}.`, style: { color: 0xFFFFFF } },
                    { type: 'ANNOUNCE_PUBLIC', message: BORDER },
                    { type: 'UPDATE_STATS', payload: { winners: round.impostorIds, losers: [], winnerRole: 'IMPOSTOR' } },
                    { type: 'SET_PHASE_TIMER', durationSeconds: 7, nextAction: 'RESET_GAME' }
                ]
            };
        }

        // Si quedan más de 2, seguimos el engaño diciendo que era inocente
        const firstPlayerName = (state.players.get(nextClueOrder[0])?.name || "---").toUpperCase();
        return {
            state: { 
                ...state, 
                phase: types_1.GamePhase.CLUES, 
                currentRound: { ...round, clueOrder: nextClueOrder, currentClueIndex: 0, clues: new Map(), votes: new Map() } 
            },
            sideEffects: [
                { type: 'MOVE_TO_SPECT', playerId: votedOutId },
                { type: 'ANNOUNCE_PUBLIC', message: `❌ ${votedName} ${s('ᴇʀᴀ ɪɴᴏᴄᴇɴᴛᴇ')}.`, style: { color: 0xFF4444, fontWeight: "bold" } },
                { type: 'ANNOUNCE_PUBLIC', message: `📝 ${s('ɴᴜᴇᴠᴀ ʀᴏɴᴅᴀ ᴅᴇ ᴘɪꜱᴛᴀꜱ')}...`, style: { color: 0xFFFF00, fontWeight: "bold" } },
                { type: 'ANNOUNCE_PUBLIC', message: `🔔 ${s('ᴛᴜʀɴᴏ ᴅᴇ')}: ${firstPlayerName}`, style: { color: 0x00FFCC, fontWeight: "bold" } },
                { type: 'SET_PHASE_TIMER', durationSeconds: state.settings.clueTimeSeconds }
            ]
        };
    }

    // --- LÓGICA NORMAL Y DOBLE IMPOSTOR ---
    const isActuallyImpostor = round.impostorIds.includes(votedOutId);

    if (isActuallyImpostor) {
        const remainingImpostors = round.impostorIds.filter(id => id !== votedOutId);

        if (remainingImpostors.length === 0) {
            return { 
                state: { ...state, phase: types_1.GamePhase.REVEAL }, 
                sideEffects: [
                    { type: 'CLEAR_TIMER' },
                    { type: 'MOVE_TO_SPECT', playerId: votedOutId },
                    { type: 'ANNOUNCE_PUBLIC', message: BORDER },
                    { type: 'ANNOUNCE_PUBLIC', message: `🎯 ¡${s('ʟᴏ ᴄᴀᴢᴀʀᴏɴ')}! ${votedName} ${s('ᴇʀᴀ ᴇʟ ɪᴍᴘᴏꜱᴛᴏʀ')}`, style: { color: 0x00FF00, fontWeight: "bold" } },
                    { type: 'ANNOUNCE_PUBLIC', message: `🏆 ¡${s('ᴠɪᴄᴛᴏʀɪᴀ ᴘᴀʀᴀ ʟᴏꜱ ɪɴᴏᴄᴇɴᴛᴇꜱ')}!`, style: { color: 0x00FF00, fontWeight: "bold" } },
                    { type: 'ANNOUNCE_PUBLIC', message: BORDER },
                    { type: 'UPDATE_STATS', payload: { winners: round.normalPlayerIds, losers: round.impostorIds, winnerRole: 'CIVIL' } },
                    { type: 'SET_PHASE_TIMER', durationSeconds: 7, nextAction: 'RESET_GAME' }
                ] 
            };
        } 
        
        const firstPlayerName = (state.players.get(nextClueOrder[0])?.name || "---").toUpperCase();
        return { 
            state: { 
                ...state, 
                phase: types_1.GamePhase.CLUES, 
                currentRound: { ...round, impostorIds: remainingImpostors, clueOrder: nextClueOrder, currentClueIndex: 0, clues: new Map(), votes: new Map() } 
            }, 
            sideEffects: [
                { type: 'MOVE_TO_SPECT', playerId: votedOutId },
                { type: 'ANNOUNCE_PUBLIC', message: `❌ ${votedName} ${s('ᴇʀᴀ ɪɴᴏᴄᴇɴᴛᴇ')}.`, style: { color: 0xFF4444, fontWeight: "bold" } },
                { type: 'ANNOUNCE_PUBLIC', message: `📝 ${s('ɴᴜᴇᴠᴀ ʀᴏɴᴅᴀ ᴅᴇ ᴘɪꜱᴛᴀꜱ')}...`, style: { color: 0xFFFF00, fontWeight: "bold" } },
                { type: 'ANNOUNCE_PUBLIC', message: `🔔 ${s('ᴛᴜʀɴᴏ ᴅᴇ')}: ${firstPlayerName}`, style: { color: 0x00FFCC, fontWeight: "bold" } },
                { type: 'SET_PHASE_TIMER', durationSeconds: state.settings.clueTimeSeconds }
            ] 
        };
    } 

    const remainingInnocents = round.normalPlayerIds.filter(id => id !== votedOutId);
    
    if (remainingInnocents.length <= 1) {
        const impNames = round.impostorIds.map(id => state.players.get(id)?.name.toUpperCase()).join(" Y ");
        return { 
            state: { ...state, phase: types_1.GamePhase.REVEAL }, 
            sideEffects: [
                { type: 'CLEAR_TIMER' },
                { type: 'MOVE_TO_SPECT', playerId: votedOutId },
                { type: 'ANNOUNCE_PUBLIC', message: BORDER },
                { type: 'ANNOUNCE_PUBLIC', message: `💀 ¡${s('ɢᴀᴍᴇ ᴏᴠᴇʀ')}! ${s('ɢᴀɴᴀʀᴏɴ ɪᴍᴘᴏꜱᴛᴏʀᴇꜱ')} (${impNames})`, style: { color: 0xFF0000, fontWeight: "bold" } },
                { type: 'ANNOUNCE_PUBLIC', message: `❌ ${votedName} ${s('ᴇʀᴀ ɪɴᴏᴄᴇɴᴛᴇ')}.`, style: { color: 0xFFFFFF } },
                { type: 'ANNOUNCE_PUBLIC', message: BORDER },
                { type: 'UPDATE_STATS', payload: { winners: round.impostorIds, losers: round.normalPlayerIds, winnerRole: 'IMPOSTOR' } },
                { type: 'SET_PHASE_TIMER', durationSeconds: 7, nextAction: 'RESET_GAME' }
            ] 
        };
    }

    const firstPlayerNormal = (state.players.get(nextClueOrder[0])?.name || "---").toUpperCase();
    return { 
        state: { 
            ...state, 
            phase: types_1.GamePhase.CLUES, 
            currentRound: { ...round, normalPlayerIds: remainingInnocents, clueOrder: nextClueOrder, currentClueIndex: 0, clues: new Map(), votes: new Map() } 
        }, 
        sideEffects: [
            { type: 'MOVE_TO_SPECT', playerId: votedOutId },
            { type: 'ANNOUNCE_PUBLIC', message: `❌ ${votedName} ${s('ᴇʀᴀ ɪɴᴏᴄᴇɴᴛᴇ')}.`, style: { color: 0xFF4444, fontWeight: "bold" } },
            { type: 'ANNOUNCE_PUBLIC', message: `📝 ${s('ɴᴜᴇᴠᴀ ʀᴏɴᴅᴀ ᴅᴇ ᴘɪꜱᴛᴀꜱ')}...`, style: { color: 0xFFFF00, fontWeight: "bold" } },
            { type: 'ANNOUNCE_PUBLIC', message: `🔔 ${s('ᴛᴜʀɴᴏ ᴅᴇ')}: ${firstPlayerNormal}`, style: { color: 0x00FFCC, fontWeight: "bold" } },
            { type: 'SET_PHASE_TIMER', durationSeconds: state.settings.clueTimeSeconds }
        ] 
    };
}

function transitionToClues(state) {
    console.log("[DEBUG-PHASE] Ejecutando transitionToClues...");
    if (!state.currentRound || !state.currentRound.clueOrder.length) {
        console.log("[DEBUG-PHASE] Abortando pistas: No hay orden de jugadores.");
        return { state, sideEffects: [] };
    }
    const first = state.players.get(state.currentRound.clueOrder[0]);
    console.log(`[DEBUG-PHASE] Primera pista para: ${first?.name} (ID: ${state.currentRound.clueOrder[0]})`);
    
    return { 
        state: { ...state, phase: types_1.GamePhase.CLUES }, 
        sideEffects: [
            { type: 'ANNOUNCE_PUBLIC', message: `📝 ${s('ᴇᴍᴘɪᴇᴢᴀɴ ʟᴀꜱ ᴘɪꜱᴛᴀꜱ')} • ${s('ᴛᴜʀɴᴏ ᴅᴇ')}: ${first?.name.toUpperCase()}`, style: { color: 0x00FFCC, fontWeight: "bold" } },
            { type: 'SET_PHASE_TIMER', durationSeconds: state.settings.clueTimeSeconds }
        ] 
    };
}
