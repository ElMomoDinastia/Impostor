"use strict";
/**
 * Game Controller - Orchestrates the game logic and room adapter
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameController = void 0;
const types_1 = require("../game/types");
const state_machine_1 = require("../game/state-machine");
const handler_1 = require("../commands/handler");
const logger_1 = require("../utils/logger");
const config_1 = require("../config");
const footballers_json_1 = __importDefault(require("../data/footballers.json"));

const SEAT_POSITIONS = [
    { x: 0, y: -130 }, // Top (Seat 1)
    { x: 124, y: -40 }, // Top-right (Seat 2)
    { x: 76, y: 105 }, // Bottom-right (Seat 3)
    { x: -76, y: 105 }, // Bottom-left (Seat 4)
    { x: -124, y: -40 }, // Top-left (Seat 5)
];

class GameController {
    adapter;
    state;
    footballers;
    phaseTimer = null;
    assignDelayTimer = null;
    roundLogs = [];

    constructor(adapter, footballers) {
        this.adapter = adapter;
        this.state = (0, types_1.createInitialState)({
            clueTimeSeconds: config_1.config.clueTime,
            discussionTimeSeconds: config_1.config.discussionTime,
            votingTimeSeconds: config_1.config.votingTime,
        });
        this.footballers = footballers ?? footballers_json_1.default;
        this.setupEventHandlers();

        // --- ANUNCIO CADA 3 MINUTOS ---
        setInterval(() => {
            if (this.adapter && this.isRoomInitialized()) {
                this.adapter.sendAnnouncement(
                    "⭐ 𝕊𝔸𝕃𝔸𝕊 𝕙𝕖𝕔𝕙𝕒𝕤 𝕡𝕠𝕣 𝕋𝕖𝕝𝕖𝕖𝕤𝕖 — 𝕋𝕖𝕝𝕖𝕖𝕤𝕖.𝕟𝕖𝕥𝕝𝕚𝕗𝕪.𝕒𝕡𝕡 ⭐", 
                    null, 
                    { 
                        color: 0x00FFFF, // Celeste Neón
                        style: "bold" 
                    }
                );
            }
        }, 180000); 
    }

    setupEventHandlers() {
        const handlers = {
            onPlayerJoin: this.handlePlayerJoin.bind(this),
            onPlayerLeave: this.handlePlayerLeave.bind(this),
            onPlayerChat: this.handlePlayerChat.bind(this),
            onRoomLink: this.handleRoomLink.bind(this),
        };
        this.adapter.setEventHandlers(handlers);
    }

    handleRoomLink(link) {
        logger_1.gameLogger.info({ link }, 'Room is ready');
    }

    handlePlayerJoin(player) {
        for (const existing of this.state.players.values()) {
            if (existing.name.toLowerCase() === player.name.toLowerCase()) {
                this.adapter.sendAnnouncement(`❌ El nombre "${player.name}" ya está en uso`, player.id, { color: 0xff0000 });
                this.adapter.kickPlayer(player.id, 'Nombre duplicado - elige otro nombre');
                return;
            }
        }
        const gamePlayer = {
            id: player.id,
            name: player.name,
            auth: player.auth,
            isAdmin: player.admin,
            joinedAt: Date.now()
        };
        const result = (0, state_machine_1.transition)(this.state, { type: 'PLAYER_JOIN', player: gamePlayer });
        this.applyTransition(result);
    }

    handlePlayerLeave(player) {
        const result = (0, state_machine_1.transition)(this.state, { type: 'PLAYER_LEAVE', playerId: player.id });
        this.applyTransition(result);
    }

    handlePlayerChat(player, message) {
        const command = (0, handler_1.parseCommand)(message);
        const isAdmin = player.admin;

        // 1. GESTIÓN DE ESPECTADORES Y ELIMINADOS
        const activePhases = [types_1.GamePhase.CLUES, types_1.GamePhase.DISCUSSION, types_1.GamePhase.VOTING, types_1.GamePhase.REVEAL];
        if (activePhases.includes(this.state.phase) && this.state.currentRound) {
            if (!this.isPlayerInRound(player.id) && !isAdmin) {
                if (command && command.type === handler_1.CommandType.JOIN) {
                    if (this.state.queue.includes(player.id)) {
                        this.adapter.sendAnnouncement(`⏳ Ya estás en cola para la próxima ronda.`, player.id, { color: 0x00bfff });
                        return false;
                    }
                    this.state.queue = [...this.state.queue, player.id];
                    this.adapter.sendAnnouncement(`✅ ${player.name} se anotó para la próxima partida`, null, { color: 0x00ff00 });
                    return false;
                }
                this.adapter.sendAnnouncement('👻 Los muertos no hablan...', player.id, { color: 0xaaaaaa });
                return false;
            }
        }

        // 2. FASE DE PISTAS
        if (this.state.phase === types_1.GamePhase.CLUES && this.state.currentRound) {
            const currentGiverId = this.state.currentRound.clueOrder[this.state.currentRound.currentClueIndex];
            if (player.id !== currentGiverId && !isAdmin) {
                this.adapter.sendAnnouncement('⏳ Espera tu turno...', player.id, { color: 0xffaa00 });
                return false;
            }
            if (player.id !== currentGiverId && isAdmin) {
                this.adapter.sendAnnouncement(`👑 ${player.name}: ${message}`, null, { color: 0xffd700 });
                return false;
            }
            const clueWord = message.trim().split(/\s+/)[0];
            if (clueWord) {
                const secretFootballer = this.state.currentRound?.footballer;
                if (secretFootballer && this.containsSpoiler(clueWord, secretFootballer)) {
                    this.adapter.sendAnnouncement('❌ ¡No digas el nombre!', player.id, { color: 0xff6b6b });
                    return false;
                }
                const result = (0, state_machine_1.transition)(this.state, { type: 'SUBMIT_CLUE', playerId: player.id, clue: clueWord });
                this.applyTransition(result);
                return false;
            }
        }

        if (!command || command.type === handler_1.CommandType.REGULAR_MESSAGE) {
            this.adapter.sendAnnouncement(`${player.name}: ${message}`, null, { color: 0xffffff });
            return false;
        }

        if (command.type === handler_1.CommandType.HELP) {
            this.adapter.sendAnnouncement((0, handler_1.generateHelpText)(this.state.phase, isAdmin), player.id, { color: 0x00bfff });
            return false;
        }

        if (command.type === handler_1.CommandType.STATUS) {
            this.adapter.sendAnnouncement((0, handler_1.generateStatusText)(this.state), player.id, { color: 0x00bfff });
            return false;
        }

        const secretFootballer = this.state.currentRound?.footballer;
        const validation = (0, handler_1.validateCommand)(command, player, this.state, secretFootballer);
        if (!validation.valid) {
            this.adapter.sendAnnouncement(`❌ ${validation.error}`, player.id, { color: 0xff6b6b });
            return false;
        }

        if (validation.action) {
            if (validation.action.type === 'START_GAME') {
                validation.action = { type: 'START_GAME', footballers: this.footballers };
            }
            const result = (0, state_machine_1.transition)(this.state, validation.action);
            this.applyTransition(result);
        }
        return false;
    }

    applyTransition(result) {
        this.state = result.state;
        this.executeSideEffects(result.sideEffects);
        if (this.state.phase === types_1.GamePhase.ASSIGN) {
            this.setupGameField();
            this.assignDelayTimer = setTimeout(() => {
                const cluesResult = (0, state_machine_1.transitionToClues)(this.state);
                this.applyTransition(cluesResult);
            }, 3000);
        }
        if (this.state.phase === types_1.GamePhase.REVEAL) {
            setTimeout(() => {
                const revealResult = (0, state_machine_1.transition)(this.state, { type: 'END_REVEAL' });
                this.applyTransition(revealResult);
            }, 3000);
        }
        if (this.state.phase === types_1.GamePhase.RESULTS) {
            setTimeout(() => {
                const resetResult = (0, state_machine_1.transition)(this.state, { type: 'RESET_GAME' });
                this.applyTransition(resetResult);
            }, 8000);
        }
    }

    containsSpoiler(clue, footballer) {
        const clueLower = clue.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const footballerLower = footballer.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const nameParts = footballerLower.split(/\s+/);
        for (const part of nameParts) {
            if (part.length > 2 && clueLower.includes(part)) return true;
        }
        return false;
    }

    async setupGameField() {
        if (!this.state.currentRound) return;
        try {
            const roundPlayerIds = [...this.state.currentRound.normalPlayerIds, this.state.currentRound.impostorId];
            await this.adapter.setTeamsLock(true);
            await this.adapter.stopGame();
            const allPlayers = await this.adapter.getPlayerList();
            for (const player of allPlayers) {
                if (player.id !== 0) await this.adapter.setPlayerTeam(player.id, 0);
            }
            for (const playerId of roundPlayerIds) {
                await this.adapter.setPlayerTeam(playerId, 1);
            }
            await this.adapter.startGame();
            for (let i = 0; i < roundPlayerIds.length && i < SEAT_POSITIONS.length; i++) {
                const seat = SEAT_POSITIONS[i];
                await this.adapter.setPlayerDiscProperties(roundPlayerIds[i], { x: seat.x, y: seat.y, xspeed: 0, yspeed: 0 });
            }
        } catch (error) {
            logger_1.gameLogger.error({ error }, 'Failed setup');
        }
    }

    isPlayerInRound(playerId) {
        return this.state.currentRound?.clueOrder.includes(playerId) ?? false;
    }

    executeSideEffects(effects) {
        for (const effect of effects) {
            switch (effect.type) {
                case 'ANNOUNCE_PUBLIC':
                    this.adapter.sendAnnouncement(effect.message, null, effect.style);
                    break;
                case 'ANNOUNCE_PRIVATE':
                    this.adapter.sendAnnouncement(effect.message, effect.playerId, { color: 0xffff00 });
                    break;
                case 'SET_PHASE_TIMER':
                    this.setPhaseTimer(effect.durationSeconds);
                    break;
                case 'CLEAR_TIMER':
                    this.clearPhaseTimer();
                    break;
                case 'LOG_ROUND':
                    this.logRound(effect.result);
                    break;
                case 'AUTO_START_GAME':
                    setTimeout(() => {
                        const startResult = (0, state_machine_1.transition)(this.state, { type: 'START_GAME', footballers: this.footballers });
                        this.applyTransition(startResult);
                    }, 2000);
                    break;
            }
        }
    }

    setPhaseTimer(durationSeconds) {
        this.clearPhaseTimer();
        this.phaseTimer = setTimeout(() => this.handlePhaseTimeout(), durationSeconds * 1000);
    }

    clearPhaseTimer() {
        if (this.phaseTimer) { clearTimeout(this.phaseTimer); this.phaseTimer = null; }
        if (this.assignDelayTimer) { clearTimeout(this.assignDelayTimer); this.assignDelayTimer = null; }
    }

    handlePhaseTimeout() {
        let result;
        switch (this.state.phase) {
            case types_1.GamePhase.CLUES: result = (0, state_machine_1.transition)(this.state, { type: 'CLUE_TIMEOUT' }); break;
            case types_1.GamePhase.DISCUSSION: result = (0, state_machine_1.transition)(this.state, { type: 'END_DISCUSSION' }); break;
            case types_1.GamePhase.VOTING: result = (0, state_machine_1.transition)(this.state, { type: 'END_VOTING' }); break;
            case types_1.GamePhase.REVEAL: result = (0, state_machine_1.transition)(this.state, { type: 'END_REVEAL' }); break;
            default: return;
        }
        this.applyTransition(result);
    }

    logRound(result) {
        this.roundLogs.push(result);
    }

    getState() { return this.state; }
    getRoomLink() { return this.adapter.getRoomLink(); }
    isRoomInitialized() { return this.adapter.isInitialized(); }
    getPlayerCount() { return this.state.players.size; }
    getQueueCount() { return this.state.queue.length; }
    getRoundsPlayed() { return this.state.roundHistory.length; }
    getCurrentPhase() { return this.state.phase; }

    async start() {
        await this.adapter.initialize();
    }

    stop() {
        this.clearPhaseTimer();
        this.adapter.close();
    }
}

exports.GameController = GameController;
