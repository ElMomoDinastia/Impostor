"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.transition = transition;
exports.transitionToClues = transitionToClues;
exports.canPlayerAct = canPlayerAct;
exports.getCurrentActor = getCurrentActor;
exports.getPhaseDescription = getPhaseDescription;

const types_1 = require("./types");

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
    return { 
        state: { ...state, players: newPlayers }, 
        sideEffects: [{ type: 'ANNOUNCE_PRIVATE', playerId: player.id, message: '🔴 EL IMPOSTOR | Escribe "!jugar" para entrar a la lista' }] 
    };
}

function handlePlayerLeave(state, playerId) {
    const newPlayers = new Map(state.players);
    newPlayers.delete(playerId);
    const newQueue = state.queue.filter(id => id !== playerId);
    let newState = { ...state, players: newPlayers, queue: newQueue };
    const sideEffects = [];
    
    if (state.currentRound) {
        const isInGame = state.currentRound.clueOrder.includes(playerId);
        if (isInGame && newPlayers.size < 3) {
            sideEffects.push({ type: 'ANNOUNCE_PUBLIC', message: '⚠️ Ronda cancelada: faltan jugadores' });
            newState = { ...newState, phase: types_1.GamePhase.WAITING, currentRound: null };
        }
    }
    return { state: newState, sideEffects };
}

function handleJoinQueue(state, playerId) {
    if (state.queue.includes(playerId)) return { state, sideEffects: [] };
    const newQueue = [...state.queue, playerId];
    const player = state.players.get(playerId);
    const sideEffects = [];
    if (state.phase === types_1.GamePhase.WAITING) {
        sideEffects.push({ type: 'ANNOUNCE_PUBLIC', message: `✅ ${player?.name} listo (${newQueue.length}/5)` });
        if (newQueue.length >= 5) sideEffects.push({ type: 'AUTO_START_GAME' });
    }
    return { state: { ...state, queue: newQueue }, sideEffects };
}

function handleLeaveQueue(state, playerId) {
    const newQueue = state.queue.filter(id => id !== playerId);
    return { state: { ...state, queue: newQueue }, sideEffects: [] };
}

function handleStartGame(state, footballers) {
    if (state.queue.length < 5) return { state, sideEffects: [] };
    const roundPlayers = state.queue.slice(0, 5);
    const impostorId = roundPlayers[Math.floor(Math.random() * 5)];
    const footballer = footballers[Math.floor(Math.random() * footballers.length)];
    
    const round = {
        id: `round_${Date.now()}`,
        footballer,
        impostorId,
        normalPlayerIds: roundPlayers.filter(id => id !== impostorId),
        clues: new Map(),
        votes: new Map(),
        clueOrder: shuffle([...roundPlayers]),
        currentClueIndex: 0,
        startedAt: Date.now()
    };

    const sideEffects = [{ type: 'ANNOUNCE_PUBLIC', message: `🔴 PARTIDA INICIADA | Jugadores: ${roundPlayers.map(id => state.players.get(id)?.name).join(', ')}` }];
    roundPlayers.forEach(id => {
        const msg = id === impostorId ? `🕵️ ERES EL IMPOSTOR` : `⚽ EL FUTBOLISTA ES: ${footballer}`;
        sideEffects.push({ type: 'ANNOUNCE_PRIVATE', playerId: id, message: msg });
    });

    return { state: { ...state, phase: types_1.GamePhase.ASSIGN, currentRound: round, queue: state.queue.slice(5) }, sideEffects };
}

function transitionToClues(state) {
    if (!state.currentRound) return { state, sideEffects: [] };
    const firstPlayer = state.players.get(state.currentRound.clueOrder[0]);
    return {
        state: { ...state, phase: types_1.GamePhase.CLUES },
        sideEffects: [
            { type: 'ANNOUNCE_PUBLIC', message: `📝 PISTAS | Turno de: ${firstPlayer?.name}` },
            { type: 'SET_PHASE_TIMER', durationSeconds: state.settings.clueTimeSeconds }
        ]
    };
}

function handleSubmitClue(state, playerId, clue) {
    const round = state.currentRound;
    if (!round || state.phase !== types_1.GamePhase.CLUES) return { state, sideEffects: [] };
    
    const newClues = new Map(round.clues).set(playerId, clue);
    const nextIndex = round.currentClueIndex + 1;
    const sideEffects = [{ type: 'ANNOUNCE_PUBLIC', message: `💬 ${state.players.get(playerId)?.name}: "${clue}"` }];

    if (nextIndex >= round.clueOrder.length) {
        sideEffects.push({ type: 'ANNOUNCE_PUBLIC', message: `🗣️ DEBATE | ¡Tienen ${state.settings.discussionTimeSeconds}s!` });
        sideEffects.push({ type: 'SET_PHASE_TIMER', durationSeconds: state.settings.discussionTimeSeconds });
        return { state: { ...state, phase: types_1.GamePhase.DISCUSSION, currentRound: { ...round, clues: newClues } }, sideEffects };
    }

    const nextPlayer = state.players.get(round.clueOrder[nextIndex]);
    sideEffects.push({ type: 'ANNOUNCE_PUBLIC', message: `📝 Turno de: ${nextPlayer?.name}` });
    return { state: { ...state, currentRound: { ...round, clues: newClues, currentClueIndex: nextIndex } }, sideEffects };
}

function handleClueTimeout(state) {
    const round = state.currentRound;
    if (!round) return { state, sideEffects: [] };
    return handleSubmitClue(state, round.clueOrder[round.currentClueIndex], "...");
}

function handleEndDiscussion(state) {
    const round = state.currentRound;
    // AQUÍ SE GENERA LA LISTA CON IDS PARA VOTAR
    const list = round.clueOrder.map((id, index) => `${index + 1}.${state.players.get(id)?.name}`).join(' | ');
    return {
        state: { ...state, phase: types_1.GamePhase.VOTING },
        sideEffects: [
            { type: 'ANNOUNCE_PUBLIC', message: `🗳️ VOTACIÓN | Escribe el NÚMERO: ${list}` },
            { type: 'SET_PHASE_TIMER', durationSeconds: state.settings.votingTimeSeconds }
        ]
    };
}

function handleSubmitVote(state, playerId, votedId) {
    const round = state.currentRound;
    if (!round || state.phase !== types_1.GamePhase.VOTING) return { state, sideEffects: [] };
    
    const newVotes = new Map(round.votes).set(playerId, votedId);
    const sideEffects = [{ type: 'ANNOUNCE_PUBLIC', message: `🗳️ ${state.players.get(playerId)?.name} ha votado.` }];

    if (newVotes.size >= round.clueOrder.length) {
        return handleEndVoting({ ...state, currentRound: { ...round, votes: newVotes } });
    }
    return { state: { ...state, currentRound: { ...round, votes: newVotes } }, sideEffects };
}

function handleEndVoting(state) {
    const round = state.currentRound;
    const counts = {};
    round.votes.forEach(v => counts[v] = (counts[v] || 0) + 1);
    
    const votedOutId = Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
    const isImpostor = votedOutId === round.impostorId;
    const votedName = state.players.get(votedOutId)?.name;

    const sideEffects = [{ type: 'CLEAR_TIMER' }];

    if (isImpostor) {
        sideEffects.push({ type: 'ANNOUNCE_PUBLIC', message: `🎯 ¡LO LOGRARON! ${votedName} era el Impostor.` });
        const result = { impostorWon: false, impostorName: votedName, footballer: round.footballer };
        return { state: { ...state, phase: types_1.GamePhase.REVEAL, currentRound: { ...round, result } }, sideEffects };
    } else {
        const remainingInnocents = round.normalPlayerIds.filter(id => id !== votedOutId);
        if (remainingInnocents.length <= 1) {
            sideEffects.push({ type: 'ANNOUNCE_PUBLIC', message: `💀 ${votedName} era INOCENTE. ¡Gana el Impostor!` });
            const result = { impostorWon: true, impostorName: state.players.get(round.impostorId)?.name, footballer: round.footballer };
            return { state: { ...state, phase: types_1.GamePhase.REVEAL, currentRound: { ...round, result } }, sideEffects };
        } else {
            // LÓGICA DE NUEVA RONDA: El juego sigue
            sideEffects.push({ type: 'ANNOUNCE_PUBLIC', message: `❌ ${votedName} era Inocente. ¡Sigue el juego!` });
            const nextRound = {
                ...round,
                normalPlayerIds: remainingInnocents,
                clueOrder: round.clueOrder.filter(id => id !== votedOutId),
                currentClueIndex: 0,
                clues: new Map(),
                votes: new Map()
            };
            return { state: { ...state, phase: types_1.GamePhase.CLUES, currentRound: nextRound }, sideEffects };
        }
    }
}

function handleEndReveal(state) {
    const res = state.currentRound.result;
    return {
        state: { ...state, phase: types_1.GamePhase.RESULTS },
        sideEffects: [
            { type: 'ANNOUNCE_PUBLIC', message: `🏆 REVELACIÓN: Era ${res.impostorName} | Futbolista: ${res.footballer}` },
            { type: 'AUTO_START_GAME' } // Esto hace que si hay gente en cola, empiece otra partida
        ]
    };
}

function handleForceReveal(state) { return handleResetGame(state); }
function handleSkipPhase(state) { return { state, sideEffects: [] }; }
function handleResetRound(state) { return handleResetGame(state); }

function handleResetGame(state) {
    const sideEffects = [{ type: 'CLEAR_TIMER' }];
    if (state.queue.length >= 5) sideEffects.push({ type: 'AUTO_START_GAME' });
    return { state: { ...state, phase: types_1.GamePhase.WAITING, currentRound: null }, sideEffects };
}

function canPlayerAct(state, playerId, action) {
    if (!state.currentRound) return false;
    const round = state.currentRound;
    if (action === 'clue') return state.phase === types_1.GamePhase.CLUES && round.clueOrder[round.currentClueIndex] === playerId;
    if (action === 'vote') return state.phase === types_1.GamePhase.VOTING && round.clueOrder.includes(playerId) && !round.votes.has(playerId);
    return false;
}

function getCurrentActor(state) {
    return state.currentRound?.clueOrder[state.currentRound.currentClueIndex] || null;
}

function getPhaseDescription(phase) {
    const names = { [types_1.GamePhase.WAITING]: '⏳ Esperando', [types_1.GamePhase.CLUES]: '📝 Pistas', [types_1.GamePhase.VOTING]: '🗳️ Votación' };
    return names[phase] || 'Juego';
}

exports.transition = transition;
exports.transitionToClues = transitionToClues;
exports.canPlayerAct = canPlayerAct;
exports.getCurrentActor = getCurrentActor;
exports.getPhaseDescription = getPhaseDescription;
