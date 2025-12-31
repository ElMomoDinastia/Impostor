"use strict";
/**
 * Pure State Machine - CLEAN & HORIZONTAL MESSAGES
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.transition = transition;
exports.transitionToClues = transitionToClues;
exports.canPlayerAct = canPlayerAct;
exports.getCurrentActor = getCurrentActor;
exports.getPhaseDescription = getPhaseDescription;
const types_1 = require("./types");
function generateRoundId() {
    return `round_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
function shuffle(array) {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}
function transition(state, action) {
    switch (action.type) {
        case 'PLAYER_JOIN':
            return handlePlayerJoin(state, action.player);
        case 'PLAYER_LEAVE':
            return handlePlayerLeave(state, action.playerId);
        case 'JOIN_QUEUE':
            return handleJoinQueue(state, action.playerId);
        case 'LEAVE_QUEUE':
            return handleLeaveQueue(state, action.playerId);
        case 'START_GAME':
            return handleStartGame(state, action.footballers);
        case 'SUBMIT_CLUE':
            return handleSubmitClue(state, action.playerId, action.clue);
        case 'CLUE_TIMEOUT':
            return handleClueTimeout(state);
        case 'END_DISCUSSION':
            return handleEndDiscussion(state);
        case 'SUBMIT_VOTE':
            return handleSubmitVote(state, action.playerId, action.votedId);
        case 'END_VOTING':
            return handleEndVoting(state);
        case 'END_REVEAL':
            return handleEndReveal(state);
        case 'FORCE_REVEAL':
            return handleForceReveal(state);
        case 'SKIP_PHASE':
            return handleSkipPhase(state);
        case 'RESET_ROUND':"use strict";

/**
 * Pure State Machine - FIXED QUEUE LOGIC
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.transition = transition;
exports.transitionToClues = transitionToClues;
exports.canPlayerAct = canPlayerAct;
exports.getCurrentActor = getCurrentActor;
exports.getPhaseDescription = getPhaseDescription;
const types_1 = require("./types");

function generateRoundId() {
    return `round_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

function shuffle(array) {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}

function transition(state, action) {
    switch (action.type) {
        case 'PLAYER_JOIN': return handlePlayerJoin(state, action.player);
        case 'PLAYER_LEAVE': return handlePlayerLeave(state, action.playerId);
        case 'JOIN_QUEUE': return handleJoinQueue(state, action.playerId);
        case 'LEAVE_QUEUE': return handleLeaveQueue(state, action.playerId);
        case 'START_GAME': return handleStartGame(state, action.footballers);
        case 'SUBMIT_CLUE': return handleSubmitClue(state, action.playerId, action.clue);
        case 'CLUE_TIMEOUT': return handleClueTimeout(state);
        case 'END_DISCUSSION': return handleEndDiscussion(state);
        case 'SUBMIT_VOTE': return handleSubmitVote(state, action.playerId, action.votedId);
        case 'END_VOTING': return handleEndVoting(state);
        case 'END_REVEAL': return handleEndReveal(state);
        case 'FORCE_REVEAL': return handleForceReveal(state);
        case 'SKIP_PHASE': return handleSkipPhase(state);
        case 'RESET_ROUND': return handleResetRound(state);
        case 'RESET_GAME': return handleResetGame(state);
        default: return { state, sideEffects: [] };
    }
}

function handlePlayerJoin(state, player) {
    const newPlayers = new Map(state.players);
    newPlayers.set(player.id, player);
    const needed = Math.max(0, state.settings.minPlayers - state.queue.length);
    const sideEffects = [{
        type: 'ANNOUNCE_PRIVATE',
        playerId: player.id,
        message: `🔴 EL IMPOSTOR | Escribe "jugar" para unirte ${needed > 0 ? `(faltan ${needed})` : ''}`,
    }];
    return { state: { ...state, players: newPlayers }, sideEffects };
}

function handlePlayerLeave(state, playerId) {
    const player = state.players.get(playerId);
    if (!player) return { state, sideEffects: [] };
    const newPlayers = new Map(state.players);
    newPlayers.delete(playerId);
    const newQueue = state.queue.filter((id) => id !== playerId);
    let newState = { ...state, players: newPlayers, queue: newQueue };
    const sideEffects = [];
    if (state.currentRound) {
        const roundPlayerIds = [state.currentRound.impostorId, ...state.currentRound.normalPlayerIds];
        if (roundPlayerIds.includes(playerId)) {
            const remaining = roundPlayerIds.filter((id) => id !== playerId && newPlayers.has(id));
            if (remaining.length < 3) {
                sideEffects.push({
                    type: 'ANNOUNCE_PUBLIC',
                    message: '⚠️ Ronda cancelada - muy pocos jugadores',
                    style: { color: 0xff6b6b, sound: 2 },
                });
                newState = { ...newState, phase: types_1.GamePhase.WAITING, currentRound: null };
                sideEffects.push({ type: 'CLEAR_TIMER' });
            }
        }
    }
    return { state: newState, sideEffects };
}

// --- SOLUCIONADO: COLA INFINITA ---
function handleJoinQueue(state, playerId) {
    const player = state.players.get(playerId);
    if (!player) return { state, sideEffects: [] };

    if (state.queue.includes(playerId)) {
        return { state, sideEffects: [{ type: 'ANNOUNCE_PRIVATE', playerId, message: '✅ Ya estás en la lista de espera' }] };
    }

    const newQueue = [...state.queue, playerId];
    const sideEffects = [];

    if (state.phase === types_1.GamePhase.WAITING) {
        sideEffects.push({ 
            type: 'ANNOUNCE_PUBLIC', 
            message: `✅ ${player.name} listo (${newQueue.length}/5)` 
        });
        
        if (newQueue.length >= 5) {
            sideEffects.push({ type: 'AUTO_START_GAME' });
        }
    } else {
        // Si hay partida en juego, permitir anotarse silenciosamente
        sideEffects.push({ 
            type: 'ANNOUNCE_PRIVATE', 
            playerId, 
            message: `✅ Anotado para la siguiente. Estás en la posición ${newQueue.length} de la cola.` 
        });
    }

    return { state: { ...state, queue: newQueue }, sideEffects };
}

function handleLeaveQueue(state, playerId) {
    if (!state.queue.includes(playerId)) return { state, sideEffects: [] };
    const player = state.players.get(playerId);
    const newQueue = state.queue.filter((id) => id !== playerId);
    return {
        state: { ...state, queue: newQueue },
        sideEffects: [{ type: 'ANNOUNCE_PUBLIC', message: `👋 ${player?.name ?? '?'} salió de la cola (${newQueue.length}/5)` }],
    };
}

// --- SOLUCIONADO: LIMPIEZA PARCIAL DE COLA ---
function handleStartGame(state, footballers) {
    if (state.phase !== types_1.GamePhase.WAITING) return { state, sideEffects: [] };
    if (state.queue.length < state.settings.minPlayers) {
        return { state, sideEffects: [{ type: 'ANNOUNCE_PUBLIC', message: `❌ Faltan jugadores (${state.queue.length}/5)` }] };
    }
    
    // Tomamos exactamente los PRIMEROS 5 de la cola
    const roundPlayers = state.queue.slice(0, 5);
    // Los que sobran se quedan para la siguiente
    const remainingQueue = state.queue.slice(5);

    const impostorId = roundPlayers[Math.floor(Math.random() * roundPlayers.length)];
    const normalPlayerIds = roundPlayers.filter((id) => id !== impostorId);
    const footballer = footballers[Math.floor(Math.random() * footballers.length)];
    const clueOrder = shuffle([...roundPlayers]);

    const round = {
        id: generateRoundId(),
        footballer,
        impostorId,
        normalPlayerIds,
        clues: new Map(),
        votes: new Map(),
        clueOrder,
        currentClueIndex: 0,
        phaseDeadline: null,
        startedAt: Date.now(),
    };

    const names = roundPlayers.map((id) => state.players.get(id)?.name ?? '?').join(', ');
    const sideEffects = [
        { type: 'ANNOUNCE_PUBLIC', message: `🔴 RONDA: ${names}`, style: { color: 0xff0000, style: 'bold', sound: 2 } },
    ];

    for (const pid of roundPlayers) {
        if (pid === impostorId) {
            sideEffects.push({ type: 'ANNOUNCE_PRIVATE', playerId: pid, message: `🕵️ ERES IMPOSTOR - ¡Finge!` });
        } else {
            sideEffects.push({ type: 'ANNOUNCE_PRIVATE', playerId: pid, message: `⚽ FUTBOLISTA: ${footballer}` });
        }
    }

    return { state: { ...state, phase: types_1.GamePhase.ASSIGN, currentRound: round, queue: remainingQueue }, sideEffects };
}

function transitionToClues(state) {
    if (state.phase !== types_1.GamePhase.ASSIGN || !state.currentRound) return { state, sideEffects: [] };
    const firstId = state.currentRound.clueOrder[0];
    const first = state.players.get(firstId);
    return {
        state: { ...state, phase: types_1.GamePhase.CLUES },
        sideEffects: [
            { type: 'ANNOUNCE_PUBLIC', message: `📝 PISTAS | Turno: ${first?.name ?? '?'}`, style: { color: 0x00bfff, style: 'bold', sound: 1 } },
            { type: 'SET_PHASE_TIMER', durationSeconds: state.settings.clueTimeSeconds },
        ],
    };
}

function handleSubmitClue(state, playerId, clue) {
    if (state.phase !== types_1.GamePhase.CLUES || !state.currentRound) return { state, sideEffects: [] };
    const round = state.currentRound;
    const expectedId = round.clueOrder[round.currentClueIndex];
    if (playerId !== expectedId) return { state, sideEffects: [] };

    const newClues = new Map(round.clues);
    newClues.set(playerId, clue);
    const newRound = { ...round, clues: newClues, currentClueIndex: round.currentClueIndex + 1 };
    const player = state.players.get(playerId);
    
    const sideEffects = [{ type: 'ANNOUNCE_PUBLIC', message: `💬 ${player?.name ?? '?'}: "${clue}"`, style: { color: 0xffffff, style: 'bold' } }];

    if (newRound.currentClueIndex >= round.clueOrder.length) {
        const summary = round.clueOrder.map((id) => `${state.players.get(id)?.name ?? '?'}:"${newClues.get(id) ?? '...'}"`).join(' | ');
        sideEffects.push({ type: 'ANNOUNCE_PUBLIC', message: `🗣️ DEBATE | ${summary}`, style: { color: 0xffa500, style: 'bold', sound: 1 } });
        sideEffects.push({ type: 'SET_PHASE_TIMER', durationSeconds: state.settings.discussionTimeSeconds });
        return { state: { ...state, phase: types_1.GamePhase.DISCUSSION, currentRound: newRound }, sideEffects };
    }

    const nextId = round.clueOrder[newRound.currentClueIndex];
    sideEffects.push({ type: 'ANNOUNCE_PUBLIC', message: `📝 Turno: ${state.players.get(nextId)?.name ?? '?'}` });
    sideEffects.push({ type: 'SET_PHASE_TIMER', durationSeconds: state.settings.clueTimeSeconds });
    return { state: { ...state, currentRound: newRound }, sideEffects };
}

function handleClueTimeout(state) {
    if (state.phase !== types_1.GamePhase.CLUES || !state.currentRound) return { state, sideEffects: [] };
    const round = state.currentRound;
    const timedOutId = round.clueOrder[round.currentClueIndex];
    const newClues = new Map(round.clues);
    newClues.set(timedOutId, '...');
    const newRound = { ...round, clues: newClues, currentClueIndex: round.currentClueIndex + 1 };

    const sideEffects = [{ type: 'ANNOUNCE_PUBLIC', message: `⏰ ${state.players.get(timedOutId)?.name ?? '?'}: "..." (tiempo)` }];

    if (newRound.currentClueIndex >= round.clueOrder.length) {
        const summary = round.clueOrder.map((id) => `${state.players.get(id)?.name ?? '?'}:"${newClues.get(id) ?? '...'}"`).join(' | ');
        sideEffects.push({ type: 'ANNOUNCE_PUBLIC', message: `🗣️ DEBATE | ${summary}`, style: { color: 0xffa500, style: 'bold', sound: 1 } });
        sideEffects.push({ type: 'SET_PHASE_TIMER', durationSeconds: state.settings.discussionTimeSeconds });
        return { state: { ...state, phase: types_1.GamePhase.DISCUSSION, currentRound: newRound }, sideEffects };
    }

    const nextId = round.clueOrder[newRound.currentClueIndex];
    sideEffects.push({ type: 'ANNOUNCE_PUBLIC', message: `📝 Turno: ${state.players.get(nextId)?.name ?? '?'}` });
    sideEffects.push({ type: 'SET_PHASE_TIMER', durationSeconds: state.settings.clueTimeSeconds });
    return { state: { ...state, currentRound: newRound }, sideEffects };
}

function handleEndDiscussion(state) {
    if (state.phase !== types_1.GamePhase.DISCUSSION || !state.currentRound) return { state, sideEffects: [] };
    const round = state.currentRound;
    const list = round.clueOrder.map((id) => `${id}.${state.players.get(id)?.name ?? '?'}`).join(' | ');
    return {
        state: { ...state, phase: types_1.GamePhase.VOTING },
        sideEffects: [
            { type: 'ANNOUNCE_PUBLIC', message: `🗳️ VOTAR | ${list} | Escribe el NÚMERO`, style: { color: 0xff69b4, style: 'bold', sound: 2 } },
            { type: 'SET_PHASE_TIMER', durationSeconds: state.settings.votingTimeSeconds },
        ],
    };
}

function handleSubmitVote(state, playerId, votedId) {
    if (state.phase !== types_1.GamePhase.VOTING || !state.currentRound) return { state, sideEffects: [] };
    const round = state.currentRound;
    const aliveIds = round.clueOrder;

    if (!aliveIds.includes(playerId) || !aliveIds.includes(votedId) || playerId === votedId) {
        return { state, sideEffects: [] };
    }

    const newVotes = new Map(round.votes);
    newVotes.set(playerId, votedId);
    const newRound = { ...round, votes: newVotes };

    const sideEffects = [{ type: 'ANNOUNCE_PUBLIC', message: `🗳️ ${state.players.get(playerId)?.name} votó (${newVotes.size}/${aliveIds.length})` }];

    if (newVotes.size >= aliveIds.length) {
        return handleEndVoting({ ...state, currentRound: newRound });
    }
    return { state: { ...state, currentRound: newRound }, sideEffects };
}

function handleEndVoting(state) {
    if (!state.currentRound) return { state, sideEffects: [] };
    const round = state.currentRound;
    const voteCount = new Map();

    for (const votedId of round.votes.values()) {
        voteCount.set(votedId, (voteCount.get(votedId) || 0) + 1);
    }

    let maxVotes = 0;
    let tied = [];
    for (const [pid, count] of voteCount) {
        if (count > maxVotes) { maxVotes = count; tied = [pid]; }
        else if (count === maxVotes) { tied.push(pid); }
    }

    const votedOutId = tied.length > 0 ? tied[Math.floor(Math.random() * tied.length)] : round.clueOrder[Math.floor(Math.random() * round.clueOrder.length)];
    const wasCorrect = votedOutId === round.impostorId;
    const votedOut = state.players.get(votedOutId);
    const sideEffects = [{ type: 'CLEAR_TIMER' }];

    if (wasCorrect) {
        const result = { impostorWon: false, impostorId: round.impostorId, impostorName: state.players.get(round.impostorId)?.name ?? '?', footballer: round.footballer, votedOutId, votedOutName: votedOut?.name ?? null, wasCorrectVote: true };
        sideEffects.push({ type: 'ANNOUNCE_PUBLIC', message: `🎯 ¡LO ENCONTRARON! ${votedOut?.name} era el impostor.`, style: { color: 0x00ff00, style: 'bold', sound: 2 } });
        return { state: { ...state, phase: types_1.GamePhase.REVEAL, currentRound: { ...round, endedAt: Date.now(), result } }, sideEffects };
    } else {
        const remainingInnocents = round.normalPlayerIds.filter(id => id !== votedOutId);
        if (remainingInnocents.length <= 1) {
            const result = { impostorWon: true, impostorId: round.impostorId, impostorName: state.players.get(round.impostorId)?.name ?? '?', footballer: round.footballer, votedOutId, votedOutName: votedOut?.name ?? null, wasCorrectVote: false };
            sideEffects.push({ type: 'ANNOUNCE_PUBLIC', message: `💀 ${votedOut?.name} era INOCENTE. ¡Gana el Impostor!`, style: { color: 0xff0000, style: 'bold', sound: 2 } });
            return { state: { ...state, phase: types_1.GamePhase.REVEAL, currentRound: { ...round, endedAt: Date.now(), result } }, sideEffects };
        } else {
            const newClueOrder = round.clueOrder.filter(id => id !== votedOutId);
            const newRound = { ...round, normalPlayerIds: remainingInnocents, clueOrder: newClueOrder, currentClueIndex: 0, clues: new Map(), votes: new Map() };
            sideEffects.push({ type: 'ANNOUNCE_PUBLIC', message: `❌ ${votedOut?.name} era INOCENTE. Sigue el juego...`, style: { color: 0xffaa00, style: 'bold' } });
            sideEffects.push({ type: 'SET_PHASE_TIMER', durationSeconds: state.settings.clueTimeSeconds });
            return { state: { ...state, phase: types_1.GamePhase.CLUES, currentRound: newRound }, sideEffects };
        }
    }
}

function handleEndReveal(state) {
    if (state.phase !== types_1.GamePhase.REVEAL || !state.currentRound) return { state, sideEffects: [] };
    const result = state.currentRound.result;
    if (!result) return { state, sideEffects: [] };

    const sideEffects = [
        { type: 'ANNOUNCE_PUBLIC', message: result.impostorWon ? `🔴 IMPOSTOR GANA | Era: ${result.impostorName}` : `🟢 JUGADORES GANAN | Era: ${result.impostorName}`, style: { color: result.impostorWon ? 0xff0000 : 0x00ff00, style: 'bold', sound: 1 } },
        { type: 'ANNOUNCE_PUBLIC', message: `⚽ Futbolista: ${result.footballer}` },
        { type: 'ANNOUNCE_PUBLIC', message: `━━━ Anotados en cola: ${state.queue.length} ━━━` },
        { type: 'LOG_ROUND', result }
    ];

    return { state: { ...state, phase: types_1.GamePhase.RESULTS, roundHistory: [...state.roundHistory, result] }, sideEffects };
}

function handleForceReveal(state) {
    if (!state.currentRound) return { state, sideEffects: [] };
    const round = state.currentRound;
    const result = { impostorWon: true, impostorId: round.impostorId, impostorName: state.players.get(round.impostorId)?.name ?? '?', footballer: round.footballer, votedOutId: null, votedOutName: null, wasCorrectVote: false };
    return {
        state: { ...state, phase: types_1.GamePhase.RESULTS, currentRound: { ...round, result, endedAt: Date.now() }, roundHistory: [...state.roundHistory, result] },
        sideEffects: [{ type: 'CLEAR_TIMER' }, { type: 'ANNOUNCE_PUBLIC', message: `⚠️ Admin reveló: ${result.impostorName} era el Impostor.` }],
    };
}

function handleSkipPhase(state) {
    switch (state.phase) {
        case types_1.GamePhase.CLUES: return handleClueTimeout(state);
        case types_1.GamePhase.DISCUSSION: return handleEndDiscussion(state);
        case types_1.GamePhase.VOTING: return handleEndVoting(state);
        case types_1.GamePhase.REVEAL: return handleEndReveal(state);
        default: return { state, sideEffects: [] };
    }
}

function handleResetGame(state) {
    const sideEffects = [];
    // Si al resetear ya hay 5 esperando, mandamos el auto-start
    if (state.queue.length >= 5) {
        sideEffects.push({ type: 'AUTO_START_GAME' });
    }
    return { state: { ...state, phase: types_1.GamePhase.WAITING, currentRound: null }, sideEffects };
}

function handleResetRound(state) {
    const sideEffects = [{ type: 'CLEAR_TIMER' }, { type: 'ANNOUNCE_PUBLIC', message: '⚠️ Ronda saltada por Admin' }];
    if (state.queue.length >= 5) sideEffects.push({ type: 'AUTO_START_GAME' });
    return { state: { ...state, phase: types_1.GamePhase.WAITING, currentRound: null }, sideEffects };
}

function canPlayerAct(state, playerId, action) {
    if (!state.currentRound) return false;
    const round = state.currentRound;
    if (!round.clueOrder.includes(playerId)) return false;
    switch (action) {
        case 'clue': return state.phase === types_1.GamePhase.CLUES && round.clueOrder[round.currentClueIndex] === playerId;
        case 'vote': return state.phase === types_1.GamePhase.VOTING && !round.votes.has(playerId);
        default: return false;
    }
}

function getCurrentActor(state) {
    if (!state.currentRound || state.phase !== types_1.GamePhase.CLUES) return null;
    return state.currentRound.clueOrder[state.currentRound.currentClueIndex] ?? null;
}

function getPhaseDescription(phase) {
    const names = {
        [types_1.GamePhase.WAITING]: '⏳ Esperando',
        [types_1.GamePhase.ASSIGN]: '🎭 Asignando',
        [types_1.GamePhase.CLUES]: '📝 Pistas',
        [types_1.GamePhase.DISCUSSION]: '🗣️ Debate',
        [types_1.GamePhase.VOTING]: '🗳️ Votación',
        [types_1.GamePhase.REVEAL]: '🔔 Revelación',
        [types_1.GamePhase.RESULTS]: '🏆 Resultados',
    };
    return names[phase] ?? 'Desconocido';
}
//# sourceMappingURL=state-machine.js.map
