"use strict";
/**
 * Pure State Machine - CLEAN & HORIZONTAL MESSAGES
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createInitialState = createInitialState;
exports.transition = transition;
exports.transitionToClues = transitionToClues;
exports.canPlayerAct = canPlayerAct;
exports.getCurrentActor = getCurrentActor;
exports.getPhaseDescription = getPhaseDescription;

const types_1 = require("./types");

/**
 * Inicializa el estado del juego
 */
function createInitialState(settings) {
    return {
        phase: types_1.GamePhase.WAITING,
        players: new Map(),
        queue: [],
        currentRound: null,
        roundHistory: [],
        settings: settings || {
            minPlayers: 5,
            clueTimeSeconds: 30,
            discussionTimeSeconds: 30,
            votingTimeSeconds: 45
        }
    };
}

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
            return han"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.createInitialState = createInitialState;
exports.transition = transition;
exports.transitionToClues = transitionToClues;
exports.canPlayerAct = canPlayerAct;
exports.getCurrentActor = getCurrentActor;
exports.getPhaseDescription = getPhaseDescription;

const types_1 = require("./types");

function createInitialState(settings) {
    return {
        phase: types_1.GamePhase.WAITING,
        players: new Map(),
        queue: [],
        currentRound: null,
        roundHistory: [],
        settings: settings || {
            minPlayers: 5,
            clueTimeSeconds: 30,
            discussionTimeSeconds: 30,
            votingTimeSeconds: 45
        }
    };
}

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
    const sideEffects = [{
        type: 'ANNOUNCE_PRIVATE',
        playerId: player.id,
        message: `🔴 EL IMPOSTOR | Escribe "jugar" para unirte`,
    }];
    return { state: { ...state, players: newPlayers }, sideEffects };
}

function handlePlayerLeave(state, playerId) {
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
                    message: '⚠️ Ronda cancelada - Jugador salió',
                    style: { color: 0xff6b6b, sound: 2 },
                });
                newState = { ...newState, phase: types_1.GamePhase.WAITING, currentRound: null };
                sideEffects.push({ type: 'CLEAR_TIMER' });
            }
        }
    }
    return { state: newState, sideEffects };
}

function handleJoinQueue(state, playerId) {
    const player = state.players.get(playerId);
    if (!player) return { state, sideEffects: [] };

    // LIMPIEZA: Solo permitimos IDs que realmente estén en la sala
    const cleanQueue = state.queue.filter(id => state.players.has(id));

    if (cleanQueue.includes(playerId)) {
        return { state: { ...state, queue: cleanQueue }, sideEffects: [{ type: 'ANNOUNCE_PRIVATE', playerId, message: '✅ Ya estás en cola.' }] };
    }

    const newQueue = [...cleanQueue, playerId];
    const sideEffects = [];

    if (state.phase === types_1.GamePhase.WAITING) {
        const remaining = state.settings.minPlayers - newQueue.length;
        if (remaining > 0) {
            sideEffects.push({
                type: 'ANNOUNCE_PUBLIC',
                message: `✅ ${player.name} listo (${newQueue.length}/5) - faltan ${remaining}`,
                style: { color: 0x00ff00 },
            });
        } else {
            sideEffects.push({
                type: 'ANNOUNCE_PUBLIC',
                message: `✅ ${player.name} listo | 🎮 ¡5/5! Empezando...`,
                style: { color: 0x00ff00, sound: 1 },
            });
            sideEffects.push({ type: 'AUTO_START_GAME' });
        }
    } else {
        sideEffects.push({ type: 'ANNOUNCE_PRIVATE', playerId, message: `✅ Anotado para la próxima ronda.` });
    }

    return { state: { ...state, queue: newQueue }, sideEffects };
}

function handleLeaveQueue(state, playerId) {
    const newQueue = state.queue.filter((id) => id !== playerId);
    return { state: { ...state, queue: newQueue }, sideEffects: [{ type: 'ANNOUNCE_PUBLIC', message: `👋 Alguien salió de la cola.` }] };
}

function handleStartGame(state, footballers) {
    if (state.phase !== types_1.GamePhase.WAITING) return { state, sideEffects: [] };
    
    // Doble check de seguridad para no iniciar solo
    const realQueue = state.queue.filter(id => state.players.has(id));
    if (realQueue.length < state.settings.minPlayers) {
        return { state: { ...state, queue: realQueue }, sideEffects: [{ type: 'ANNOUNCE_PUBLIC', message: '❌ Jugadores insuficientes' }] };
    }

    const roundPlayers = shuffle(realQueue).slice(0, 5);
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

    const sideEffects = [
        { type: 'ANNOUNCE_PUBLIC', message: `🔴 RONDA INICIADA`, style: { color: 0xff0000, style: 'bold', sound: 2 } },
    ];

    for (const pid of roundPlayers) {
        if (pid === impostorId) {
            sideEffects.push({ type: 'ANNOUNCE_PRIVATE', playerId: pid, message: `🕵️ ERES EL IMPOSTOR - ¡Miente para ganar!` });
        } else {
            sideEffects.push({ type: 'ANNOUNCE_PRIVATE', playerId: pid, message: `⚽ FUTBOLISTA: ${footballer} - ¡No digas el nombre!` });
        }
    }

    return { state: { ...state, phase: types_1.GamePhase.ASSIGN, currentRound: round, queue: [] }, sideEffects };
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
    const sideEffects = [{ type: 'ANNOUNCE_PUBLIC', message: `💬 ${player?.name}: "${clue}"` }];

    if (newRound.currentClueIndex >= round.clueOrder.length) {
        sideEffects.push({ type: 'ANNOUNCE_PUBLIC', message: `🗣️ DEBATE | ¡A discutir!`, style: { color: 0xffa500, sound: 1 } });
        sideEffects.push({ type: 'SET_PHASE_TIMER', durationSeconds: state.settings.discussionTimeSeconds });
        return { state: { ...state, phase: types_1.GamePhase.DISCUSSION, currentRound: newRound }, sideEffects };
    }

    const nextId = round.clueOrder[newRound.currentClueIndex];
    const next = state.players.get(nextId);
    sideEffects.push({ type: 'ANNOUNCE_PUBLIC', message: `📝 Turno: ${next?.name ?? '?'}` });
    sideEffects.push({ type: 'SET_PHASE_TIMER', durationSeconds: state.settings.clueTimeSeconds });
    return { state: { ...state, currentRound: newRound }, sideEffects };
}

function handleClueTimeout(state) {
    if (state.phase !== types_1.GamePhase.CLUES || !state.currentRound) return { state, sideEffects: [] };
    return handleSubmitClue(state, state.currentRound.clueOrder[state.currentRound.currentClueIndex], "...");
}

function handleEndDiscussion(state) {
    if (state.phase !== types_1.GamePhase.DISCUSSION || !state.currentRound) return { state, sideEffects: [] };
    return {
        state: { ...state, phase: types_1.GamePhase.VOTING },
        sideEffects: [
            { type: 'ANNOUNCE_PUBLIC', message: `🗳️ VOTACIÓN | Escribe el número del sospechoso`, style: { color: 0xff69b4, sound: 2 } },
            { type: 'SET_PHASE_TIMER', durationSeconds: state.settings.votingTimeSeconds },
        ],
    };
}

function handleSubmitVote(state, playerId, votedId) {
    if (state.phase !== types_1.GamePhase.VOTING || !state.currentRound) return { state, sideEffects: [] };
    const round = state.currentRound;
    if (!round.clueOrder.includes(playerId) || !round.clueOrder.includes(votedId)) return { state, sideEffects: [] };

    const newVotes = new Map(round.votes);
    newVotes.set(playerId, votedId);
    const voter = state.players.get(playerId);
    const newRound = { ...round, votes: newVotes };

    const sideEffects = [{ type: 'ANNOUNCE_PUBLIC', message: `🗳️ ${voter?.name} votó (${newVotes.size}/5)` }];
    if (newVotes.size >= round.clueOrder.length) return handleEndVoting({ ...state, currentRound: newRound });
    return { state: { ...state, currentRound: newRound }, sideEffects };
}

function handleEndVoting(state) {
    if (state.phase !== types_1.GamePhase.VOTING || !state.currentRound) return { state, sideEffects: [] };
    const round = state.currentRound;
    const counts = {};
    round.votes.forEach(v => counts[v] = (counts[v] || 0) + 1);

    const votedOutId = Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b, round.clueOrder[0]);
    const wasImpostor = votedOutId == round.impostorId;
    const votedName = state.players.get(parseInt(votedOutId))?.name;

    const sideEffects = [{ type: 'CLEAR_TIMER' }];
    if (wasImpostor) {
        sideEffects.push({ type: 'ANNOUNCE_PUBLIC', message: `🎯 ¡GANARON! ${votedName} era el Impostor`, style: { color: 0x00ff00, sound: 2 } });
    } else {
        sideEffects.push({ type: 'ANNOUNCE_PUBLIC', message: `💀 ${votedName} era Inocente. ¡Gana el Impostor!`, style: { color: 0xff0000, sound: 2 } });
    }
    
    sideEffects.push({ type: 'ANNOUNCE_PUBLIC', message: `⚽ El futbolista era: ${round.footballer}` });
    return { state: { ...state, phase: types_1.GamePhase.RESULTS }, sideEffects };
}

function handleResetGame(state) {
    return { state: { ...state, phase: types_1.GamePhase.WAITING, currentRound: null, queue: [] }, sideEffects: [] };
}

function handleResetRound(state) {
    return { state: { ...state, phase: types_1.GamePhase.WAITING, currentRound: null }, sideEffects: [{ type: 'CLEAR_TIMER' }] };
}

function canPlayerAct(state, playerId, action) {
    return true; // Simplificado para pruebas
}

function getCurrentActor(state) {
    if (state.phase === types_1.GamePhase.CLUES && state.currentRound) {
        return state.currentRound.clueOrder[state.currentRound.currentClueIndex];
    }
    return null;
}

function getPhaseDescription(phase) {
    return phase;
}

function handleEndReveal(state) { return handleResetGame(state); }
function handleForceReveal(state) { return handleEndVoting(state); }
function handleSkipPhase(state) { return { state, sideEffects: [] }; }
