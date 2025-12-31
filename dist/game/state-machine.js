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
            const newPlayers = new Map(state.players).set(action.player.id, action.player);
            return { state: { ...state, players: newPlayers }, sideEffects: [{ type: 'ANNOUNCE_PRIVATE', playerId: action.player.id, message: '⚽ ¡Bienvenido! Escribe "!jugar" para entrar.' }] };
        
        case 'PLAYER_LEAVE':
            const playersAfterLeave = new Map(state.players);
            playersAfterLeave.delete(action.playerId);
            const queueAfterLeave = state.queue.filter(id => id !== action.playerId);
            return { state: { ...state, players: playersAfterLeave, queue: queueAfterLeave }, sideEffects: [] };

        case 'JOIN_QUEUE':
    if (state.queue.includes(action.playerId)) return { state, sideEffects: [] };
    
    const updatedQueue = [...state.queue, action.playerId];
    const playerPosition = updatedQueue.length;
    const playerName = state.players.get(action.playerId)?.name;

    // Si la cola supera los 5, le avisamos en qué posición de espera está
    const message = playerPosition <= 5 
        ? `✅ @${playerName} anotado (${playerPosition}/5)`
        : `⏳ @${playerName} en espera (Posición: ${playerPosition - 5})`;

    return { 
        state: { ...state, queue: updatedQueue }, 
        sideEffects: [{ type: 'ANNOUNCE_PUBLIC', message }] 
    };

        case 'START_GAME':
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
            const effects = [{ type: 'ANNOUNCE_PUBLIC', message: '🕵️ RONDA INICIADA. Revisen sus mensajes privados.' }];
            participants.forEach(id => {
                const msg = id === impostorId ? '🕵️ ERES EL IMPOSTOR. Disimula.' : `⚽ EL JUGADOR ES: ${footballer}`;
                effects.push({ type: 'ANNOUNCE_PRIVATE', playerId: id, message: msg });
            });
            return { state: { ...state, phase: types_1.GamePhase.ASSIGN, currentRound: round, queue: state.queue.slice(5) }, sideEffects: effects };

        case 'SUBMIT_CLUE':
            const rClue = state.currentRound;
            const newClues = new Map(rClue.clues).set(action.playerId, action.clue);
            const isLastClue = rClue.currentClueIndex >= rClue.clueOrder.length - 1;
            if (isLastClue) {
                return { 
                    state: { ...state, phase: types_1.GamePhase.DISCUSSION, currentRound: { ...rClue, clues: newClues } }, 
                    sideEffects: [
                        { type: 'ANNOUNCE_PUBLIC', message: `💬 Pista: "${action.clue}"` },
                        { type: 'ANNOUNCE_PUBLIC', message: `🗣️ DEBATE (${state.settings.discussionTimeSeconds}s)` },
                        { type: 'SET_PHASE_TIMER', durationSeconds: state.settings.discussionTimeSeconds }
                    ]
                };
            }
            return { 
                state: { ...state, currentRound: { ...rClue, clues: newClues, currentClueIndex: rClue.currentClueIndex + 1 } }, 
                sideEffects: [
                    { type: 'ANNOUNCE_PUBLIC', message: `💬 Pista: "${action.clue}"` },
                    { type: 'ANNOUNCE_PUBLIC', message: `📝 Turno de: ${state.players.get(rClue.clueOrder[rClue.currentClueIndex + 1])?.name}` }
                ]
            };

        case 'END_DISCUSSION':
            const list = state.currentRound.clueOrder.map((id, i) => `${i + 1}. ${state.players.get(id)?.name}`).join(' | ');
            return { 
                state: { ...state, phase: types_1.GamePhase.VOTING }, 
                sideEffects: [
                    { type: 'ANNOUNCE_PUBLIC', message: `🗳️ VOTEN (Escriban el número): ${list}` },
                    { type: 'SET_PHASE_TIMER', durationSeconds: state.settings.votingTimeSeconds }
                ] 
            };

        case 'SUBMIT_VOTE':
            const rVote = state.currentRound;
            const newVotes = new Map(rVote.votes).set(action.playerId, action.votedId);
            if (newVotes.size >= rVote.clueOrder.length) return handleEndVoting({ ...state, currentRound: { ...rVote, votes: newVotes } });
            return { state: { ...state, currentRound: { ...rVote, votes: newVotes } }, sideEffects: [] };

        case 'END_VOTING': return handleEndVoting(state);
        case 'END_REVEAL': return { state: { ...state, phase: types_1.GamePhase.RESULTS }, sideEffects: [] };
        case 'RESET_GAME': return { state: { ...state, phase: types_1.GamePhase.WAITING, currentRound: null }, sideEffects: [{ type: 'AUTO_START_GAME' }] };
        default: return { state, sideEffects: [] };
    }
}

function handleEndVoting(state) {
    const round = state.currentRound;
    const counts = {};
    
    // 1. Contar votos
    round.votes.forEach(v => counts[v] = (counts[v] || 0) + 1);
    const sorted = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
    const votedOutId = sorted[0];

    const isImpostor = votedOutId === round.impostorId;
    const votedName = state.players.get(votedOutId)?.name;

    // 2. Si atrapan al Impostor: Ganan Inocentes
    if (isImpostor) {
        const result = { impostorWon: false, impostorName: votedName, footballer: round.footballer };
        return { 
            state: { ...state, phase: types_1.GamePhase.REVEAL, currentRound: { ...round, result } }, 
            sideEffects: [
                { type: 'CLEAR_TIMER' },
                { type: 'ANNOUNCE_PUBLIC', message: `🎯 ¡LO CAZARON! ${votedName} era el Impostor.` }
            ] 
        };
    } 

    // 3. Si expulsan a un Inocente: ¿Cuántos quedan?
    const remainingInnocents = round.normalPlayerIds.filter(id => id !== votedOutId);
    
    // REGLA DE VICTORIA DEL IMPOSTOR:
    // Si queda 1 Inocente vs 1 Impostor, ya no hay mayoría posible para votar. Gana el Impostor.
    if (remainingInnocents.length <= 1) {
        const result = { impostorWon: true, impostorName: state.players.get(round.impostorId)?.name, footballer: round.footballer };
        return { 
            state: { ...state, phase: types_1.GamePhase.REVEAL, currentRound: { ...round, result } }, 
            sideEffects: [
                { type: 'CLEAR_TIMER' },
                { type: 'ANNOUNCE_PUBLIC', message: `💀 ${votedName} era INOCENTE. ¡Gana el Impostor por mayoría!` }
            ] 
        };
    }

    // 4. EL JUEGO SIGUE: Nueva ronda de pistas con los que quedan
    const nextRound = {
        ...round,
        normalPlayerIds: remainingInnocents,
        clueOrder: round.clueOrder.filter(id => id !== votedOutId), // Sacamos al expulsado de los turnos
        currentClueIndex: 0,
        clues: new Map(), // Limpiamos pistas viejas
        votes: new Map()  // Limpiamos votos viejos
    };

    return { 
        state: { ...state, phase: types_1.GamePhase.CLUES, currentRound: nextRound }, 
        sideEffects: [
            { type: 'CLEAR_TIMER' },
            { type: 'ANNOUNCE_PUBLIC', message: `❌ ${votedName} era Inocente. ¡Sigue la búsqueda!` },
            { type: 'ANNOUNCE_PUBLIC', message: `📝 NUEVA RONDA DE PISTAS...` },
            { type: 'SET_PHASE_TIMER', durationSeconds: state.settings.clueTimeSeconds }
        ] 
    };
}

function transitionToClues(state) {
    const first = state.players.get(state.currentRound.clueOrder[0]);
    return { 
        state: { ...state, phase: types_1.GamePhase.CLUES }, 
        sideEffects: [
            { type: 'ANNOUNCE_PUBLIC', message: `📝 EMPIEZAN LAS PISTAS. Turno de: ${first?.name}` },
            { type: 'SET_PHASE_TIMER', durationSeconds: state.settings.clueTimeSeconds }
        ] 
    };
}
